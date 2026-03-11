"""Pipeline d'indexation RAG — envoie les documents au rag-api externe.

Sources indexées :
  - ai_document   : documents IA générés (PV, convocations, etc.)
  - transcription : transcriptions de réunions
  - procedure     : procédures (titre + description + réponses participants)
  - contact       : groupes de contacts
"""

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.services import external_rag

logger = logging.getLogger(__name__)


def _save_rag_mapping(tenant_id: str, source_type: str, source_id: str, rag_doc_id: str) -> None:
    """Persiste le lien source ScribIA → document RAG externe."""
    from app.models.rag_document import RagDocumentMapping

    db = SessionLocal()
    try:
        # Upsert : supprime l'ancien mapping s'il existe
        db.query(RagDocumentMapping).filter(
            RagDocumentMapping.tenant_id == tenant_id,
            RagDocumentMapping.source_type == source_type,
            RagDocumentMapping.source_id == source_id,
        ).delete()
        db.add(RagDocumentMapping(
            tenant_id=tenant_id,
            source_type=source_type,
            source_id=source_id,
            rag_document_id=rag_doc_id,
        ))
        db.commit()
    except Exception as exc:
        logger.warning("[RAG] Failed to save mapping %s/%s → %s: %s",
                       source_type, source_id, rag_doc_id, exc)
        db.rollback()
    finally:
        db.close()


def _sanitize_filename(name: str) -> str:
    """Nettoie un nom pour l'utiliser comme nom de fichier."""
    return "".join(c if c.isalnum() or c in " -_." else "_" for c in name)[:100]


# ── Indexation par type de source ────────────────────────────────────────────


def index_ai_document(tenant_id: str, doc_id: str, title: str, content: str) -> int:
    """Indexe un document IA (PV, convocation, etc.) via le RAG externe."""
    if not content or not content.strip():
        return 0

    text = f"# {title}\n\n{content}"
    filename = f"{_sanitize_filename(title)}.md"
    metadata = {
        "source_type": "ai_document",
        "source_id": doc_id,
        "title": title,
        "tenant_id": tenant_id,
    }

    try:
        result = external_rag.ingest_file(tenant_id, text, filename, metadata=metadata)
        rag_doc_id = result.get("document_id") or result.get("id")
        logger.info("[RAG] Ingested ai_document %s → doc %s", doc_id, rag_doc_id)
        if rag_doc_id:
            _save_rag_mapping(tenant_id, "ai_document", doc_id, rag_doc_id)
        return 1
    except Exception as exc:
        logger.exception("[RAG] Failed to ingest ai_document %s: %s", doc_id, exc)
        return 0


def index_transcription(tenant_id: str, job_id: str, title: str, segments: list[dict]) -> int:
    """Indexe une transcription via le RAG externe."""
    if not segments:
        return 0

    parts = [f"# Transcription : {title}\n"]
    for seg in segments:
        speaker = seg.get("speaker", "")
        text = seg.get("text", "").strip()
        if text:
            prefix = f"[{speaker}] " if speaker else ""
            parts.append(f"{prefix}{text}")

    full_text = "\n".join(parts)
    if len(full_text.strip()) < 20:
        return 0

    filename = f"{_sanitize_filename(title)}.md"
    metadata = {
        "source_type": "transcription",
        "source_id": job_id,
        "title": title,
        "tenant_id": tenant_id,
    }

    try:
        result = external_rag.ingest_file(tenant_id, full_text, filename, metadata=metadata)
        rag_doc_id = result.get("document_id") or result.get("id")
        logger.info("[RAG] Ingested transcription %s → doc %s", job_id, rag_doc_id)
        if rag_doc_id:
            _save_rag_mapping(tenant_id, "transcription", job_id, rag_doc_id)
        return 1
    except Exception as exc:
        logger.exception("[RAG] Failed to ingest transcription %s: %s", job_id, exc)
        return 0


def index_procedure(tenant_id: str, procedure_id: str, title: str,
                    description: Optional[str], participants_data: list[dict]) -> int:
    """Indexe une procédure via le RAG externe."""
    parts = [f"# Procédure : {title}"]
    if description:
        parts.append(description)

    for p in participants_data:
        name = p.get("name", "")
        role = p.get("role_name", "")
        responses = p.get("responses", {})
        questions = p.get("form_questions", [])

        if not responses:
            continue

        part = f"\n## {role} : {name}"
        for q in questions:
            qid = q.get("id", "")
            label = q.get("label", qid)
            answer = responses.get(qid, "")
            if answer:
                part += f"\n- **{label}** : {answer}"
        parts.append(part)

    full_text = "\n".join(parts)
    if len(full_text.strip()) < 10:
        return 0

    filename = f"{_sanitize_filename(title)}.md"
    metadata = {
        "source_type": "procedure",
        "source_id": procedure_id,
        "title": title,
        "tenant_id": tenant_id,
    }

    try:
        result = external_rag.ingest_file(tenant_id, full_text, filename, metadata=metadata)
        rag_doc_id = result.get("document_id") or result.get("id")
        logger.info("[RAG] Ingested procedure %s → doc %s", procedure_id, rag_doc_id)
        if rag_doc_id:
            _save_rag_mapping(tenant_id, "procedure", procedure_id, rag_doc_id)
        return 1
    except Exception as exc:
        logger.exception("[RAG] Failed to ingest procedure %s: %s", procedure_id, exc)
        return 0


