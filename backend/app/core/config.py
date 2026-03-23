from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database — PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://codepilot:dev_password@localhost:5432/codepilot"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM — DeepSeek (OpenAI 兼容)
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "deepseek-chat"
    LLM_BASE_URL: str = "https://api.deepseek.com"

    # App
    APP_ENV: str = "development"
    APP_DEBUG: bool = True

    # JWT
    JWT_SECRET_KEY: str = "codepilot-dev-secret-change-in-production"
    JWT_EXPIRE_HOURS: int = 24

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
