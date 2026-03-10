"""Modèle Sector — secteurs d'activité dynamiques."""

from sqlalchemy import Boolean, Column, String, Text

from app.models.base import Base, UUIDMixin, TimestampMixin


class Sector(UUIDMixin, TimestampMixin, Base):
    """Secteur d'activité configurable par le super admin."""
    __tablename__ = "sectors"

    key             = Column(String(50), nullable=False, unique=True, index=True)
    label           = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)  # Description métier du secteur
    # JSON array of module keys, e.g. ["procedures","ai_documents","transcription"]
    default_modules = Column(Text, nullable=False, default="[]")
    # JSON dict of suggestions per module, e.g. {"search": [...], "ai_documents": [...]}
    suggestions     = Column(Text, nullable=True)
    is_active       = Column(Boolean, nullable=False, default=True)
