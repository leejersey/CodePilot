"""练习判题服务 — 支持独立练习中心"""

import json
from app.services.llm import call_llm_json
from app.services.judge0 import JudgeUnavailable, run_test_cases


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
3. starter_code、reference_solution 与 test_cases 要贴合知识库中的写法与难度，不要另起一套无关考题

知识库资料如下：
{kb_context}
"""

    prompt = f"""你是一位编程教育专家。请生成一道 {language} 语言的编程练习题。

难度: {difficulty}{topic_hint}{chapter_section}
{kb_section}
要求：
1. 题目应当有真实场景背景，不要出过于抽象的题。
2. starter_code 里要体现 {language} 语言的特征和最佳实践。
3. 程序必须从标准输入读取、向标准输出写结果，不使用交互提示文字。
4. test_cases 需要包含至少 2 个公开用例和 1 个隐藏用例，input 是完整 stdin，expected 是完整 stdout。
5. reference_solution 必须是可独立运行并通过全部 test_cases 的完整程序。
6. tags 用于分类，如 ["并发", "网络编程"]。

请以纯 JSON 格式返回以下结构：
{{
  "title": "题目标题",
  "description": "# 题目描述\\n\\n使用 Markdown 格式的详细描述...",
  "starter_code": "# 初始代码模板\\ndef solution():\\n    pass",
  "reference_solution": "# 可独立运行的完整标准答案",
  "test_cases": [
    {{"input": "输入示例", "expected": "期望输出", "hidden": false}},
    {{"input": "输入示例2", "expected": "期望输出2", "hidden": false}},
    {{"input": "隐藏测试", "expected": "期望输出", "hidden": true}}
  ],
  "tags": ["标签1", "标签2"]
}}"""

    return await call_llm_json(
        prompt, temperature=0.7, request_type="exercise_generate"
    )


async def judge_submission(description: str, test_cases: list | None, code: str, language: str = "python") -> dict:
    """通过 Judge0 真实执行，LLM 只解释已确定的运行结果。"""
    cases = list(test_cases or [])
    try:
        judgement = await run_test_cases(code, language, cases)
        judgement["trusted"] = True
        judgement["judge_source"] = "judge0"
    except JudgeUnavailable:
        fallback_prompt = f"""远程代码沙箱当前不可用。请临时评估代码是否通过测试。
该结果只用于提示，必须返回纯 JSON：
{{
  "result": "pass 或 fail 或 error",
  "score": 0到100,
  "test_results": [{{"case": 1, "passed": true}}],
  "ai_feedback": "说明这是临时评估，并给出代码建议"
}}

题目：{description}
语言：{language}
测试：{json.dumps(cases, ensure_ascii=False)}
代码：
```{language}
{code}
```"""
        raw = await call_llm_json(
            fallback_prompt, temperature=0.1, request_type="judge_fallback"
        )
        raw_results = raw.get("test_results") if isinstance(raw.get("test_results"), list) else []
        sanitized = []
        for index, case in enumerate(cases):
            item = raw_results[index] if index < len(raw_results) and isinstance(raw_results[index], dict) else {}
            sanitized.append({
                "case": index + 1,
                "passed": bool(item.get("passed")),
                "hidden": bool(case.get("hidden")),
                "status": "LLM 临时评估",
            })
        result = raw.get("result") if raw.get("result") in {"pass", "fail", "error"} else "error"
        return {
            "result": result,
            "score": max(0, min(100, int(raw.get("score") or 0))),
            "test_results": sanitized,
            "ai_feedback": raw.get("ai_feedback") or "远程判题不可用，这是 LLM 临时评估结果。",
            "trusted": False,
            "judge_source": "llm",
        }
    prompt = f"""你是一位编程教育专家。请根据已经由真实沙箱确定的测试结果给出简短反馈，不得改变判题结论。

## 题目描述
{description}

## 真实测试结果
{json.dumps(judgement, ensure_ascii=False)}

## 用户提交的代码 ({language})
```{language}
{code}
```

请以纯 JSON 格式返回：
{{
  "ai_feedback": "简短的 Markdown 反馈，包括错误方向和改进建议"
}}"""

    try:
        feedback = await call_llm_json(
            prompt, temperature=0.2, request_type="judge_feedback"
        )
        judgement["ai_feedback"] = feedback.get("ai_feedback", "")
    except Exception:
        judgement["ai_feedback"] = "判题已完成，请根据测试点状态检查输入输出与边界条件。"
    return judgement
