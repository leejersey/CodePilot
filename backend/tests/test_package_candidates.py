from uuid import uuid4

from app.services.package_candidates import (
    HARD_DENYLIST,
    KNOWN_SAFE_HINTS,
    aggregate_candidates,
    approved_names,
    effective_packages,
    merge_status,
    package_status_lookup,
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
