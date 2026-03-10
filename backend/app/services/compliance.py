from datetime import datetime, timedelta, timezone

from sqlalchemy import func, distinct
from sqlalchemy.orm import Session

from app.models.audit import AuditLog, ConsentRecord, DataRetentionPolicy, RGPDRequest
from app.models.user import User
from app.schemas.compliance import (
    ConsentMetrics,
    ConsentTypeMetric,
    AuditSummary,
    RetentionPolicyResponse,
    ComplianceDashboardResponse,
)


def get_consent_metrics(db: Session, tenant_id: str) -> ConsentMetrics:
    """Compute consent metrics for a tenant."""
    # Total active users in tenant
    total_users = db.query(func.count(User.id)).filter(
        User.tenant_id == tenant_id, User.is_active == True
    ).scalar() or 0

    # Users who have at least one 'granted' consent
    users_with_consent = db.query(func.count(distinct(ConsentRecord.user_id))).filter(
        ConsentRecord.tenant_id == tenant_id,
        ConsentRecord.granted == "granted",
    ).scalar() or 0

    consent_rate = (users_with_consent / total_users * 100) if total_users > 0 else 0.0

    # By type: get latest status per user per type
    # We query all consent records for this tenant, then aggregate
    records = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.tenant_id == tenant_id)
        .order_by(ConsentRecord.timestamp.desc())
        .all()
    )

    # Latest consent per (user_id, consent_type)
    latest: dict[tuple[str, str], str] = {}
    for r in records:
        key = (r.user_id, r.consent_type)
        if key not in latest:
            latest[key] = r.granted

    by_type: dict[str, ConsentTypeMetric] = {}
    for (_, ctype), status in latest.items():
        if ctype not in by_type:
            by_type[ctype] = ConsentTypeMetric(granted=0, revoked=0)
        if status == "granted":
            by_type[ctype].granted += 1
        else:
            by_type[ctype].revoked += 1

    return ConsentMetrics(
        total_users=total_users,
        users_with_consent=users_with_consent,
        consent_rate=round(consent_rate, 1),
        by_type=by_type,
    )


def get_audit_summary(db: Session, tenant_id: str, days: int = 7) -> AuditSummary:
    """Compute audit summary for a tenant."""
    total_events = db.query(func.count(AuditLog.id)).filter(
        AuditLog.tenant_id == tenant_id,
    ).scalar() or 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent_events = db.query(func.count(AuditLog.id)).filter(
        AuditLog.tenant_id == tenant_id,
        AuditLog.timestamp >= cutoff,
    ).scalar() or 0

    # Top actions (last 30 days for relevance)
    cutoff_30 = datetime.now(timezone.utc) - timedelta(days=30)
    action_counts = (
        db.query(AuditLog.action, func.count(AuditLog.id))
        .filter(AuditLog.tenant_id == tenant_id, AuditLog.timestamp >= cutoff_30)
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
        .all()
    )
    by_action = {action: count for action, count in action_counts}

    return AuditSummary(
        total_events=total_events,
        recent_events=recent_events,
        by_action=by_action,
    )


def get_pending_requests_counts(db: Session, tenant_id: str) -> tuple[int, int]:
    """Return (pending_count, overdue_count) for RGPD requests."""
    pending = db.query(func.count(RGPDRequest.id)).filter(
        RGPDRequest.tenant_id == tenant_id,
        RGPDRequest.status.in_(["pending", "in_progress"]),
    ).scalar() or 0

    # Overdue: pending/in_progress and created > 30 days ago
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    overdue = db.query(func.count(RGPDRequest.id)).filter(
        RGPDRequest.tenant_id == tenant_id,
        RGPDRequest.status.in_(["pending", "in_progress"]),
        RGPDRequest.created_at < cutoff,
    ).scalar() or 0

    return pending, overdue


def compute_dashboard(db: Session, tenant_id: str) -> ComplianceDashboardResponse:
    """Aggregate all compliance metrics into a single dashboard response."""
    consent = get_consent_metrics(db, tenant_id)
    audit = get_audit_summary(db, tenant_id)
    pending, overdue = get_pending_requests_counts(db, tenant_id)

    policies = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.tenant_id == tenant_id)
        .all()
    )
    policy_responses = [RetentionPolicyResponse.model_validate(p) for p in policies]

    return ComplianceDashboardResponse(
        consent_metrics=consent,
        retention_policies=policy_responses,
        audit_summary=audit,
        pending_requests_count=pending,
        overdue_requests_count=overdue,
    )
