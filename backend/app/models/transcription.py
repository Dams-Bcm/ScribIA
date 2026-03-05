import enum

from sqlalchemy import Column, String, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class TranscriptionJobStatus(str, enum.Enum):
    CREATED = "created"
    UPLOADING = "uploading"
    QUEUED = "queued"
    CONVERTING = "converting"
    DIARIZING = "diarizing"
    TRANSCRIBING = "transcribing"
    ALIGNING = "aligning"
    COMPLETED = "completed"
    ERROR = "error"


class TranscriptionJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transcription_jobs"

    tenant_id         = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    user_id           = Column(String(36), ForeignKey("users.id"), nullable=False)
    title             = Column(String(255), nullable=False)
    status            = Column(String(50), nullable=False, default=TranscriptionJobStatus.CREATED)
    progress          = Column(Integer, nullable=False, default=0)
    progress_message  = Column(String(500), nullable=True)
    error_message     = Column(Text, nullable=True)
    audio_filename    = Column(String(255), nullable=True)
    original_filename = Column(String(255), nullable=True)
    duration_seconds  = Column(Float, nullable=True)
    audio_file_size   = Column(Integer, nullable=True)
    language          = Column(String(10), nullable=False, default="fr")
    mode              = Column(String(20), nullable=False, default="simple")
    num_speakers      = Column(Integer, nullable=True)
    detected_speakers = Column(Integer, nullable=True)

    segments = relationship(
        "TranscriptionSegment",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="TranscriptionSegment.order_index",
    )
    speakers = relationship(
        "DiarisationSpeaker",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="DiarisationSpeaker.color_index",
    )


class TranscriptionSegment(UUIDMixin, Base):
    __tablename__ = "transcription_segments"

    job_id        = Column(String(36), ForeignKey("transcription_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time    = Column(Float, nullable=False)
    end_time      = Column(Float, nullable=False)
    text          = Column(Text, nullable=False)
    order_index   = Column(Integer, nullable=False)
    speaker_id    = Column(String(50), nullable=True)
    speaker_label = Column(String(255), nullable=True)

    job = relationship("TranscriptionJob", back_populates="segments")


class DiarisationSpeaker(UUIDMixin, Base):
    __tablename__ = "diarisation_speakers"

    job_id         = Column(String(36), ForeignKey("transcription_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    speaker_id     = Column(String(50), nullable=False)   # label pyannote ex: "SPEAKER_00"
    display_name   = Column(String(255), nullable=True)
    color_index    = Column(Integer, nullable=False, default=0)
    segment_count  = Column(Integer, nullable=False, default=0)
    total_duration = Column(Float, nullable=False, default=0.0)

    # Lien vers le profil vocal identifié (null si locuteur non identifié)
    profile_id = Column(String(36), ForeignKey("speaker_profiles.id"), nullable=True)
    # Embedding extrait pour ce locuteur dans ce job (JSON float array)
    embedding  = Column(Text, nullable=True)

    job     = relationship("TranscriptionJob", back_populates="speakers")
    profile = relationship("SpeakerProfile", back_populates="diarisation_speakers")
