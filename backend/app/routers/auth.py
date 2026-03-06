import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, Tenant
from app.models.sector import Sector
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth import verify_password, create_access_token
from app.services.audit import log_action
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
