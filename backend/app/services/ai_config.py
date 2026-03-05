"""Helper to resolve the Ollama model for a given AI usage."""

from app.config import settings


def get_model_for_usage(usage_key: str) -> str:
    """Returns the model assigned to a usage, or the default model."""
    from app.database import SessionLocal
    from app.models.ai_settings import AISetting

    db = SessionLocal()
    try:
        setting = db.query(AISetting).filter_by(usage_key=usage_key).first()
        if setting:
            return setting.model_name
    finally:
        db.close()
    return settings.ollama_default_model
