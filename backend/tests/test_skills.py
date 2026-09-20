"""Unit tests for skill outline normalization and unlock helpers."""

from app.services.skills import normalize_skills_from_chapter_item


def test_normalize_skills_from_llm_list():
    item = {
        "title": "变量与类型",
        "summary": "章概述",
        "skills": [
            {"title": "声明变量", "goal": "能声明并打印变量", "objectives": ["会用 int", ""]},
            {"title": "类型转换", "goal": "理解强转"},
            {"title": "  ", "goal": "跳过空标题"},
            {"title": "字符串基础"},
            {"title": "列表入门"},
            {"title": "字典入门"},
            {"title": "超出上限应被截断"},
        ],
    }
    skills = normalize_skills_from_chapter_item(item)
    assert len(skills) == 6
    assert skills[0]["sort_order"] == 1
    assert skills[0]["title"] == "声明变量"
    assert skills[0]["objectives"] == ["会用 int"]
    assert skills[4]["title"] == "字典入门"
    assert skills[-1]["title"] == "超出上限应被截断"


def test_normalize_skills_fallback_from_chapter():
    skills = normalize_skills_from_chapter_item(
        {"title": "异步入门", "summary": "学会 async/await"},
        chapter_title="异步入门",
    )
    assert len(skills) == 1
    assert skills[0]["title"] == "异步入门"
    assert "async" in (skills[0]["goal"] or "").lower() or "异步" in (skills[0]["goal"] or "")


def test_normalize_skills_empty_skills_array_falls_back():
    skills = normalize_skills_from_chapter_item(
        {"title": "空技能章", "summary": "", "skills": []},
    )
    assert len(skills) == 1
    assert skills[0]["title"] == "空技能章"
