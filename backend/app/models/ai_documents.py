from sqlalchemy import Boolean, Column, Float, ForeignKey, String, Text, DateTime, Table
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, _utcnow


# Junction table: global templates assigned to tenants
template_tenant_assignments = Table(
    "template_tenant_assignments",
    Base.metadata,
    Column("template_id", String(36), ForeignKey("ai_document_templates.id", ondelete="NO ACTION"), primary_key=True),
    Column("tenant_id", String(36), ForeignKey("tenants.id", ondelete="NO ACTION"), primary_key=True),
)


class AIDocumentTemplate(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_document_templates"

    tenant_id            = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    sector               = Column(String(50), nullable=True, index=True)
    name                 = Column(String(200), nullable=False)
    description          = Column(Text, nullable=True)
    document_type        = Column(String(50), nullable=False, default="custom")
    # Valeurs : "pv" | "deliberation" | "summary" | "agenda" | "custom"
    category             = Column(String(50), nullable=False, default="document")
    # Valeurs : "document" | "procedure" | "email"
    is_global            = Column(Boolean, nullable=False, default=False)
    system_prompt        = Column(Text, nullable=False)
    user_prompt_template = Column(Text, nullable=False)
    map_system_prompt    = Column(Text, nullable=True)   # prompt système pour la passe map (map-reduce)
    # Placeholders supportés : {titre} {date} {tenant}
    #                           {points} {transcription} {documents} {participants} {duree}
    ollama_model         = Column(String(100), nullable=True)  # None → config default
    temperature          = Column(Float, nullable=False, default=0.3)
    is_active            = Column(Boolean, nullable=False, default=True)
    # JSON array d'étapes de workflow (uniquement pour category="procedure")
    workflow_steps       = Column(Text, nullable=True)

    documents = relationship("AIDocument", back_populates="template")
    assigned_tenants = relationship("Tenant", secondary=template_tenant_assignments, backref="assigned_templates")


class AIDocument(UUIDMixin, Base):
    __tablename__ = "ai_documents"

    tenant_id      = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id        = Column(String(36), ForeignKey("users.id", ondelete="NO ACTION"), nullable=True)
    template_id    = Column(String(36), ForeignKey("ai_document_templates.id", ondelete="NO ACTION"), nullable=True)
    # Snapshot JSON du template au moment de la génération
    template_snapshot = Column(Text, nullable=True)

    title          = Column(String(500), nullable=False)
    status         = Column(String(20), nullable=False, default="pending")
    # Valeurs : "pending" | "generating" | "completed" | "error"

    # Sources (NO ACTION pour éviter les cascades multiples)
    source_dossier_id = Column(String(36), ForeignKey("preparatory_dossiers.id", ondelete="NO ACTION"), nullable=True)
    source_session_id = Column(String(36), ForeignKey("transcription_jobs.id", ondelete="NO ACTION"), nullable=True)

    # JSON dict of extra context variables injected at generation time (e.g. from procedure)
    extra_context  = Column(Text, nullable=True)

    result_text    = Column(Text, nullable=True)
    error_message  = Column(Text, nullable=True)

    # Consent invalidation
    invalidated_at     = Column(DateTime(timezone=True), nullable=True)
    invalidated_reason = Column(Text, nullable=True)

    created_at               = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    generation_started_at    = Column(DateTime(timezone=True), nullable=True)
    generation_completed_at  = Column(DateTime(timezone=True), nullable=True)

    template = relationship("AIDocumentTemplate", back_populates="documents")
