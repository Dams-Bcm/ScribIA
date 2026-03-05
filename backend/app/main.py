from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import Base, Tenant, TenantModule, User, AVAILABLE_MODULES
from app.services.auth import hash_password
from app.routers import health, auth, admin, privacy, transcription, diarisation, compliance, preparatory_phases, ai_documents, speakers
from app.routers.procedures import router as procedures_router, public_router as procedures_public_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.services.event_bus import event_bus
    event_bus.set_loop(asyncio.get_running_loop())

    # Create tables on startup (Alembic will replace this in production)
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    _seed_super_admin()
    yield


def _add_missing_columns():
    """Add columns introduced by diarisation module to existing tables (MSSQL)."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)

    with engine.connect() as conn:
        # transcription_jobs: mode, num_speakers, detected_speakers
        job_cols = {c["name"] for c in insp.get_columns("transcription_jobs")}
        if "mode" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD mode VARCHAR(20) NOT NULL DEFAULT 'simple'"
            ))
        if "num_speakers" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD num_speakers INT NULL"
            ))
        if "detected_speakers" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD detected_speakers INT NULL"
            ))

        # transcription_segments: speaker_id, speaker_label
        seg_cols = {c["name"] for c in insp.get_columns("transcription_segments")}
        if "speaker_id" not in seg_cols:
            conn.execute(text(
                "ALTER TABLE transcription_segments ADD speaker_id VARCHAR(50) NULL"
            ))
        if "speaker_label" not in seg_cols:
            conn.execute(text(
                "ALTER TABLE transcription_segments ADD speaker_label VARCHAR(255) NULL"
            ))

        # diarisation_speakers: profile_id, embedding
        ds_cols = {c["name"] for c in insp.get_columns("diarisation_speakers")}
        if "profile_id" not in ds_cols:
            conn.execute(text(
                "ALTER TABLE diarisation_speakers ADD profile_id VARCHAR(36) NULL"
            ))
        if "embedding" not in ds_cols:
            conn.execute(text(
                "ALTER TABLE diarisation_speakers ADD embedding NVARCHAR(MAX) NULL"
            ))

        conn.commit()


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
app.include_router(transcription.router)
app.include_router(diarisation.router)
app.include_router(compliance.router)
app.include_router(preparatory_phases.router)
app.include_router(ai_documents.router)
app.include_router(speakers.router)
app.include_router(procedures_router)
app.include_router(procedures_public_router)
