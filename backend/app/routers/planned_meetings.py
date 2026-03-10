"""Router — Réunions planifiées.

Préfixe : /planned-meetings
Module requis : transcription_diarisation
"""

import json
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.planned_meeting import PlannedMeeting, PlannedMeetingParticipant, PlannedMeetingStatus
from app.models.preparatory import PreparatoryDossier
from app.models.contacts import Contact
from app.models.speaker import SpeakerProfile
from app.models.transcription import TranscriptionJob
from app.models.user import User
from app.config import settings

logger = logging.getLogger(__name__)
from app.schemas.planned_meeting import (
    PlannedMeetingCreate,
    PlannedMeetingUpdate,
    PlannedMeetingResponse,
    PlannedMeetingDetailResponse,
    ParticipantResponse,
    ParticipantBase,
)

router = APIRouter(
    prefix="/planned-meetings",
    tags=["planned-meetings"],
    dependencies=[Depends(require_module("transcription_diarisation"))],
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _refresh_participants(db: Session, participants: list) -> None:
    """Refresh cached speaker_profile_id and enrollment_status from actual SpeakerProfiles."""
    contact_ids = [p.contact_id for p in participants if p.contact_id]
    if not contact_ids:
        return
    profiles = (
        db.query(SpeakerProfile)
        .filter(SpeakerProfile.contact_id.in_(contact_ids))
        .all()
    )
    profile_map = {sp.contact_id: sp for sp in profiles}
    dirty = False
    for p in participants:
        sp = profile_map.get(p.contact_id)
        new_profile_id = sp.id if sp else None
        new_enroll = sp.enrollment_status if sp else None
        new_consent = sp.consent_status if sp else None
        if (p.speaker_profile_id != new_profile_id
                or p.enrollment_status != new_enroll
                or p.consent_status != new_consent):
            p.speaker_profile_id = new_profile_id
            p.enrollment_status = new_enroll
            p.consent_status = new_consent
            dirty = True
    if dirty:
        db.commit()


def _to_response(m: PlannedMeeting) -> PlannedMeetingResponse:
    participants = m.participants or []
    enrolled = sum(1 for p in participants if p.enrollment_status == "enrolled")
    consented = sum(1 for p in participants if p.consent_status == "accepted")
    return PlannedMeetingResponse(
        id=m.id,
        title=m.title,
        description=m.description,
        location=m.location,
        meeting_date=m.meeting_date,
        status=m.status,
        job_id=m.job_id,
        dossier_id=m.dossier.id if m.dossier else None,
        participant_count=len(participants),
        enrolled_count=enrolled,
        consented_count=consented,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _to_detail(m: PlannedMeeting) -> PlannedMeetingDetailResponse:
    participants = m.participants or []
    enrolled = sum(1 for p in participants if p.enrollment_status == "enrolled")
    consented = sum(1 for p in participants if p.consent_status == "accepted")
    return PlannedMeetingDetailResponse(
        id=m.id,
        title=m.title,
        description=m.description,
        location=m.location,
        meeting_date=m.meeting_date,
        status=m.status,
        job_id=m.job_id,
        dossier_id=m.dossier.id if m.dossier else None,
        participant_count=len(participants),
        enrolled_count=enrolled,
        consented_count=consented,
        created_at=m.created_at,
        updated_at=m.updated_at,
        participants=[
            ParticipantResponse(
                id=p.id,
                contact_id=p.contact_id,
                name=p.name,
                email=p.email,
                speaker_profile_id=p.speaker_profile_id,
                enrollment_status=p.enrollment_status,
                consent_status=p.consent_status,
                created_at=p.created_at,
            )
            for p in participants
        ],
    )


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PlannedMeetingResponse])
def list_planned_meetings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meetings = (
        db.query(PlannedMeeting)
        .options(joinedload(PlannedMeeting.participants), joinedload(PlannedMeeting.dossier))
        .filter(PlannedMeeting.tenant_id == user.tenant_id)
        .order_by(PlannedMeeting.meeting_date.desc())
        .all()
    )
    for m in meetings:
        _refresh_participants(db, m.participants or [])
    return [_to_response(m) for m in meetings]


