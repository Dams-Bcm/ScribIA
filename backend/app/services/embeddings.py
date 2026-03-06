"""Service d'embeddings via Ollama (nomic-embed-text)."""

import logging
import requests

from app.config import settings

logger = logging.getLogger(__name__)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Génère les embeddings pour une liste de textes via Ollama."""
    if not texts:
        return []

    resp = requests.post(
        f"{settings.ollama_url}/api/embed",
        json={"model": settings.embedding_model, "input": texts},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"]


def embed_query(text: str) -> list[float]:
    """Génère l'embedding d'une seule requête."""
    return embed_texts([text])[0]
