"""Router — Module Contacts (carnets de contacts groupés).

Préfixe : /contacts
Module requis : contacts
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.contacts import Contact, ContactGroup
from app.models.speaker import SpeakerProfile
from app.models.user import User
from app.schemas.contacts import (
    ContactCreate,
    ContactGroupCreate,
    ContactGroupDetailResponse,
    ContactGroupResponse,
    ContactGroupUpdate,
    ContactResponse,
    ContactUpdate,
)

router = APIRouter(
    prefix="/contacts",
    tags=["contacts"],
    dependencies=[Depends(require_module("contacts"))],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _to_group_response(g: ContactGroup) -> ContactGroupResponse:
    return ContactGroupResponse(
        id=g.id,
        name=g.name,
        description=g.description,
        metadata=_parse_json(g.metadata_),
        contact_count=len(g.contacts) if g.contacts else 0,
        created_at=g.created_at,
        updated_at=g.updated_at,
    )


def _to_contact_response(c: Contact, speaker_profile=None) -> ContactResponse:
    return ContactResponse(
        id=c.id,
        group_id=c.group_id,
        name=c.name,
        email=c.email,
        phone=c.phone,
        role=c.role,
        custom_fields=_parse_json(c.custom_fields),
        created_at=c.created_at,
        speaker_profile_id=speaker_profile.id if speaker_profile else None,
        consent_status=speaker_profile.consent_status if speaker_profile else None,
        consent_type=speaker_profile.consent_type if speaker_profile else None,
        enrollment_status=speaker_profile.enrollment_status if speaker_profile else None,
    )


def _get_group(db: Session, group_id: str, tenant_id: str) -> ContactGroup:
    g = (
        db.query(ContactGroup)
        .options(joinedload(ContactGroup.contacts))
        .filter(ContactGroup.id == group_id, ContactGroup.tenant_id == tenant_id)
        .first()
    )
    if not g:
        raise HTTPException(status_code=404, detail="Groupe introuvable")
    return g


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[ContactGroupResponse])
def list_groups(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    groups = (
        db.query(ContactGroup)
        .options(joinedload(ContactGroup.contacts))
        .filter(ContactGroup.tenant_id == user.tenant_id)
        .order_by(ContactGroup.name)
        .all()
    )
    return [_to_group_response(g) for g in groups]


@router.post("/groups", response_model=ContactGroupDetailResponse, status_code=201)
def create_group(
    body: ContactGroupCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = ContactGroup(
        tenant_id=user.tenant_id,
        name=body.name,
        description=body.description,
        metadata_=json.dumps(body.metadata) if body.metadata else None,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return ContactGroupDetailResponse(
        **_to_group_response(g).model_dump(),
        contacts=[],
    )


@router.get("/groups/{group_id}", response_model=ContactGroupDetailResponse)
def get_group(
    group_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, group_id, user.tenant_id)

    # Load consent status from linked speaker profiles
    contact_ids = [c.id for c in g.contacts]
    profile_map: dict[str, SpeakerProfile] = {}
    if contact_ids:
        profiles = db.query(SpeakerProfile).filter(
            SpeakerProfile.contact_id.in_(contact_ids),
            SpeakerProfile.tenant_id == user.tenant_id,
        ).all()
        for p in profiles:
            profile_map[p.contact_id] = p

    return ContactGroupDetailResponse(
        **_to_group_response(g).model_dump(),
        contacts=[_to_contact_response(c, profile_map.get(c.id)) for c in g.contacts],
    )


@router.patch("/groups/{group_id}", response_model=ContactGroupResponse)
def update_group(
    group_id: str,
    body: ContactGroupUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, group_id, user.tenant_id)
    updates = body.model_dump(exclude_unset=True)
    if "metadata" in updates:
        g.metadata_ = json.dumps(updates.pop("metadata")) if updates["metadata"] else None
    for field, value in updates.items():
        setattr(g, field, value)
    db.commit()
    db.refresh(g)
    return _to_group_response(g)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, group_id, user.tenant_id)
    db.delete(g)
    db.commit()


# ── Contacts ─────────────────────────────────────────────────────────────────

@router.post("/groups/{group_id}/contacts", response_model=ContactResponse, status_code=201)
def add_contact(
    group_id: str,
    body: ContactCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_group(db, group_id, user.tenant_id)
    c = Contact(
        tenant_id=user.tenant_id,
        group_id=group_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        role=body.role,
        custom_fields=json.dumps(body.custom_fields) if body.custom_fields else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _to_contact_response(c)


@router.patch("/groups/{group_id}/contacts/{contact_id}", response_model=ContactResponse)
def update_contact(
    group_id: str,
    contact_id: str,
    body: ContactUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_group(db, group_id, user.tenant_id)
    c = db.query(Contact).filter_by(id=contact_id, group_id=group_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    updates = body.model_dump(exclude_unset=True)
    if "custom_fields" in updates:
        c.custom_fields = json.dumps(updates.pop("custom_fields")) if updates["custom_fields"] else None
    for field, value in updates.items():
        setattr(c, field, value)
    db.commit()
    db.refresh(c)
    return _to_contact_response(c)


@router.delete("/groups/{group_id}/contacts/{contact_id}", status_code=204)
def delete_contact(
    group_id: str,
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_group(db, group_id, user.tenant_id)
    c = db.query(Contact).filter_by(id=contact_id, group_id=group_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    db.delete(c)
    db.commit()
