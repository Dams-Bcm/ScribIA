"""Models for the Consent module — RGPD consent tracking and proof."""

from sqlalchemy import Column, String, Float, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class ConsentRequest(UUIDMixin, TimestampMixin, Base):
    """
    Source de vérité pour les consentements par email.

    Cycle de vie : pending → accepted | refused → withdrawn (optionnel)
    Le retrait doit être aussi simple que le recueil (même lien email).
    """
    __tablename__ = "consent_requests"

    tenant_id    = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    job_id       = Column(String(36), ForeignKey("transcription_jobs.id"), nullable=True)
    contact_id   = Column(String(36), ForeignKey("contacts.id"), nullable=False, index=True)
    token        = Column(String(255), nullable=False, unique=True)
    status       = Column(String(20), nullable=False, default="pending")
    # "pending" | "accepted" | "refused" | "withdrawn"

    # Version de la notice d'information affichée au moment du consentement
    notice_version = Column(String(50), nullable=True)
    notice_hash    = Column(String(128), nullable=True)

    sent_at        = Column(DateTime(timezone=True), nullable=True)
    responded_at   = Column(DateTime(timezone=True), nullable=True)

    # Retrait
    withdrawn_at     = Column(DateTime(timezone=True), nullable=True)
    withdrawn_via    = Column(String(20), nullable=True)   # "email_link" | "manual_request"
    withdrawn_by     = Column(String(36), ForeignKey("users.id"), nullable=True)
    withdrawn_reason = Column(Text, nullable=True)

    # Preuve
    ip_address = Column(String(45), nullable=True)    # IPv6 max 45 chars
    user_agent = Column(String(500), nullable=True)

    # Relations
    tenant   = relationship("Tenant")
    job      = relationship("TranscriptionJob")
    contact  = relationship("Contact")
    withdrawer = relationship("User", foreign_keys=[withdrawn_by])


class ConsentDetection(UUIDMixin, TimestampMixin, Base):
    """
    Source de vérité pour les consentements oraux détectés par l'IA.

    L'IA détecte un segment de consentement/refus dans la transcription,
    l'utilisateur DOIT confirmer (pas d'auto-accept).
    """
    __tablename__ = "consent_detections"

    tenant_id      = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    job_id         = Column(String(36), ForeignKey("transcription_jobs.id"), nullable=False, index=True)
    detection_type = Column(String(30), nullable=False)
    # "collective_consent" | "individual_refusal"

    # Segment audio
    segment_start_ms = Column(Float, nullable=True)
    segment_end_ms   = Column(Float, nullable=True)
    transcript_text  = Column(Text, nullable=True)

    # Locuteur (si identifiable)
    speaker_id = Column(String(50), nullable=True)    # SPEAKER_XX
    contact_id = Column(String(36), ForeignKey("contacts.id"), nullable=True)

    # Contacts couverts par ce consentement collectif
    # Transitoire : à terme, table de liaison consent_detection_covered_contacts
    covered_contacts = Column(Text, nullable=True)    # JSON array of contact_ids

    # IA
    ai_confidence = Column(Float, nullable=True)      # 0.0 - 1.0

    # Notice d'information contextuelle
    notice_version = Column(String(50), nullable=True)

    # Confirmation utilisateur
    user_confirmed = Column(Boolean, nullable=False, default=False)
    confirmed_by   = Column(String(36), ForeignKey("users.id"), nullable=True)
    confirmed_at   = Column(DateTime(timezone=True), nullable=True)

    # Relations
    tenant    = relationship("Tenant")
    job       = relationship("TranscriptionJob")
    contact   = relationship("Contact", foreign_keys=[contact_id])
    confirmer = relationship("User", foreign_keys=[confirmed_by])
