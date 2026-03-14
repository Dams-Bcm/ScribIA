"""Models for the Contacts module — generic contact groups and contacts."""

from sqlalchemy import Column, String, Text, ForeignKey, Integer, Table, Boolean
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


# N:N junction table
contact_group_members = Table(
    "contact_group_members",
    Base.metadata,
    Column("contact_id", String(36), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", String(36), ForeignKey("contact_groups.id", ondelete="CASCADE"), primary_key=True),
)


class ContactGroup(UUIDMixin, TimestampMixin, Base):
    """A group of contacts (e.g. Résidence, Commission, Lot/Phase)."""
    __tablename__ = "contact_groups"

    tenant_id   = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    metadata_   = Column("metadata", Text, nullable=True)  # JSON — sector-specific (total_tantiemes, etc.)
    is_default  = Column(Boolean, nullable=False, server_default="0")

    contacts = relationship(
        "Contact",
        secondary=contact_group_members,
        back_populates="groups",
        order_by="Contact.name",
    )


class Contact(UUIDMixin, TimestampMixin, Base):
    """A contact within one or more groups (e.g. Copropriétaire, Élu, Entreprise)."""
    __tablename__ = "contacts"

    tenant_id     = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    name          = Column(String(255), nullable=False)
    first_name    = Column(String(255), nullable=True)
    email         = Column(String(255), nullable=True)
    phone         = Column(String(50), nullable=True)
    role          = Column(String(100), nullable=True)
    custom_fields = Column(Text, nullable=True)  # JSON — sector-specific

    groups = relationship(
        "ContactGroup",
        secondary=contact_group_members,
        back_populates="contacts",
    )
