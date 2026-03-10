"""Push notification subscription endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.push_subscription import PushSubscription

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-key")
def get_vapid_key():
    """Return the VAPID public key for push subscription."""
    if not settings.vapid_public_key:
        raise HTTPException(503, "Push notifications non configurees (VAPID key manquante)")
    return {"vapid_public_key": settings.vapid_public_key}


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # { p256dh, auth }


@router.post("/subscribe")
def subscribe(
    body: SubscribeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a push subscription for the current user."""
    p256dh = body.keys.get("p256dh", "")
    auth = body.keys.get("auth", "")
    if not p256dh or not auth:
        raise HTTPException(400, "Cles de souscription manquantes (p256dh, auth)")

    # Upsert: if endpoint already exists, update keys
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == body.endpoint).first()
    if existing:
        existing.user_id = user.id
        existing.tenant_id = user.tenant_id
        existing.p256dh = p256dh
        existing.auth = auth
    else:
        sub = PushSubscription(
            user_id=user.id,
            tenant_id=user.tenant_id,
            endpoint=body.endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        db.add(sub)
    db.commit()
    return {"status": "subscribed"}


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
def unsubscribe(
    body: UnsubscribeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a push subscription."""
    deleted = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
        .delete()
    )
    db.commit()
    return {"status": "unsubscribed", "deleted": deleted}
