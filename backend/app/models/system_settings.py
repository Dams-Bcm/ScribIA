"""Key-value store for system settings persisted in DB."""

from sqlalchemy import Column, String, Text

from app.models.base import Base, UUIDMixin


class SystemSetting(UUIDMixin, Base):
    __tablename__ = "system_settings"

    key   = Column(String(100), nullable=False, unique=True)
    value = Column(Text, nullable=True)
