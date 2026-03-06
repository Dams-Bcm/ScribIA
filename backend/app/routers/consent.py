"""Router — Public consent endpoints (no auth required).

These endpoints are accessed via token links sent by email.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.speaker import SpeakerProfile

router = APIRouter(prefix="/consent", tags=["consent"])


class ConsentActionResponse(BaseModel):
    status: str
    display_name: str | None = None
    message: str


@router.get("/accept")
def accept_consent(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public endpoint — person clicks the accept link from their email."""
    profile = _get_profile_by_token(token, db)

    profile.consent_status = "accepted"
    profile.consent_type = "email"
    profile.consent_scope = "individual"
    profile.consent_date = datetime.now(timezone.utc)
    profile.consent_token = None
    profile.consent_token_expires = None

    db.commit()
    return ConsentActionResponse(
        status="accepted",
        display_name=profile.display_name,
        message="Votre consentement a ete enregistre. Merci.",
    )


@router.get("/decline")
def decline_consent(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public endpoint — person clicks the decline link from their email."""
    profile = _get_profile_by_token(token, db)

    profile.consent_status = "declined"
    profile.consent_date = datetime.now(timezone.utc)
    profile.consent_token = None
    profile.consent_token_expires = None

    db.commit()
    return ConsentActionResponse(
        status="declined",
        display_name=profile.display_name,
        message="Votre refus a ete enregistre.",
    )


@router.get("/withdraw")
def withdraw_consent(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """Public endpoint — person withdraws their consent (RGPD right)."""
    profile = (
        db.query(SpeakerProfile)
        .filter(SpeakerProfile.withdrawal_token == token)
        .first()
    )
    if not profile:
        raise HTTPException(404, "Lien invalide ou expire.")

    profile.consent_status = "withdrawn"
    profile.consent_date = datetime.now(timezone.utc)
    # Clear voice data
    profile.embedding = None
    profile.enrollment_status = None
    profile.enrollment_method = None
    profile.enrolled_at = None

    db.commit()
    return ConsentActionResponse(
        status="withdrawn",
        display_name=profile.display_name,
        message="Votre consentement a ete retire et vos donnees vocales supprimees.",
    )


def _get_profile_by_token(token: str, db: Session) -> SpeakerProfile:
    profile = (
        db.query(SpeakerProfile)
        .filter(SpeakerProfile.consent_token == token)
        .first()
    )
    if not profile:
        raise HTTPException(404, "Lien invalide ou expire.")

    if profile.consent_token_expires and profile.consent_token_expires < datetime.now(timezone.utc):
        raise HTTPException(410, "Ce lien a expire. Contactez votre administrateur.")

    if profile.consent_status == "accepted":
        raise HTTPException(400, "Le consentement a deja ete accepte.")

    return profile
