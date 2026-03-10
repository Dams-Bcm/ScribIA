from sqlalchemy import Column, String, Text, ForeignKey

from app.models.base import Base, UUIDMixin, TimestampMixin


class PushSubscription(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "push_subscriptions"

    user_id    = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    tenant_id  = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    endpoint   = Column(String(500), nullable=False, unique=True)
    p256dh     = Column(String(500), nullable=False)
    auth       = Column(String(255), nullable=False)
