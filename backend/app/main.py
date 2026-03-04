from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import Base, Tenant, TenantModule, User, AVAILABLE_MODULES
from app.services.auth import hash_password
from app.routers import health, auth, admin, privacy


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (Alembic will replace this in production)
    Base.metadata.create_all(bind=engine)
    _seed_super_admin()
    yield


def _seed_super_admin():
    """Create a default super_admin + tenant if the DB is empty."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        if db.query(User).first() is not None:
            return

        tenant = Tenant(name="Administration", slug="admin", tenant_type="group")
        db.add(tenant)
        db.flush()

        # Enable all modules for the admin tenant
        for key in AVAILABLE_MODULES:
            db.add(TenantModule(tenant_id=tenant.id, module_key=key, enabled=True))

        user = User(
            username="admin",
            hashed_password=hash_password("admin"),
            display_name="Super Admin",
            role="super_admin",
            tenant_id=tenant.id,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()


app = FastAPI(
    title=settings.app_name,
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(privacy.router)
