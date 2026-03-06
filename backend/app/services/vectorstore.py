"""Service ChromaDB — une collection par tenant pour l'isolation des données."""

import logging
from typing import Optional

import chromadb

from app.config import settings

logger = logging.getLogger(__name__)

_client: Optional[chromadb.HttpClient] = None


def _get_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_url.replace("http://", "").split(":")[0],
                                      port=int(settings.chroma_url.split(":")[-1]))
        logger.info("[RAG] ChromaDB client connected to %s", settings.chroma_url)
    return _client


def _collection_name(tenant_id: str) -> str:
    """Nom de collection ChromaDB pour un tenant (doit respecter [a-zA-Z0-9_-])."""
    return f"tenant_{tenant_id.replace('-', '_')}"


def get_collection(tenant_id: str) -> chromadb.Collection:
    """Récupère ou crée la collection pour un tenant."""
    client = _get_client()
    return client.get_or_create_collection(
        name=_collection_name(tenant_id),
        metadata={"hnsw:space": "cosine"},
    )


def add_documents(
    tenant_id: str,
    doc_ids: list[str],
    embeddings: list[list[float]],
    texts: list[str],
    metadatas: list[dict],
) -> None:
    """Ajoute des chunks à la collection du tenant."""
    collection = get_collection(tenant_id)
    collection.upsert(
        ids=doc_ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )
    logger.info("[RAG] Indexed %d chunks for tenant %s", len(doc_ids), tenant_id)


def search(
    tenant_id: str,
    query_embedding: list[float],
    top_k: int | None = None,
    where: dict | None = None,
    where_document: dict | None = None,
) -> dict:
    """Recherche sémantique dans la collection du tenant."""
    collection = get_collection(tenant_id)
    kwargs: dict = {
        "query_embeddings": [query_embedding],
        "n_results": top_k or settings.rag_top_k,
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where
    if where_document:
        kwargs["where_document"] = where_document
    return collection.query(**kwargs)


def delete_by_source(tenant_id: str, source_type: str, source_id: str) -> None:
    """Supprime tous les chunks d'un document source."""
    collection = get_collection(tenant_id)
    collection.delete(where={"source_id": source_id, "source_type": source_type})
    logger.info("[RAG] Deleted chunks for %s/%s (tenant %s)", source_type, source_id, tenant_id)
