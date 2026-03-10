from typing import Optional
from datetime import datetime

from pydantic import BaseModel


# ── Retention Policies ────────────────────────────────────────────────────────

class RetentionPolicyResponse(BaseModel):
    id: str
    tenant_id: str
    data_type: str
    retention_days: str
    auto_delete: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class RetentionPolicyCreate(BaseModel):
    data_type: str
    retention_days: str
    auto_delete: str = "false"
    description: Optional[str] = None


class RetentionPolicyUpdate(BaseModel):
    retention_days: Optional[str] = None
    auto_delete: Optional[str] = None
    description: Optional[str] = None


# ── RGPD Requests ─────────────────────────────────────────────────────────────

class RGPDRequestResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    request_type: str
    status: str
    notes: Optional[str] = None
    admin_notes: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RGPDRequestCreate(BaseModel):
    request_type: str  # access | rectification | deletion | portability
    user_id: str
    notes: Optional[str] = None


class RGPDRequestUpdate(BaseModel):
    status: Optional[str] = None  # pending | in_progress | completed | rejected
    admin_notes: Optional[str] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

class ConsentTypeMetric(BaseModel):
    granted: int
    revoked: int


class ConsentMetrics(BaseModel):
    total_users: int
    users_with_consent: int
    consent_rate: float
    by_type: dict[str, ConsentTypeMetric]


class AuditSummary(BaseModel):
    total_events: int
    recent_events: int
    by_action: dict[str, int]


class ComplianceDashboardResponse(BaseModel):
    consent_metrics: ConsentMetrics
    retention_policies: list[RetentionPolicyResponse]
    audit_summary: AuditSummary
    pending_requests_count: int
    overdue_requests_count: int
