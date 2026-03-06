"""Pipeline d'indexation RAG — découpe les documents en chunks et les indexe.

Sources indexées :
  - ai_document   : documents IA générés (PV, convocations, etc.)
  - transcription : transcriptions de réunions
  - procedure     : procédures (titre + description + réponses participants)
"""

import json
import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.services.embeddings import embed_texts
from app.services import vectorstore

logger = logging.getLogger(__name__)


# ── Chunking ────────────────────────────────────────────────────────────────


def _chunk_text(text: str, chunk_size: int = 0, overlap: int = 0) -> list[str]:
    """Découpe un texte en chunks avec overlap."""
    chunk_size = chunk_size or settings.rag_chunk_size
    overlap = overlap or settings.rag_chunk_overlap

    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks


# ── Indexation par type de source ────────────────────────────────────────────


def index_ai_document(tenant_id: str, doc_id: str, title: str, content: str) -> int:
    """Indexe un document IA (PV, convocation, etc.)."""
    if not content or not content.strip():
        return 0

    chunks = _chunk_text(content)
    doc_ids = [f"aidoc_{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"source_type": "ai_document", "source_id": doc_id, "title": title, "chunk_index": i}
        for i in range(len(chunks))
    ]

    embeddings = embed_texts(chunks)
    vectorstore.add_documents(tenant_id, doc_ids, embeddings, chunks, metadatas)
    return len(chunks)


def index_transcription(tenant_id: str, job_id: str, title: str, segments: list[dict]) -> int:
    """Indexe une transcription (segments regroupés en chunks)."""
    if not segments:
        return 0

    # Regroupe les segments en texte continu avec indicateur de locuteur
    full_text_parts = []
    for seg in segments:
        speaker = seg.get("speaker", "")
        text = seg.get("text", "").strip()
        if text:
            prefix = f"[{speaker}] " if speaker else ""
            full_text_parts.append(f"{prefix}{text}")

    full_text = "\n".join(full_text_parts)
    if not full_text.strip():
        return 0

    chunks = _chunk_text(full_text)
    doc_ids = [f"trans_{job_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"source_type": "transcription", "source_id": job_id, "title": title, "chunk_index": i}
        for i in range(len(chunks))
    ]

    embeddings = embed_texts(chunks)
    vectorstore.add_documents(tenant_id, doc_ids, embeddings, chunks, metadatas)
    return len(chunks)


def index_procedure(tenant_id: str, procedure_id: str, title: str,
                    description: Optional[str], participants_data: list[dict]) -> int:
    """Indexe une procédure (titre + description + réponses des participants)."""
    parts = [f"Procédure : {title}"]
    if description:
        parts.append(description)

    for p in participants_data:
        name = p.get("name", "")
        role = p.get("role_name", "")
        responses = p.get("responses", {})
        questions = p.get("form_questions", [])

        if not responses:
            continue

        part = f"\n--- {role} : {name} ---"
        for q in questions:
            qid = q.get("id", "")
            label = q.get("label", qid)
            answer = responses.get(qid, "")
            if answer:
                part += f"\n{label} : {answer}"
        parts.append(part)

    full_text = "\n".join(parts)
    if len(full_text.strip()) < 10:
        return 0

    chunks = _chunk_text(full_text)
    doc_ids = [f"proc_{procedure_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"source_type": "procedure", "source_id": procedure_id, "title": title, "chunk_index": i}
        for i in range(len(chunks))
    ]

    embeddings = embed_texts(chunks)
    vectorstore.add_documents(tenant_id, doc_ids, embeddings, chunks, metadatas)
    return len(chunks)


def delete_source(tenant_id: str, source_type: str, source_id: str) -> None:
    """Supprime un document source de l'index."""
    vectorstore.delete_by_source(tenant_id, source_type, source_id)


# ── Réindexation complète d'un tenant ────────────────────────────────────────


def reindex_tenant(tenant_id: str, db: Session) -> dict:
    """Réindexe toutes les données d'un tenant. Retourne un récapitulatif."""
    from app.models import AIDocument, Procedure, ProcedureParticipant

    stats = {"ai_documents": 0, "transcriptions": 0, "procedures": 0, "chunks_total": 0}

    # 1. Documents IA
    docs = db.query(AIDocument).filter(
        AIDocument.tenant_id == tenant_id,
        AIDocument.status == "completed",
    ).all()
    for doc in docs:
        if doc.result_text:
            n = index_ai_document(tenant_id, doc.id, doc.title, doc.result_text)
            stats["ai_documents"] += 1
            stats["chunks_total"] += n

    # 2. Transcriptions
    from app.models import TranscriptionJob
    jobs = db.query(TranscriptionJob).filter(
        TranscriptionJob.tenant_id == tenant_id,
        TranscriptionJob.status == "completed",
    ).all()
    for job in jobs:
        if job.result_text:
            try:
                segments = json.loads(job.result_text) if isinstance(job.result_text, str) else []
            except (json.JSONDecodeError, TypeError):
                segments = [{"text": job.result_text}]
            n = index_transcription(tenant_id, job.id, job.original_filename or "Transcription", segments)
            stats["transcriptions"] += 1
            stats["chunks_total"] += n

    # 3. Procédures terminées
    procs = db.query(Procedure).filter(
        Procedure.tenant_id == tenant_id,
        Procedure.status == "done",
    ).all()
    for proc in procs:
        participants = db.query(ProcedureParticipant).filter(
            ProcedureParticipant.procedure_id == proc.id,
            ProcedureParticipant.responded_at.isnot(None),
        ).all()
        p_data = []
        for p in participants:
            p_data.append({
                "name": p.name,
                "role_name": p.role_name,
                "responses": json.loads(p.responses) if p.responses else {},
                "form_questions": json.loads(p.form_questions) if p.form_questions else [],
            })
        n = index_procedure(tenant_id, proc.id, proc.title, proc.description, p_data)
        stats["procedures"] += 1
        stats["chunks_total"] += n

    logger.info("[RAG] Reindexed tenant %s: %s", tenant_id, stats)
    return stats
