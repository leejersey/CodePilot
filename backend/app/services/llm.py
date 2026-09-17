"""LLM 服务 — OpenAI 兼容；支持平台默认 + 用户个人配置覆盖"""

from __future__ import annotations

import json
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from typing import Any, Iterator

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.llm_usage import (
    begin_llm_request,
    estimate_tokens,
    finish_llm_request,
    resolve_monthly_quota,
)

# provider → 预设（均可走 OpenAI 兼容协议）
LLM_PRESETS: dict[str, dict[str, str]] = {
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-flash",
        "hint": "官方 DeepSeek API（deepseek-flash 支持图像理解）",
    },
    "openai": {
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "hint": "官方 OpenAI Chat Completions",
    },
    "gemini": {
        "label": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "default_model": "gemini-2.0-flash",
        "hint": "Gemini 的 OpenAI 兼容端点",
    },
    "openrouter": {
        "label": "OpenRouter（Claude 等）",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "anthropic/claude-3.5-sonnet",
        "hint": "可用 anthropic/claude-*、google/gemini-* 等模型 ID",
    },
    "custom": {
        "label": "自定义 OpenAI 兼容",
        "base_url": "",
        "default_model": "",
        "hint": "任意兼容 /v1/chat/completions 的网关",
    },
}


@dataclass(frozen=True)
class LLMRuntimeConfig:
    api_key: str
    base_url: str
    model: str
    provider: str
    source: str  # platform | user
    user_id: Any | None = None
    monthly_token_quota: int = 0


_llm_ctx: ContextVar[LLMRuntimeConfig | None] = ContextVar("llm_runtime", default=None)


def platform_llm_config() -> LLMRuntimeConfig:
    s = get_settings()
    return LLMRuntimeConfig(
        api_key=s.LLM_API_KEY or "",
        base_url=(s.LLM_BASE_URL or "").rstrip("/") or "https://api.deepseek.com",
        model=s.LLM_MODEL or "deepseek-flash",
        provider="platform",
        source="platform",
    )


def resolve_llm_config(user: Any | None = None) -> LLMRuntimeConfig:
    """选中的个人档案优先，否则平台 .env。兼容旧版单配置字段。"""
    platform = platform_llm_config()
    if user is None:
        return platform
    platform = replace(
        platform,
        user_id=getattr(user, "id", None),
        monthly_token_quota=resolve_monthly_quota(
            user, get_settings().LLM_MONTHLY_PLATFORM_TOKEN_QUOTA
        ),
    )

    prefs = getattr(user, "preferences", None) or {}
    llm = prefs.get("llm") if isinstance(prefs, dict) else None
    if not isinstance(llm, dict):
        return platform

    profiles = llm.get("profiles")
    active_id = llm.get("active_id")

    # 兼容旧结构：use_custom + 单条字段 → 视为临时档案
    if not isinstance(profiles, list):
        if llm.get("use_custom") and (llm.get("api_key") or "").strip():
            profiles = [
                {
                    "id": "legacy",
                    "name": "个人配置",
                    "provider": llm.get("provider") or "custom",
                    "api_key": llm.get("api_key"),
                    "base_url": llm.get("base_url"),
                    "model": llm.get("model"),
                }
            ]
            active_id = "legacy"
        else:
            return platform

    if not active_id:
        return platform

    selected = None
    for p in profiles:
        if isinstance(p, dict) and str(p.get("id")) == str(active_id):
            selected = p
            break
    if not selected:
        return platform

    api_key = (selected.get("api_key") or "").strip()
    if not api_key:
        return platform

    provider = (selected.get("provider") or "custom").strip().lower()
    preset = LLM_PRESETS.get(provider, LLM_PRESETS["custom"])
    base_url = (
        (selected.get("base_url") or "").strip()
        or preset.get("base_url")
        or platform.base_url
    )
    model = (
        (selected.get("model") or "").strip()
        or preset.get("default_model")
        or platform.model
    )

    return LLMRuntimeConfig(
        api_key=api_key,
        base_url=base_url.rstrip("/"),
        model=model,
        provider=provider,
        source="user",
        user_id=getattr(user, "id", None),
        monthly_token_quota=resolve_monthly_quota(
            user, get_settings().LLM_MONTHLY_PLATFORM_TOKEN_QUOTA
        ),
    )


def get_active_llm_config() -> LLMRuntimeConfig:
    return _llm_ctx.get() or platform_llm_config()


@contextmanager
def llm_user_context(user: Any | None) -> Iterator[LLMRuntimeConfig]:
    cfg = resolve_llm_config(user)
    token = _llm_ctx.set(cfg)
    try:
        yield cfg
    finally:
        _llm_ctx.reset(token)


def _client_for(cfg: LLMRuntimeConfig) -> AsyncOpenAI:
    if not cfg.api_key:
        raise RuntimeError("未配置 LLM API Key（请在个人中心或 backend/.env 中设置）")
    return AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)


def mask_api_key(key: str | None) -> str | None:
    if not key:
        return None
    k = key.strip()
    if len(k) <= 8:
        return "****"
    return f"{k[:3]}****{k[-4:]}"


async def call_llm_json(
    prompt: str,
    temperature: float = 0.7,
    request_type: str = "general",
) -> dict:
    """调用 LLM 并要求返回 JSON 格式"""
    cfg = get_active_llm_config()
    reservation = await begin_llm_request(
        cfg, prompt_text=prompt, request_type=request_type
    )
    try:
        client = _client_for(cfg)
        response = await client.chat.completions.create(
            model=cfg.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        result = json.loads(content)
    except BaseException as exc:
        await finish_llm_request(
            reservation,
            status="error",
            error_message=str(exc),
        )
        raise
    usage = response.usage
    await finish_llm_request(
        reservation,
        input_tokens=getattr(usage, "prompt_tokens", None),
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
    )
    return result


async def call_llm_stream(
    messages: list[dict],
    temperature: float = 0.7,
    request_type: str = "chat",
):
    """流式调用 LLM，返回 async generator"""
    cfg = get_active_llm_config()
    prompt_text = json.dumps(messages, ensure_ascii=False)
    reservation = await begin_llm_request(
        cfg, prompt_text=prompt_text, request_type=request_type
    )
    output_parts: list[str] = []
    try:
        client = _client_for(cfg)
        stream = await client.chat.completions.create(
            model=cfg.model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                output_parts.append(content)
                yield content
    except BaseException as exc:
        await finish_llm_request(
            reservation,
            output_tokens=estimate_tokens("".join(output_parts)),
            status="error",
            error_message=str(exc),
        )
        raise
    await finish_llm_request(
        reservation,
        output_tokens=estimate_tokens("".join(output_parts)),
    )
