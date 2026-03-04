import json
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


def log_action(
    db: Session,
    action: str,
    *,
    user_id: str | None = None,
    tenant_id: str | None = None,
    resource: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Write an audit log entry. Call within an existing transaction."""
    entry = AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        details=json.dumps(details, ensure_ascii=False) if details else None,
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
