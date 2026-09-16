from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    # Database — PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://codepilot:dev_password@localhost:5432/codepilot"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM — DeepSeek (OpenAI 兼容)
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "deepseek-chat"
    LLM_BASE_URL: str = "https://api.deepseek.com"

    # Embeddings — 阿里云百炼（OpenAI 兼容模式）
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    EMBEDDING_MODEL: str = "text-embedding-v3"
    EMBEDDING_DIM: int = 1024

    # Knowledge base uploads
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10MB

    # App
    APP_ENV: str = "development"
    APP_DEBUG: bool = True

    # JWT
    JWT_SECRET_KEY: str = "codepilot-dev-secret-change-in-production"
    JWT_EXPIRE_HOURS: int = 24

    # 超级管理员邮箱（逗号分隔，命中则 role=super_admin）
    ADMIN_EMAILS: str = ""

    # 先读仓库根 .env，再读 backend/.env（后者覆盖前者，如 DATABASE_URL 端口）
    model_config = SettingsConfigDict(
        env_file=(str(_REPO_ROOT / ".env"), str(_BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in get_settings().admin_email_set
