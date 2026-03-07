"""Router — Consent endpoints.

Public endpoints (no auth) : accept/decline/withdraw via token links.
Authenticated endpoints    : manage attendees, send consent requests, check status.
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models.consent import ConsentRequest, ConsentDetection
from app.models.contacts import Contact
from app.models.speaker import SpeakerProfile
from app.models.transcription import TranscriptionJob
from app.models.ai_documents import AIDocument
from app.models.user import User
from app.schemas.consent import (
    AttendeeEntry,
    AttendeesResponse,
    ConsentDetectionResponse,
    ConsentRequestResponse,
    ConsentSendRequest,
    ConsentStatusResponse,
    ConsentWithdrawManualRequest,
    SetAttendeesRequest,
)

router = APIRouter(prefix="/consent", tags=["consent"])


# ── Public endpoints (token-based, no auth) ──────────────────────────────────

class ConsentActionResponse(BaseModel):
    status: str
    display_name: str | None = None
    message: str


@router.get("/accept")
def accept_consent(
    token: str = Query(...),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Public — person clicks the accept link from their email."""
    profile = _get_profile_by_token(token, db)

    profile.consent_status = "accepted"
    profile.consent_type = "email"
    profile.consent_scope = "individual"
    profile.consent_date = datetime.now(timezone.utc)
    profile.consent_token = None
    profile.consent_token_expires = None

    db.commit()
    return ConsentActionResponse(
        status="accepted",
        display_name=profile.display_name,
        message="Votre consentement a ete enregistre. Merci.",
    )


