"""Database layer with multi-engine support for dedicated tenant databases."""

import logging
import threading

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.config import settings

logger = logging.getLogger(__name__)

# ── Main (shared) engine ────────────────────────────────────────────────────

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


# ── Dedicated engine pool ───────────────────────────────────────────────────

_engine_pool: dict[str, "Engine"] = {}  # db_name -> Engine
_pool_lock = threading.Lock()


def get_engine_for_db(db_name: str):
    """Return (or create) a SQLAlchemy Engine for a dedicated database."""
    if db_name == settings.db_name:
        return engine

    with _pool_lock:
        if db_name not in _engine_pool:
            url = settings.database_url_for(db_name)
            _engine_pool[db_name] = create_engine(
                url, pool_pre_ping=True, pool_size=5, max_overflow=10,
            )
            logger.info("[DB] Created engine for dedicated database: %s", db_name)
        return _engine_pool[db_name]


def dispose_engine_for_db(db_name: str):
    """Dispose and remove a dedicated engine from the pool."""
    with _pool_lock:
        eng = _engine_pool.pop(db_name, None)
        if eng:
            eng.dispose()
            logger.info("[DB] Disposed engine for database: %s", db_name)


# ── Tenant DB-mode cache ───────────────────────────────────────────────────
# Maps tenant_id -> (db_mode, dedicated_db_name) to avoid DB hits on every request.

_tenant_db_cache: dict[str, tuple[str, str | None]] = {}
_cache_lock = threading.Lock()


def update_tenant_db_cache(tenant_id: str, db_mode: str, dedicated_db_name: str | None):
    """Update the in-memory cache when a tenant's db_mode changes."""
    with _cache_lock:
        _tenant_db_cache[tenant_id] = (db_mode, dedicated_db_name)


def get_tenant_db_info(tenant_id: str) -> tuple[str, str | None]:
    """Return (db_mode, dedicated_db_name) from cache, or ('shared', None) if unknown."""
    with _cache_lock:
        return _tenant_db_cache.get(tenant_id, ("shared", None))


def load_tenant_db_cache(db: Session):
    """Load all tenant DB modes into the cache. Called at startup."""
    from app.models import Tenant
    tenants = db.query(Tenant.id, Tenant.db_mode, Tenant.dedicated_db_name).all()
    with _cache_lock:
        _tenant_db_cache.clear()
        for t_id, mode, db_name in tenants:
            _tenant_db_cache[t_id] = (mode, db_name)
    logger.info("[DB] Loaded DB cache for %d tenants", len(tenants))


# ── FastAPI dependency ──────────────────────────────────────────────────────

def get_db(request: Request = None):
    """FastAPI dependency — yields a DB session routed to the correct engine.

    If the middleware has set ``request.state.db_engine`` (dedicated tenant),
    we use that engine. Otherwise we fall back to the shared engine.
    """
    target_engine = engine  # default: shared
    if request is not None:
        target_engine = getattr(request.state, "db_engine", engine)

    session = sessionmaker(bind=target_engine, autocommit=False, autoflush=False)()
    try:
        yield session
    finally:
        session.close()
