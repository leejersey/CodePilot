"""动画生成 — 单知识点代码讲解（含真实/模拟运行结果）"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.models.models import User
from app.services.llm import call_llm_json, call_llm_stream, llm_user_context

router = APIRouter()


class SnippetExplainRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=8000)
    language: str = Field(default="python", max_length=40)
    context: str | None = Field(
        default=None,
        max_length=4000,
        description="代码块周围的课文（标题/说明）",
    )


class AnimationRequest(BaseModel):
    """兼容旧整章讲解入口（内部转发为提示，建议用 snippet）"""

    topic: str = Field(..., min_length=1, max_length=200)
    chapter_title: str | None = None
    chapter_summary: str | None = None
    lesson_content: str | None = None


SNIPPET_PROMPT = """你是编程课短视频编剧。只讲「这一段代码」这一个知识点，必须讲清楚。

已知信息：
- 语言：{language}
- 课文上下文（可能含标题/说明）：
---
{context}
---
- 代码：
```{language}
{code}
```
- 该代码的真实运行输出（或错误）：
---
{output}
---
- 是否报错：{has_error}

请输出严格 JSON（不要代码围栏）：
{{
  "type": "snippet_explain",
  "title": "短标题，如「认识 Path 对象」",
  "takeaway": "一句必须记住的结论（中文）",
  "beats": [
    {{
      "id": "intro",
      "duration_ms": 3500,
      "narration": "引入这个知识点要解决什么问题",
      "focus": "title",
      "highlight_lines": []
    }},
    {{
      "id": "code",
      "duration_ms": 6000,
      "narration": "逐行说清代码在干什么（口语）",
      "focus": "code",
      "highlight_lines": [1, 2]
    }},
    {{
      "id": "run",
      "duration_ms": 5000,
      "narration": "结合运行结果解释发生了什么；若报错则解释原因",
      "focus": "console",
      "highlight_lines": []
    }},
    {{
      "id": "takeaway",
      "duration_ms": 4000,
      "narration": "收束：强调 takeaway",
      "focus": "takeaway",
      "highlight_lines": []
    }}
  ]
}}

硬性规则：
1. type 必须是 snippet_explain
2. beats 必须恰好 4 段，且 focus 依次为 title → code → console → takeaway
3. highlight_lines 为 1-based 行号，仅 code 段需要，挑 1～4 行关键行
4. narration 中文，口语，讲清楚；不要复述整段代码
5. 旁白必须与运行结果一致，禁止编造与输出不符的现象
6. duration_ms：intro 3000–4500；code 5000–8000；run 4000–7000；takeaway 3000–5000
"""


async def _simulate_run(code: str, language: str) -> tuple[str, bool]:
    prompt = f"""你是一个代码执行环境。请执行以下 {language} 代码，只返回控制台输出结果。
如果代码有语法错误或运行时错误，返回错误信息。
不要解释代码，不要添加任何额外文字，只返回纯粹的执行输出。

```{language}
{code}
```

