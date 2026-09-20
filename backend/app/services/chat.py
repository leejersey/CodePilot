"""对话管理服务 — 架构文档 5.5 services/chat.py"""

import re

from app.services.llm import call_llm_stream
from app.services.chat_images import build_user_content_for_llm


SYSTEM_PROMPT = """你是 CodePilot AI，一位热情且专业的编程导师。你的职责是：
1. 用清晰、通俗的语言讲解编程概念
2. 提供代码示例并解释关键细节
3. 鼓励用户动手实践
4. 回答以 Markdown 格式输出，包含代码块和重点标注
5. 当用户附带报错截图时，先读图中的关键错误信息，再给出可执行的排查与修复步骤

语言约束（必须遵守）：
- 代码示例、术语与练习必须以「当前章节上下文」指定的编程语言为准
- 混合技术栈路径可能每章语言不同，当前章节优先于路径主题
- 不要擅自切换到其他语言（例如当前章是 JavaScript 时禁止改用 Python 举例），除非用户明确要求切换
- 代码块语言标记必须与当前章节语言一致（如 ```javascript）

知识库约束（必须遵守）：
- 若上下文中提供了「知识库检索结果」或知识库资料，教学必须以这些资料为主线
- 讲解顺序、阶段划分、示例风格尽量贴合知识库原文，不要擅自改成另一套通用课程大纲
- 引用知识库内容时标注来源文件名；不要编造知识库中不存在的具体条文
- 仅当检索结果明显不足时，才可少量补充通用说明，并明确这是补充而非知识库原文
- 章节编号以「当前学习章节上下文」中的章节序号为准；知识库原文若写「第 N 章」但与本课序号不一致，必须改用本课序号，不得照抄原文编号

保持友善、耐心的教学风格。"""


def detect_language_hint(text: str) -> str | None:
    """从文本推断编程语言；无法判断时返回 None（不默认 python）。"""
    t = (text or "").lower()
    if re.search(r"\bhtml5?\b", t) or any(k in t for k in ("超文本", "页面骨架")):
        return "html"
    if re.search(r"\bcss3?\b", t) or any(k in t for k in ("样式表", "页面样式")):
        return "css"
    if "typescript" in t:
        return "typescript"
    if any(
        k in t
        for k in (
            "javascript",
            "react",
            "vue",
            "nodejs",
            "node.js",
            "next.js",
            "nextjs",
        )
    ) or re.search(r"(^|[^a-z])node([^a-z]|$)", t):
        return "javascript"
    if "golang" in t or re.search(r"(^|[^a-z])go([^a-z]|$)", t):
        return "go"
    if "rust" in t:
        return "rust"
    if "java" in t and "javascript" not in t:
        return "java"
    if "c++" in t or "cpp" in t:
        return "cpp"
    if "c#" in t or "csharp" in t or ".net" in t:
        return "csharp"
    if "kotlin" in t:
        return "kotlin"
    if "swift" in t:
        return "swift"
    if "ruby" in t:
        return "ruby"
    if "php" in t:
        return "php"
    if "bash" in t or "shell" in t:
        return "bash"
    if any(k in t for k in ("python", "django", "flask", "fastapi", "pytest", "pyodide")):
        return "python"
    if any(k in t for k in ("前端", "frontend", "front-end")):
        return "javascript"
    return None


def detect_language_from_topic(topic: str) -> str:
    """从学习路径主题推断编程语言，默认 python。"""
    return detect_language_hint(topic) or "python"


def detect_language_from_context(
    topic: str,
    chapter_title: str,
    chapter_summary: str | None = None,
) -> str:
    """优先按当前章节推断，路径主题只作为回退。"""
    chapter_hint = detect_language_hint(
        f"{chapter_title}\n{chapter_summary or ''}"
    )
    return chapter_hint or detect_language_from_topic(topic)


def format_chapter_learning_context(
    *,
    topic: str,
    language: str,
    sort_order: int,
    title: str,
    summary: str | None = None,
    difficulty: str | None = None,
) -> list[str]:
    """组装章节上下文行；章节序号必须来自学习路径，而非知识库原文编号。"""
    parts = [
        f"学习路径主题：{topic or '未指定'}",
        f"编程语言：{language}（所有代码示例必须使用此语言）",
        f"当前章节序号：{sort_order}",
        f"当前章节：第 {sort_order} 章「{title}」",
        "称呼本章时必须使用上述章节序号，不要沿用知识库原文里的章节编号。",
    ]
    if summary:
        parts.append(f"章节摘要：{summary}")
    if difficulty:
        parts.append(f"难度：{difficulty}")
    return parts


async def stream_chat_response(
    messages: list[dict],
    chapter_context: str | None = None,
    images: list[dict[str, str]] | None = None,
):
    """
    构建完整的 LLM 消息上下文并流式返回 AI 回复。

    Args:
        messages: 历史消息列表 [{"role": "user/assistant", "content": "..."}]
        chapter_context: 当前章节上下文（可选）
        images: 当前轮用户附图（仅作用于最后一条 user 消息）

    Yields:
        str: 逐 token 的文本内容
    """
    system = SYSTEM_PROMPT
    if chapter_context:
        system += f"\n\n当前学习章节上下文：{chapter_context}"
    if images:
        system += (
            "\n\n用户本轮附带了报错/界面截图。请结合图片中的文字与界面线索作答；"
            "若图片不够清晰，明确指出还需要哪些信息。"
        )

    api_messages: list[dict] = [{"role": "system", "content": system}]
    pending_images = list(images or [])
    last_index = len(messages) - 1
    for index, msg in enumerate(messages):
        role = msg["role"]
        content = msg["content"]
        if (
            index == last_index
            and role == "user"
            and pending_images
        ):
            api_messages.append(
                {
                    "role": "user",
                    "content": build_user_content_for_llm(str(content), pending_images),
                }
            )
        else:
            api_messages.append({"role": role, "content": content})

    async for token in call_llm_stream(api_messages):
        yield token
