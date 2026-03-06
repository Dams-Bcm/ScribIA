"""Service RAG — Retrieval-Augmented Generation.

Orchestre : question → embedding → recherche hybride (sémantique + mots-clés) → contexte → LLM → réponse.
"""

import logging
import re
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

# Mots vides à ignorer pour la recherche par mots-clés
_STOP_WORDS = {
    "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on",
    "le", "la", "les", "un", "une", "des", "du", "de", "d",
    "ce", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes",
    "son", "sa", "ses", "notre", "votre", "leur", "leurs",
    "et", "ou", "mais", "donc", "car", "ni", "que", "qui", "quoi",
    "dans", "sur", "sous", "avec", "sans", "pour", "par", "en", "à", "au", "aux",
    "est", "sont", "a", "ont", "fait", "être", "avoir", "faire",
    "ne", "pas", "plus", "moins", "très", "bien", "mal",
    "quel", "quelle", "quels", "quelles", "comment", "où", "quand", "pourquoi",
    "recherche", "cherche", "trouve", "trouver", "discussion", "conversation",
    "parle", "parler", "concerne", "concernant", "propos", "sujet",
}


def _extract_keywords(question: str) -> list[str]:
    """Extrait les mots-clés significatifs de la question."""
    words = re.findall(r"[a-zA-ZÀ-ÿ]+", question.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) >= 3]


def ask(tenant_id: str, question: str, source_filter: str | None = None) -> dict:
    """Pose une question et obtient une réponse basée sur les documents du tenant."""
    # 1. Embedding de la question
    query_embedding = embed_query(question)

    # 2. Recherche hybride : sémantique + mots-clés
    where = {"source_type": source_filter} if source_filter else None

    # 2a. Recherche par mots-clés (via ChromaDB where_document)
    # ChromaDB $contains is case-sensitive, so try multiple case variants
    keywords = _extract_keywords(question)
    keyword_results = []
    for kw in keywords:
        variants = list({kw, kw.lower(), kw.capitalize(), kw.upper()})
        for variant in variants:
            try:
                kw_res = vectorstore.search(
                    tenant_id, query_embedding,
                    where=where,
                    where_document={"$contains": variant},
                    top_k=5,
                )
                kw_docs = kw_res.get("documents", [[]])[0]
                kw_metas = kw_res.get("metadatas", [[]])[0]
                kw_dists = kw_res.get("distances", [[]])[0]
                for doc, meta, dist in zip(kw_docs, kw_metas, kw_dists):
                    keyword_results.append((doc, meta, dist, kw))
            except Exception:
                pass

    # 2b. Recherche sémantique pure
    semantic_results = vectorstore.search(tenant_id, query_embedding, where=where)
    sem_docs = semantic_results.get("documents", [[]])[0]
    sem_metas = semantic_results.get("metadatas", [[]])[0]
    sem_dists = semantic_results.get("distances", [[]])[0]

    # 3. Fusionner et dédupliquer (priorité aux résultats mots-clés)
    seen_chunks = set()
    merged = []

    # D'abord les résultats par mots-clés (boost de pertinence)
    for doc, meta, dist, kw in keyword_results:
        chunk_key = doc[:100]
        if chunk_key not in seen_chunks:
            seen_chunks.add(chunk_key)
            # Bonus pour les résultats mots-clés : réduire la distance
            merged.append((doc, meta, dist * 0.7))

    # Puis les résultats sémantiques
    for doc, meta, dist in zip(sem_docs, sem_metas, sem_dists):
        chunk_key = doc[:100]
        if chunk_key not in seen_chunks:
            seen_chunks.add(chunk_key)
            merged.append((doc, meta, dist))

    # Trier par distance et limiter
    merged.sort(key=lambda x: x[2])
    merged = merged[:settings.rag_top_k]

    documents = [m[0] for m in merged]
    metadatas = [m[1] for m in merged]
    distances = [m[2] for m in merged]

    logger.warning("[RAG] Query: %s | Keywords: %s", question[:100], keywords)
    logger.warning("[RAG] Keyword results: %d, Semantic results: %d, Merged: %d",
                   len(keyword_results), len(sem_docs), len(merged))
    for i, (doc, meta, dist) in enumerate(zip(documents, metadatas, distances)):
        logger.warning("[RAG] #%d dist=%.4f title=%s chunk=%s...", i, dist, meta.get("title"), doc[:80])

    if not documents:
        return {
            "answer": "Je n'ai trouvé aucun document pertinent pour répondre à cette question.",
            "sources": [],
            "chunks_used": 0,
        }

    # 4. Assembler le contexte
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
                "relevance": round(max(0, 1 - dist), 3),
            })

    context = "\n".join(context_parts)

    # 5. Appel LLM via Ollama
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
