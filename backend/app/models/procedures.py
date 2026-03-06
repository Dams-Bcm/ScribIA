"""Modèles pour le module Procédures — workflow collaboratif.

Deux modes :
1. Workflow à étapes (steps) : pipeline séquentiel configurable
2. Legacy (roles) : collecte de formulaires par rôle participant (rétrocompat)
"""

import enum

from sqlalchemy import Boolean, Column, ForeignKey, String, Text, DateTime, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, _utcnow


class ProcedureStatus(str, enum.Enum):
    DRAFT      = "draft"       # créée, pas encore commencée
    IN_PROGRESS = "in_progress" # workflow en cours (au moins une étape démarrée)
    COLLECTING = "collecting"  # (legacy) collecte en cours
    SCHEDULED  = "scheduled"   # (legacy) date fixée
    MEETING    = "meeting"     # réunion tenue
    GENERATING = "generating"  # génération IA en cours
    DONE       = "done"        # terminée


class StepType(str, enum.Enum):
    FORM              = "form"               # Formulaire à remplir par l'utilisateur
    SELECT_CONTACTS   = "select_contacts"    # Sélection de contacts
    SEND_EMAIL        = "send_email"         # Envoi d'email aux contacts
    COLLECT_RESPONSES = "collect_responses"   # Collecte de réponses (formulaire public)
    GENERATE_DOCUMENT = "generate_document"  # Génération de document IA
    UPLOAD_DOCUMENT   = "upload_document"    # Upload d'un fichier
    MANUAL            = "manual"             # Étape manuelle (validation humaine)


class StepStatus(str, enum.Enum):
    PENDING     = "pending"      # Pas encore accessible
    ACTIVE      = "active"       # Étape en cours
    COMPLETED   = "completed"    # Terminée
    SKIPPED     = "skipped"      # Passée


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
    steps       = relationship(
        "ProcedureTemplateStep",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProcedureTemplateStep.order_index",
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


class ProcedureTemplateStep(UUIDMixin, Base):
    """Étape dans un template de procédure (pipeline séquentiel)."""
    __tablename__ = "procedure_template_steps"

    template_id = Column(String(36), ForeignKey("procedure_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)
    step_type   = Column(String(30), nullable=False)  # StepType enum value
    label       = Column(String(200), nullable=False)  # Nom affiché (ex: "Création de l'ODJ")
    description = Column(Text, nullable=True)
    # JSON config spécifique au type d'étape :
    #   form:              {"fields": [{"id","label","type","required","options"}]}
    #   select_contacts:   {"allow_groups": true}
    #   send_email:        {"subject_template": "...", "body_template": "...", "attach_previous": true}
    #   collect_responses: {"roles": [{"role_name","form_questions":[...],"invitation_delay_days":15}]}
    #   generate_document: {"document_template_id": "..."}
    #   upload_document:   {"accepted_types": ["pdf","docx"]}
    #   manual:            {"instructions": "..."}
    config      = Column(Text, nullable=True)  # JSON
    is_required = Column(Boolean, nullable=False, default=True)

    template = relationship("ProcedureTemplate", back_populates="steps")


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

    # Étape courante (index 0-based, None = pas encore commencé ou mode legacy)
    current_step_index = Column(Integer, nullable=True)

    template     = relationship("ProcedureTemplate", back_populates="procedures")
    participants = relationship(
        "ProcedureParticipant",
        back_populates="procedure",
        cascade="all, delete-orphan",
        order_by="ProcedureParticipant.created_at",
    )
    step_instances = relationship(
        "ProcedureStepInstance",
        back_populates="procedure",
        cascade="all, delete-orphan",
        order_by="ProcedureStepInstance.order_index",
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


class ProcedureStepInstance(UUIDMixin, Base):
    """Instance d'une étape dans une procédure en cours."""
    __tablename__ = "procedure_step_instances"

    procedure_id     = Column(String(36), ForeignKey("procedures.id", ondelete="CASCADE"), nullable=False, index=True)
    template_step_id = Column(String(36), ForeignKey("procedure_template_steps.id", ondelete="NO ACTION"), nullable=True)
    order_index      = Column(Integer, nullable=False, default=0)
    step_type        = Column(String(30), nullable=False)
    label            = Column(String(200), nullable=False)
    description      = Column(Text, nullable=True)
    config           = Column(Text, nullable=True)   # JSON — copie de la config du template step
    status           = Column(String(20), nullable=False, default=StepStatus.PENDING)
    # Données collectées à cette étape (JSON) :
    #   form: {"field_id": "value", ...}
    #   select_contacts: {"contact_ids": [...], "contacts": [{name, email}]}
    #   send_email: {"sent_count": N, "sent_at": "..."}
    #   upload_document: {"filename": "...", "file_path": "..."}
    #   manual: {"validated_by": "...", "notes": "..."}
    data             = Column(Text, nullable=True)   # JSON
    completed_at     = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    procedure = relationship("Procedure", back_populates="step_instances")