执行输出："""
    messages = [
        {
            "role": "system",
            "content": "你是一个精确的代码执行模拟器。只输出代码的运行结果，不要有任何多余的话。",
        },
        {"role": "user", "content": prompt},
    ]
    output = ""
    async for token in call_llm_stream(messages):
        output += token
    text = output.strip()
    has_error = any(
        kw in text.lower()
        for kw in ["error", "traceback", "exception", "syntaxerror", "错误"]
    )
    return text or "(无输出)", has_error


def _normalize_snippet(result: dict, *, title_fallback: str, code: str, language: str, output: str, has_error: bool) -> dict:
    if not isinstance(result, dict):
        result = {}
    result["type"] = "snippet_explain"
    result["code"] = code
    result["language"] = language
    result["run_output"] = output
    result["has_error"] = has_error
    result.setdefault("title", title_fallback)
    result.setdefault("takeaway", "抓住这段代码的核心行为与返回值。")

    beats = result.get("beats")
    if not isinstance(beats, list) or len(beats) < 4:
        result["beats"] = [
            {
                "id": "intro",
                "duration_ms": 3500,
                "narration": f"我们来讲清楚：{result['title']}",
                "focus": "title",
                "highlight_lines": [],
            },
            {
                "id": "code",
                "duration_ms": 6000,
                "narration": "先看这段代码做了什么。",
                "focus": "code",
                "highlight_lines": [1],
            },
            {
                "id": "run",
                "duration_ms": 5000,
                "narration": "再看运行结果，对照理解。",
                "focus": "console",
                "highlight_lines": [],
            },
            {
                "id": "takeaway",
                "duration_ms": 4000,
                "narration": result["takeaway"],
                "focus": "takeaway",
                "highlight_lines": [],
            },
        ]
    else:
        # 强制 focus 顺序，避免模型乱序
        focuses = ["title", "code", "console", "takeaway"]
        fixed = []
        for i, focus in enumerate(focuses):
            b = beats[i] if i < len(beats) and isinstance(beats[i], dict) else {}
            fixed.append(
                {
                    "id": b.get("id") or focus,
                    "duration_ms": max(2500, int(b.get("duration_ms") or 4000)),
                    "narration": (b.get("narration") or "").strip() or f"讲解：{focus}",
                    "focus": focus,
                    "highlight_lines": b.get("highlight_lines")
                    if isinstance(b.get("highlight_lines"), list)
                    else [],
                }
            )
        result["beats"] = fixed
    return result


async def build_snippet_explain(req: SnippetExplainRequest, user: User | None = None) -> dict:
    """单知识点讲解：先跑代码拿结果，再生成旁白分镜。"""
    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="代码不能为空")
    language = (req.language or "python").strip().lower() or "python"
    context = (req.context or "").strip() or "（无额外上下文）"

    with llm_user_context(user):
        output, has_error = await _simulate_run(code, language)

        title_fb = "知识点讲解"
        for line in context.splitlines():
            s = line.strip().lstrip("#").strip()
            if s and not s.startswith("```"):
                title_fb = s[:40]
                break

        prompt = SNIPPET_PROMPT.format(
            language=language,
            context=context[:3500],
            code=code[:6000],
            output=output[:3000],
            has_error=str(has_error).lower(),
        )
        raw = await call_llm_json(prompt, temperature=0.3)

    return _normalize_snippet(
        raw if isinstance(raw, dict) else {},
        title_fallback=title_fb,
        code=code,
        language=language,
        output=output,
        has_error=has_error,
    )


@router.post("/generate-snippet")
async def generate_snippet_explain(
    req: SnippetExplainRequest,
    user: User = Depends(get_current_user),
):
    return await build_snippet_explain(req, user=user)


@router.post("/generate")
async def generate_animation(
    req: AnimationRequest,
    user: User = Depends(get_current_user),
):
    """旧接口：若 lesson 里能抽出代码则走 snippet，否则返回引导。"""
    import re

    lesson = (req.lesson_content or "").strip()
    m = re.search(r"```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```", lesson)
    if m:
        lang = (m.group(1) or "python").strip() or "python"
        code = m.group(2).strip()
        return await build_snippet_explain(
            SnippetExplainRequest(
                code=code,
                language=lang,
                context=(req.chapter_title or req.topic or "")
                + "\n"
                + (req.chapter_summary or ""),
            ),
            user=user,
        )

    title = (req.chapter_title or req.topic or "知识点").strip()
    return {
        "type": "snippet_explain",
        "title": title,
        "language": "python",
        "code": "# 请在课文代码块上点击「讲解」\nprint('请选择具体代码块')\n",
        "run_output": "请选择具体代码块",
        "has_error": False,
        "takeaway": "讲解以单个代码知识点为单位，请点击代码块旁的「讲解」。",
        "beats": [
            {
                "id": "intro",
                "duration_ms": 4000,
                "narration": "整章讲解已改为「单知识点」模式。",
                "focus": "title",
                "highlight_lines": [],
            },
            {
                "id": "code",
                "duration_ms": 4000,
                "narration": "请在左侧课文的代码块标题栏点击「讲解」。",
                "focus": "code",
                "highlight_lines": [1],
            },
            {
                "id": "run",
                "duration_ms": 3500,
                "narration": "系统会运行该段代码，并把结果写进短片。",
                "focus": "console",
                "highlight_lines": [],
            },
            {
                "id": "takeaway",
                "duration_ms": 4000,
                "narration": "一次只讲透一个知识点，才会清楚。",
                "focus": "takeaway",
                "highlight_lines": [],
            },
        ],
    }
