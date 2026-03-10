"""Web Push notification service."""

import logging
from sqlalchemy.orm import Session
from app.config import settings

logger = logging.getLogger(__name__)


def send_push_to_user(db: Session, user_id: str, title: str, body: str, url: str = "/", tag: str = "scribia"):
    """Send a push notification to all subscriptions of a user."""
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.debug("[PUSH] VAPID keys not configured — skipping push notification")
        return

    from app.models.push_subscription import PushSubscription

    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subs:
        return

    import json
    from pywebpush import webpush, WebPushException

    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})

    for sub in subs:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_claims_email},
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                # Subscription expired or unsubscribed — clean up
                logger.info(f"[PUSH] Removing expired subscription {sub.id}")
                db.delete(sub)
                db.commit()
            else:
                logger.warning(f"[PUSH] Failed to send to {sub.endpoint[:60]}: {e}")
        except Exception as e:
            logger.warning(f"[PUSH] Unexpected error sending push: {e}")


def notify_job_completed(db: Session, job):
    """Send push notification when a transcription/diarisation job completes."""
    mode_label = "Diarisation" if job.mode == "diarisation" else "Transcription"
    title = f"{mode_label} terminee"
    body = f'"{job.title}" est prete.'
    url = f"/{'reunion' if job.mode == 'diarisation' else 'dictee'}"
    send_push_to_user(db, job.user_id, title, body, url, tag=f"job-{job.id}")


def notify_job_error(db: Session, job):
    """Send push notification when a job fails."""
    mode_label = "Diarisation" if job.mode == "diarisation" else "Transcription"
    title = f"{mode_label} echouee"
    body = f'Erreur sur "{job.title}".'
    url = f"/{'reunion' if job.mode == 'diarisation' else 'dictee'}"
    send_push_to_user(db, job.user_id, title, body, url, tag=f"job-{job.id}")
