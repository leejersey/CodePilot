from uuid import uuid4

from app.services.package_candidates import (
    HARD_DENYLIST,
    KNOWN_SAFE_HINTS,
    aggregate_candidates,
    approved_names,
    build_chapter_refs_from_texts,
    effective_packages,
    merge_status,
    package_status_lookup,
    refresh_path_package_lists,
    sanitize_name,
)


def test_aggregate_shared_and_unique():
    c1, c2, c3 = uuid4(), uuid4(), uuid4()
    path_c, chapter_c = aggregate_candidates(
        {
            c1: [("langchain", "import"), ("httpx", "import")],
            c2: [("langchain", "import"), ("python-dotenv", "import")],
            c3: [("numpy", "import")],
        }
    )
    path_names = {x["name"] for x in path_c}
    assert path_names == {"langchain"}  # in ≥2 chapters
    assert {x["name"] for x in chapter_c[c1]} == {"httpx"}
    assert {x["name"] for x in chapter_c[c2]} == {"python-dotenv"}
    assert {x["name"] for x in chapter_c[c3]} == {"numpy"}


def test_aggregate_preserves_provider_source():
    c1 = uuid4()
    path_c, _ = aggregate_candidates({c1: [("langchain-deepseek", "provider")]})
    assert path_c[0]["source"] == "provider"


def test_merge_drops_missing():
    assert (
        merge_status(
            [{"name": "httpx", "status": "approved", "source": "import"}],
            [],
        )
        == []
    )


def test_aggregate_single_chapter_all_on_path():
    c1 = uuid4()
    path_c, chapter_c = aggregate_candidates(
        {c1: [("langchain", "import"), ("httpx", "import")]}
    )
    assert {x["name"] for x in path_c} == {"langchain", "httpx"}
    assert chapter_c[c1] == []


def test_merge_keeps_approved():
    old = [{"name": "httpx", "status": "approved", "source": "import"}]
    new = [
        {"name": "httpx", "status": "pending", "source": "import"},
        {"name": "numpy", "status": "pending", "source": "import"},
    ]
    merged = merge_status(old, new)
    assert {x["name"]: x["status"] for x in merged} == {
        "httpx": "approved",
        "numpy": "pending",
    }


def test_effective_union():
    path = [{"name": "langchain", "status": "approved", "source": "import"}]
    ch = [
        {"name": "httpx", "status": "approved", "source": "import"},
        {"name": "evil", "status": "pending", "source": "import"},
    ]
    assert effective_packages(path, ch) == ["langchain", "httpx"]


def test_approved_names():
    candidates = [
        {"name": "httpx", "status": "approved", "source": "import"},
        {"name": "numpy", "status": "pending", "source": "import"},
    ]
    assert approved_names(candidates) == ["httpx"]


def test_package_status_lookup():
    path = [{"name": "langchain", "status": "approved", "source": "import"}]
    ch = [{"name": "httpx", "status": "pending", "source": "import"}]
    assert package_status_lookup(path, ch) == {
        "langchain": "approved",
        "httpx": "pending",
    }


def test_known_safe_hints_matches_teaching_allowlist():
    assert "langchain" in KNOWN_SAFE_HINTS
    assert "python-dotenv" in KNOWN_SAFE_HINTS
    assert "langchain-deepseek" in KNOWN_SAFE_HINTS


def test_hard_denylist_empty_phase1():
    assert HARD_DENYLIST == frozenset()


def test_sanitize_name_normalizes():
    assert sanitize_name("  LangChain==0.1 ") == "langchain"


def test_sanitize_name_rejects_invalid():
    assert sanitize_name("not valid!") is None
    assert sanitize_name("") is None


def test_merge_preserves_reason_when_keeping_status():
    old = [
        {
            "name": "httpx",
            "status": "rejected",
            "source": "import",
            "reason": "not needed",
        }
    ]
    new = [{"name": "httpx", "status": "pending", "source": "import"}]
    merged = merge_status(old, new)
    assert merged == [
        {
            "name": "httpx",
            "status": "rejected",
            "source": "import",
            "reason": "not needed",
        }
    ]