def index_contact_group(tenant_id: str, group_id: str, group_name: str,
                        description: Optional[str], contacts: list[dict]) -> int:
    """Indexe un groupe de contacts via le RAG externe."""
    parts = [f"# Groupe de contacts : {group_name}"]
    if description:
        parts.append(description)

    for c in contacts:
        line = f"- {c.get('name', '')}"
        if c.get("role"):
            line += f" ({c['role']})"
        if c.get("email"):
            line += f" — {c['email']}"
        if c.get("phone"):
            line += f" — {c['phone']}"
        custom = c.get("custom_fields", {})
        if custom:
            extras = [f"{k}: {v}" for k, v in custom.items() if v]
            if extras:
                line += f" — {', '.join(extras)}"
        parts.append(line)

    full_text = "\n".join(parts)
    if len(full_text.strip()) < 10:
        return 0

    filename = f"{_sanitize_filename(group_name)}.md"
    metadata = {
        "source_type": "contact",
        "source_id": group_id,
        "title": group_name,
        "tenant_id": tenant_id,
    }

    try:
        result = external_rag.ingest_file(tenant_id, full_text, filename, metadata=metadata)
        rag_doc_id = result.get("document_id") or result.get("id")
        logger.info("[RAG] Ingested contact group %s → doc %s", group_id, rag_doc_id)
        if rag_doc_id:
            _save_rag_mapping(tenant_id, "contact", group_id, rag_doc_id)
        return 1
    except Exception as exc:
        logger.exception("[RAG] Failed to ingest contact group %s: %s", group_id, exc)
        return 0


def delete_source(tenant_id: str, source_type: str, source_id: str) -> None:
    """Supprime un document source du RAG externe via DELETE /v1/documents/{doc_id}."""
    from app.models.rag_document import RagDocumentMapping

    db = SessionLocal()
    try:
        mapping = db.query(RagDocumentMapping).filter(
            RagDocumentMapping.tenant_id == tenant_id,
            RagDocumentMapping.source_type == source_type,
            RagDocumentMapping.source_id == source_id,
        ).first()

        if not mapping:
            logger.warning("[RAG] No mapping found for %s/%s — cannot delete from RAG",
                           source_type, source_id)
            return

        try:
            external_rag.delete_document(tenant_id, mapping.rag_document_id)
            logger.info("[RAG] Deleted %s/%s (rag_doc=%s)", source_type, source_id,
                        mapping.rag_document_id)
        except Exception as exc:
            logger.exception("[RAG] Failed to delete %s/%s from RAG: %s",
                             source_type, source_id, exc)

        # Remove mapping regardless (even if RAG delete failed — doc may already be gone)
        db.delete(mapping)
        db.commit()
    except Exception as exc:
        logger.exception("[RAG] delete_source error for %s/%s: %s",
                         source_type, source_id, exc)
        db.rollback()
    finally:
        db.close()


# ── Réindexation complète d'un tenant ────────────────────────────────────────


def reindex_tenant(tenant_id: str, db: Session) -> dict:
    """Réindexe toutes les données d'un tenant via le RAG externe."""
    from app.models import AIDocument, Procedure, ProcedureParticipant

    stats = {"ai_documents": 0, "transcriptions": 0, "procedures": 0, "contacts": 0, "chunks_total": 0}

    # 1. Documents IA
    docs = db.query(AIDocument).filter(
        AIDocument.tenant_id == tenant_id,
        AIDocument.status == "completed",
    ).all()
    logger.warning("[RAG] Found %d completed AI documents for tenant %s", len(docs), tenant_id)
    for doc in docs:
        if doc.result_text:
            n = index_ai_document(tenant_id, doc.id, doc.title, doc.result_text)
            stats["ai_documents"] += n
            stats["chunks_total"] += n

    # 2. Transcriptions
    from app.models.transcription import TranscriptionJob, TranscriptionSegment
    jobs = db.query(TranscriptionJob).filter(
        TranscriptionJob.tenant_id == tenant_id,
        TranscriptionJob.status == "completed",
    ).all()
    logger.warning("[RAG] Found %d completed transcriptions for tenant %s", len(jobs), tenant_id)
    for job in jobs:
        segs = (
            db.query(TranscriptionSegment)
            .filter_by(job_id=job.id)
            .order_by(TranscriptionSegment.order_index)
            .all()
        )
        title = job.title or job.original_filename or "Transcription"
        if segs:
            segments = [{"speaker": s.speaker_label or "", "text": s.text} for s in segs]
            n = index_transcription(tenant_id, job.id, title, segments)
            stats["transcriptions"] += n
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
        stats["procedures"] += n
        stats["chunks_total"] += n

    # 4. Contacts
    from app.models.contacts import ContactGroup
    groups = db.query(ContactGroup).filter(
        ContactGroup.tenant_id == tenant_id,
    ).all()
    for group in groups:
        contacts_list = group.contacts
        if contacts_list:
            c_data = []
            for c in contacts_list:
                custom = {}
                if c.custom_fields:
                    try:
                        custom = json.loads(c.custom_fields)
                    except (json.JSONDecodeError, TypeError):
                        pass
                c_data.append({
                    "name": c.name,
                    "email": c.email or "",
                    "phone": c.phone or "",
                    "role": c.role or "",
                    "custom_fields": custom,
                })
            n = index_contact_group(tenant_id, group.id, group.name, group.description, c_data)
            stats["contacts"] += n
            stats["chunks_total"] += n

    logger.warning("[RAG] Reindexed tenant %s: %s", tenant_id, stats)
    return stats
