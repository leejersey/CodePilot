"""练习判题服务 — 支持独立练习中心"""

import json
from app.services.llm import call_llm_json


async def generate_exercise(
    language: str = "python",
    difficulty: str = "medium",
    topic: str = "",
    chapter_hint: str = "",
    kb_context: str = "",
) -> dict:
    """调用 LLM 生成编程练习题（支持按语言/主题/知识库出题）"""

    topic_hint = f"\n主题方向: {topic}" if topic else ""
    chapter_section = f"\n关联章节: {chapter_hint}" if chapter_hint else ""

    kb_section = ""
    if kb_context:
        kb_section = f"""

【重要】用户已绑定知识库。你必须依据知识库资料出题，而不是出一套与资料无关的通用题。
要求：
1. 题目场景、知识点、变量/函数命名尽量来自知识库内容
2. description 中可点名相关概念或阶段（如文档中的章节名）
3. starter_code 与 test_cases 要贴合知识库中的写法与难度，不要另起一套无关考题

知识库资料如下：
{kb_context}
"""

    prompt = f"""你是一位编程教育专家。请生成一道 {language} 语言的编程练习题。

难度: {difficulty}{topic_hint}{chapter_section}
{kb_section}
要求：
1. 题目应当有真实场景背景，不要出过于抽象的题。
2. starter_code 里要体现 {language} 语言的特征和最佳实践。
3. test_cases 需要包含至少 2 个公开用例和 1 个隐藏用例。
4. tags 用于分类，如 ["并发", "网络编程"]。

请以纯 JSON 格式返回以下结构：
{{
  "title": "题目标题",
  "description": "# 题目描述\\n\\n使用 Markdown 格式的详细描述...",
  "starter_code": "# 初始代码模板\\ndef solution():\\n    pass",
  "test_cases": [
    {{"input": "输入示例", "expected": "期望输出", "hidden": false}},
    {{"input": "输入示例2", "expected": "期望输出2", "hidden": false}},
    {{"input": "隐藏测试", "expected": "期望输出", "hidden": true}}
  ],
  "tags": ["标签1", "标签2"]
}}"""

    return await call_llm_json(prompt, temperature=0.7)


async def judge_submission(description: str, test_cases: list | None, code: str, language: str = "python") -> dict:
    """调用 LLM 对提交的代码进行 AI 判题"""
    prompt = f"""你是一位编程教育专家和代码审查员。请判断以下代码是否正确解决了题目。

## 题目描述
{description}

## 测试用例
{json.dumps(test_cases or [], ensure_ascii=False)}

## 用户提交的代码 ({language})
```{language}
{code}
```

请以纯 JSON 格式返回判题结果：
{{
  "result": "pass 或 fail 或 error",
  "score": <0-100的评分>,
  "test_results": [
    {{"case": 1, "passed": true/false}},
    ...
  ],
  "ai_feedback": "详细的 Markdown 格式反馈，包括代码优缺点和改进建议"
}}"""

    return await call_llm_json(prompt, temperature=0.3)
