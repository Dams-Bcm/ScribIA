from sqlalchemy import Column, String, Boolean, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class SpeakerProfile(UUIDMixin, TimestampMixin, Base):
    """
    Profil vocal d'une personne physique, lié à un tenant.

    Cycle de vie :
      1. Consentement  → consent_status : None → sent → accepted | declined
      2. Enrollment    → enrollment_status : None → pending_online → enrolled
                         (ou directement enrolled si via segments de transcription)
    """
    __tablename__ = "speaker_profiles"

    tenant_id    = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    first_name   = Column(String(100), nullable=True)
    last_name    = Column(String(100), nullable=True)
    display_name = Column(String(255), nullable=True)   # "{first_name} {last_name}", calculé à la sauvegarde
    fonction     = Column(String(255), nullable=True)
    email        = Column(String(255), nullable=True)
    phone_number = Column(String(50),  nullable=True)

    # ── Consentement ────────────────────────────────────────────────────────────
    # consent_status   : None | sent | accepted | declined
    # consent_type     : email | oral_recording
    # consent_scope    : individual | collective  (oral_recording uniquement)
    consent_status        = Column(String(20),  nullable=True)
    consent_type          = Column(String(20),  nullable=True)
    consent_scope         = Column(String(20),  nullable=True)
    consent_date          = Column(DateTime(timezone=True), nullable=True)

    # Email : token envoyé à la personne pour signer en ligne
    consent_token         = Column(String(255), nullable=True)
    consent_token_expires = Column(DateTime(timezone=True), nullable=True)

    # Option B (oral) : segment de référence + admin qui a validé
    # consent_scope : individual | collective
    consent_segment_id   = Column(String(36), ForeignKey("transcription_segments.id"), nullable=True)
    consent_validated_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    # RGPD : token persistant pour que la personne retire son consentement
    withdrawal_token      = Column(String(255), nullable=True)

    # ── Enrollment voix ─────────────────────────────────────────────────────────
    # enrollment_status  : None | pending_online | enrolled
    # enrollment_method  : online | operator
    enrollment_status         = Column(String(20),  nullable=True)
    enrollment_method         = Column(String(20),  nullable=True)
    enrolled_at               = Column(DateTime(timezone=True), nullable=True)

    # Option A (online) : token envoyé par email pour enregistrer la phrase
    enrollment_token          = Column(String(255), nullable=True)
    enrollment_token_expires  = Column(DateTime(timezone=True), nullable=True)
    enrollment_audio_filename = Column(String(255), nullable=True)  # audio de calibration conservé

    # Embedding vocal (JSON float array) — null avant enrollment
    embedding = Column(Text, nullable=True)

    # Partage avec le tenant parent (EPCI)
    share_with_parent_tenant = Column(Boolean, nullable=False, default=False)

    # ── Relations ───────────────────────────────────────────────────────────────
    tenant               = relationship("Tenant", back_populates="speaker_profiles")
    consent_validator    = relationship("User", foreign_keys=[consent_validated_by])
    consent_segment      = relationship("TranscriptionSegment", foreign_keys=[consent_segment_id])
    enrollment_segments  = relationship(
        "SpeakerEnrollmentSegment",
        back_populates="speaker_profile",
        cascade="all, delete-orphan",
    )
    diarisation_speakers = relationship("DiarisationSpeaker", back_populates="profile")


class SpeakerEnrollmentSegment(UUIDMixin, Base):
    """
    Segments de transcription sélectionnés par l'admin pour construire
    l'embedding vocal d'un SpeakerProfile (enrollment option B — depuis une transcription).
    Plusieurs segments peuvent être combinés pour améliorer la qualité.
    """
    __tablename__ = "speaker_enrollment_segments"

    speaker_profile_id = Column(String(36), ForeignKey("speaker_profiles.id"), nullable=False, index=True)
    job_id             = Column(String(36), ForeignKey("transcription_jobs.id"), nullable=False, index=True)
    segment_id         = Column(String(36), ForeignKey("transcription_segments.id"), nullable=False)
    start_time         = Column(Float, nullable=True)   # dénormalisé pour accès rapide
    end_time           = Column(Float, nullable=True)

    speaker_profile = relationship("SpeakerProfile", back_populates="enrollment_segments")
    job             = relationship("TranscriptionJob")
    segment         = relationship("TranscriptionSegment", foreign_keys=[segment_id])
