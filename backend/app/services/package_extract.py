"""Extract pip package candidates from Python course source."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass

_IMPORT_RE = re.compile(
    r"^\s*(?:from|import)\s+([a-zA-Z0-9_][a-zA-Z0-9_]*)",
    re.MULTILINE,
)
_CHAT_PROVIDER_RE = re.compile(
    r"""init_chat_model\s*\(\s*['"]([a-zA-Z0-9_-]+):""",
)

STDLIB = frozenset(sys.stdlib_module_names)

# top-level import name → pip package (when different)
_IMPORT_ALIASES: dict[str, str] = {
    "langchain": "langchain",
    "langchain_core": "langchain-core",
    "langchain_community": "langchain-community",
    "langchain_openai": "langchain-openai",
    "langchain_text_splitters": "langchain-text-splitters",
    "langchain_deepseek": "langchain-deepseek",
    "langsmith": "langsmith",
    "openai": "openai",
    "httpx": "httpx",
    "requests": "requests",
    "pydantic": "pydantic",
    "fastapi": "fastapi",
    "uvicorn": "uvicorn",
    "numpy": "numpy",
    "pandas": "pandas",
    "dotenv": "python-dotenv",
}

_PROVIDER_ALIASES: dict[str, str] = {
    "deepseek": "langchain-deepseek",
    "openai": "langchain-openai",
}


@dataclass(frozen=True)
class PackageRef:
    name: str
    source: str  # "import" | "provider"


def _import_to_package(top: str) -> str | None:
    if top in STDLIB:
        return None
    if top in _IMPORT_ALIASES:
        return _IMPORT_ALIASES[top]
    return top.replace("_", "-")


def _provider_to_package(provider: str) -> str:
    key = provider.lower()
    if key in _PROVIDER_ALIASES:
        return _PROVIDER_ALIASES[key]
    return f"langchain-{key}"


def extract_package_refs(code: str) -> list[PackageRef]:
    """Return deduplicated pip package refs from imports and chat providers."""
    seen: set[str] = set()
    refs: list[PackageRef] = []

    def add(name: str | None, source: str) -> None:
        if not name or name in seen:
            return
        seen.add(name)
        refs.append(PackageRef(name=name, source=source))

    for match in _IMPORT_RE.finditer(code or ""):
        add(_import_to_package(match.group(1)), "import")

    for match in _CHAT_PROVIDER_RE.finditer(code or ""):
        add(_provider_to_package(match.group(1)), "provider")

    return refs
