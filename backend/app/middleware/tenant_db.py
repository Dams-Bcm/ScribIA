"""Middleware that routes requests to the correct database engine based on tenant."""

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.database import engine, get_tenant_db_info, get_engine_for_db
from app.services.auth import decode_access_token

logger = logging.getLogger(__name__)


class TenantDBMiddleware(BaseHTTPMiddleware):
    """Read the JWT, resolve the tenant's DB mode, and set request.state.db_engine."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Default to shared engine
        request.state.db_engine = engine

        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_access_token(token)
            if payload:
                tenant_id = payload.get("tenant_id")
                if tenant_id:
                    db_mode, dedicated_db_name = get_tenant_db_info(tenant_id)
                    if db_mode == "dedicated" and dedicated_db_name:
                        request.state.db_engine = get_engine_for_db(dedicated_db_name)

        return await call_next(request)
