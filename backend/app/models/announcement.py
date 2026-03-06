from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Table
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


# Junction table for targeting specific tenants
announcement_tenants = Table(
    "announcement_tenants",
    Base.metadata,
    Column("announcement_id", String(36), ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True),
    Column("tenant_id", String(36), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
)


class Announcement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "announcements"

    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    target_all = Column(Boolean, nullable=False, default=True)  # True = all tenants

    # Many-to-many: targeted tenants (only used when target_all=False)
    tenants = relationship("Tenant", secondary=announcement_tenants, lazy="selectin")
