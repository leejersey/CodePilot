"""Embedding 服务 — 阿里云百炼 text-embedding-v3（OpenAI 兼容模式）"""

from openai import AsyncOpenAI
from fastapi import HTTPException

from app.core.config import get_settings

settings = get_settings()

_client: AsyncOpenAI | None = None

# 百炼 text-embedding-v3/v4：单次最多 10 条
_BATCH_SIZE = 10


def _get_client() -> AsyncOpenAI:
    global _client
    if not settings.EMBEDDING_API_KEY:
        raise HTTPException(status_code=503, detail="未配置 embedding（请设置 EMBEDDING_API_KEY）")
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.EMBEDDING_API_KEY,
            base_url=settings.EMBEDDING_BASE_URL,
        )
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """批量生成文本向量。"""
    if not texts:
        return []
    client = _get_client()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        resp = await client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
            dimensions=settings.EMBEDDING_DIM,
            encoding_format="float",
        )
        ordered = sorted(resp.data, key=lambda d: d.index)
        vectors.extend([d.embedding for d in ordered])
    return vectors


async def embed_query(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0]
