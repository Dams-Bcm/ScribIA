from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Tenant, TenantModule, User, AVAILABLE_MODULES, AuditLog
from app.schemas.tenant import TenantCreate, TenantUpdate, TenantResponse, TenantModuleUpdate
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.auth import hash_password
from app.deps import require_super_admin

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Tenants ───────────────────────────────────────────────────────────────────


@router.get("/tenants", response_model=list[TenantResponse])
def list_tenants(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenants = (
        db.query(Tenant)
        .options(joinedload(Tenant.modules))
        .order_by(Tenant.name)
        .all()
    )
    return tenants


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    body: TenantCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    # Check slug uniqueness
    if db.query(Tenant).filter(Tenant.slug == body.slug).first():
        raise HTTPException(status_code=409, detail=f"Le slug '{body.slug}' est déjà utilisé")

    # Validate parent
    if body.parent_id:
        parent = db.query(Tenant).filter(Tenant.id == body.parent_id).first()
        if not parent or parent.tenant_type != "group":
            raise HTTPException(status_code=400, detail="Le parent doit être un groupe existant")

    # Validate modules
    for m in body.modules:
        if m not in AVAILABLE_MODULES:
            raise HTTPException(status_code=400, detail=f"Module inconnu : '{m}'")

    tenant = Tenant(
        name=body.name,
        slug=body.slug.strip().lower().replace(" ", "-"),
        tenant_type=body.tenant_type,
        sector=body.sector,
        parent_id=body.parent_id,
        is_large=body.is_large,
    )
    db.add(tenant)
    db.flush()

    # Create module entries
    for m in body.modules:
        db.add(TenantModule(tenant_id=tenant.id, module_key=m, enabled=True))

    db.commit()
    db.refresh(tenant)
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    body: TenantUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).options(joinedload(Tenant.modules)).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    if body.name is not None:
        tenant.name = body.name
    if body.slug is not None:
        existing = db.query(Tenant).filter(Tenant.slug == body.slug, Tenant.id != tenant_id).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Le slug '{body.slug}' est déjà utilisé")
        tenant.slug = body.slug
    if body.tenant_type is not None:
        tenant.tenant_type = body.tenant_type
    if body.sector is not None:
        tenant.sector = body.sector
    if body.parent_id is not None:
        tenant.parent_id = body.parent_id or None
    if body.is_large is not None:
        tenant.is_large = body.is_large
    if body.is_active is not None:
        tenant.is_active = body.is_active

    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Detach children before deleting group
    if tenant.tenant_type == "group":
        db.query(Tenant).filter(Tenant.parent_id == tenant_id).update({"parent_id": None})

    db.delete(tenant)
    db.commit()


# ── Tenant modules ────────────────────────────────────────────────────────────


@router.put("/tenants/{tenant_id}/modules")
def update_tenant_modules(
    tenant_id: str,
    body: list[TenantModuleUpdate],
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    for item in body:
        if item.module_key not in AVAILABLE_MODULES:
            raise HTTPException(status_code=400, detail=f"Module inconnu : '{item.module_key}'")

        existing = db.query(TenantModule).filter_by(tenant_id=tenant_id, module_key=item.module_key).first()
        if existing:
            existing.enabled = item.enabled
        else:
            db.add(TenantModule(tenant_id=tenant_id, module_key=item.module_key, enabled=item.enabled))

    db.commit()
    return {"message": "Modules mis à jour"}


@router.get("/modules")
def list_available_modules(_: User = Depends(require_super_admin)):
    return [{"key": k, "label": v} for k, v in AVAILABLE_MODULES.items()]


# ── Users ─────────────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[UserResponse])
def list_users(
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    q = db.query(User).options(joinedload(User.tenant).joinedload(Tenant.modules))
    if tenant_id:
        q = q.filter(User.tenant_id == tenant_id)
    return q.order_by(User.username).all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == body.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Check uniqueness
    existing = db.query(User).filter(User.username == body.username, User.tenant_id == body.tenant_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"L'utilisateur '{body.username}' existe déjà dans cette organisation")

    user = User(
        username=body.username,
        email=body.email.strip().lower() if body.email else None,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
        tenant_id=body.tenant_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.tenant).joinedload(Tenant.modules))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if body.email is not None:
        user.email = body.email.strip().lower() if body.email else None
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    db.delete(user)
    db.commit()


# ── Audit logs ────────────────────────────────────────────────────────────────


@router.get("/audit-logs")
def list_audit_logs(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": l.id,
            "timestamp": str(l.timestamp),
            "user_id": l.user_id,
            "tenant_id": l.tenant_id,
            "action": l.action,
            "resource": l.resource,
            "resource_id": l.resource_id,
            "ip_address": l.ip_address,
        }
        for l in logs
    ]
