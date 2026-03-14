from contextlib import asynccontextmanager
import logging
import sys

# Configure root logger so that all logger.info / logger.warning calls
# from app modules are visible in docker logs (stdout).
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s: %(message)s",
    stream=sys.stdout,
)

print("[BOOT] main.py loading...", flush=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

print("[BOOT] importing config...", flush=True)
from app.config import settings
print("[BOOT] importing database...", flush=True)
from app.database import engine
print("[BOOT] importing models...", flush=True)
from app.models import Base, Tenant, TenantModule, User, AVAILABLE_MODULES
from app.models.push_subscription import PushSubscription  # noqa: F401 — ensure table creation
print("[BOOT] importing auth...", flush=True)
from app.services.auth import hash_password
print("[BOOT] importing routers...", flush=True)
from app.routers import health, auth, admin, privacy, transcription, diarisation, compliance, preparatory_phases, ai_documents, speakers, contacts, search, dictionary, consent, push, planned_meetings
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
    print("[LIFESPAN] add_missing_columns...", flush=True)
    _add_missing_columns()
    print("[LIFESPAN] seed_super_admin...", flush=True)
    _seed_super_admin()
    print("[LIFESPAN] seed_sectors...", flush=True)
    _seed_sectors()
    print("[LIFESPAN] sync_tenant_modules...", flush=True)
    _sync_tenant_modules()
    print("[LIFESPAN] ensure_default_contact_groups...", flush=True)
    _ensure_default_contact_groups()
    print("[LIFESPAN] load_dedicated_db_cache...", flush=True)
    _load_dedicated_db_cache()
    print("[LIFESPAN] load_system_settings...", flush=True)
    _load_system_settings()
    print("[LIFESPAN] done! App ready.", flush=True)
    yield


def _add_missing_columns():
    """Add columns introduced by diarisation module to existing tables (MSSQL)."""
    from sqlalchemy import text, inspect

    with engine.connect() as conn:
        insp = inspect(conn)
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
        if "whisper_initial_prompt" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD whisper_initial_prompt NVARCHAR(MAX) NULL"
            ))
        if "rag_project_id" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD rag_project_id VARCHAR(100) NULL"
            ))
        if "rag_api_key" not in tenant_cols:
            conn.execute(text(
                "ALTER TABLE tenants ADD rag_api_key VARCHAR(255) NULL"
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

        # ai_document_templates: map_system_prompt
        ai_tpl_cols = {c["name"] for c in insp.get_columns("ai_document_templates")}
        if "map_system_prompt" not in ai_tpl_cols:
            conn.execute(text(
                "ALTER TABLE ai_document_templates ADD map_system_prompt NVARCHAR(MAX) NULL"
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

        # procedures: drop FK on document_template_id (global templates cross-DB)
        fk_rows = conn.execute(text("""
            SELECT fk.name
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
            WHERE OBJECT_NAME(fk.parent_object_id) = 'procedures'
              AND c.name = 'document_template_id'
        """)).fetchall()
        for row in fk_rows:
            conn.execute(text(f"ALTER TABLE procedures DROP CONSTRAINT [{row[0]}]"))

        # transcription_jobs: attendees, recording_validity
        if "attendees" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD attendees NVARCHAR(MAX) NULL"
            ))
        if "recording_validity" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD recording_validity VARCHAR(20) NULL"
            ))
        if "consent_detection_result" not in job_cols:
            conn.execute(text(
                "ALTER TABLE transcription_jobs ADD consent_detection_result NVARCHAR(MAX) NULL"
            ))

        # speaker_profiles: contact_id
        if "speaker_profiles" in insp.get_table_names():
            sp_cols = {c["name"] for c in insp.get_columns("speaker_profiles")}
            if "contact_id" not in sp_cols:
                conn.execute(text(
                    "ALTER TABLE speaker_profiles ADD contact_id VARCHAR(36) NULL"
                ))

        # ai_documents: invalidated_at, invalidated_reason
        if "ai_documents" in insp.get_table_names():
            doc_cols = {c["name"] for c in insp.get_columns("ai_documents")}
            if "invalidated_at" not in doc_cols:
                conn.execute(text(
                    "ALTER TABLE ai_documents ADD invalidated_at DATETIME2 NULL"
                ))
            if "invalidated_reason" not in doc_cols:
                conn.execute(text(
                    "ALTER TABLE ai_documents ADD invalidated_reason NVARCHAR(MAX) NULL"
                ))

        # speaker_enrollment_segments: make segment_id nullable
        if "speaker_enrollment_segments" in insp.get_table_names():
            ses_col = next(
                (c for c in insp.get_columns("speaker_enrollment_segments") if c["name"] == "segment_id"),
                None,
            )
            if ses_col and not ses_col.get("nullable", True):
                conn.execute(text(
                    "ALTER TABLE speaker_enrollment_segments ALTER COLUMN segment_id VARCHAR(36) NULL"
                ))

        # ai_document_templates: tenant_id nullable + sector column
        adt_cols = {c["name"] for c in insp.get_columns("ai_document_templates")} if "ai_document_templates" in insp.get_table_names() else set()
        if "ai_document_templates" in insp.get_table_names():
            tid_col = next(
                (c for c in insp.get_columns("ai_document_templates") if c["name"] == "tenant_id"),
                None,
            )
            if tid_col and not tid_col.get("nullable", True):
                conn.execute(text(
                    "ALTER TABLE ai_document_templates ALTER COLUMN tenant_id VARCHAR(36) NULL"
                ))
            if "sector" not in adt_cols:
                conn.execute(text(
                    "ALTER TABLE ai_document_templates ADD sector VARCHAR(50) NULL"
                ))
            if "category" not in adt_cols:
                conn.execute(text(
                    "ALTER TABLE ai_document_templates ADD category VARCHAR(50) NOT NULL DEFAULT 'document'"
                ))
            if "is_global" not in adt_cols:
                conn.execute(text(
                    "ALTER TABLE ai_document_templates ADD is_global BIT NOT NULL DEFAULT 0"
                ))
            if "workflow_steps" not in adt_cols:
                conn.execute(text(
                    "ALTER TABLE ai_document_templates ADD workflow_steps NVARCHAR(MAX) NULL"
                ))

        # contacts: first_name
        if "contacts" in insp.get_table_names():
            contact_cols = {c["name"] for c in insp.get_columns("contacts")}
            if "first_name" not in contact_cols:
                conn.execute(text(
                    "ALTER TABLE contacts ADD first_name NVARCHAR(255) NULL"
                ))

        # contacts N:N migration: create junction table, migrate data, drop old group_id
        tables = insp.get_table_names()
        if "contacts" in tables:
            contact_cols = {c["name"] for c in insp.get_columns("contacts")}
            if "contact_group_members" not in tables and "group_id" in contact_cols:
                conn.execute(text("""
                    CREATE TABLE contact_group_members (
                        contact_id VARCHAR(36) NOT NULL,
                        group_id VARCHAR(36) NOT NULL,
                        PRIMARY KEY (contact_id, group_id),
                        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE NO ACTION,
                        FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE NO ACTION
                    )
                """))
                conn.execute(text("""
                    INSERT INTO contact_group_members (contact_id, group_id)
                    SELECT id, group_id FROM contacts WHERE group_id IS NOT NULL
                """))
            # Drop group_id column if it still exists (even if junction table already created)
            if "group_id" in contact_cols:
                # Drop FK constraint on group_id before dropping column
                conn.execute(text("""
                    DECLARE @fk NVARCHAR(255)
                    SELECT @fk = fk.name
                    FROM sys.foreign_keys fk
                    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
                    JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
                    WHERE OBJECT_NAME(fk.parent_object_id) = 'contacts' AND c.name = 'group_id'
                    IF @fk IS NOT NULL
                        EXEC('ALTER TABLE contacts DROP CONSTRAINT ' + @fk)
                """))
                conn.execute(text("ALTER TABLE contacts DROP COLUMN group_id"))

        # Add is_default column to contact_groups if missing
        if "contact_groups" in tables:
            cg_cols = {c["name"] for c in insp.get_columns("contact_groups")}
            if "is_default" not in cg_cols:
                conn.execute(text(
                    "ALTER TABLE contact_groups ADD is_default BIT NOT NULL DEFAULT 0"
                ))

        # contact_group_members: fix FK to CASCADE (was NO ACTION)
        if "contact_group_members" in tables:
            fk_fix_rows = conn.execute(text("""
                SELECT fk.name, OBJECT_NAME(fk.referenced_object_id) AS ref_table
                FROM sys.foreign_keys fk
                WHERE OBJECT_NAME(fk.parent_object_id) = 'contact_group_members'
                  AND fk.delete_referential_action_desc = 'NO_ACTION'
            """)).fetchall()
            for row in fk_fix_rows:
                fk_name, ref_table = row[0], row[1]
                if ref_table == "contacts":
                    conn.execute(text(f"ALTER TABLE contact_group_members DROP CONSTRAINT [{fk_name}]"))
                    conn.execute(text(
                        "ALTER TABLE contact_group_members ADD CONSTRAINT [FK_cgm_contact] "
                        "FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE"
                    ))
                elif ref_table == "contact_groups":
                    conn.execute(text(f"ALTER TABLE contact_group_members DROP CONSTRAINT [{fk_name}]"))
                    conn.execute(text(
                        "ALTER TABLE contact_group_members ADD CONSTRAINT [FK_cgm_group] "
                        "FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE"
                    ))

        # planned_meeting_participants: consent_status
        if "planned_meeting_participants" in tables:
            pmp_cols = {c["name"] for c in insp.get_columns("planned_meeting_participants")}
            if "consent_status" not in pmp_cols:
                conn.execute(text(
                    "ALTER TABLE planned_meeting_participants ADD consent_status VARCHAR(20) NULL"
                ))

        # users: reset_token, reset_token_expires
        user_cols = {c["name"] for c in insp.get_columns("users")}
        if "reset_token" not in user_cols:
            conn.execute(text(
                "ALTER TABLE users ADD reset_token VARCHAR(255) NULL"
            ))
        if "reset_token_expires" not in user_cols:
            conn.execute(text(
                "ALTER TABLE users ADD reset_token_expires DATETIME2 NULL"
            ))

        # preparatory_dossiers: planned_meeting_id
        if "preparatory_dossiers" in tables:
            pd_cols = {c["name"] for c in insp.get_columns("preparatory_dossiers")}
            if "planned_meeting_id" not in pd_cols:
                conn.execute(text(
                    "ALTER TABLE preparatory_dossiers ADD planned_meeting_id VARCHAR(36) NULL"
                ))

        conn.commit()


