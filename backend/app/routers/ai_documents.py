"""Router — Module Documents IA.

Préfixe : /ai-documents
Module requis : ai_documents
"""

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_module, require_super_admin
from app.models.ai_documents import AIDocument, AIDocumentTemplate
from app.models.user import User
from app.schemas.ai_documents import (
    AIDocumentListItem,
    AIDocumentResponse,
    GenerateRequest,
    TemplateCreate,
    TemplateResponse,
    TemplateUpdate,
)
from app.services.ai_documents import enqueue_generation, seed_default_templates
from app.services.event_bus import event_bus

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai-documents",
    tags=["AI Documents"],
    dependencies=[Depends(require_module("ai_documents"))],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_template_or_404(template_id: str, tenant_id: str, db: Session) -> AIDocumentTemplate:
    tpl = db.query(AIDocumentTemplate).filter_by(id=template_id, tenant_id=tenant_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    return tpl


def _get_document_or_404(doc_id: str, tenant_id: str, db: Session) -> AIDocument:
    doc = db.query(AIDocument).filter_by(id=doc_id, tenant_id=tenant_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return doc


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les templates du tenant (avec seeding des défauts si vide)."""
    seed_default_templates(user.tenant_id, db)
    return (
        db.query(AIDocumentTemplate)
        .filter_by(tenant_id=user.tenant_id)
        .order_by(AIDocumentTemplate.created_at)
        .all()
    )


@router.post("/templates", response_model=TemplateResponse, status_code=201)
def create_template(
    body: TemplateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tpl = AIDocumentTemplate(tenant_id=user.tenant_id, **body.model_dump())
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/templates/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_template_or_404(template_id, user.tenant_id, db)


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: str,
    body: TemplateUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tpl = _get_template_or_404(template_id, user.tenant_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tpl, field, value)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tpl = _get_template_or_404(template_id, user.tenant_id, db)
    db.delete(tpl)
    db.commit()


# ── Modèles Ollama disponibles ────────────────────────────────────────────────

@router.get("/ollama-models")
def list_ollama_models():
    """Retourne les modèles disponibles sur l'instance Ollama locale."""
    import requests as req
    from app.config import settings
    try:
        resp = req.get(f"{settings.ollama_url}/api/tags", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        models = [m["name"] for m in data.get("models", [])]
        return {"models": models, "default": settings.ollama_default_model}
    except Exception as exc:
        logger.warning(f"[AI] Impossible de lister les modèles Ollama : {exc}")
        return {"models": [], "default": settings.ollama_default_model, "error": str(exc)}


@router.delete("/ollama-models/{model_name:path}", status_code=204)
def delete_ollama_model(
    model_name: str,
    _: User = Depends(require_super_admin),
):
    """Supprime un modèle Ollama."""
    import requests as req
    from app.config import settings
    try:
        resp = req.delete(f"{settings.ollama_url}/api/delete", json={"name": model_name}, timeout=30)
        resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Ollama : {exc}")


@router.get("/ollama-models/pull")
async def pull_ollama_model(
    model: str,
    _: User = Depends(require_super_admin),
):
    """Lance le téléchargement d'un modèle Ollama et stream la progression en SSE."""
    import requests as req
    from app.config import settings

    async def _stream() -> AsyncGenerator[str, None]:
        try:
            with req.post(
                f"{settings.ollama_url}/api/pull",
                json={"name": model, "stream": True},
                stream=True,
                timeout=3600,
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line:
                        continue
                    yield f"data: {line.decode()}\n\n"
                    try:
                        chunk = json.loads(line)
                        if chunk.get("status") == "success":
                            break
                    except json.JSONDecodeError:
                        pass
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── Génération ────────────────────────────────────────────────────────────────

@router.post("/generate", response_model=AIDocumentResponse, status_code=202)
def generate_document(
    body: GenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lance une génération asynchrone. Retourne immédiatement le document en statut 'pending'."""
    tpl = _get_template_or_404(body.template_id, user.tenant_id, db)

    # Snapshot du template
    snapshot = {
        "name": tpl.name,
        "document_type": tpl.document_type,
        "system_prompt": tpl.system_prompt,
        "user_prompt_template": tpl.user_prompt_template,
        "ollama_model": tpl.ollama_model,
        "temperature": tpl.temperature,
    }

    doc = AIDocument(
        tenant_id=user.tenant_id,
        user_id=user.id,
        template_id=tpl.id,
        template_snapshot=json.dumps(snapshot, ensure_ascii=False),
        title=body.title,
        status="pending",
        source_dossier_id=body.source_dossier_id,
        source_session_id=body.source_session_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    enqueue_generation(doc.id)
    logger.info(f"[AI] Document {doc.id} mis en file d'attente")
    return doc


# ── Liste / Détail / Suppression ──────────────────────────────────────────────

@router.get("/documents", response_model=list[AIDocumentListItem])
def list_documents(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(AIDocument)
        .filter_by(tenant_id=user.tenant_id)
        .order_by(AIDocument.created_at.desc())
        .all()
    )


@router.get("/documents/{doc_id}", response_model=AIDocumentResponse)
def get_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_document_or_404(doc_id, user.tenant_id, db)


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = _get_document_or_404(doc_id, user.tenant_id, db)
    db.delete(doc)
    db.commit()


# ── Export ─────────────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/export")
def export_document(
    doc_id: str,
    format: str = "md",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Télécharge le document généré au format texte (md ou txt)."""
    doc = _get_document_or_404(doc_id, user.tenant_id, db)
    if doc.status != "completed" or not doc.result_text:
        raise HTTPException(status_code=409, detail="Document pas encore disponible")
    ext = "md" if format == "md" else "txt"
    filename = f"{doc.title}.{ext}".replace("/", "-")
    return StreamingResponse(
        iter([doc.result_text]),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── SSE ───────────────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/events")
async def document_events(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream SSE des événements de génération."""
    _get_document_or_404(doc_id, user.tenant_id, db)

    async def _stream() -> AsyncGenerator[str, None]:
        q = event_bus.subscribe(doc_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("status") in ("completed", "error"):
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            event_bus.unsubscribe(doc_id, q)

    return StreamingResponse(_stream(), media_type="text/event-stream")
