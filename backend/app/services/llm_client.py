"""Client LLM centralisé — appels via LiteLLM Proxy (API OpenAI-compatible)
ou via le RAG externe (POST /v1/generate) selon settings.use_external_llm.

Les modèles cloud (préfixe "cloud/") sont routés directement vers le provider cloud.
"""

import json
import logging
from typing import Generator

import httpx
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_client: OpenAI | None = None
_cloud_client: OpenAI | None = None
_cloud_endpoint: str = ""
_cloud_api_key: str = ""


def get_client() -> OpenAI:
    """Retourne un client OpenAI singleton pointant vers LiteLLM Proxy."""
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.litellm_url,
            api_key=settings.litellm_api_key,
            timeout=600.0,
        )
    return _client


def _get_cloud_provider():
    """Load cloud provider config from DB (cached per endpoint/key)."""
    from app.database import SessionLocal
    from app.models.ai_settings import CloudProvider

    db = SessionLocal()
    try:
        return db.query(CloudProvider).filter_by(provider_name="ovh", enabled=True).first()
    finally:
        db.close()


def get_cloud_client() -> OpenAI | None:
    """Retourne un client OpenAI pointant vers le provider cloud (OVH), ou None."""
    global _cloud_client, _cloud_endpoint, _cloud_api_key

    provider = _get_cloud_provider()
    if not provider or not provider.api_key:
        return None

    # Recreate client if config changed
    if (provider.endpoint != _cloud_endpoint or provider.api_key != _cloud_api_key):
        _cloud_endpoint = provider.endpoint
        _cloud_api_key = provider.api_key
        _cloud_client = OpenAI(
            base_url=provider.endpoint,
            api_key=provider.api_key,
            timeout=600.0,
        )

    return _cloud_client


def _is_cloud_model(model: str) -> bool:
    return model.startswith("cloud/")


def _resolve_client_and_model(model: str) -> tuple[OpenAI, str]:
    """Retourne le bon client et le nom de modèle nettoyé selon le préfixe."""
    if _is_cloud_model(model):
        cloud = get_cloud_client()
        if not cloud:
            raise RuntimeError("Provider cloud non configuré ou désactivé")
        return cloud, model[6:]  # strip "cloud/" prefix
    return get_client(), model


