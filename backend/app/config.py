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
        return (
            f"mssql+pyodbc://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
            f"?driver={self.db_driver.replace(' ', '+')}"
            "&TrustServerCertificate=yes"
        )

    # ── JWT ────────────────────────────────────────────────────────────────────
    jwt_secret: str = "CHANGE-ME-IN-PRODUCTION"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    # ── App ────────────────────────────────────────────────────────────────────
    app_name: str = "ScribIA"
    debug: bool = False
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = {"env_prefix": "SCRIBIA_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
