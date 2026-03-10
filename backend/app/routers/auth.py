import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from sqlalchemy import or_

from app.database import get_db
from app.models import User, Tenant
from app.models.sector import Sector
from app.models.announcement import Announcement, announcement_tenants
from app.schemas.auth import (
    LoginRequest, TokenResponse, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from app.schemas.user import UserResponse
from app.services.auth import verify_password, hash_password, create_access_token
from app.services.audit import log_action
from app.services.email import send_generic_email
from app.config import settings
from app.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .options(joinedload(User.tenant).joinedload(Tenant.modules))
        .filter(User.username == body.username, User.is_active == True)
        .first()
    )
    if not user or not verify_password(body.password, user.hashed_password):
        log_action(db, "login_failed", details={"username": body.username}, ip_address=request.client.host if request.client else None)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects")

    log_action(db, "login_success", user_id=user.id, tenant_id=user.tenant_id, ip_address=request.client.host if request.client else None)
    token = create_access_token({"sub": user.id, "tenant_id": user.tenant_id, "role": user.role})
    db.commit()
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response = UserResponse.model_validate(user)
    response.tenant_sector = user.tenant_sector
    if user.tenant and user.tenant.sector:
        sector = db.query(Sector).filter_by(key=user.tenant.sector).first()
        if sector and sector.suggestions:
            response.sector_suggestions = json.loads(sector.suggestions)
    return response


@router.get("/announcement")
def get_active_announcement(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the currently active announcement visible to this user's tenant."""
    # Super admins don't see announcements (they manage them)
    if user.role == "super_admin":
        return None

    ann = (
        db.query(Announcement)
        .filter(Announcement.is_active == True)
        .outerjoin(announcement_tenants)
        .filter(
            or_(
                Announcement.target_all == True,
                announcement_tenants.c.tenant_id == user.tenant_id,
            )
        )
        .first()
    )
    if not ann:
        return None
    return {"id": ann.id, "title": ann.title, "message": ann.message}


# ── Change password (authenticated) ──────────────────────────────────────────


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 8 caractères")

    user.hashed_password = hash_password(body.new_password)
    log_action(db, "password_changed", user_id=user.id, tenant_id=user.tenant_id,
               ip_address=request.client.host if request.client else None)
    db.commit()
    return {"status": "ok"}


# ── Forgot password (public) ─────────────────────────────────────────────────


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    # Always return success to avoid email enumeration
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user:
        return {"status": "ok"}

    token = secrets.token_urlsafe(48)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    log_action(db, "password_reset_requested", user_id=user.id, tenant_id=user.tenant_id,
               ip_address=request.client.host if request.client else None)
    db.commit()

    reset_url = f"{settings.app_base_url.rstrip('/')}/reset-password?token={token}"
    send_generic_email(
        to_email=user.email,
        subject="Réinitialisation de votre mot de passe — ScribIA",
        title="Réinitialisation du mot de passe",
        icon="&#128274;",
        icon_bg="#fef3c7",
        body_html=f"""\
<p style="margin:0 0 14px 0;">Bonjour <strong>{user.display_name or user.username}</strong>,</p>
<p style="margin:0 0 14px 0;">
  Vous avez demandé la réinitialisation de votre mot de passe.
  Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
</p>
<p style="margin:0 0 14px 0;">
  Ce lien est valable <strong>1 heure</strong>.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
  <tr>
    <td>
      <a href="{reset_url}" target="_blank"
         style="display:inline-block; background-color:#2563eb; color:#ffffff;
                padding:12px 36px; text-decoration:none; border-radius:6px;
                font-size:14px; font-weight:bold; font-family:Arial,sans-serif;">
        Réinitialiser mon mot de passe
      </a>
    </td>
  </tr>
</table>
<p style="margin:20px 0 0 0; font-size:13px; color:#9ca3af;">
  Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
</p>""",
    )
    return {"status": "ok"}


# ── Reset password (public, with token) ──────────────────────────────────────


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.reset_token == body.token,
        User.is_active == True,
    ).first()

    if not user or not user.reset_token_expires:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré")

    if datetime.now(timezone.utc) > user.reset_token_expires.replace(tzinfo=timezone.utc):
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Lien expiré, veuillez refaire une demande")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")

    user.hashed_password = hash_password(body.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    log_action(db, "password_reset_completed", user_id=user.id, tenant_id=user.tenant_id,
               ip_address=request.client.host if request.client else None)
    db.commit()
    return {"status": "ok"}
