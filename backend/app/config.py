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
    whisper_model: str = "medium"
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
    speaker_matching_threshold: float = 0.75  # cosine similarity threshold for auto-match

    # ── Preparatory Phases ──────────────────────────────────────────────────
    prep_docs_path: str = "/data/prep_docs"
    max_doc_size_mb: int = 50

    # ── AI Documents / Ollama ───────────────────────────────────────────────────
    ollama_url: str = "http://localhost:11434"
    ollama_default_model: str = "llama3.1:8b"
    ai_docs_path: str = "/data/ai_docs"

    # ── RAG / ChromaDB ──────────────────────────────────────────────────────────
    chroma_url: str = "http://chroma:8000"
    embedding_model: str = "nomic-embed-text"
    rag_chunk_size: int = 1500         # chars per chunk
    rag_chunk_overlap: int = 200       # overlap between chunks
    rag_top_k: int = 10               # number of chunks to retrieve

    # ── App ────────────────────────────────────────────────────────────────────
    app_name: str = "ScribIA"
    debug: bool = False
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_prefix": "SCRIBIA_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
