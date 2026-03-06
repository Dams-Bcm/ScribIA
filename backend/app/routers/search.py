"""Router pour la recherche RAG — recherche sémantique par tenant."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models import User
from app.services import rag, indexer
from app.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/search",
    tags=["search"],
    dependencies=[Depends(require_module("search"))],
)


# ── Schemas ──────────────────────────────────────────────────────────────────


class AskRequest(BaseModel):
    question: str
    source_filter: Optional[str] = None  # "ai_document" | "transcription" | "procedure" | None


class SourceInfo(BaseModel):
    type: str
    id: str
    title: str
    relevance: float


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceInfo]
    chunks_used: int


class ReindexResponse(BaseModel):
    ai_documents: int
    transcriptions: int
    procedures: int
    chunks_total: int


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/ask", response_model=AskResponse)
def ask_question(
    body: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pose une question en langage naturel, reçoit une réponse basée sur les documents du tenant."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="La question ne peut pas être vide.")

    if body.source_filter and body.source_filter not in ("ai_document", "transcription", "procedure"):
        raise HTTPException(status_code=400, detail="Filtre source invalide.")

    result = rag.ask(user.tenant_id, body.question, body.source_filter)

    log_action(db, "search_ask", user_id=user.id, tenant_id=user.tenant_id,
               resource="search", details={"question": body.question[:200]})

    return AskResponse(**result)


@router.post("/reindex", response_model=ReindexResponse)
def reindex(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Réindexe toutes les données du tenant (admin/super_admin uniquement)."""
    if user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    stats = indexer.reindex_tenant(user.tenant_id, db)

    log_action(db, "search_reindex", user_id=user.id, tenant_id=user.tenant_id,
               resource="search", details=stats)

    return ReindexResponse(**stats)
