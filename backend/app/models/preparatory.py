import enum

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDMixin, TimestampMixin, _utcnow


class DossierStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    ARCHIVED = "archived"


class PreparatoryDossier(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "preparatory_dossiers"

    tenant_id          = Column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    user_id            = Column(String(36), ForeignKey("users.id"), nullable=False)
    planned_meeting_id = Column(String(36), ForeignKey("planned_meetings.id", ondelete="CASCADE"), nullable=True, index=True)
    title              = Column(String(255), nullable=False)
    description  = Column(Text, nullable=True)
    meeting_date = Column(DateTime(timezone=True), nullable=True)
    status       = Column(String(20), nullable=False, default=DossierStatus.DRAFT)

    agenda_points = relationship(
        "AgendaPoint",
        back_populates="dossier",
        cascade="all, delete-orphan",
        order_by="AgendaPoint.order_index",
    )
    documents = relationship(
        "DossierDocument",
        back_populates="dossier",
        cascade="all, delete-orphan",
    )
    planned_meeting = relationship("PlannedMeeting", back_populates="dossier")


class AgendaPoint(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "agenda_points"

    dossier_id  = Column(String(36), ForeignKey("preparatory_dossiers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)
    title       = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)

    dossier   = relationship("PreparatoryDossier", back_populates="agenda_points")
    documents = relationship("DossierDocument", back_populates="agenda_point")


class DossierDocument(UUIDMixin, Base):
    __tablename__ = "dossier_documents"

    dossier_id        = Column(String(36), ForeignKey("preparatory_dossiers.id", ondelete="CASCADE"), nullable=False, index=True)
    agenda_point_id   = Column(String(36), ForeignKey("agenda_points.id", ondelete="NO ACTION"), nullable=True)
    original_filename = Column(String(500), nullable=False)
    stored_filename   = Column(String(255), nullable=False)
    file_size         = Column(Integer, nullable=True)
    content_type      = Column(String(100), nullable=True)
    created_at        = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    dossier      = relationship("PreparatoryDossier", back_populates="documents")
    agenda_point = relationship("AgendaPoint", back_populates="documents")
