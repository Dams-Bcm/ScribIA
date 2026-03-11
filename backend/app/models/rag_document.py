"""Mapping between ScribIA source objects and external RAG document IDs."""

from sqlalchemy import Column, DateTime, String

from app.models.base import Base, TimestampMixin, _new_uuid, _utcnow


class RagDocumentMapping(TimestampMixin, Base):
    """Tracks which RAG document_id corresponds to a ScribIA source.

    Allows delete_source() to call DELETE /v1/documents/{rag_doc_id}.
    One row per (tenant_id, source_type, source_id) combination.
    """

    __tablename__ = "rag_document_mappings"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    tenant_id = Column(String(36), nullable=False, index=True)
    source_type = Column(String(50), nullable=False)   # ai_document, transcription, procedure, contact
    source_id = Column(String(36), nullable=False)
    rag_document_id = Column(String(100), nullable=False)  # ID retourné par /v1/ingest
