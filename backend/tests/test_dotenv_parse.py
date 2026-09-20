"""Tests for learner .env parsing."""

import pytest

from app.services.dotenv_parse import parse_dotenv


def test_parse_dotenv_basic():
    text = """
# comment
DEEPSEEK_API_KEY=sk-test
OPENAI_API_KEY="quoted"
EMPTY=
"""
    env = parse_dotenv(text)
    assert env["DEEPSEEK_API_KEY"] == "sk-test"
    assert env["OPENAI_API_KEY"] == "quoted"
    assert env["EMPTY"] == ""


def test_parse_dotenv_blocks_path():
    env = parse_dotenv("PATH=/evil\nDEEPSEEK_API_KEY=ok\n")
    assert "PATH" not in env
    assert env["DEEPSEEK_API_KEY"] == "ok"


def test_parse_dotenv_rejects_huge_value():
    with pytest.raises(ValueError, match="过长"):
        parse_dotenv("DEEPSEEK_API_KEY=" + ("x" * 3000))