def _ensure_default_contact_groups():
    """Ensure every tenant with the contacts module has a default group."""
    from app.database import SessionLocal
    from app.models.contacts import ContactGroup
    db = SessionLocal()
    try:
        # Find tenants with contacts module enabled but no default group
        tenants_with_module = (
            db.query(TenantModule.tenant_id)
            .filter(TenantModule.module_key == "contacts", TenantModule.enabled == True)
            .all()
        )
        for (tid,) in tenants_with_module:
            existing = db.query(ContactGroup).filter(
                ContactGroup.tenant_id == tid, ContactGroup.is_default == True
            ).first()
            if not existing:
                db.add(ContactGroup(tenant_id=tid, name="Défaut", is_default=True))
        db.commit()
    finally:
        db.close()


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
        ("education_spe", "Éducation spécialisée / MDPH", ["ai_documents", "transcription", "transcription_diarisation", "procedures"]),
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


def _load_system_settings():
    """Load persisted system settings (SMTP, etc.) from DB into runtime config."""
    from app.database import SessionLocal
    from app.models.system_settings import SystemSetting
    db = SessionLocal()
    try:
        rows = db.query(SystemSetting).all()
        for row in rows:
            if row.value is None:
                continue
            if row.key == "smtp_port":
                try:
                    settings.smtp_port = int(row.value)
                except ValueError:
                    pass
            elif row.key == "smtp_use_tls":
                settings.smtp_use_tls = row.value.lower() in ("true", "1", "yes")
            elif hasattr(settings, row.key):
                setattr(settings, row.key, row.value)
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
app.include_router(consent.router)
app.include_router(push.router)
app.include_router(planned_meetings.router)
