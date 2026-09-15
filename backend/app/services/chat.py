"""对话管理服务 — 架构文档 5.5 services/chat.py"""

import re

from app.services.llm import call_llm_stream


SYSTEM_PROMPT = """你是 CodePilot AI，一位热情且专业的编程导师。你的职责是：
1. 用清晰、通俗的语言讲解编程概念
2. 提供代码示例并解释关键细节
3. 鼓励用户动手实践
4. 回答以 Markdown 格式输出，包含代码块和重点标注

语言约束（必须遵守）：
- 代码示例、术语与练习必须以「当前学习路径」指定的编程语言为准
- 不要询问用户使用哪种语言；路径主题已决定语言
- 不要擅自切换到其他语言（例如路径是 Python 时禁止用 Java/C++ 举例），除非用户明确要求切换
- 代码块语言标记必须与路径语言一致（如 ```python）

知识库约束（必须遵守）：
- 若上下文中提供了「知识库检索结果」或知识库资料，教学必须以这些资料为主线
- 讲解顺序、阶段划分、示例风格尽量贴合知识库原文，不要擅自改成另一套通用课程大纲
- 引用知识库内容时标注来源文件名；不要编造知识库中不存在的具体条文
- 仅当检索结果明显不足时，才可少量补充通用说明，并明确这是补充而非知识库原文

保持友善、耐心的教学风格。"""


def detect_language_hint(text: str) -> str | None:
    """从文本推断编程语言；无法判断时返回 None（不默认 python）。"""
    t = (text or "").lower()
    if any(
        k in t
        for k in (
            "javascript",
            "typescript",
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
    if any(k in t for k in ("python", "django", "flask", "fastapi", "pytest", "pyodide")):
        return "python"
    return None


def detect_language_from_topic(topic: str) -> str:
    """从学习路径主题推断编程语言，默认 python。"""
    return detect_language_hint(topic) or "python"


async def stream_chat_response(messages: list[dict], chapter_context: str | None = None):
    """
    构建完整的 LLM 消息上下文并流式返回 AI 回复。

    Args:
        messages: 历史消息列表 [{"role": "user/assistant", "content": "..."}]
        chapter_context: 当前章节上下文（可选）

    Yields:
        str: 逐 token 的文本内容
    """
    system = SYSTEM_PROMPT
    if chapter_context:
        system += f"\n\n当前学习章节上下文：{chapter_context}"

    api_messages = [{"role": "system", "content": system}]
    for msg in messages:
        api_messages.append({"role": msg["role"], "content": msg["content"]})

    async for token in call_llm_stream(api_messages):
        yield token
