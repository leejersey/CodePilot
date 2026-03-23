"""对话管理服务 — 架构文档 5.5 services/chat.py"""

from app.services.llm import call_llm_stream


SYSTEM_PROMPT = """你是 CodePilot AI，一位热情且专业的编程导师。你的职责是：
1. 用清晰、通俗的语言讲解编程概念
2. 提供代码示例并解释关键细节
3. 鼓励用户动手实践
4. 回答以 Markdown 格式输出，包含代码块和重点标注

保持友善、耐心的教学风格。"""


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
