from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_JWT_SECRETS = frozenset({
    "",
    "codepilot-dev-secret-change-in-production",
})


class Settings(BaseSettings):
    # Database — PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://codepilot:dev_password@localhost:5432/codepilot"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Judge0 — self-hosted code execution
    JUDGE0_URL: str = ""
    JUDGE0_AUTH_HEADER: str = "X-Auth-Token"
    JUDGE0_AUTH_TOKEN: str = ""
    JUDGE0_RAPIDAPI_HOST: str = ""
    JUDGE0_RAPIDAPI_KEY: str = ""
    JUDGE0_TIMEOUT_SECONDS: float = 20.0
    JUDGE0_FAILURE_THRESHOLD: int = 3
    JUDGE0_COOLDOWN_SECONDS: float = 30.0
    JUDGE0_CPU_TIME_LIMIT: float = 3.0
    JUDGE0_WALL_TIME_LIMIT: float = 8.0
    JUDGE0_MEMORY_LIMIT_KB: int = 128000

    # LLM — DeepSeek (OpenAI 兼容)
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "deepseek-flash"
    LLM_BASE_URL: str = "https://api.deepseek.com"
    LLM_RATE_LIMIT_PER_MINUTE: int = 20
    LLM_MAX_CONCURRENT_REQUESTS: int = 3
    LLM_MONTHLY_PLATFORM_TOKEN_QUOTA: int = 1_000_000
    LLM_QUOTA_RESERVE_OUTPUT_TOKENS: int = 4096
    LLM_PRICING_JSON: str = "{}"

    # General REST API fixed-window limit per authenticated user or IP
    API_RATE_LIMIT_PER_MINUTE: int = 120

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
    LOG_LEVEL: str = "INFO"
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1
    ALERT_WEBHOOK_URL: str = ""
    ALERT_COOLDOWN_SECONDS: int = 300
    ALERT_5XX_THRESHOLD_PER_MINUTE: int = 5

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


def validate_runtime_security(settings: Settings) -> None:
    """Fail closed when a deployable environment uses a known weak JWT secret."""
    if (
        settings.APP_ENV.strip().lower() in {"production", "staging"}
        and settings.JWT_SECRET_KEY.strip() in _DEFAULT_JWT_SECRETS
    ):
        raise RuntimeError(
            "JWT_SECRET_KEY must be set to a non-default value in production/staging"
        )


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in get_settings().admin_email_set
