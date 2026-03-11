from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    db_driver: str = "ODBC Driver 17 for SQL Server"
    db_host: str = "db"
    db_port: int = 1433
    db_name: str = "scribia"
    db_user: str = "sa"
    db_password: str = "ScribIA_Dev_2026!"

    @property
    def database_url(self) -> str:
        return self.database_url_for(self.db_name)

    def database_url_for(self, db_name: str) -> str:
        """Build a connection string for a given database name."""
        return (
            f"mssql+pyodbc://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{db_name}"
            f"?driver={self.db_driver.replace(' ', '+')}"
            "&TrustServerCertificate=yes"
        )

    # ── JWT ────────────────────────────────────────────────────────────────────
    jwt_secret: str = "CHANGE-ME-IN-PRODUCTION"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    # ── Transcription ──────────────────────────────────────────────────────────
    whisper_model: str = "large-v3"
    device: str = "cuda"
    compute_type: str = "float16"
    audio_path: str = "/data/audio"
    max_audio_size_mb: int = 500
    whisper_language: str = "fr"
    whisper_beam_size: int = 5
    whisper_no_speech_threshold: float = 0.45
    whisper_temperature: str = "0.0,0.2,0.4,0.6,0.8,1.0"
    whisper_initial_prompt: str = ""
    whisper_condition_on_previous_text: bool = True
    whisper_vad_min_silence_ms: int = 500
    whisper_vad_speech_pad_ms: int = 200

    # ── Diarisation ────────────────────────────────────────────────────────────
    hf_token: str = ""
    min_speakers: int = 0
    max_speakers: int = 0
    clustering_threshold: float = 0.70
    speaker_matching_threshold: float = 0.65  # cosine similarity threshold for auto-match

    # ── Preparatory Phases ──────────────────────────────────────────────────
    prep_docs_path: str = "/data/prep_docs"
    max_doc_size_mb: int = 50

    # ── LiteLLM Proxy ────────────────────────────────────────────────────────────
    litellm_url: str = "http://localhost:4000/v1"
    litellm_api_key: str = "sk-scribia-litellm"
    litellm_default_model: str = "default"  # nom logique déclaré dans litellm_config.yaml

    # ── AI Documents / Ollama ───────────────────────────────────────────────────
    ollama_url: str = "http://localhost:11434"  # accès direct pour gestion des modèles (pull/delete/list)
    ollama_default_model: str = "llama3.1:8b"  # conservé pour la gestion des modèles
    ollama_long_context_model: str = ""  # modèle pour longs contextes (>20k chars), ex: qwen2.5:32b
    ollama_long_context_threshold: int = 20000  # seuil en chars pour basculer sur le modèle long contexte
    ollama_map_reduce: bool = True  # résumé en 2 passes pour les longs contextes
    ollama_map_reduce_chunk_size: int = 4000  # taille des chunks en chars pour la passe 1
    ai_docs_path: str = "/data/ai_docs"

    # ── RAG externe ──────────────────────────────────────────────────────────────
    rag_api_url: str = "http://192.168.9.16:8000"   # URL du rag-api externe
    rag_api_key: str = ""                            # API key rak_... pour auth service-to-service
    rag_project_id: str = "default"                  # project_id fixe (Option A : 1 projet par tenant)
    rag_top_k: int = 10                              # nombre de résultats pour /v1/search
    rag_score_threshold: float = 0.5                 # seuil de score pour /v1/search
    use_external_transcription: bool = False         # si True, délègue Whisper+pyannote au rag-api
    use_external_llm: bool = False                   # si True, délègue les appels LLM au rag-api /v1/generate

    # ── Email (SMTP) ─────────────────────────────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@scribia.fr"
    smtp_from_name: str = "ScribIA"
    smtp_use_tls: bool = True
    app_base_url: str = "http://localhost:3001"  # URL publique pour les liens dans les emails

    # ── Push Notifications (VAPID) ──────────────────────────────────────────
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "mailto:admin@scribia.fr"

    # ── App ────────────────────────────────────────────────────────────────────
    app_name: str = "ScribIA"
    debug: bool = False
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_prefix": "SCRIBIA_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
