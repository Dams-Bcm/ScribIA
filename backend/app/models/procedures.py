"""Modèles pour le module Procédures — workflow collaboratif de réunion.

Flux : Création → Invitations & Collecte → Planification → Confirmation
      → Réunion (transcription) → Génération IA → Terminé
"""

import enum

from sqlalchemy import Boolean, Column, ForeignKey, String, Text, DateTime, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, _utcnow


class ProcedureStatus(str, enum.Enum):
    DRAFT      = "draft"       # créée, pas encore envoyée
    COLLECTING = "collecting"  # invitations envoyées, collecte en cours
    SCHEDULED  = "scheduled"   # date fixée, confirmations envoyées
    MEETING    = "meeting"     # réunion tenue, transcription liée
    GENERATING = "generating"  # génération IA en cours
    DONE       = "done"        # terminée


# ── Templates de procédure ────────────────────────────────────────────────────

class ProcedureTemplate(UUIDMixin, TimestampMixin, Base):
    """Template réutilisable définissant un type de procédure.

    Deux usages :
    - Template sectoriel (sector != NULL, tenant_id NULL) : master template géré par le super admin
    - Template tenant (tenant_id != NULL) : copie locale créée lors du provisionnement
    """
    __tablename__ = "procedure_templates"

    tenant_id   = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    sector      = Column(String(50), nullable=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # Template de document IA à générer en fin de procédure (nullable)
    document_template_id = Column(
        String(36),
        ForeignKey("ai_document_templates.id", ondelete="NO ACTION"),
        nullable=True,
    )
    is_active   = Column(Boolean, nullable=False, default=True)

    roles       = relationship(
        "ProcedureTemplateRole",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProcedureTemplateRole.order_index",
    )
    procedures  = relationship("Procedure", back_populates="template")


class ProcedureTemplateRole(UUIDMixin, Base):
    """Rôle participant dans un template, avec son formulaire de questions."""
    __tablename__ = "procedure_template_roles"

    template_id      = Column(String(36), ForeignKey("procedure_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    role_name        = Column(String(100), nullable=False)   # ex: "Enseignant", "Parent"
    order_index      = Column(Integer, nullable=False, default=0)
    # JSON array : [{id, label, type: "text"|"textarea"|"select", options?: [...]}]
    form_questions   = Column(Text, nullable=True)
    invitation_delay_days = Column(Integer, nullable=False, default=15)  # J-X pour l'invitation

    template = relationship("ProcedureTemplate", back_populates="roles")


# ── Procédures (instances) ────────────────────────────────────────────────────

class Procedure(UUIDMixin, TimestampMixin, Base):
    """Instance d'une procédure pour une réunion donnée."""
    __tablename__ = "procedures"

    tenant_id   = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id     = Column(String(36), ForeignKey("users.id", ondelete="NO ACTION"), nullable=True)
    template_id = Column(String(36), ForeignKey("procedure_templates.id", ondelete="NO ACTION"), nullable=True)

    title       = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status      = Column(String(20), nullable=False, default=ProcedureStatus.DRAFT)
    meeting_date = Column(DateTime(timezone=True), nullable=True)

    # Document IA à générer (peut différer du template par défaut)
    document_template_id = Column(
        String(36),
        ForeignKey("ai_document_templates.id", ondelete="NO ACTION"),
        nullable=True,
    )

    # Liens vers les ressources produites
    source_session_id = Column(
        String(36),
        ForeignKey("transcription_jobs.id", ondelete="NO ACTION"),
        nullable=True,
    )
    ai_document_id = Column(
        String(36),
        ForeignKey("ai_documents.id", ondelete="NO ACTION"),
        nullable=True,
    )

    template     = relationship("ProcedureTemplate", back_populates="procedures")
    participants = relationship(
        "ProcedureParticipant",
        back_populates="procedure",
        cascade="all, delete-orphan",
        order_by="ProcedureParticipant.created_at",
    )


class ProcedureParticipant(UUIDMixin, Base):
    """Participant à une procédure, avec son token de formulaire unique."""
    __tablename__ = "procedure_participants"

    procedure_id = Column(String(36), ForeignKey("procedures.id", ondelete="CASCADE"), nullable=False, index=True)
    name         = Column(String(255), nullable=False)
    email        = Column(String(255), nullable=True)
    role_name    = Column(String(100), nullable=False)

    # Snapshot des questions envoyées (JSON array)
    form_questions = Column(Text, nullable=True)

    # Token unique pour accès public au formulaire
    form_token   = Column(String(36), nullable=False, unique=True)

    invited_at   = Column(DateTime(timezone=True), nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    # Réponses JSON : {question_id: valeur}
    responses    = Column(Text, nullable=True)

    created_at   = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    procedure = relationship("Procedure", back_populates="participants")
