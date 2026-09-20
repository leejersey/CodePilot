"""用户设置 — 多条 LLM 档案 + 选择一条启用（否则平台默认）"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from openai import AsyncOpenAI

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import User
from app.services.llm import (
    LLM_PRESETS,
    llm_user_context,
    mask_api_key,
    platform_llm_config,
    resolve_llm_config,
)

router = APIRouter()


class LlmProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    provider: str = Field(default="deepseek", max_length=40)
    api_key: str = Field(..., min_length=1, max_length=512)
    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=120)
    set_active: bool = True


class LlmProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    provider: str | None = Field(default=None, max_length=40)
    api_key: str | None = Field(default=None, max_length=512)
    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=120)
    keep_api_key: bool = True


class LlmActiveUpdate(BaseModel):
    """active_id 为 null / 空字符串 → 使用平台默认"""
    active_id: str | None = None


class LlmProfilePublic(BaseModel):
    id: str
    name: str
    provider: str
    api_key_masked: str | None
    has_api_key: bool
    base_url: str
    model: str


class LlmSettingsResponse(BaseModel):
    active_id: str | None
    profiles: list[LlmProfilePublic]
    active_source: str
    active_provider: str
    active_model: str
    active_base_url: str
    platform_model: str
    platform_base_url: str
    presets: list[dict]


def _public_presets() -> list[dict]:
    return [{"id": pid, **meta} for pid, meta in LLM_PRESETS.items()]


def _prefs(user: User) -> dict:
    return dict(user.preferences) if isinstance(user.preferences, dict) else {}


def _normalize_llm_blob(llm: dict) -> dict:
    """统一为 { active_id, profiles[] }，并迁移旧单配置。"""
    profiles = llm.get("profiles")
    if isinstance(profiles, list):
        cleaned = [p for p in profiles if isinstance(p, dict) and p.get("id")]
        active_id = llm.get("active_id")
        if active_id and not any(str(p.get("id")) == str(active_id) for p in cleaned):
            active_id = None
        return {"active_id": active_id, "profiles": cleaned}

    # 旧版：use_custom + 单字段
    if llm.get("use_custom") and (llm.get("api_key") or "").strip():
        pid = "legacy"
        return {
            "active_id": pid,
            "profiles": [
                {
                    "id": pid,
                    "name": "个人配置",
                    "provider": (llm.get("provider") or "custom").strip().lower(),
                    "api_key": llm.get("api_key"),
                    "base_url": llm.get("base_url") or "",
                    "model": llm.get("model") or "",
                }
            ],
        }
    return {"active_id": None, "profiles": []}


def _get_llm(user: User) -> dict:
    prefs = _prefs(user)
    raw = prefs.get("llm") if isinstance(prefs.get("llm"), dict) else {}
    return _normalize_llm_blob(raw)


def _save_llm(user: User, llm: dict) -> None:
    prefs = _prefs(user)
    prefs["llm"] = {
        "active_id": llm.get("active_id"),
        "profiles": llm.get("profiles") or [],
    }
    user.preferences = prefs
    flag_modified(user, "preferences")


def _profile_public(p: dict) -> LlmProfilePublic:
    provider = (p.get("provider") or "custom").strip().lower()
    preset = LLM_PRESETS.get(provider, LLM_PRESETS["custom"])
    key = (p.get("api_key") or "").strip()
    return LlmProfilePublic(
        id=str(p.get("id")),
        name=(p.get("name") or "未命名").strip() or "未命名",
        provider=provider,
        api_key_masked=mask_api_key(key),
        has_api_key=bool(key),
        base_url=(p.get("base_url") or "").strip() or preset.get("base_url") or "",
        model=(p.get("model") or "").strip() or preset.get("default_model") or "",
    )


def _to_response(user: User) -> LlmSettingsResponse:
    llm = _get_llm(user)
    active = resolve_llm_config(user)
    platform = platform_llm_config()
    return LlmSettingsResponse(
        active_id=llm.get("active_id"),
        profiles=[_profile_public(p) for p in llm.get("profiles") or []],
        active_source=active.source,
        active_provider=active.provider,
        active_model=active.model,
        active_base_url=active.base_url,
        platform_model=platform.model,
        platform_base_url=platform.base_url,
        presets=_public_presets(),
    )


def _resolve_fields(provider: str, base_url: str | None, model: str | None) -> tuple[str, str, str]:
    provider = (provider or "custom").strip().lower()
    if provider not in LLM_PRESETS:
        raise HTTPException(status_code=400, detail=f"不支持的 provider: {provider}")
    preset = LLM_PRESETS[provider]
    bu = (base_url or "").strip() or preset.get("base_url") or ""
    md = (model or "").strip() or preset.get("default_model") or ""
    if provider == "custom" and (not bu or not md):
        raise HTTPException(status_code=400, detail="自定义提供商需填写 Base URL 与模型名")
    return provider, bu, md


@router.get("/llm", response_model=LlmSettingsResponse)
async def get_llm_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 读时若仍是旧结构，落库迁移一次
    prefs = _prefs(user)
    raw = prefs.get("llm") if isinstance(prefs.get("llm"), dict) else {}
    if isinstance(raw, dict) and "profiles" not in raw and raw.get("use_custom"):
        _save_llm(user, _normalize_llm_blob(raw))
        await db.commit()
        await db.refresh(user)
    return _to_response(user)


@router.put("/llm/active", response_model=LlmSettingsResponse)
async def set_active_llm_profile(
    body: LlmActiveUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    llm = _get_llm(user)
    active_id = (body.active_id or "").strip() or None
    if active_id:
        if not any(str(p.get("id")) == active_id for p in llm["profiles"]):
            raise HTTPException(status_code=404, detail="配置不存在")
        # 选中档案必须有 key
        selected = next(p for p in llm["profiles"] if str(p.get("id")) == active_id)
        if not (selected.get("api_key") or "").strip():
            raise HTTPException(status_code=400, detail="该配置缺少 API Key，无法启用")
    llm["active_id"] = active_id
    _save_llm(user, llm)
    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.post("/llm/profiles", response_model=LlmSettingsResponse, status_code=201)
async def create_llm_profile(
    body: LlmProfileCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    provider, base_url, model = _resolve_fields(body.provider, body.base_url, body.model)
    llm = _get_llm(user)
    pid = str(uuid.uuid4())
    profile = {
        "id": pid,
        "name": body.name.strip(),
        "provider": provider,
        "api_key": body.api_key.strip(),
        "base_url": base_url,
        "model": model,
    }
    llm["profiles"].append(profile)
    if body.set_active:
        llm["active_id"] = pid
    _save_llm(user, llm)
    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.put("/llm/profiles/{profile_id}", response_model=LlmSettingsResponse)
async def update_llm_profile(
    profile_id: str,
    body: LlmProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    llm = _get_llm(user)
    idx = next((i for i, p in enumerate(llm["profiles"]) if str(p.get("id")) == profile_id), -1)
    if idx < 0:
        raise HTTPException(status_code=404, detail="配置不存在")

    cur = dict(llm["profiles"][idx])
    provider = body.provider if body.provider is not None else cur.get("provider") or "custom"
    base_url = body.base_url if body.base_url is not None else cur.get("base_url")
    model = body.model if body.model is not None else cur.get("model")
    provider, base_url, model = _resolve_fields(provider, base_url, model)

    api_key = (body.api_key or "").strip()
    if not api_key and body.keep_api_key:
        api_key = (cur.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")

    if body.name is not None:
        cur["name"] = body.name.strip()
    cur["provider"] = provider
    cur["base_url"] = base_url
    cur["model"] = model
    cur["api_key"] = api_key
    llm["profiles"][idx] = cur
    _save_llm(user, llm)
    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.delete("/llm/profiles/{profile_id}", response_model=LlmSettingsResponse)
async def delete_llm_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    llm = _get_llm(user)
    before = len(llm["profiles"])
    llm["profiles"] = [p for p in llm["profiles"] if str(p.get("id")) != profile_id]
    if len(llm["profiles"]) == before:
        raise HTTPException(status_code=404, detail="配置不存在")
    if str(llm.get("active_id")) == profile_id:
        llm["active_id"] = None
    _save_llm(user, llm)
    await db.commit()
    await db.refresh(user)
    return _to_response(user)


@router.post("/llm/test")
async def test_llm_settings(user: User = Depends(get_current_user)):
    """用当前生效配置发一条极短请求，验证连通性。"""
    cfg = resolve_llm_config(user)
    if not cfg.api_key:
        raise HTTPException(status_code=400, detail="当前无可用 API Key")
    try:
        with llm_user_context(user):
            client = AsyncOpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
            # Gemini 等模型可能占用 thinking token；max_tokens 过小会出现「连通成功但回复空」。
            resp = await client.chat.completions.create(
                model=cfg.model,
                messages=[{"role": "user", "content": "Reply with exactly: ok"}],
                max_tokens=64,
                temperature=0,
                timeout=30.0,
            )
            text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "接口可达，但模型返回空内容。请检查模型 ID 是否正确，"
                    "或换用 gemini-2.0-flash / gemini-2.5-flash 等稳定型号后再测。"
                ),
            )
        return {
            "ok": True,
            "source": cfg.source,
            "provider": cfg.provider,
            "model": cfg.model,
            "reply": text[:200],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"连通失败: {e}") from e


# --- Sandbox (Modal / Daytona BYOK) --------------------------------------


class SandboxSettingsPublic(BaseModel):
    default_provider: Literal["modal", "daytona"] | None
    has_modal_credentials: bool
    modal_token_id_masked: str | None
    has_daytona_credentials: bool
    daytona_api_key_masked: str | None


class SandboxSettingsUpdate(BaseModel):
    default_provider: Literal["modal", "daytona"] | None = None
    modal_token_id: str | None = None
    modal_token_secret: str | None = None
    keep_modal_secret: bool = True
    daytona_api_key: str | None = None
    keep_daytona_secret: bool = True


def _get_sandbox(user: User) -> dict:
    prefs = _prefs(user)
    raw = prefs.get("sandbox")
    return dict(raw) if isinstance(raw, dict) else {}


def _save_sandbox(user: User, sandbox: dict) -> None:
    prefs = _prefs(user)
    prefs["sandbox"] = sandbox
    user.preferences = prefs
    flag_modified(user, "preferences")


def _sandbox_public(sandbox: dict) -> SandboxSettingsPublic:
    modal = sandbox.get("modal") if isinstance(sandbox.get("modal"), dict) else {}
    token_id = (modal.get("token_id") or "").strip()
    token_secret = (modal.get("token_secret") or "").strip()
    daytona = sandbox.get("daytona") if isinstance(sandbox.get("daytona"), dict) else {}
    daytona_key = (daytona.get("api_key") or "").strip()
    default = sandbox.get("default_provider")
    if default not in ("modal", "daytona"):
        default = None
    return SandboxSettingsPublic(
        default_provider=default,
        has_modal_credentials=bool(token_id and token_secret),
        modal_token_id_masked=mask_api_key(token_id) if token_id else None,
        has_daytona_credentials=bool(daytona_key),
        daytona_api_key_masked=mask_api_key(daytona_key) if daytona_key else None,
    )


@router.get("/sandbox", response_model=SandboxSettingsPublic)
async def get_sandbox_settings(user: User = Depends(get_current_user)):
    return _sandbox_public(_get_sandbox(user))


@router.put("/sandbox", response_model=SandboxSettingsPublic)
async def put_sandbox_settings(
    body: SandboxSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sandbox = _get_sandbox(user)
    modal = dict(sandbox.get("modal")) if isinstance(sandbox.get("modal"), dict) else {}
    daytona = (
        dict(sandbox.get("daytona")) if isinstance(sandbox.get("daytona"), dict) else {}
    )

    if body.default_provider is not None:
        sandbox["default_provider"] = body.default_provider

    new_id = (body.modal_token_id or "").strip()
    new_secret = (body.modal_token_secret or "").strip()

    if body.modal_token_id is not None:
        if new_id:
            modal["token_id"] = new_id
        else:
            modal.pop("token_id", None)

    if new_secret:
        modal["token_secret"] = new_secret
    elif body.modal_token_secret is not None and not body.keep_modal_secret:
        modal.pop("token_secret", None)
    # else: keep_modal_secret and no new secret → leave existing secret

    tid = (modal.get("token_id") or "").strip()
    tsec = (modal.get("token_secret") or "").strip()
    if (tid and not tsec) or (tsec and not tid):
        raise HTTPException(
            status_code=400,
            detail="设置 Modal 凭证需同时提供 Token ID 与 Secret",
        )

    if tid and tsec:
        sandbox["modal"] = {"token_id": tid, "token_secret": tsec}
    elif body.modal_token_id is not None or body.modal_token_secret is not None:
        sandbox["modal"] = {}

    new_daytona = (body.daytona_api_key or "").strip()
    if new_daytona:
        daytona["api_key"] = new_daytona
    elif body.daytona_api_key is not None and not body.keep_daytona_secret:
        daytona.pop("api_key", None)
    # else: keep_daytona_secret and no new key → leave existing

    dkey = (daytona.get("api_key") or "").strip()
    if dkey:
        sandbox["daytona"] = {"api_key": dkey}
    elif body.daytona_api_key is not None:
        sandbox["daytona"] = {}

    _save_sandbox(user, sandbox)
    await db.commit()
    await db.refresh(user)
    return _sandbox_public(_get_sandbox(user))
