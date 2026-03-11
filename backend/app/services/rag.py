"""Service RAG — délègue au rag-api externe.

Orchestre : question → rag-api /v1/chat → réponse + citations.
"""

import logging

from app.config import settings
from app.services import external_rag

logger = logging.getLogger(__name__)


def ask(tenant_id: str, question: str, source_filter: str | None = None) -> dict:
    """Pose une question et obtient une réponse via le RAG externe.

    Le format de retour reste identique à l'ancien RAG interne pour
    compatibilité avec le router et le frontend :
        {answer: str, sources: list[{type, id, title, relevance}], chunks_used: int}
    """
    # Enrichir la question avec le filtre source si présent
    message = question
    if source_filter:
        filter_labels = {
            "ai_document": "documents IA générés",
            "transcription": "transcriptions de réunions",
            "procedure": "procédures",
            "contact": "contacts",
        }
        label = filter_labels.get(source_filter, source_filter)
        message = f"[Recherche limitée aux {label}] {question}"

    try:
        result = external_rag.chat(
            tenant_id=tenant_id,
            message=message,
            top_k=settings.rag_top_k,
            score_threshold=settings.rag_score_threshold,
            max_tokens=2048,
            temperature=0.1,
        )
    except Exception as exc:
        logger.exception("[RAG] External RAG call failed: %s", exc)
        return {
            "answer": "Désolé, une erreur est survenue lors de la recherche.",
            "sources": [],
            "chunks_used": 0,
        }

    # Mapper les citations du RAG externe vers le format attendu
    citations = result.get("citations") or []
    sources_seen: set[str] = set()
    sources = []

    for cit in citations:
        doc_id = cit.get("doc_id", "")
        if doc_id in sources_seen:
            continue
        sources_seen.add(doc_id)

        meta = cit.get("metadata") or {}
        sources.append({
            "type": meta.get("source_type", "unknown"),
            "id": meta.get("source_id", doc_id),
            "title": meta.get("title", cit.get("excerpt", "")[:80]),
            "relevance": round(cit.get("score", 0), 3),
        })

    answer = result.get("answer", "").strip()
    if not answer:
        answer = "Je n'ai trouvé aucun document pertinent pour répondre à cette question."

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(citations),
    }