@router.get("/{meeting_id}", response_model=PlannedMeetingDetailResponse)
def get_planned_meeting(
    meeting_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = (
        db.query(PlannedMeeting)
        .options(joinedload(PlannedMeeting.participants), joinedload(PlannedMeeting.dossier))
        .filter(PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(404, "Réunion non trouvée")
    _refresh_participants(db, m.participants or [])
    return _to_detail(m)


@router.post("", response_model=PlannedMeetingDetailResponse, status_code=201)
def create_planned_meeting(
    data: PlannedMeetingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = PlannedMeeting(
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=data.title,
        description=data.description,
        location=data.location,
        meeting_date=data.meeting_date,
    )
    db.add(meeting)
    db.flush()

    # Auto-create linked preparatory dossier
    dossier = PreparatoryDossier(
        tenant_id=user.tenant_id,
        user_id=user.id,
        planned_meeting_id=meeting.id,
        title=data.title,
        description=data.description,
        meeting_date=data.meeting_date,
    )
    db.add(dossier)

    # Add participants from contact IDs
    if data.participant_ids:
        contacts = (
            db.query(Contact)
            .filter(Contact.id.in_(data.participant_ids), Contact.tenant_id == user.tenant_id)
            .all()
        )
        for c in contacts:
            # Look up speaker profile for enrollment status
            sp = db.query(SpeakerProfile).filter(SpeakerProfile.contact_id == c.id).first() if c else None
            participant = PlannedMeetingParticipant(
                meeting_id=meeting.id,
                contact_id=c.id,
                name=f"{c.first_name or ''} {c.name}".strip(),
                email=c.email,
                speaker_profile_id=sp.id if sp else None,
                enrollment_status=sp.enrollment_status if sp else None,
                consent_status=sp.consent_status if sp else None,
            )
            db.add(participant)

    db.commit()
    db.refresh(meeting)
    return _to_detail(meeting)


@router.patch("/{meeting_id}", response_model=PlannedMeetingDetailResponse)
def update_planned_meeting(
    meeting_id: str,
    data: PlannedMeetingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(PlannedMeeting).filter(
        PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id,
    ).first()
    if not m:
        raise HTTPException(404, "Réunion non trouvée")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(m, field, value)

    # Sync changes to linked dossier
    dossier = db.query(PreparatoryDossier).filter_by(planned_meeting_id=meeting_id).first()
    if dossier:
        if "title" in updates:
            dossier.title = m.title
        if "description" in updates:
            dossier.description = m.description
        if "meeting_date" in updates:
            dossier.meeting_date = m.meeting_date

    db.commit()
    db.refresh(m)
    # Re-load with participants + dossier
    m = (
        db.query(PlannedMeeting)
        .options(joinedload(PlannedMeeting.participants), joinedload(PlannedMeeting.dossier))
        .filter(PlannedMeeting.id == meeting_id)
        .first()
    )
    return _to_detail(m)


@router.delete("/{meeting_id}", status_code=204)
def delete_planned_meeting(
    meeting_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(PlannedMeeting).filter(
        PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id,
    ).first()
    if not m:
        raise HTTPException(404, "Réunion non trouvée")

    # Clean up dossier files on disk before cascade delete
    dossier = db.query(PreparatoryDossier).filter_by(planned_meeting_id=meeting_id).first()
    if dossier:
        docs_dir = Path(settings.prep_docs_path) / user.tenant_id / dossier.id
        if docs_dir.exists():
            shutil.rmtree(docs_dir, ignore_errors=True)

    db.delete(m)
    db.commit()


# ── Participants management ──────────────────────────────────────────────────

@router.post("/{meeting_id}/participants", response_model=PlannedMeetingDetailResponse)
def add_participants(
    meeting_id: str,
    contact_ids: list[str],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = (
        db.query(PlannedMeeting)
        .options(joinedload(PlannedMeeting.participants), joinedload(PlannedMeeting.dossier))
        .filter(PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(404, "Réunion non trouvée")

    existing_contact_ids = {p.contact_id for p in m.participants if p.contact_id}
    new_ids = [cid for cid in contact_ids if cid not in existing_contact_ids]

    if new_ids:
        contacts = db.query(Contact).filter(Contact.id.in_(new_ids), Contact.tenant_id == user.tenant_id).all()
        for c in contacts:
            sp = db.query(SpeakerProfile).filter(SpeakerProfile.contact_id == c.id).first()
            participant = PlannedMeetingParticipant(
                meeting_id=m.id,
                contact_id=c.id,
                name=f"{c.first_name or ''} {c.name}".strip(),
                email=c.email,
                speaker_profile_id=sp.id if sp else None,
                enrollment_status=sp.enrollment_status if sp else None,
                consent_status=sp.consent_status if sp else None,
            )
            db.add(participant)
        db.commit()
        db.refresh(m)

    return _to_detail(m)


@router.delete("/{meeting_id}/participants/{participant_id}", status_code=204)
def remove_participant(
    meeting_id: str,
    participant_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(PlannedMeeting).filter(
        PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id,
    ).first()
    if not m:
        raise HTTPException(404, "Réunion non trouvée")

    p = db.query(PlannedMeetingParticipant).filter(
        PlannedMeetingParticipant.id == participant_id,
        PlannedMeetingParticipant.meeting_id == meeting_id,
    ).first()
    if not p:
        raise HTTPException(404, "Participant non trouvé")

    db.delete(p)
    db.commit()


# ── Link to diarisation job ──────────────────────────────────────────────────

@router.post("/{meeting_id}/start-recording", response_model=PlannedMeetingDetailResponse)
def link_recording(
    meeting_id: str,
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Link a diarisation job to a planned meeting and mark it as in_progress.

    Automatically populates the job with data from the planned meeting:
    - title
    - attendees (from participants with contact_id)
    """
    m = (
        db.query(PlannedMeeting)
        .options(joinedload(PlannedMeeting.participants), joinedload(PlannedMeeting.dossier))
        .filter(PlannedMeeting.id == meeting_id, PlannedMeeting.tenant_id == user.tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(404, "Réunion non trouvée")

    m.job_id = job_id
    m.status = PlannedMeetingStatus.IN_PROGRESS

    # Populate job from planned meeting data
    job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
    if job:
        _populate_job_from_meeting(db, job, m)

    db.commit()
    db.refresh(m)
    return _to_detail(m)


def _populate_job_from_meeting(db: Session, job: TranscriptionJob, meeting: PlannedMeeting):
    """Transfer planned meeting data into the transcription job."""
    from app.models.consent import ConsentRequest

    # Title
    job.title = meeting.title

    # Build attendees from participants with a contact_id
    contact_ids = [p.contact_id for p in meeting.participants if p.contact_id]
    if not contact_ids:
        return

    # Check existing email consent
    accepted_crs = (
        db.query(ConsentRequest)
        .filter(
            ConsentRequest.contact_id.in_(contact_ids),
            ConsentRequest.tenant_id == job.tenant_id,
            ConsentRequest.status == "accepted",
        )
        .all()
    )
    accepted_cr_map = {cr.contact_id: cr for cr in accepted_crs}

    # Check speaker profile consent (email only, not oral)
    accepted_profiles = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.contact_id.in_(contact_ids),
            SpeakerProfile.tenant_id == job.tenant_id,
            SpeakerProfile.consent_status == "accepted",
            SpeakerProfile.consent_type != "oral_recording",
        )
        .all()
    )
    accepted_profile_map = {p.contact_id: p for p in accepted_profiles}

    attendees = []
    for cid in contact_ids:
        cr = accepted_cr_map.get(cid)
        profile = accepted_profile_map.get(cid)
        entry = {"contact_id": cid}
        if cr:
            entry.update(
                status="accepted_email",
                evidence_type="email",
                evidence_id=cr.id,
                decided_at=cr.responded_at.isoformat() if cr.responded_at else None,
                decided_by="system",
            )
        elif profile:
            entry.update(
                status="accepted_email",
                evidence_type="email",
                decided_at=profile.consent_date.isoformat() if profile.consent_date else None,
                decided_by="system",
            )
        else:
            entry["status"] = "pending_oral"
        attendees.append(entry)

    job.attendees = json.dumps(attendees)

    # Compute recording_validity
    statuses = {a["status"] for a in attendees}
    if statuses <= {"accepted_email", "accepted_oral"}:
        job.recording_validity = "valid"
    elif "refused" in statuses or "withdrawn" in statuses:
        job.recording_validity = "invalidated"
    elif statuses & {"accepted_email", "accepted_oral"}:
        job.recording_validity = "pending"
    else:
        job.recording_validity = "blocked"

    logger.info(
        f"[PLANNED→JOB] Populated job {job.id} from meeting: "
        f"title='{job.title}', attendees={len(attendees)}, "
        f"validity={job.recording_validity}"
    )
