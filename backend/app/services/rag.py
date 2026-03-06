"""Service RAG — Retrieval-Augmented Generation.

Orchestre : question → embedding → recherche vectorielle → contexte → LLM → réponse.
"""

import logging
import requests

from app.config import settings
from app.services.embeddings import embed_query
from app.services import vectorstore

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Tu es un assistant intelligent spécialisé dans l'analyse de documents professionnels.
Tu réponds aux questions de l'utilisateur en te basant UNIQUEMENT sur les extraits de documents fournis ci-dessous.

Règles :
- Réponds en français, de façon claire et concise.
- Cite les sources (titre du document) quand c'est pertinent.
- Si l'information n'est pas dans les extraits, dis-le honnêtement : "Je n'ai pas trouvé cette information dans les documents disponibles."
- Ne fabrique jamais d'information. Base-toi uniquement sur les extraits fournis.
- Si la question est ambiguë, demande des précisions.
"""


def ask(tenant_id: str, question: str, source_filter: str | None = None) -> dict:
    """Pose une question et obtient une réponse basée sur les documents du tenant.

    Args:
        tenant_id: ID du tenant pour l'isolation des données.
        question: Question en langage naturel.
        source_filter: Filtrer par type de source ("ai_document", "transcription", "procedure").

    Returns:
        {"answer": str, "sources": list[dict], "chunks_used": int}
    """
    # 1. Embedding de la question
    query_embedding = embed_query(question)

    # 2. Recherche vectorielle
    where = {"source_type": source_filter} if source_filter else None
    results = vectorstore.search(tenant_id, query_embedding, where=where)

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    logger.warning("[RAG] Query: %s", question[:100])
    logger.warning("[RAG] Results count: %d", len(documents))
    for i, (doc, meta, dist) in enumerate(zip(documents, metadatas, distances)):
        logger.warning("[RAG] #%d dist=%.4f title=%s chunk=%s...", i, dist, meta.get("title"), doc[:80])

    if not documents:
        return {
            "answer": "Je n'ai trouvé aucun document pertinent pour répondre à cette question.",
            "sources": [],
            "chunks_used": 0,
        }

    # 3. Assembler le contexte
    context_parts = []
    sources_seen = set()
    sources = []

    for i, (doc, meta, dist) in enumerate(zip(documents, metadatas, distances)):
        title = meta.get("title", "Document sans titre")
        source_type = meta.get("source_type", "unknown")
        source_id = meta.get("source_id", "")

        context_parts.append(f"[Extrait {i+1} — {title}]\n{doc}\n")

        source_key = f"{source_type}:{source_id}"
        if source_key not in sources_seen:
            sources_seen.add(source_key)
            sources.append({
                "type": source_type,
                "id": source_id,
                "title": title,
                "relevance": round(1 - dist, 3),  # cosine distance → similarity
            })

    context = "\n".join(context_parts)

    # 4. Appel LLM via Ollama
    prompt = f"""Voici les extraits de documents disponibles :

{context}

Question de l'utilisateur : {question}

Réponds en te basant uniquement sur ces extraits."""

    try:
        resp = requests.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.ollama_default_model,
                "system": _SYSTEM_PROMPT,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 1024},
            },
            timeout=120,
        )
        resp.raise_for_status()
        answer = resp.json().get("response", "").strip()
    except Exception as exc:
        logger.exception("[RAG] LLM call failed: %s", exc)
        answer = "Désolé, une erreur est survenue lors de la génération de la réponse."

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(documents),
    }
