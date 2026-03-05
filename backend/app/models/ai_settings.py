"""Global AI settings — key/value store for model assignments per usage."""

from sqlalchemy import Column, String

from app.models.base import Base, UUIDMixin, TimestampMixin


# Known usage keys
AI_USAGES = {
    "ai_documents": "Génération de documents IA",
    "workflow_generation": "Génération de workflows",
    "convocations": "Génération de convocations",
}


class AISetting(UUIDMixin, TimestampMixin, Base):
    """Maps an AI usage to an Ollama model."""
    __tablename__ = "ai_settings"

    usage_key  = Column(String(50), nullable=False, unique=True)
    model_name = Column(String(200), nullable=False)