@router.get("/decline")
def decline_consent(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public — person clicks the decline link from their email."""
    profile = _get_profile_by_token(token, db)

    profile.consent_status = "declined"
    profile.consent_date = datetime.now(timezone.utc)
    profile.consent_token = None
    profile.consent_token_expires = None

    db.commit()
    return ConsentActionResponse(
        status="declined",
        display_name=profile.display_name,
        message="Votre refus a ete enregistre.",
    )


@router.get("/withdraw")
def withdraw_consent(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public — person withdraws their consent (RGPD right)."""
    profile = (
        db.query(SpeakerProfile)
        .filter(SpeakerProfile.withdrawal_token == token)
        .first()
    )
    if not profile:
        raise HTTPException(404, "Lien invalide ou expire.")

    profile.consent_status = "withdrawn"
    profile.consent_date = datetime.now(timezone.utc)
    profile.embedding = None
    profile.enrollment_status = None
    profile.enrollment_method = None
    profile.enrolled_at = None

    db.commit()
    return ConsentActionResponse(
        status="withdrawn",
        display_name=profile.display_name,
        message="Votre consentement a ete retire et vos donnees vocales supprimees.",
    )


# ── Public: ConsentRequest token endpoints ───────────────────────────────────

@router.get("/respond/{token}")
def respond_consent_request(
    token: str,
    action: str = Query(..., description="accept or refuse"),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Public — person responds to a ConsentRequest email link."""
    cr = db.query(ConsentRequest).filter(ConsentRequest.token == token).first()
    if not cr:
        raise HTTPException(404, "Lien invalide ou expire.")
    if cr.status not in ("pending",):
        raise HTTPException(400, f"Ce consentement a deja ete traite (statut: {cr.status}).")

    if action not in ("accept", "refuse"):
        raise HTTPException(400, "Action invalide. Utilisez 'accept' ou 'refuse'.")

    now = datetime.now(timezone.utc)
    cr.status = "accepted" if action == "accept" else "refused"
    cr.responded_at = now
    if request:
        cr.ip_address = request.client.host if request.client else None
        cr.user_agent = request.headers.get("user-agent", "")[:500]

    # Update attendees[] on the job
    if cr.job_id:
        _update_attendee_status(
            db, cr.job_id, cr.contact_id,
            status="accepted_email" if action == "accept" else "refused",
            evidence_type="email",
            evidence_id=cr.id,
            decided_at=now.isoformat(),
            decided_by="system",
        )

    db.commit()
    if action == "accept":
        return ConsentActionResponse(status="accepted", message="Votre consentement a ete enregistre. Merci.")
    return ConsentActionResponse(status="refused", message="Votre refus a ete enregistre.")


@router.post("/withdraw/{token}")
def withdraw_consent_request(
    token: str,
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Public — person withdraws a previously accepted ConsentRequest."""
    cr = db.query(ConsentRequest).filter(ConsentRequest.token == token).first()
    if not cr:
        raise HTTPException(404, "Lien invalide ou expire.")
    if cr.status != "accepted":
        raise HTTPException(400, "Seul un consentement accepte peut etre retire.")

    now = datetime.now(timezone.utc)
    cr.status = "withdrawn"
    cr.withdrawn_at = now
    cr.withdrawn_via = "email_link"

    # Update attendees[] and invalidate session + documents
    if cr.job_id:
        _update_attendee_status(
            db, cr.job_id, cr.contact_id,
            status="withdrawn",
            withdrawn_at=now.isoformat(),
        )
        job = db.query(TranscriptionJob).filter(TranscriptionJob.id == cr.job_id).first()
        if job:
            job.recording_validity = "invalidated"
        # Get contact name for invalidation reason
        contact = db.query(Contact).filter(Contact.id == cr.contact_id).first()
        contact_name = f"{contact.first_name} {contact.last_name}" if contact else "un participant"
        _invalidate_documents_for_job(db, cr.job_id, contact_name, now)

    db.commit()

    # Send withdrawal confirmation email
    try:
        from app.services.email import send_withdrawal_confirmation
        contact = db.query(Contact).filter(Contact.id == cr.contact_id).first()
        if contact and contact.email:
            send_withdrawal_confirmation(contact.email, f"{contact.first_name} {contact.last_name}")
    except Exception:
        pass

    return ConsentActionResponse(status="withdrawn", message="Votre consentement a ete retire.")


# ── Authenticated endpoints ──────────────────────────────────────────────────

@router.post("/jobs/{job_id}/attendees", response_model=AttendeesResponse)
def set_attendees(
    job_id: str,
    body: SetAttendeesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set the attendees for a transcription job.

    Automatically checks existing ConsentRequests to set initial status:
    - accepted ConsentRequest exists → accepted_email
    - otherwise → pending_oral
    """
    job = _get_job(db, job_id, user.tenant_id)

    # Validate all contact_ids belong to tenant
    contacts = (
        db.query(Contact)
        .filter(Contact.id.in_(body.contact_ids), Contact.tenant_id == user.tenant_id)
        .all()
    )
    found_ids = {c.id for c in contacts}
    missing = set(body.contact_ids) - found_ids
    if missing:
        raise HTTPException(400, f"Contacts introuvables: {', '.join(missing)}")

    # Check existing accepted ConsentRequests for these contacts
    accepted_crs = (
        db.query(ConsentRequest)
        .filter(
            ConsentRequest.contact_id.in_(body.contact_ids),
            ConsentRequest.tenant_id == user.tenant_id,
            ConsentRequest.status == "accepted",
        )
        .all()
    )
    accepted_map = {cr.contact_id: cr for cr in accepted_crs}

    attendees = []
    for contact_id in body.contact_ids:
        cr = accepted_map.get(contact_id)
        if cr:
            attendees.append(AttendeeEntry(
                contact_id=contact_id,
                status="accepted_email",
                evidence_type="email",
                evidence_id=cr.id,
                decided_at=cr.responded_at.isoformat() if cr.responded_at else None,
                decided_by="system",
            ))
        else:
            attendees.append(AttendeeEntry(
                contact_id=contact_id,
                status="pending_oral",
            ))

    job.attendees = json.dumps([a.model_dump() for a in attendees])
    job.recording_validity = "pending"
    _recompute_recording_validity(job, attendees)
    db.commit()

    email_count = sum(1 for a in attendees if a.status == "accepted_email")
    oral_count = sum(1 for a in attendees if a.status == "pending_oral")
    summary = f"{email_count} consentement(s) email validé(s), {oral_count} consentement(s) oral(aux) à valider"

    return AttendeesResponse(
        attendees=attendees,
        recording_validity=job.recording_validity,
        summary=summary,
    )


@router.get("/jobs/{job_id}/attendees", response_model=AttendeesResponse)
def get_attendees(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current attendees and consent status for a job."""
    job = _get_job(db, job_id, user.tenant_id)
    attendees = _parse_attendees(job.attendees)

    email_count = sum(1 for a in attendees if a.status == "accepted_email")
    oral_count = sum(1 for a in attendees if a.status == "pending_oral")
    accepted_oral = sum(1 for a in attendees if a.status == "accepted_oral")
    summary = (
        f"{email_count} email, {accepted_oral} oral validé(s), {oral_count} oral en attente"
        if attendees else "Aucun participant défini"
    )

    return AttendeesResponse(
        attendees=attendees,
        recording_validity=job.recording_validity,
        summary=summary,
    )


@router.get("/jobs/{job_id}/status", response_model=ConsentStatusResponse)
def get_consent_status(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full consent status for a job: attendees + requests + detections."""
    job = _get_job(db, job_id, user.tenant_id)
    attendees = _parse_attendees(job.attendees)

    crs = (
        db.query(ConsentRequest)
        .filter(ConsentRequest.job_id == job_id, ConsentRequest.tenant_id == user.tenant_id)
        .all()
    )
    cds = (
        db.query(ConsentDetection)
        .filter(ConsentDetection.job_id == job_id, ConsentDetection.tenant_id == user.tenant_id)
        .all()
    )

    can_record = all(a.status in ("accepted_email", "pending_oral") for a in attendees) if attendees else False
    can_generate = all(a.status in ("accepted_email", "accepted_oral") for a in attendees) if attendees else False

    return ConsentStatusResponse(
        job_id=job_id,
        recording_validity=job.recording_validity,
        attendees=attendees,
        consent_requests=[ConsentRequestResponse.model_validate(cr) for cr in crs],
        consent_detections=[_detection_to_response(cd) for cd in cds],
        can_record=can_record and job.recording_validity != "invalidated",
        can_generate=can_generate and job.recording_validity == "valid",
    )


@router.post("/send", response_model=ConsentRequestResponse)
def send_consent_request(
    body: ConsentSendRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send a consent request email to a contact."""
    contact = db.query(Contact).filter(
        Contact.id == body.contact_id, Contact.tenant_id == user.tenant_id
    ).first()
    if not contact:
        raise HTTPException(404, "Contact introuvable.")
    if not contact.email:
        raise HTTPException(400, "Ce contact n'a pas d'adresse email.")

    token = str(uuid.uuid4())
    cr = ConsentRequest(
        tenant_id=user.tenant_id,
        job_id=body.job_id,
        contact_id=body.contact_id,
        token=token,
        status="pending",
        notice_version=body.notice_version,
        sent_at=datetime.now(timezone.utc),
    )
    db.add(cr)
    db.commit()
    db.refresh(cr)

    # Send actual email
    from app.services.email import send_consent_email
    org_name = user.tenant.name if user.tenant else "ScribIA"
    send_consent_email(
        to_email=contact.email,
        to_name=contact.name,
        token=token,
        organisation=org_name,
    )

    return ConsentRequestResponse.model_validate(cr)


@router.post("/withdraw-manual")
def withdraw_consent_manual(
    body: ConsentWithdrawManualRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin withdraws consent on behalf of a contact (manual request)."""
    cr = (
        db.query(ConsentRequest)
        .filter(
            ConsentRequest.contact_id == body.contact_id,
            ConsentRequest.job_id == body.job_id,
            ConsentRequest.tenant_id == user.tenant_id,
            ConsentRequest.status == "accepted",
        )
        .first()
    )
    if not cr:
        raise HTTPException(404, "Aucun consentement accepte trouve pour ce contact et cette session.")

    now = datetime.now(timezone.utc)
    cr.status = "withdrawn"
    cr.withdrawn_at = now
    cr.withdrawn_via = "manual_request"
    cr.withdrawn_by = user.id
    cr.withdrawn_reason = body.reason

    # Update attendees and invalidate session + documents
    _update_attendee_status(
        db, body.job_id, body.contact_id,
        status="withdrawn",
        withdrawn_at=now.isoformat(),
    )
    job = db.query(TranscriptionJob).filter(TranscriptionJob.id == body.job_id).first()
    if job:
        job.recording_validity = "invalidated"

    # Cascade invalidation to AI documents
    contact = db.query(Contact).filter(Contact.id == body.contact_id).first()
    contact_name = f"{contact.first_name} {contact.last_name}" if contact else "un participant"
    _invalidate_documents_for_job(db, body.job_id, contact_name, now)

    db.commit()
    return ConsentActionResponse(
        status="withdrawn",
        message="Consentement retire manuellement pour le contact.",
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_profile_by_token(token: str, db: Session) -> SpeakerProfile:
    profile = (
        db.query(SpeakerProfile)
        .filter(SpeakerProfile.consent_token == token)
        .first()
    )
    if not profile:
        raise HTTPException(404, "Lien invalide ou expire.")
    if profile.consent_token_expires and profile.consent_token_expires < datetime.now(timezone.utc):
        raise HTTPException(410, "Ce lien a expire. Contactez votre administrateur.")
    if profile.consent_status == "accepted":
        raise HTTPException(400, "Le consentement a deja ete accepte.")
    return profile


def _get_job(db: Session, job_id: str, tenant_id: str) -> TranscriptionJob:
    job = db.query(TranscriptionJob).filter(
        TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == tenant_id
    ).first()
    if not job:
        raise HTTPException(404, "Session introuvable.")
    return job


def _parse_attendees(raw: str | None) -> list[AttendeeEntry]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [AttendeeEntry(**item) for item in data]
    except (json.JSONDecodeError, TypeError):
        return []


def _update_attendee_status(db: Session, job_id: str, contact_id: str, **fields):
    """Update a single attendee's fields in the job's attendees JSON."""
    job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
    if not job:
        return
    attendees = _parse_attendees(job.attendees)
    for a in attendees:
        if a.contact_id == contact_id:
            for k, v in fields.items():
                setattr(a, k, v)
            break
    job.attendees = json.dumps([a.model_dump() for a in attendees])
    _recompute_recording_validity(job, attendees)


def _recompute_recording_validity(job: TranscriptionJob, attendees: list[AttendeeEntry]):
    """Recompute recording_validity based on attendees statuses."""
    if not attendees:
        job.recording_validity = None
        return

    statuses = {a.status for a in attendees}

    if "refused" in statuses or "withdrawn" in statuses:
        job.recording_validity = "invalidated"
    elif all(s in ("accepted_email", "accepted_oral") for s in statuses):
        job.recording_validity = "valid"
    elif "pending" in statuses:
        job.recording_validity = "blocked"
    else:
        # Mix of accepted_* and pending_oral
        job.recording_validity = "pending"


def _invalidate_documents_for_job(db: Session, job_id: str, contact_name: str, withdrawn_at: datetime):
    """Mark all AIDocuments linked to this job as invalidated."""
    docs = db.query(AIDocument).filter(
        AIDocument.source_session_id == job_id,
        AIDocument.invalidated_at.is_(None),
    ).all()
    reason = f"Invalidé suite au retrait du consentement de {contact_name} le {withdrawn_at.strftime('%d/%m/%Y à %H:%M')}."
    for doc in docs:
        doc.invalidated_at = withdrawn_at
        doc.invalidated_reason = reason


def _detection_to_response(cd: ConsentDetection) -> ConsentDetectionResponse:
    covered = None
    if cd.covered_contacts:
        try:
            covered = json.loads(cd.covered_contacts)
        except (json.JSONDecodeError, TypeError):
            covered = None
    return ConsentDetectionResponse(
        id=cd.id,
        job_id=cd.job_id,
        detection_type=cd.detection_type,
        segment_start_ms=cd.segment_start_ms,
        segment_end_ms=cd.segment_end_ms,
        transcript_text=cd.transcript_text,
        speaker_id=cd.speaker_id,
        contact_id=cd.contact_id,
        covered_contacts=covered,
        ai_confidence=cd.ai_confidence,
        notice_version=cd.notice_version,
        user_confirmed=cd.user_confirmed,
        confirmed_by=cd.confirmed_by,
        confirmed_at=cd.confirmed_at,
        created_at=cd.created_at,
    )
