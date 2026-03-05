from sqlalchemy import Column, String, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


# Available modules — single source of truth
AVAILABLE_MODULES = {
    "transcription":              "Transcription simple",
    "transcription_diarisation":  "Transcription + Diarisation",
    "preparatory_phases":         "Phase(s) préparatoire(s)",
    "rgpd":                       "RGPD",
    "ai_documents":               "Génération de documents IA",
    "convocations":               "Convocations",
}


class Tenant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name        = Column(String(255), nullable=False)
    slug        = Column(String(100), nullable=False, unique=True)
    tenant_type = Column(String(50), nullable=False, default="organization")  # 'organization' | 'group'
    parent_id   = Column(String(36), ForeignKey("tenants.id"), nullable=True)
    is_large    = Column(Boolean, nullable=False, default=False)
    config      = Column(Text, nullable=True)   # JSON string
    is_active   = Column(Boolean, nullable=False, default=True)

    # Relationships
    parent   = relationship("Tenant", remote_side="Tenant.id", backref="children")
    modules  = relationship("TenantModule", back_populates="tenant", cascade="all, delete-orphan")
    users    = relationship("User", back_populates="tenant", cascade="all, delete-orphan")


class TenantModule(UUIDMixin, Base):
    __tablename__ = "tenant_modules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "module_key", name="uq_tenant_module"),
    )

    tenant_id  = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    module_key = Column(String(50), nullable=False)
    enabled    = Column(Boolean, nullable=False, default=True)
    config     = Column(Text, nullable=True)  # JSON string — module-specific config per tenant

    tenant = relationship("Tenant", back_populates="modules")
