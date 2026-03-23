"""代码模拟运行 — 通过 LLM 预测代码输出"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.llm import call_llm_stream

router = APIRouter()


class CodeRunRequest(BaseModel):
    code: str = Field(..., min_length=1)
    language: str = Field("python")


class CodeRunResponse(BaseModel):
    output: str
    has_error: bool = False


@router.post("/run", response_model=CodeRunResponse)
async def run_code(body: CodeRunRequest):
    """通过 AI 模拟执行代码，返回预测输出"""
    prompt = f"""你是一个代码执行环境。请执行以下 {body.language} 代码，只返回控制台输出结果。
如果代码有语法错误或运行时错误，返回错误信息。
不要解释代码，不要添加任何额外文字，只返回纯粹的执行输出。

```{body.language}
{body.code}
```

执行输出："""

    messages = [
        {"role": "system", "content": "你是一个精确的代码执行模拟器。只输出代码的运行结果，不要有任何多余的话。"},
        {"role": "user", "content": prompt},
    ]

    output = ""
    async for token in call_llm_stream(messages):
        output += token

    has_error = any(kw in output.lower() for kw in ["error", "traceback", "exception", "syntaxerror"])

    return CodeRunResponse(output=output.strip(), has_error=has_error)
