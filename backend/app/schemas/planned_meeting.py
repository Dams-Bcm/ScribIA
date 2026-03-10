from datetime import datetime
from pydantic import BaseModel, Field


# ── Participants ─────────────────────────────────────────────────────────────

class ParticipantBase(BaseModel):
    contact_id: str | None = None
    name: str = Field(..., min_length=1, max_length=255)
    email: str | None = None
    speaker_profile_id: str | None = None


class ParticipantResponse(ParticipantBase):
    id: str
    enrollment_status: str | None = None
    consent_status: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Planned Meetings ────────────────────────────────────────────────────────

class PlannedMeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    meeting_date: datetime
    participant_ids: list[str] = []  # contact IDs to add as participants


class PlannedMeetingUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    location: str | None = None
    meeting_date: datetime | None = None
    status: str | None = None


class PlannedMeetingResponse(BaseModel):
    id: str
    title: str
    description: str | None
    location: str | None
    meeting_date: datetime
    status: str
    job_id: str | None
    dossier_id: str | None = None
    participant_count: int = 0
    enrolled_count: int = 0
    consented_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlannedMeetingDetailResponse(PlannedMeetingResponse):
    participants: list[ParticipantResponse] = []
