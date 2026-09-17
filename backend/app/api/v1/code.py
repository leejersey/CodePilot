"""通过 Judge0 沙箱真实运行代码。"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.models.models import User
from app.services.judge0 import JudgeUnavailable, language_id_for, run_code as judge0_run_code
from app.services.llm import call_llm_json, llm_user_context

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
