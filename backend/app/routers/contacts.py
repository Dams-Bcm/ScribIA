"""Router — Module Contacts (carnets de contacts groupés).

Préfixe : /contacts
Module requis : contacts
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.contacts import Contact, ContactGroup, contact_group_members
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
        group_ids=[g.id for g in c.groups] if c.groups else [],
        name=c.name,
        first_name=c.first_name,
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


def _build_profile_map(db: Session, contact_ids: list[str], tenant_id: str) -> dict[str, SpeakerProfile]:
    if not contact_ids:
        return {}
    profiles = db.query(SpeakerProfile).filter(
        SpeakerProfile.contact_id.in_(contact_ids),
        SpeakerProfile.tenant_id == tenant_id,
    ).all()
    return {p.contact_id: p for p in profiles}


# ── All contacts (virtual "Tous" group) ───────────────────────────────────────

@router.get("/all", response_model=ContactGroupDetailResponse)
def list_all_contacts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all contacts across all groups for this tenant."""
    all_contacts = (
        db.query(Contact)
        .options(joinedload(Contact.groups))
        .filter(Contact.tenant_id == user.tenant_id)
        .order_by(Contact.name)
        .all()
    )

    contact_ids = [c.id for c in all_contacts]
    profile_map = _build_profile_map(db, contact_ids, user.tenant_id)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    return ContactGroupDetailResponse(
        id="__all__",
        name="Tous",
        description=None,
        metadata=None,
        contact_count=len(all_contacts),
        created_at=now,
        updated_at=now,
        contacts=[_to_contact_response(c, profile_map.get(c.id)) for c in all_contacts],
    )


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

    contact_ids = [c.id for c in g.contacts]
    profile_map = _build_profile_map(db, contact_ids, user.tenant_id)

    # Eager-load groups for each contact so group_ids is populated
    for c in g.contacts:
        if not hasattr(c, '_sa_instance_state') or 'groups' not in c.__dict__:
            db.refresh(c, ['groups'])

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
    # Clean junction table before deleting group (MSSQL NO ACTION)
    db.execute(contact_group_members.delete().where(contact_group_members.c.group_id == group_id))
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
    g = _get_group(db, group_id, user.tenant_id)
    c = Contact(
        tenant_id=user.tenant_id,
        name=body.name,
        first_name=body.first_name,
        email=body.email,
        phone=body.phone,
        role=body.role,
        custom_fields=json.dumps(body.custom_fields) if body.custom_fields else None,
    )
    c.groups.append(g)
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
    c = (
        db.query(Contact)
        .options(joinedload(Contact.groups))
        .filter(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
        .first()
    )
    if not c or not any(g.id == group_id for g in c.groups):
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
    c = (
        db.query(Contact)
        .options(joinedload(Contact.groups))
        .filter(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
        .first()
    )
    if not c or not any(g.id == group_id for g in c.groups):
        raise HTTPException(status_code=404, detail="Contact introuvable")

    # Clean junction table + FK references before deleting
    db.execute(contact_group_members.delete().where(contact_group_members.c.contact_id == contact_id))
    from app.models.consent import ConsentRequest, ConsentDetection
    db.query(ConsentRequest).filter(ConsentRequest.contact_id == contact_id).delete(
        synchronize_session=False)
    db.query(ConsentDetection).filter(ConsentDetection.contact_id == contact_id).delete(
        synchronize_session=False)

    db.delete(c)
    db.commit()


# ── Group membership management ──────────────────────────────────────────────

@router.post("/contacts/{contact_id}/groups/{group_id}", status_code=204)
def add_contact_to_group(
    contact_id: str,
    group_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add an existing contact to a group."""
    g = _get_group(db, group_id, user.tenant_id)
    c = (
        db.query(Contact)
        .options(joinedload(Contact.groups))
        .filter(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if g not in c.groups:
        c.groups.append(g)
        db.commit()


@router.delete("/contacts/{contact_id}/groups/{group_id}", status_code=204)
def remove_contact_from_group(
    contact_id: str,
    group_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a contact from a group (does not delete the contact)."""
    g = _get_group(db, group_id, user.tenant_id)
    c = (
        db.query(Contact)
        .options(joinedload(Contact.groups))
        .filter(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if g in c.groups:
        c.groups.remove(g)
        db.commit()
