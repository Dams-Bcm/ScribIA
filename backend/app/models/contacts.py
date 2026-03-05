"""Models for the Contacts module — generic contact groups and contacts."""

from sqlalchemy import Column, String, Text, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class ContactGroup(UUIDMixin, TimestampMixin, Base):
    """A group of contacts (e.g. Résidence, Commission, Lot/Phase)."""
    __tablename__ = "contact_groups"

    tenant_id   = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    address     = Column(String(500), nullable=True)
    metadata_   = Column("metadata", Text, nullable=True)  # JSON — sector-specific (total_tantiemes, etc.)

    contacts = relationship("Contact", back_populates="group", cascade="all, delete-orphan", order_by="Contact.name")


class Contact(UUIDMixin, TimestampMixin, Base):
    """A contact within a group (e.g. Copropriétaire, Élu, Entreprise)."""
    __tablename__ = "contacts"

    tenant_id     = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    group_id      = Column(String(36), ForeignKey("contact_groups.id", ondelete="CASCADE"), nullable=False)
    name          = Column(String(255), nullable=False)
    email         = Column(String(255), nullable=True)
    phone         = Column(String(50), nullable=True)
    role          = Column(String(100), nullable=True)  # e.g. "Copropriétaire", "Conseil syndical"
    custom_fields = Column(Text, nullable=True)  # JSON — sector-specific (lot_number, tantiemes, etc.)

    group = relationship("ContactGroup", back_populates="contacts")
