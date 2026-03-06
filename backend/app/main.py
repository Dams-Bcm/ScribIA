from contextlib import asynccontextmanager
import sys

print("[BOOT] main.py loading...", flush=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

print("[BOOT] importing config...", flush=True)
from app.config import settings
print("[BOOT] importing database...", flush=True)
from app.database import engine
print("[BOOT] importing models...", flush=True)
from app.models import Base, Tenant, TenantModule, User, AVAILABLE_MODULES
print("[BOOT] importing auth...", flush=True)
from app.services.auth import hash_password
print("[BOOT] importing routers...", flush=True)
from app.routers import health, auth, admin, privacy, transcription, diarisation, compliance, preparatory_phases, ai_documents, speakers, contacts, search, dictionary
print("[BOOT] importing procedures...", flush=True)
from app.routers.procedures import router as procedures_router, public_router as procedures_public_router
print("[BOOT] importing middleware...", flush=True)
from app.middleware.tenant_db import TenantDBMiddleware
print("[BOOT] all imports done!", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[LIFESPAN] entering lifespan...", flush=True)
    import asyncio
    import logging as _logging
    _log = _logging.getLogger("scribia.startup")

    from app.services.event_bus import event_bus
    event_bus.set_loop(asyncio.get_running_loop())

    # Create tables on startup (Alembic will replace this in production)
    print("[LIFESPAN] create_all...", flush=True)
    try:
        with engine.connect() as _conn:
            print("[LIFESPAN] DB connection OK", flush=True)
        Base.metadata.create_all(bind=engine)
        print("[LIFESPAN] create_all done!", flush=True)
    except Exception as _e:
        print(f"[LIFESPAN] create_all FAILED: {_e}", flush=True)
        raise
    _log.info("[STARTUP] add_missing_columns...")
    _add_missing_columns()
    _log.info("[STARTUP] seed_super_admin...")
    _seed_super_admin()
    _log.info("[STARTUP] seed_sectors...")
    _seed_sectors()
    _log.info("[STARTUP] sync_tenant_modules...")
    _sync_tenant_modules()
    _log.info("[STARTUP] load_dedicated_db_cache...")
    _load_dedicated_db_cache()
    _log.info("[STARTUP] done!")
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

        # tenants: sector, db_mode, dedicated_db_name
        tenant_cols = {c["name"] for c in insp.get_columns("tenants")}
        if "sector" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD sector VARCHAR(50) NULL"
            ))
        if "db_mode" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD db_mode VARCHAR(20) NOT NULL DEFAULT 'shared'"
            ))
        if "dedicated_db_name" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD dedicated_db_name VARCHAR(100) NULL"
            ))

        # procedure_templates: sector + make tenant_id nullable
        pt_cols = {c["name"] for c in insp.get_columns("procedure_templates")}
        if "sector" not in pt_cols:
            conn.execute(text(
                "ALTER TABLE procedure_templates ADD sector VARCHAR(50) NULL"
            ))
        # Make tenant_id nullable (was NOT NULL)
        pt_tenant_col = next((c for c in insp.get_columns("procedure_templates") if c["name"] == "tenant_id"), None)
        if pt_tenant_col and not pt_tenant_col.get("nullable", True):
            conn.execute(text(
                "ALTER TABLE procedure_templates ALTER COLUMN tenant_id VARCHAR(36) NULL"
            ))

        # ai_documents: extra_context
        ai_doc_cols = {c["name"] for c in insp.get_columns("ai_documents")}
        if "extra_context" not in ai_doc_cols:
            conn.execute(text(
                "ALTER TABLE ai_documents ADD extra_context NVARCHAR(MAX) NULL"
            ))

        # sectors: description, suggestions
        if "sectors" in insp.get_table_names():
            sector_cols = {c["name"] for c in insp.get_columns("sectors")}
            if "description" not in sector_cols:
                conn.execute(text(
                    "ALTER TABLE sectors ADD description NVARCHAR(MAX) NULL"
                ))
            if "suggestions" not in sector_cols:
                conn.execute(text(
                    "ALTER TABLE sectors ADD suggestions NVARCHAR(MAX) NULL"
                ))

        # procedures: current_step_index
        proc_cols = {c["name"] for c in insp.get_columns("procedures")}
        if "current_step_index" not in proc_cols:
            conn.execute(text(
                "ALTER TABLE procedures ADD current_step_index INT NULL"
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


def _seed_sectors():
    """Seed default sectors if the sectors table is empty."""
    import json as _json
    from app.database import SessionLocal
    from app.models.sector import Sector

    _DEFAULT_SECTORS = [
        ("syndic_copro", "Syndic de copropriété", ["procedures", "ai_documents", "convocations", "transcription", "contacts"]),
        ("education_spe", "Éducation spécialisée / MDPH", ["preparatory_phases", "ai_documents", "transcription", "transcription_diarisation", "procedures"]),
        ("collectivite", "Collectivité territoriale", ["transcription", "transcription_diarisation", "ai_documents", "procedures"]),
        ("chantier", "Gestion de chantier", ["procedures", "transcription", "ai_documents"]),
        ("sante", "Santé / Médico-social", ["transcription", "transcription_diarisation", "ai_documents", "rgpd", "procedures"]),
    ]

    db = SessionLocal()
    try:
        if db.query(Sector).first() is not None:
            return
        for key, label, modules in _DEFAULT_SECTORS:
            db.add(Sector(key=key, label=label, default_modules=_json.dumps(modules)))
        db.commit()
    finally:
        db.close()


def _sync_tenant_modules():
    """Ensure every tenant has a row for every module in AVAILABLE_MODULES."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        tenants = db.query(Tenant).all()
        for tenant in tenants:
            existing_keys = {m.module_key for m in tenant.modules}
            for key in AVAILABLE_MODULES:
                if key not in existing_keys:
                    db.add(TenantModule(tenant_id=tenant.id, module_key=key, enabled=False))
        db.commit()
    finally:
        db.close()


def _load_dedicated_db_cache():
    """Load tenant DB routing cache and ensure dedicated DBs have all tables."""
    from app.database import SessionLocal, load_tenant_db_cache, get_engine_for_db
    db = SessionLocal()
    try:
        load_tenant_db_cache(db)
        # Ensure dedicated databases have up-to-date schema
        for tenant in db.query(Tenant).filter(Tenant.db_mode == "dedicated").all():
            if tenant.dedicated_db_name:
                ded_engine = get_engine_for_db(tenant.dedicated_db_name)
                Base.metadata.create_all(bind=ded_engine)
    finally:
        db.close()


app = FastAPI(
    title=settings.app_name,
    version="2.0.0",
    lifespan=lifespan,
)

# Middleware — order matters: CORS first, then tenant DB routing
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantDBMiddleware)

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
app.include_router(contacts.router)
app.include_router(search.router)
app.include_router(dictionary.router)
