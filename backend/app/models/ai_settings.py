"""Global AI settings — key/value store for model assignments per usage."""

from sqlalchemy import Boolean, Column, String, Text

from app.models.base import Base, UUIDMixin, TimestampMixin


# Known usage keys
AI_USAGES = {
    "ai_documents": "Génération de documents IA",
    "workflow_generation": "Génération de workflows",
    "convocations": "Génération de convocations",
    "sector_suggestions": "Suggestions sectorielles",
    "consent_detection": "Détection du consentement oral",
}


class AISetting(UUIDMixin, TimestampMixin, Base):
    """Maps an AI usage to an Ollama model."""
    __tablename__ = "ai_settings"

    usage_key  = Column(String(50), nullable=False, unique=True)
    model_name = Column(String(200), nullable=False)


# Pre-defined OVH Cloud models
OVH_MODELS = [
    {"id": "Meta-Llama-3_3-70B-Instruct", "label": "Llama 3.3 70B Instruct"},
    {"id": "Mistral-Nemo-Instruct-2407", "label": "Mistral Nemo 12B"},
    {"id": "Mistral-7B-Instruct-v0.3", "label": "Mistral 7B Instruct"},
    {"id": "DeepSeek-R1-Distill-Llama-70B", "label": "DeepSeek R1 70B"},
]

OVH_DEFAULT_ENDPOINT = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"


class CloudProvider(UUIDMixin, TimestampMixin, Base):
    """Cloud LLM provider configuration (e.g. OVH AI Endpoints)."""
    __tablename__ = "cloud_providers"

    provider_name = Column(String(50), nullable=False, unique=True)  # "ovh"
    enabled       = Column(Boolean, default=False, nullable=False)
    api_key       = Column(Text, default="", nullable=False)
    endpoint      = Column(String(500), default=OVH_DEFAULT_ENDPOINT, nullable=False)
    model_name    = Column(String(200), default="Meta-Llama-3_3-70B-Instruct", nullable=False)
