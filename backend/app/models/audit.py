from sqlalchemy import Column, String, Text, DateTime
from app.models.base import Base, UUIDMixin, _utcnow


class AuditLog(UUIDMixin, Base):
    """
    RGPD Article 30 — Registre des activités de traitement.
    Trace toute action sur des données personnelles.
    """
    __tablename__ = "audit_logs"

    timestamp   = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    user_id     = Column(String(36), nullable=True)   # null for system actions
    tenant_id   = Column(String(36), nullable=True)
    action      = Column(String(100), nullable=False)  # 'login', 'create_user', 'delete_user', 'export_data', 'consent_given', ...
    resource    = Column(String(100), nullable=True)   # 'user', 'tenant', 'session', ...
    resource_id = Column(String(36), nullable=True)
    details     = Column(Text, nullable=True)          # JSON string with additional context
    ip_address  = Column(String(45), nullable=True)    # IPv4 or IPv6


class ConsentRecord(UUIDMixin, Base):
    """
    RGPD Articles 6 & 7 — Preuve de consentement.
    Chaque consentement donné ou retiré est tracé.
    """
    __tablename__ = "consent_records"

    user_id      = Column(String(36), nullable=False, index=True)
    tenant_id    = Column(String(36), nullable=False)
    consent_type = Column(String(100), nullable=False)  # 'terms_of_service', 'data_processing', 'voice_recording', 'email_notifications', ...
    granted      = Column(String(10), nullable=False)    # 'granted' | 'revoked'
    version      = Column(String(20), nullable=True)     # policy version (e.g., '2.0.1')
    ip_address   = Column(String(45), nullable=True)
    timestamp    = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class DataRetentionPolicy(UUIDMixin, Base):
    """
    RGPD Article 5(1)(e) — Limitation de la conservation.
    Politique de rétention configurable par tenant et type de données.
    """
    __tablename__ = "data_retention_policies"

    tenant_id       = Column(String(36), nullable=False, index=True)
    data_type       = Column(String(100), nullable=False)  # 'audio_files', 'transcriptions', 'user_data', 'audit_logs', ...
    retention_days  = Column(String(10), nullable=False)   # number of days, or 'indefinite'
    auto_delete     = Column(String(5), nullable=False, default="false")  # 'true' | 'false'
    description     = Column(Text, nullable=True)


class RGPDRequest(UUIDMixin, Base):
    """
    RGPD Articles 15-20 — Suivi des demandes formelles.
    Types : access (Art.15), rectification (Art.16), deletion (Art.17), portability (Art.20).
    """
    __tablename__ = "rgpd_requests"

    tenant_id    = Column(String(36), nullable=False, index=True)
    user_id      = Column(String(36), nullable=False)
    request_type = Column(String(20), nullable=False)   # access | rectification | deletion | portability
    status       = Column(String(20), nullable=False, default="pending")  # pending | in_progress | completed | rejected
    notes        = Column(Text, nullable=True)           # demandeur
    admin_notes  = Column(Text, nullable=True)           # réponse admin
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at   = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