def _rag_generate(
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Appelle POST /v1/chat du RAG externe (mode non-stream, sans contexte RAG)."""
    url = f"{settings.rag_api_url}/v1/chat"
    headers = {
        "Authorization": f"Bearer {settings.rag_api_key}",
        "Content-Type": "application/json",
    }
    # Combine system + user prompts en un seul message
    message = f"{system_prompt}\n\n{user_prompt}".strip() if system_prompt else user_prompt
    payload = {
        "message": message,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
        "score_threshold": 0.99,  # Ignore le contexte RAG — génération LLM pure
    }
    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=600.0)
        resp.raise_for_status()
        return resp.json()["answer"]
    except Exception as exc:
        raise RuntimeError(f"Erreur RAG LLM : {exc}") from exc


def _rag_generate_stream(
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> Generator[str, None, None]:
    """Appelle POST /v1/chat du RAG externe en streaming (SSE, sans contexte RAG)."""
    url = f"{settings.rag_api_url}/v1/chat"
    headers = {
        "Authorization": f"Bearer {settings.rag_api_key}",
        "Content-Type": "application/json",
    }
    message = f"{system_prompt}\n\n{user_prompt}".strip() if system_prompt else user_prompt
    payload = {
        "message": message,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        "score_threshold": 0.99,  # Ignore le contexte RAG — génération LLM pure
    }
    try:
        with httpx.stream("POST", url, json=payload, headers=headers, timeout=600.0) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    chunk = line[6:]
                    if not chunk or chunk == "[DONE]":
                        continue
                    try:
                        data = json.loads(chunk)
                        content = data["choices"][0]["delta"].get("content")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
    except Exception as exc:
        raise RuntimeError(f"Erreur RAG LLM stream : {exc}") from exc


def llm_generate_stream(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    extra_params: dict | None = None,
) -> Generator[str, None, None]:
    """Appelle le LLM en streaming et yield les chunks de texte.

    Args:
        model: Nom du modèle (logique LiteLLM, ollama/xxx, ou cloud/xxx).
        system_prompt: Prompt système.
        user_prompt: Prompt utilisateur.
        temperature: Température de génération.
        max_tokens: Nombre max de tokens à générer.
        extra_params: Paramètres supplémentaires (repeat_penalty, etc.).
    """
    if settings.use_external_llm and not _is_cloud_model(model):
        yield from _rag_generate_stream(system_prompt, user_prompt, temperature, max_tokens)
        return

    is_cloud = _is_cloud_model(model)
    client, resolved_model = _resolve_client_and_model(model)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    kwargs: dict = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    # Ollama-specific params (keep_alive, repeat_penalty, etc.) are not supported by cloud APIs
    if extra_params and not is_cloud:
        kwargs["extra_body"] = extra_params

    try:
        stream = client.chat.completions.create(**kwargs)
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as exc:
        raise RuntimeError(f"Erreur LLM : {exc}") from exc


def llm_generate(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    response_format: dict | None = None,
    extra_params: dict | None = None,
) -> str:
    """Appelle le LLM en mode non-streaming et retourne la réponse complète.

    Args:
        model: Nom du modèle.
        system_prompt: Prompt système (optionnel).
        user_prompt: Prompt utilisateur.
        temperature: Température de génération.
        max_tokens: Nombre max de tokens.
        response_format: Format de réponse (ex: {"type": "json_object"}).
        extra_params: Paramètres supplémentaires.
    """
    if settings.use_external_llm and not _is_cloud_model(model):
        return _rag_generate(system_prompt, user_prompt, temperature, max_tokens)

    is_cloud = _is_cloud_model(model)
    client, resolved_model = _resolve_client_and_model(model)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    kwargs: dict = {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format
    # Ollama-specific params are not supported by cloud APIs
    if extra_params and not is_cloud:
        kwargs["extra_body"] = extra_params

    try:
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""
    except Exception as exc:
        raise RuntimeError(f"Erreur LLM : {exc}") from exc


def resolve_model(model_name: str) -> str:
    """Convertit un nom de modèle brut en nom compatible LiteLLM ou cloud/.

    - "cloud/Meta-Llama-3_3-70B-Instruct" → retourné tel quel (routé vers OVH)
    - "default", "long-context" → retourné tel quel (nom logique LiteLLM)
    - "ollama/xxx" → retourné tel quel
    - "llama3.1:8b" → préfixé "ollama/" pour LiteLLM
    """
    if not model_name:
        return settings.litellm_default_model
    # Cloud models: passthrough (handled by _resolve_client_and_model)
    if model_name.startswith("cloud/"):
        return model_name
    # Déjà un nom logique LiteLLM (pas de ':' ni de '/')
    if "/" not in model_name and ":" not in model_name:
        return model_name
    # Déjà préfixé ollama/
    if model_name.startswith("ollama/"):
        return model_name
    # Nom Ollama brut (ex: "llama3.1:8b") → préfixer
    return f"ollama/{model_name}"


def llm_health_check() -> bool:
    """Vérifie que le service LLM est accessible (RAG externe ou LiteLLM selon config)."""
    try:
        if settings.use_external_llm:
            # En mode externe, le LLM passe par le RAG — vérifier cet endpoint
            from app.services.external_rag import health_check as rag_health
            return rag_health()
        # Mode local : vérifier LiteLLM Proxy
        base = settings.litellm_url.rstrip("/").removesuffix("/v1")
        r = httpx.get(f"{base}/health", timeout=5.0)
        return r.status_code < 500
    except Exception:
        return False
