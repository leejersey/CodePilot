"""LLM 服务封装 — 使用 OpenAI 兼容格式调用 DeepSeek API"""

import json
from openai import AsyncOpenAI
from app.core.config import get_settings

settings = get_settings()

client = AsyncOpenAI(
    api_key=settings.LLM_API_KEY,
    base_url=settings.LLM_BASE_URL,
)


async def call_llm_json(prompt: str, temperature: float = 0.7) -> dict:
    """调用 LLM 并要求返回 JSON 格式"""
    response = await client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


async def call_llm_stream(messages: list[dict], temperature: float = 0.7):
    """流式调用 LLM，返回 async generator"""
    stream = await client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
