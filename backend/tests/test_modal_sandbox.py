"""Unit tests for Modal package allow-list (no live Modal calls)."""

import pytest

from app.services.modal_sandbox import detect_packages_from_code, normalize_packages, resolve_packages


def test_normalize_packages_allowlist():
    assert normalize_packages(["LangChain", "openai"]) == ["langchain", "openai"]


def test_normalize_packages_rejects_unknown():
    with pytest.raises(ValueError, match="不允许安装"):
        normalize_packages(["malicious-pkg"])


def test_normalize_packages_caps_count():
    pkgs = [
        "langchain",
        "langchain-core",
        "openai",
        "httpx",
        "requests",
        "pydantic",
        "fastapi",
        "uvicorn",
        "numpy",
    ]
    with pytest.raises(ValueError, match="最多安装"):
        normalize_packages(pkgs)


def test_detect_httpx_import():
    code = "import httpx\nimport os\n"
    assert detect_packages_from_code(code) == ["httpx"]


def test_detect_dotenv_import():
    code = "from dotenv import load_dotenv\nimport os\n"
    assert detect_packages_from_code(code) == ["python-dotenv"]


def test_detect_langchain_deepseek_provider_string():
    code = (
        'from langchain.chat_models import init_chat_model\n'
        'llm = init_chat_model("deepseek:deepseek-chat")\n'
    )
    assert detect_packages_from_code(code) == ["langchain", "langchain-deepseek"]


def test_detect_langchain_deepseek_import():
    code = "from langchain_deepseek import ChatDeepSeek\n"
    assert detect_packages_from_code(code) == ["langchain-deepseek"]


def test_resolve_packages_merges_imports():
    code = "import httpx\nfrom openai import OpenAI\n"
    assert resolve_packages(code, []) == ["httpx", "openai"]
