import enum

from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class PlannedMeetingStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PlannedMeeting(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "planned_meetings"

    tenant_id   = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    user_id     = Column(String(36), ForeignKey("users.id"), nullable=False)
    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    location    = Column(String(255), nullable=True)
    meeting_date = Column(DateTime(timezone=True), nullable=False)
    status      = Column(String(20), nullable=False, default=PlannedMeetingStatus.PLANNED)

    # Link to the diarisation job once recording starts
    job_id = Column(String(36), ForeignKey("transcription_jobs.id"), nullable=True)

    participants = relationship(
        "PlannedMeetingParticipant",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="PlannedMeetingParticipant.created_at",
    )
    dossier = relationship(
        "PreparatoryDossier",
        foreign_keys="[PreparatoryDossier.planned_meeting_id]",
        uselist=False,
        back_populates="planned_meeting",
        cascade="all, delete-orphan",
    )


class PlannedMeetingParticipant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "planned_meeting_participants"

    meeting_id = Column(String(36), ForeignKey("planned_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id = Column(String(36), ForeignKey("contacts.id"), nullable=True)
    name       = Column(String(255), nullable=False)
    email      = Column(String(255), nullable=True)
    # Speaker profile for voice identification
    speaker_profile_id = Column(String(36), ForeignKey("speaker_profiles.id"), nullable=True)
    enrollment_status  = Column(String(20), nullable=True)  # cached from speaker_profile
    consent_status     = Column(String(20), nullable=True)  # cached from speaker_profile

    meeting = relationship("PlannedMeeting", back_populates="participants")
