from sqlalchemy import Column, String, Boolean, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class SubstitutionRule(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "substitution_rules"

    tenant_id       = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    original        = Column(String(500), nullable=False)
    replacement     = Column(String(500), nullable=False)
    is_case_sensitive = Column(Boolean, nullable=False, default=True)
    is_whole_word   = Column(Boolean, nullable=False, default=True)
    is_enabled      = Column(Boolean, nullable=False, default=True)
    category        = Column(String(100), nullable=True)
    usage_count     = Column(Integer, nullable=False, default=0)

    tenant = relationship("Tenant")
