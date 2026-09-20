"""通过 Judge0 / Modal 沙箱运行代码。"""

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.models.models import Chapter, LearningPath, User
from app.services.course_access import can_access_legacy_path
from app.services.judge0 import JudgeUnavailable, language_id_for, run_code as judge0_run_code
from app.services.llm import call_llm_json, llm_user_context
from app.services.modal_sandbox import ModalUnavailable, run_python_in_modal
from app.services.package_candidates import resolve_modal_install

router = APIRouter()


class CodeRunRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100_000)
    language: str = Field("python")
    stdin: str = Field("", max_length=100_000)


class CodeRunResponse(BaseModel):
    output: str
    has_error: bool = False
    status: str
    stderr: str | None = None
    compile_output: str | None = None
    time: str | None = None
    memory: int | None = None
    trusted: bool
    judge_source: str


class ModalRunRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100_000)
    language: str = Field("python")
    path_id: uuid.UUID
    chapter_id: uuid.UUID
    # Learner .env contents (KEY=VALUE). Parsed server-side; platform keys are NOT injected.
    dotenv: str = Field("", max_length=20_000)
    # Client `packages` is intentionally omitted — allow decisions come from course DB only.


@router.post("/run", response_model=CodeRunResponse)
async def run_code(
    body: CodeRunRequest,
    user: User = Depends(get_current_user),
):
    """真实执行代码并返回编译、运行和资源使用信息。"""
    try:
        language_id_for(body.language)
        result = await judge0_run_code(body.code, body.language, body.stdin)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except JudgeUnavailable:
        prompt = f"""远程代码沙箱当前不可用。请临时模拟以下代码，只返回 JSON：
{{
  "output": "控制台输出或错误",
  "has_error": true或false,
  "status": "简短状态"
}}
语言：{body.language}
标准输入：{body.stdin}
代码：
```{body.language}
{body.code}
```"""
        with llm_user_context(user):
            simulated = await call_llm_json(
                prompt, temperature=0.0, request_type="code_fallback"
            )
        return CodeRunResponse(
            output=str(simulated.get("output") or ""),
            has_error=bool(simulated.get("has_error")),
            status=str(simulated.get("status") or "LLM 临时模拟"),
            trusted=False,
            judge_source="llm",
        )
    except (httpx.HTTPError, TimeoutError) as exc:
        raise HTTPException(status_code=503, detail=f"代码沙箱暂不可用: {exc}") from exc

    error_text = result.stderr or result.compile_output or result.message or ""
    return CodeRunResponse(
        output=result.stdout or error_text,
        has_error=result.status_id != 3,
        status=result.status,
        stderr=result.stderr,
        compile_output=result.compile_output,
        time=result.time,
        memory=result.memory,
        trusted=True,
        judge_source="judge0",
    )


def _blocked_packages_message(blocked: list[tuple[str, str]]) -> str:
    parts = [f"{name}（{status}）" for name, status in blocked]
    return "不允许安装未批准的依赖：" + "、".join(parts)


@router.post("/run-modal", response_model=CodeRunResponse)
async def run_code_modal(
    body: ModalRunRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """在 Modal Sandbox 中运行 Python；安装集合 = 代码检测 ∩ 课程已批准依赖。"""
    language = (body.language or "python").strip().lower()
    if language not in {"python", "py", "python3"}:
        raise HTTPException(status_code=422, detail="Modal 云端运行目前仅支持 Python")

    chapter = await db.scalar(select(Chapter).where(Chapter.id == body.chapter_id))
    if not chapter or chapter.path_id != body.path_id:
        raise HTTPException(status_code=404, detail="章节不存在")

    path = await db.scalar(select(LearningPath).where(LearningPath.id == body.path_id))
    if not path or not await can_access_legacy_path(db, path, user):
        raise HTTPException(status_code=404, detail="学习路线不存在")

    path_candidates = list(getattr(path, "package_candidates", None) or [])
    chapter_candidates = list(getattr(chapter, "package_candidates", None) or [])

    try:
        to_install, blocked = resolve_modal_install(
            body.code,
            path_candidates=path_candidates,
            chapter_candidates=chapter_candidates,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if blocked:
        raise HTTPException(status_code=422, detail=_blocked_packages_message(blocked))

    prefs = user.preferences or {}
    sandbox = prefs.get("sandbox") if isinstance(prefs, dict) else None
    modal_creds = (sandbox or {}).get("modal") if isinstance(sandbox, dict) else None
    modal_creds = modal_creds if isinstance(modal_creds, dict) else {}
    token_id = str(modal_creds.get("token_id") or "").strip()
    token_secret = str(modal_creds.get("token_secret") or "").strip()
    if not token_id or not token_secret:
        raise HTTPException(
            status_code=422,
            detail="请先在个人中心配置 Modal Token（token_id / token_secret）后再使用云端运行",
        )

    try:
        from app.services.dotenv_parse import parse_dotenv

        env_vars = parse_dotenv(body.dotenv) if body.dotenv.strip() else {}
        result = await run_python_in_modal(
            body.code,
            to_install,
            token_id=token_id,
            token_secret=token_secret,
            env_vars=env_vars,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModalUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Modal 执行失败: {exc}") from exc

    output = result.stdout
    if result.stderr:
        output = f"{output}\n{result.stderr}".strip() if output else result.stderr
    return CodeRunResponse(
        output=output or "(无输出)",
        has_error=result.exit_code != 0,
        status=result.status,
        stderr=result.stderr or None,
        trusted=True,
        judge_source="modal",
    )
