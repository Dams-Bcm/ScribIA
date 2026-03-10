from sqlalchemy import Column, String, Boolean, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", "tenant_id", name="uq_user_tenant"),
    )

    username        = Column(String(100), nullable=False)
    email           = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    display_name    = Column(String(255), nullable=True)
    role            = Column(String(50), nullable=False, default="user")  # 'super_admin', 'admin', 'user'
    tenant_id       = Column(String(36), ForeignKey("tenants.id"), nullable=False)
    is_active       = Column(Boolean, nullable=False, default=True)
    reset_token         = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

    tenant = relationship("Tenant", back_populates="users")

    @property
    def is_super_admin(self) -> bool:
        return self.role == "super_admin"

    @property
    def is_admin(self) -> bool:
        return self.role in ("super_admin", "admin")

    @property
    def enabled_modules(self) -> list[str]:
        """List of enabled module keys for this user's tenant."""
        return [m.module_key for m in self.tenant.modules if m.enabled]

    @property
    def tenant_sector(self) -> str | None:
        return self.tenant.sector if self.tenant else None
