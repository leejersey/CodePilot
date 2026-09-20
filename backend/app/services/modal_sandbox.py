"""Modal Sandbox runner for framework / LangChain-style Python demos."""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass

from app.core.config import get_settings

# Soft hints / legacy helpers only — course allow decisions live in package_candidates.
ALLOWED_PACKAGES = frozenset(
    {
        "langchain",
        "langchain-core",
        "langchain-community",
        "langchain-openai",
        "langchain-text-splitters",
        "langchain-deepseek",
        "langsmith",
        "openai",
        "httpx",
        "requests",
        "pydantic",
        "fastapi",
        "uvicorn",
        "numpy",
        "pandas",
        "python-dotenv",
    }
)

_PKG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.+-]*$")
_IMPORT_RE = re.compile(
    r"^\s*(?:from|import)\s+([a-zA-Z0-9_][a-zA-Z0-9_]*)",
    re.MULTILINE,
)
# init_chat_model("provider:model") — provider is not an import
_CHAT_PROVIDER_RE = re.compile(
    r"""init_chat_model\s*\(\s*['"]([a-zA-Z0-9_-]+):""",
)

# top-level import name → pip package (when different)
_IMPORT_TO_PACKAGE = {
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

_CHAT_PROVIDER_TO_PACKAGE = {
    "deepseek": "langchain-deepseek",
    "openai": "langchain-openai",
}


class ModalUnavailable(Exception):
    """Modal is not configured or the SDK call failed."""


@dataclass
class ModalRunResult:
    stdout: str
    stderr: str
    exit_code: int
    status: str


def detect_packages_from_code(code: str) -> list[str]:
    """Pick allow-listed pip packages referenced by imports or chat providers."""
    found: list[str] = []
    seen: set[str] = set()

    def _add(pkg: str | None) -> None:
        if not pkg or pkg in seen:
            return
        seen.add(pkg)
        found.append(pkg)

    for match in _IMPORT_RE.finditer(code or ""):
        _add(_IMPORT_TO_PACKAGE.get(match.group(1)))
    for match in _CHAT_PROVIDER_RE.finditer(code or ""):
        _add(_CHAT_PROVIDER_TO_PACKAGE.get(match.group(1).lower()))
    return found


def normalize_packages(packages: list[str] | None) -> list[str]:
    """Legacy helper: sanitize + require membership in ALLOWED_PACKAGES."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in packages or []:
        name = (raw or "").strip().lower().split("==")[0].split(">=")[0].split("<=")[0]
        name = name.strip()
        if not name or name in seen:
            continue
        if not _PKG_RE.match(name) or name not in ALLOWED_PACKAGES:
            raise ValueError(f"不允许安装依赖: {raw}")
        seen.add(name)
        out.append(name)
    if len(out) > 8:
        raise ValueError("一次最多安装 8 个白名单依赖")
    return out


def sanitize_install_packages(packages: list[str] | None) -> list[str]:
    """Sanitize a pre-validated install list (no ALLOWED_PACKAGES gate)."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in packages or []:
        name = (raw or "").strip().lower().split("==")[0].split(">=")[0].split("<=")[0]
        name = name.strip()
        if not name or name in seen:
            continue
        if not _PKG_RE.match(name):
            raise ValueError(f"不允许安装依赖: {raw}")
        seen.add(name)
        out.append(name)
    if len(out) > 8:
        raise ValueError("一次最多安装 8 个白名单依赖")
    return out


def resolve_packages(code: str, packages: list[str] | None = None) -> list[str]:
    """Merge explicit packages with imports detected in source (legacy allow-list)."""
    merged = list(packages or []) + detect_packages_from_code(code)
    return normalize_packages(merged)


def modal_configured() -> bool:
    settings = get_settings()
    return bool(settings.MODAL_TOKEN_ID.strip() and settings.MODAL_TOKEN_SECRET.strip())


def _ensure_modal_env() -> None:
    settings = get_settings()
    if not modal_configured():
        raise ModalUnavailable(
            "未配置 Modal：请在环境变量中设置 MODAL_TOKEN_ID 与 MODAL_TOKEN_SECRET"
        )
    os.environ["MODAL_TOKEN_ID"] = settings.MODAL_TOKEN_ID.strip()
    os.environ["MODAL_TOKEN_SECRET"] = settings.MODAL_TOKEN_SECRET.strip()


def _run_python_sync(
    code: str,
    packages: list[str],
    env_vars: dict[str, str] | None = None,
) -> ModalRunResult:
    _ensure_modal_env()
    try:
        import modal
    except ImportError as exc:
        raise ModalUnavailable("未安装 modal 包，请在 backend 执行 pip install modal") from exc

    settings = get_settings()
    image = modal.Image.debian_slim(python_version="3.11")
    if packages:
        image = image.pip_install(*packages)

    # Learner-provided secrets only (e.g. from editor `.env` tab). No platform key.
    env: dict[str, str] = {k: v for k, v in (env_vars or {}).items() if v is not None}

    app = modal.App.lookup(settings.MODAL_APP_NAME, create_if_missing=True)
    sandbox = modal.Sandbox.create(
        app=app,
        image=image,
        timeout=settings.MODAL_SANDBOX_TIMEOUT_SECONDS,
        env=env or None,
    )
    try:
        sandbox.filesystem.write_text(code, "/tmp/main.py")
        if env:
            # Also write .env so `python-dotenv` / manual file reads work in demos.
            dotenv_body = "\n".join(f"{k}={v}" for k, v in env.items()) + "\n"
            sandbox.filesystem.write_text(dotenv_body, "/tmp/.env")
        process = sandbox.exec(
            "python",
            "/tmp/main.py",
            timeout=settings.MODAL_EXEC_TIMEOUT_SECONDS,
            env=env or None,
            workdir="/tmp",
        )
        stdout = process.stdout.read() if process.stdout is not None else ""
        stderr = process.stderr.read() if process.stderr is not None else ""
        process.wait()
        exit_code = int(getattr(process, "returncode", None) or 0)
        status = "Finished" if exit_code == 0 else f"Exit {exit_code}"
        return ModalRunResult(
            stdout=str(stdout or ""),
            stderr=str(stderr or ""),
            exit_code=exit_code,
            status=status,
        )
    finally:
        try:
            sandbox.terminate()
        except Exception:
            pass


async def run_python_in_modal(
    code: str,
    packages: list[str] | None = None,
    env_vars: dict[str, str] | None = None,
) -> ModalRunResult:
    """Run Python in Modal. ``packages`` must already be course-allowlisted.

    Does not re-merge code imports against ALLOWED_PACKAGES; callers (run-modal)
    pass ``detected ∩ effective`` after server-side validation.
    """
    pkgs = sanitize_install_packages(packages)
    return await asyncio.to_thread(_run_python_sync, code, pkgs, env_vars)
