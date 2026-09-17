from app.services.chat import detect_language_from_context, detect_language_hint
from app.services.kb_retrieve import is_kb_relevant_to_topic


def test_frontend_languages_are_detected():
    assert detect_language_hint("HTML 页面结构") == "html"
    assert detect_language_hint("CSS 样式") == "css"
    assert detect_language_hint("前端入门") == "javascript"


def test_chapter_language_overrides_broad_path_topic():
    assert (
        detect_language_from_context(
            topic="前端入门",
            chapter_title="3. JavaScript — 让页面动起来",
            chapter_summary="DOM 与事件",
        )
        == "javascript"
    )
    assert (
        detect_language_from_context(
            topic="全栈开发",
            chapter_title="Python 核心语法",
            chapter_summary=None,
        )
        == "python"
    )


def test_mixed_frontend_knowledge_base_matches_frontend_path():
    assert is_kb_relevant_to_topic(
        "前端入门",
        kb_name="前端入门",
        filenames=[
            "第一章-HTML.md",
            "第二章-CSS.md",
            "第三章-JavaScript.md",
            "第四章-Vue.md",
        ],
    )
    assert not is_kb_relevant_to_topic(
        "前端入门",
        kb_name="Python基础",
        filenames=["Python 核心语法.md", "FastAPI 开发.md"],
    )
