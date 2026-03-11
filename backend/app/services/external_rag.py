"""Client HTTP pour le rag-api externe.

Endpoints utilisés :
  - GET  /v1/health          : healthcheck
  - POST /v1/search          : recherche sémantique
  - POST /v1/chat            : RAG chat (search + LLM)
  - POST /v1/ingest          : upload fichier (multipart)
  - POST /v1/ingest/external : ingestion source externe (JSON)
  - GET  /v1/documents       : liste des documents indexés
  - DELETE /v1/documents/{id} : suppression document
  - POST /v1/transcribe      : transcription audio (Whisper + pyannote)

Auth : API Key (rak_...) via header Authorization.
Multi-tenancy : X-Tenant-ID + X-Project-ID sur chaque requête.
"""

import io
import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)


def _headers(tenant_id: str) -> dict[str, str]:
    """Headers communs : auth API Key + isolation multi-tenant."""
    return {
        "Authorization": f"Bearer {settings.rag_api_key}",
        "X-Tenant-ID": tenant_id,
        "X-Project-ID": settings.rag_project_id,
    }


def _base() -> str:
    return settings.rag_api_url.rstrip("/")


# ── Health ───────────────────────────────────────────────────────────────────


def health_check() -> bool:
    """Vérifie que le rag-api est joignable."""
    try:
        r = httpx.get(f"{_base()}/v1/health", timeout=5.0)
        return r.status_code == 200
    except Exception:
        return False


# ── Search ───────────────────────────────────────────────────────────────────


def search(
    tenant_id: str,
    query: str,
    top_k: int | None = None,
    score_threshold: float | None = None,
) -> dict:
    """POST /v1/search — recherche sémantique pure (sans génération LLM)."""
    body: dict[str, Any] = {"query": query}
    if top_k is not None:
        body["top_k"] = top_k
    if score_threshold is not None:
        body["score_threshold"] = score_threshold

    r = httpx.post(
        f"{_base()}/v1/search", json=body,
        headers=_headers(tenant_id), timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


# ── Chat (RAG + LLM) ────────────────────────────────────────────────────────


def chat(
    tenant_id: str,
    message: str,
    *,
    top_k: int | None = None,
    score_threshold: float | None = None,
    max_tokens: int = 2048,
    temperature: float = 0.1,
) -> dict:
    """POST /v1/chat (stream=false) — RAG-augmented answer."""
    body: dict[str, Any] = {
        "message": message,
        "stream": False,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if top_k is not None:
        body["top_k"] = top_k
    if score_threshold is not None:
        body["score_threshold"] = score_threshold

    r = httpx.post(
        f"{_base()}/v1/chat", json=body,
        headers=_headers(tenant_id), timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


# ── Ingestion ────────────────────────────────────────────────────────────────


def ingest_file(
    tenant_id: str,
    content: str,
    filename: str,
    content_type: str = "text/markdown",
    metadata: dict | None = None,
) -> dict:
    """POST /v1/ingest — upload d'un fichier texte (multipart).

    Crée un fichier en mémoire à partir du contenu texte et l'envoie
    via multipart/form-data.
    """
    files = {"file": (filename, io.BytesIO(content.encode("utf-8")), content_type)}
    data: dict[str, Any] = {}
    if metadata:
        data["metadata"] = json.dumps(metadata)

    r = httpx.post(
        f"{_base()}/v1/ingest",
        files=files,
        data=data,
        headers=_headers(tenant_id),
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def ingest_external(
    tenant_id: str,
    source_type: str,
    source_uri: str,
    filename: str | None = None,
    content_type: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """POST /v1/ingest/external — ingestion d'une source distante."""
    body: dict[str, Any] = {
        "source_type": source_type,
        "source_uri_external": source_uri,
    }
    if filename:
        body["filename"] = filename
    if content_type:
        body["content_type"] = content_type
    if metadata:
        body["metadata"] = metadata

    r = httpx.post(
        f"{_base()}/v1/ingest/external", json=body,
        headers=_headers(tenant_id), timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


# ── Documents ────────────────────────────────────────────────────────────────


def list_documents(tenant_id: str) -> dict:
    """GET /v1/documents — liste les documents indexés pour ce tenant."""
    r = httpx.get(
        f"{_base()}/v1/documents",
        headers=_headers(tenant_id), timeout=_TIMEOUT,
    )
    r.raise_for_status()
    return r.json()


def delete_document(tenant_id: str, doc_id: str) -> None:
    """DELETE /v1/documents/{doc_id} — soft-delete + suppression chunks/vecteurs/fichiers."""
    r = httpx.delete(
        f"{_base()}/v1/documents/{doc_id}",
        headers=_headers(tenant_id), timeout=_TIMEOUT,
    )
    r.raise_for_status()


# ── Transcription ────────────────────────────────────────────────────────────

# Timeout long pour la transcription (audio de 1h+ → plusieurs minutes de traitement)
_TRANSCRIBE_TIMEOUT = httpx.Timeout(connect=10.0, read=600.0, write=120.0, pool=10.0)


def transcribe(
    tenant_id: str,
    audio_path: str,
    *,
    initial_prompt: str | None = None,
    language: str | None = None,
) -> dict:
    """POST /v1/transcribe — transcription audio via Whisper + pyannote.

    Envoie le fichier audio en multipart et retourne les segments transcrits.
    Accepte initial_prompt et language en champs Form optionnels.

    Retour attendu :
        {
            "segments": [{"start": 0.0, "end": 3.5, "text": "...", "speaker": "SPEAKER_00"|null}],
            "language": "fr",
            "duration": 3600.0,
            "speaker_embeddings": {"SPEAKER_00": [0.12, ...], ...} | null
        }
    """
    data: dict[str, str] = {}
    if initial_prompt:
        data["initial_prompt"] = initial_prompt
    if language:
        data["language"] = language

    with open(audio_path, "rb") as f:
        files = {"file": (audio_path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1], f, "audio/wav")}
        r = httpx.post(
            f"{_base()}/v1/transcribe",
            files=files,
            data=data,
            headers=_headers(tenant_id),
            timeout=_TRANSCRIBE_TIMEOUT,
        )
    if r.status_code == 422:
        logger.error(f"[TRANSCRIBE] 422 detail: {r.text}")
    r.raise_for_status()
    return r.json()
