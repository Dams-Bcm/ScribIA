"""
RGPD endpoints — Droits des personnes concernées.
- Droit d'accès (Art. 15)
- Droit à l'effacement (Art. 17)
- Droit à la portabilité (Art. 20)
- Gestion du consentement (Art. 7)
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.models.audit import AuditLog, ConsentRecord
from app.deps import get_current_user
from app.services.audit import log_action

router = APIRouter(prefix="/privacy", tags=["privacy"])


# ── Droit d'accès (RGPD Art. 15) ─────────────────────────────────────────────

@router.get("/my-data")
def export_my_data(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export all personal data associated with the current user."""
    log_action(
        db, "data_export_request",
        user_id=user.id,
        tenant_id=user.tenant_id,
        resource="user",
        resource_id=user.id,
        ip_address=request.client.host if request.client else None,
    )

    # Consent history
    consents = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user.id)
        .order_by(ConsentRecord.timestamp.desc())
        .all()
    )

    # Audit trail for this user
    audit_entries = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(500)
        .all()
    )

    db.commit()

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "is_active": user.is_active,
            "created_at": str(user.created_at),
        },
        "consents": [
            {
                "type": c.consent_type,
                "status": c.granted,
                "version": c.version,
                "timestamp": str(c.timestamp),
            }
            for c in consents
        ],
        "activity_log": [
            {
                "action": a.action,
                "resource": a.resource,
                "timestamp": str(a.timestamp),
            }
            for a in audit_entries
        ],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Droit à l'effacement (RGPD Art. 17) ──────────────────────────────────────

@router.delete("/my-data")
def delete_my_data(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Anonymize the current user's personal data (soft delete).
    Audit logs are retained (legal obligation) but anonymized.
    """
    log_action(
        db, "data_deletion_request",
        user_id=user.id,
        tenant_id=user.tenant_id,
        resource="user",
        resource_id=user.id,
        ip_address=request.client.host if request.client else None,
    )

    # Anonymize user record
    user.username = f"deleted_{user.id[:8]}"
    user.email = None
    user.display_name = "Utilisateur supprimé"
    user.is_active = False
    user.hashed_password = "DELETED"

    # Anonymize audit logs (keep action/timestamp for legal compliance)
    db.query(AuditLog).filter(AuditLog.user_id == user.id).update(
        {"ip_address": None, "details": None}
    )

    db.commit()
    return {"message": "Données personnelles supprimées. Le compte a été désactivé."}


# ── Consentement (RGPD Art. 7) ────────────────────────────────────────────────

@router.post("/consent")
def give_consent(
    consent_type: str,
    version: str = "1.0",
    request: Request = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = ConsentRecord(
        user_id=user.id,
        tenant_id=user.tenant_id,
        consent_type=consent_type,
        granted="granted",
        version=version,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(record)

    log_action(
        db, "consent_given",
        user_id=user.id,
        tenant_id=user.tenant_id,
        details={"consent_type": consent_type, "version": version},
        ip_address=request.client.host if request and request.client else None,
    )

    db.commit()
    return {"message": "Consentement enregistré", "consent_type": consent_type, "status": "granted"}


@router.delete("/consent")
def revoke_consent(
    consent_type: str,
    request: Request = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = ConsentRecord(
        user_id=user.id,
        tenant_id=user.tenant_id,
        consent_type=consent_type,
        granted="revoked",
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(record)

    log_action(
        db, "consent_revoked",
        user_id=user.id,
        tenant_id=user.tenant_id,
        details={"consent_type": consent_type},
        ip_address=request.client.host if request and request.client else None,
    )

    db.commit()
    return {"message": "Consentement retiré", "consent_type": consent_type, "status": "revoked"}


@router.get("/consents")
def list_my_consents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all current consent statuses for the user."""
    records = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user.id)
        .order_by(ConsentRecord.timestamp.desc())
        .all()
    )

    # Get latest status for each consent type
    latest: dict[str, dict] = {}
    for r in records:
        if r.consent_type not in latest:
            latest[r.consent_type] = {
                "consent_type": r.consent_type,
                "status": r.granted,
                "version": r.version,
                "timestamp": str(r.timestamp),
            }

    return list(latest.values())
