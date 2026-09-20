from app.services.learning_docs import build_handout_stages


LONG_TAIL = "TAIL_MARKER_" + ("Z" * 80)


def _long_doc() -> str:
    body = "这是模块化与可组合的详细展开。" * 40
    return (
        "# LangChain 实战\n\n"
        "## 核心思想\n\n"
        "LangChain 的核心思想是模块化 + 可组合。\n\n"
        f"{body}\n\n"
        "## 完整示例\n\n"
        f"这里是后半段全文，不应被截断。{LONG_TAIL}\n"
    )


def test_handout_keeps_full_document_instead_of_excerpt():
    stages = build_handout_stages(
        chapter_title="Chain 与 LCEL 编排",
        chapter_summary="本章讲 LCEL。",
        documents=[("langchain.md", _long_doc())],
    )
    joined = "\n".join(stage["content"] for stage in stages)

    assert LONG_TAIL in joined
    assert "全文请切换" not in joined
    assert "知识库原文" not in joined
    assert any("核心思想" in stage["title"] or "核心思想" in stage["content"] for stage in stages)
    assert any("完整示例" in stage["title"] or "完整示例" in stage["content"] for stage in stages)


def test_handout_intro_does_not_point_to_knowledge_base_original():
    stages = build_handout_stages(
        chapter_title="Chain 与 LCEL 编排",
        chapter_summary="本章讲 LCEL 与 Runnable。",
        documents=[],
    )
    joined = "\n".join(stage["content"] for stage in stages)
    assert "知识库原文" not in joined
    assert "本章讲 LCEL 与 Runnable。" in joined
