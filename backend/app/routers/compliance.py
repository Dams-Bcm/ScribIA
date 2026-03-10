"""
Router RGPD / Compliance — admin-only, module-gated.
Prefix: /compliance
"""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin, require_module
from app.models.audit import AuditLog, DataRetentionPolicy, RGPDRequest
from app.models.user import User
from app.schemas.compliance import (
    ComplianceDashboardResponse,
    RetentionPolicyCreate,
    RetentionPolicyResponse,
    RetentionPolicyUpdate,
    RGPDRequestCreate,
    RGPDRequestResponse,
    RGPDRequestUpdate,
)
from app.services.audit import log_action
from app.services.compliance import compute_dashboard

router = APIRouter(
    prefix="/compliance",
    tags=["compliance"],
    dependencies=[Depends(require_module("rgpd"))],
)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=ComplianceDashboardResponse)
def get_dashboard(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return compute_dashboard(db, user.tenant_id)


# ── Retention Policies ────────────────────────────────────────────────────────

@router.get("/retention-policies", response_model=list[RetentionPolicyResponse])
def list_retention_policies(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    policies = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.tenant_id == user.tenant_id)
        .all()
    )
    return [RetentionPolicyResponse.model_validate(p) for p in policies]


@router.post("/retention-policies", response_model=RetentionPolicyResponse, status_code=201)
def create_retention_policy(
    body: RetentionPolicyCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    policy = DataRetentionPolicy(
        tenant_id=user.tenant_id,
        data_type=body.data_type,
        retention_days=body.retention_days,
        auto_delete=body.auto_delete,
        description=body.description,
    )
    db.add(policy)
    log_action(db, "retention_policy_created", user_id=user.id, tenant_id=user.tenant_id,
               resource="retention_policy", details={"data_type": body.data_type})
    db.commit()
    db.refresh(policy)
    return RetentionPolicyResponse.model_validate(policy)


@router.patch("/retention-policies/{policy_id}", response_model=RetentionPolicyResponse)
def update_retention_policy(
    policy_id: str,
    body: RetentionPolicyUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.id == policy_id, DataRetentionPolicy.tenant_id == user.tenant_id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Politique de rétention introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)
    log_action(db, "retention_policy_updated", user_id=user.id, tenant_id=user.tenant_id,
               resource="retention_policy", resource_id=policy_id)
    db.commit()
    db.refresh(policy)
    return RetentionPolicyResponse.model_validate(policy)


@router.delete("/retention-policies/{policy_id}", status_code=204)
def delete_retention_policy(
    policy_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.id == policy_id, DataRetentionPolicy.tenant_id == user.tenant_id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Politique de rétention introuvable")
    log_action(db, "retention_policy_deleted", user_id=user.id, tenant_id=user.tenant_id,
               resource="retention_policy", resource_id=policy_id, details={"data_type": policy.data_type})
    db.delete(policy)
    db.commit()


# ── RGPD Requests ─────────────────────────────────────────────────────────────

@router.get("/requests", response_model=list[RGPDRequestResponse])
def list_rgpd_requests(
    request_status: str | None = Query(None, alias="status"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(RGPDRequest).filter(RGPDRequest.tenant_id == user.tenant_id)
    if request_status:
        q = q.filter(RGPDRequest.status == request_status)
    return [RGPDRequestResponse.model_validate(r) for r in q.order_by(RGPDRequest.created_at.desc()).all()]


@router.post("/requests", response_model=RGPDRequestResponse, status_code=201)
def create_rgpd_request(
    body: RGPDRequestCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    valid_types = {"access", "rectification", "deletion", "portability"}
    if body.request_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Type invalide. Valeurs acceptées : {', '.join(valid_types)}")
    req = RGPDRequest(
        tenant_id=user.tenant_id,
        user_id=body.user_id,
        request_type=body.request_type,
        notes=body.notes,
    )
    db.add(req)
    log_action(db, "rgpd_request_created", user_id=user.id, tenant_id=user.tenant_id,
               resource="rgpd_request", details={"type": body.request_type, "target_user": body.user_id})
    db.commit()
    db.refresh(req)
    return RGPDRequestResponse.model_validate(req)


@router.patch("/requests/{request_id}", response_model=RGPDRequestResponse)
def update_rgpd_request(
    request_id: str,
    body: RGPDRequestUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    req = (
        db.query(RGPDRequest)
        .filter(RGPDRequest.id == request_id, RGPDRequest.tenant_id == user.tenant_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Demande RGPD introuvable")
    valid_statuses = {"pending", "in_progress", "completed", "rejected"}
    if body.status and body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs acceptées : {', '.join(valid_statuses)}")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(req, field, value)
    if body.status in ("completed", "rejected") and not req.completed_at:
        req.completed_at = datetime.now(timezone.utc)
    log_action(db, "rgpd_request_updated", user_id=user.id, tenant_id=user.tenant_id,
               resource="rgpd_request", resource_id=request_id, details=body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(req)
    return RGPDRequestResponse.model_validate(req)


# ── Audit Logs (tenant-scoped) ────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    limit: int = Query(200, le=1000),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == user.tenant_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "user_id": log.user_id,
            "action": log.action,
            "resource": log.resource,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
        }
        for log in logs
    ]


# ── Export CSV ────────────────────────────────────────────────────────────────

@router.get("/export")
def export_compliance_report(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Export a CSV compliance report for the tenant."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Retention policies
    writer.writerow(["=== Politiques de rétention ==="])
    writer.writerow(["Type de données", "Durée (jours)", "Suppression auto", "Description"])
    policies = db.query(DataRetentionPolicy).filter(DataRetentionPolicy.tenant_id == user.tenant_id).all()
    for p in policies:
        writer.writerow([p.data_type, p.retention_days, p.auto_delete, p.description or ""])

    writer.writerow([])

    # RGPD Requests
    writer.writerow(["=== Demandes RGPD ==="])
    writer.writerow(["ID", "Utilisateur", "Type", "Statut", "Créée le", "Terminée le", "Notes"])
    requests = db.query(RGPDRequest).filter(RGPDRequest.tenant_id == user.tenant_id).order_by(RGPDRequest.created_at.desc()).all()
    for r in requests:
        writer.writerow([
            r.id, r.user_id, r.request_type, r.status,
            r.created_at.isoformat() if r.created_at else "",
            r.completed_at.isoformat() if r.completed_at else "",
            r.notes or "",
        ])

    log_action(db, "compliance_report_exported", user_id=user.id, tenant_id=user.tenant_id)
    db.commit()

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=rapport_rgpd_{user.tenant_id[:8]}.csv"},
    )
