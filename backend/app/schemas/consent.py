from datetime import datetime
from pydantic import BaseModel, Field


# ── Attendee (élément du JSON attendees[] sur TranscriptionJob) ──────────────

class AttendeeEntry(BaseModel):
    """Un participant dans le JSON attendees[] d'un TranscriptionJob."""
    contact_id: str
    status: str = "pending"
    # "pending" | "pending_oral" | "accepted_email" | "accepted_oral" | "refused" | "withdrawn"
    evidence_type: str | None = None       # "email" | "oral"
    evidence_id: str | None = None         # FK vers ConsentRequest ou ConsentDetection
    segment_start_ms: float | None = None  # oral uniquement
    segment_end_ms: float | None = None
    decided_at: str | None = None          # ISO datetime
    decided_by: str | None = None          # "system" | "user_confirmed"
    withdrawn_at: str | None = None
    withdrawn_via: str | None = None


# ── ConsentRequest (email) ───────────────────────────────────────────────────

class ConsentRequestResponse(BaseModel):
    id: str
    job_id: str | None
    contact_id: str
    status: str
    notice_version: str | None
    sent_at: datetime | None
    responded_at: datetime | None
    withdrawn_at: datetime | None
    withdrawn_via: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConsentSendRequest(BaseModel):
    """Envoi d'une demande de consentement par email."""
    contact_id: str
    job_id: str | None = None
    notice_version: str | None = None


class ConsentWithdrawManualRequest(BaseModel):
    """Retrait manuel de consentement par un admin."""
    contact_id: str
    job_id: str
    reason: str | None = None


# ── ConsentDetection (oral) ──────────────────────────────────────────────────

class ConsentDetectionResponse(BaseModel):
    id: str
    job_id: str
    detection_type: str
    segment_start_ms: float | None
    segment_end_ms: float | None
    transcript_text: str | None
    speaker_id: str | None
    contact_id: str | None
    covered_contacts: list[str] | None = None
    ai_confidence: float | None
    notice_version: str | None
    user_confirmed: bool
    confirmed_by: str | None
    confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Attendees management ─────────────────────────────────────────────────────

class SetAttendeesRequest(BaseModel):
    """Définir les participants d'une session (liste de contact_ids)."""
    contact_ids: list[str] = Field(..., min_length=1)


class AttendeesResponse(BaseModel):
    """Réponse avec la liste des attendees et le recording_validity."""
    attendees: list[AttendeeEntry]
    recording_validity: str | None
    summary: str | None = None  # ex: "6 email validés, 4 oraux à valider"


# ── Consent status for a job ─────────────────────────────────────────────────

class ConsentStatusResponse(BaseModel):
    """Statut global du consentement pour une session."""
    job_id: str
    recording_validity: str | None
    attendees: list[AttendeeEntry]
    consent_requests: list[ConsentRequestResponse] = []
    consent_detections: list[ConsentDetectionResponse] = []
    can_record: bool = False        # tous accepted_email ou pending_oral
    can_generate: bool = False      # tous accepted_*