def test_build_chapter_refs_from_texts_extracts_imports():
    c1, c2 = uuid4(), uuid4()
    refs = build_chapter_refs_from_texts(
        {
            c1: "import httpx\nfrom dotenv import load_dotenv\n",
            c2: 'init_chat_model("deepseek:deepseek-chat")\n',
        }
    )
    assert refs[c1] == [("httpx", "import"), ("python-dotenv", "import")]
    assert refs[c2] == [("langchain-deepseek", "provider")]


def test_refresh_path_package_lists_merges_status():
    c1, c2 = uuid4(), uuid4()
    path_old = [
        {"name": "langchain", "status": "approved", "source": "import"},
    ]
    chapter_old = {
        c1: [
            {
                "name": "httpx",
                "status": "rejected",
                "source": "import",
                "reason": "not needed",
            },
            {"name": "numpy", "status": "approved", "source": "import"},
        ],
    }
    chapter_to_refs = {
        c1: [("langchain", "import"), ("httpx", "import")],
        c2: [("langchain", "import"), ("python-dotenv", "import")],
    }
    merged_path, merged_chapters = refresh_path_package_lists(
        path_old, chapter_old, chapter_to_refs
    )
    by_name = {x["name"]: x for x in merged_path}
    assert by_name["langchain"]["status"] == "approved"
    assert {x["name"] for x in merged_chapters[c1]} == {"httpx"}
    assert merged_chapters[c1][0]["status"] == "rejected"
    assert merged_chapters[c1][0]["reason"] == "not needed"
    assert {x["name"] for x in merged_chapters[c2]} == {"python-dotenv"}
    assert all(x["name"] != "numpy" for x in merged_chapters[c1])


def test_refresh_empty_refs_clears_candidates():
    c1 = uuid4()
    merged_path, merged_chapters = refresh_path_package_lists(
        [{"name": "httpx", "status": "approved", "source": "import"}],
        {c1: [{"name": "numpy", "status": "pending", "source": "import"}]},
        {c1: []},
    )
    assert merged_path == []
    assert merged_chapters[c1] == []


def test_collect_chapter_scan_text_includes_outline_skills_exercises():
    from app.services.package_candidates import collect_chapter_scan_text

    text = collect_chapter_scan_text(
        outline_chapter={
            "title": "HTTP",
            "summary": "Use httpx",
            "skills": [{"teach_prompt": "import httpx"}],
        },
        skills=[
            {
                "teach_prompt": "from dotenv import load_dotenv",
                "goal": "load env",
                "objectives": ["import os", "use dotenv"],
            }
        ],
        exercises=[
            {
                "starter_code": "import numpy as np\n",
                "description": "Compute with numpy",
            }
        ],
    )
    assert "httpx" in text
    assert "dotenv" in text
    assert "numpy" in text
    assert "load env" in text


def test_apply_package_refresh_sets_candidates_on_fakes():
    from types import SimpleNamespace

    from app.services.package_candidates import apply_package_refresh

    c1, c2 = uuid4(), uuid4()
    path = SimpleNamespace(
        outline={
            "chapters": [
                {"order": 1, "title": "A", "summary": "import httpx"},
                {"order": 2, "title": "B", "summary": "import httpx\nimport numpy"},
            ]
        },
        package_candidates=[],
    )
    ch1 = SimpleNamespace(id=c1, sort_order=1, title="A", package_candidates=[])
    ch2 = SimpleNamespace(id=c2, sort_order=2, title="B", package_candidates=[])
    apply_package_refresh(
        path,
        [ch1, ch2],
        chapter_skills={
            c1: [SimpleNamespace(teach_prompt="import httpx", goal=None, objectives=None)],
            c2: [
                SimpleNamespace(
                    teach_prompt="import httpx\nimport numpy",
                    goal=None,
                    objectives=None,
                )
            ],
        },
    )
    assert {x["name"] for x in path.package_candidates} == {"httpx"}
    assert {x["name"] for x in ch2.package_candidates} == {"numpy"}
    assert ch1.package_candidates == []
