"""Service d'embeddings via Ollama (nomic-embed-text)."""

import logging
import requests

from app.config import settings

logger = logging.getLogger(__name__)


def embed_texts(texts: list[str], prefix: str = "search_document: ") -> list[list[float]]:
    """Génère les embeddings pour une liste de textes via Ollama.

    nomic-embed-text requires prefixes:
      - "search_document: " for documents being indexed
      - "search_query: " for search queries
    """
    if not texts:
        return []

    prefixed = [f"{prefix}{t}" for t in texts]
    resp = requests.post(
        f"{settings.ollama_url}/api/embed",
        json={"model": settings.embedding_model, "input": prefixed},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def embed_query(text: str) -> list[float]:
    """Génère l'embedding d'une requête de recherche."""
    return embed_texts([text], prefix="search_query: ")[0]
