"""Service for provisioning and deprovisioning dedicated tenant databases."""

import logging
import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_engine_for_db, dispose_engine_for_db, update_tenant_db_cache
from app.models import Base, Tenant

logger = logging.getLogger(__name__)


def _safe_db_name(tenant_slug: str) -> str:
    """Generate a safe database name from a tenant slug."""
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", tenant_slug)
    return f"scribia_{clean}"


def provision_dedicated_db(db: Session, tenant: Tenant) -> str:
    """Create a dedicated database for a tenant and migrate its data.

    Returns the dedicated database name.
    """
    db_name = _safe_db_name(tenant.slug)
    logger.info("[DedicatedDB] Provisioning database '%s' for tenant '%s'", db_name, tenant.name)

    # 1. Create the database on the SQL Server (use master-level connection)
    with engine.connect() as conn:
        # Autocommit required for CREATE DATABASE
        conn.execute(text("COMMIT"))
        conn.execute(text(f"IF DB_ID('{db_name}') IS NULL CREATE DATABASE [{db_name}]"))
        conn.commit()

    # 2. Create all tables in the dedicated database
    ded_engine = get_engine_for_db(db_name)
    Base.metadata.create_all(bind=ded_engine)

    # 3. Copy tenant data from shared DB to dedicated DB
    _migrate_tenant_data(db, tenant, ded_engine)

    # 4. Update tenant record in shared DB
    tenant.db_mode = "dedicated"
    tenant.dedicated_db_name = db_name
    db.commit()

    # 5. Update cache
    update_tenant_db_cache(tenant.id, "dedicated", db_name)

    logger.info("[DedicatedDB] Successfully provisioned '%s'", db_name)
    return db_name


def deprovision_dedicated_db(db: Session, tenant: Tenant):
    """Move data back to shared DB and mark tenant as shared.

    Does NOT drop the dedicated database (safety measure).
    """
    if tenant.db_mode != "dedicated" or not tenant.dedicated_db_name:
        return

    db_name = tenant.dedicated_db_name
    logger.info("[DedicatedDB] Deprovisioning '%s' for tenant '%s'", db_name, tenant.name)

    ded_engine = get_engine_for_db(db_name)

    # 1. Copy data back from dedicated to shared
    _migrate_tenant_data_back(ded_engine, tenant, db)

    # 2. Update tenant record
    tenant.db_mode = "shared"
    tenant.dedicated_db_name = None
    db.commit()

    # 3. Update cache and dispose engine
    update_tenant_db_cache(tenant.id, "shared", None)
    dispose_engine_for_db(db_name)

    logger.info("[DedicatedDB] Deprovisioned '%s' (database kept for safety)", db_name)


def _get_tenant_tables() -> list[str]:
    """Return the list of tables that contain tenant-scoped data, in dependency order."""
    return [
        "transcription_segments",
        "transcription_jobs",
        "diarisation_speakers",
        "ai_documents",
        "procedure_steps",
        "procedure_roles",
        "procedure_form_fields",
        "procedure_form_submissions",
        "procedures",
        "preparatory_phase_documents",
        "preparatory_phases",
        "contacts",
        "speaker_profiles",
        "compliance_data",
        "audit_logs",
    ]


def _migrate_tenant_data(shared_db: Session, tenant: Tenant, ded_engine):
    """Copy tenant data from shared DB to dedicated DB."""
    from sqlalchemy import inspect

    shared_insp = inspect(engine)
    ded_insp = inspect(ded_engine)
    tenant_id = tenant.id

    tables_with_tenant_id = []
    for table_name in shared_insp.get_table_names():
        cols = {c["name"] for c in shared_insp.get_columns(table_name)}
        if "tenant_id" in cols:
            tables_with_tenant_id.append(table_name)

    logger.info("[DedicatedDB] Migrating data for tenant %s from %d tables", tenant_id, len(tables_with_tenant_id))

    for table_name in tables_with_tenant_id:
        # Check table exists in dedicated DB
        if table_name not in ded_insp.get_table_names():
            continue

        cols = [c["name"] for c in shared_insp.get_columns(table_name)]
        col_list = ", ".join(f"[{c}]" for c in cols)

        # Read from shared
        rows = shared_db.execute(
            text(f"SELECT {col_list} FROM [{table_name}] WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        ).fetchall()

        if not rows:
            continue

        # Insert into dedicated
        placeholders = ", ".join(f":{c}" for c in cols)
        insert_sql = f"INSERT INTO [{table_name}] ({col_list}) VALUES ({placeholders})"

        with ded_engine.connect() as ded_conn:
            for row in rows:
                ded_conn.execute(text(insert_sql), dict(zip(cols, row)))
            ded_conn.commit()

        # Delete from shared
        shared_db.execute(
            text(f"DELETE FROM [{table_name}] WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        )
        shared_db.commit()

        logger.info("[DedicatedDB] Migrated %d rows from %s", len(rows), table_name)


def _migrate_tenant_data_back(ded_engine, tenant: Tenant, shared_db: Session):
    """Copy tenant data from dedicated DB back to shared DB."""
    from sqlalchemy import inspect

    ded_insp = inspect(ded_engine)
    shared_insp = inspect(engine)
    tenant_id = tenant.id

    for table_name in ded_insp.get_table_names():
        cols_ded = {c["name"] for c in ded_insp.get_columns(table_name)}
        if "tenant_id" not in cols_ded:
            continue

        # Check table exists in shared DB
        if table_name not in shared_insp.get_table_names():
            continue

        cols = [c["name"] for c in ded_insp.get_columns(table_name)]
        col_list = ", ".join(f"[{c}]" for c in cols)

        # Read from dedicated
        with ded_engine.connect() as ded_conn:
            rows = ded_conn.execute(
                text(f"SELECT {col_list} FROM [{table_name}] WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            ).fetchall()

        if not rows:
            continue

        # Insert into shared
        placeholders = ", ".join(f":{c}" for c in cols)
        insert_sql = f"INSERT INTO [{table_name}] ({col_list}) VALUES ({placeholders})"

        for row in rows:
            shared_db.execute(text(insert_sql), dict(zip(cols, row)))
        shared_db.commit()

        # Delete from dedicated
        with ded_engine.connect() as ded_conn:
            ded_conn.execute(
                text(f"DELETE FROM [{table_name}] WHERE tenant_id = :tid"),
                {"tid": tenant_id},
            )
            ded_conn.commit()

        logger.info("[DedicatedDB] Migrated back %d rows from %s", len(rows), table_name)
