from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin, get_current_user
from app.models import User
from app.models.speaker import SpeakerProfile
from app.schemas.speaker import SpeakerProfileCreate, SpeakerProfileUpdate, SpeakerProfileResponse

router = APIRouter(prefix="/speakers", tags=["speakers"])


def _get_profile_or_404(profile_id: str, user: User, db: Session) -> SpeakerProfile:
    q = db.query(SpeakerProfile).filter(SpeakerProfile.id == profile_id)
    if not user.is_super_admin:
        q = q.filter(SpeakerProfile.tenant_id == user.tenant_id)
    profile = q.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Intervenant introuvable")
    return profile


@router.get("", response_model=list[SpeakerProfileResponse])
def list_speakers(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    q = db.query(SpeakerProfile)
    if not user.is_super_admin:
        q = q.filter(SpeakerProfile.tenant_id == user.tenant_id)
    return q.order_by(SpeakerProfile.last_name, SpeakerProfile.first_name).all()


@router.post("", response_model=SpeakerProfileResponse, status_code=status.HTTP_201_CREATED)
def create_speaker(
    body: SpeakerProfileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = SpeakerProfile(
        tenant_id=user.tenant_id,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip().upper(),
        display_name=f"{body.first_name.strip()} {body.last_name.strip().upper()}",
        fonction=body.fonction,
        email=body.email.strip().lower() if body.email else None,
        phone_number=body.phone_number,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/{profile_id}", response_model=SpeakerProfileResponse)
def update_speaker(
    profile_id: str,
    body: SpeakerProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = _get_profile_or_404(profile_id, user, db)

    if body.first_name is not None:
        profile.first_name = body.first_name.strip()
    if body.last_name is not None:
        profile.last_name = body.last_name.strip().upper()
    if body.fonction is not None:
        profile.fonction = body.fonction
    if body.email is not None:
        profile.email = body.email.strip().lower() if body.email else None
    if body.phone_number is not None:
        profile.phone_number = body.phone_number

    # Recompute display_name
    profile.display_name = f"{profile.first_name or ''} {profile.last_name or ''}".strip()

    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_speaker(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = _get_profile_or_404(profile_id, user, db)
    db.delete(profile)
    db.commit()


@router.post("/{profile_id}/send-consent", response_model=SpeakerProfileResponse)
def send_consent_email(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Envoie l'email de consentement (option A). Passe le statut à 'sent'."""
    profile = _get_profile_or_404(profile_id, user, db)

    if not profile.email:
        raise HTTPException(status_code=400, detail="L'intervenant n'a pas d'email renseigné")
    if profile.consent_status == "accepted":
        raise HTTPException(status_code=400, detail="Le consentement a déjà été accepté")

    import secrets
    from datetime import timezone, timedelta
    from datetime import datetime

    profile.consent_type = "email"
    profile.consent_status = "sent"
    profile.consent_token = secrets.token_urlsafe(32)
    profile.consent_token_expires = datetime.now(timezone.utc) + timedelta(days=30)

    # TODO: envoyer l'email réel quand le service email sera configuré

    db.commit()
    db.refresh(profile)
    return profile
