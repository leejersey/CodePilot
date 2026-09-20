"""Parse learner-provided .env content into safe environment variables."""

from __future__ import annotations

import re

_LINE_RE = re.compile(
    r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$"
)
_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")

# Block shell / runtime overrides even if they match KEY_RE.
_BLOCKED_KEYS = frozenset(
    {
        "PATH",
        "PYTHONPATH",
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "HOME",
        "USER",
        "SHELL",
        "PWD",
        "TMPDIR",
        "TEMP",
        "TMP",
        "MODAL_TOKEN_ID",
        "MODAL_TOKEN_SECRET",
    }
)

MAX_ENV_VARS = 20
MAX_VALUE_LEN = 2000


def parse_dotenv(content: str) -> dict[str, str]:
    """Parse KEY=VALUE lines; ignore comments/blank; strip optional quotes."""
    out: dict[str, str] = {}
    for raw in (content or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _LINE_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        if (
            not _KEY_RE.match(key)
            or key in _BLOCKED_KEYS
            or key.startswith("MODAL_")
        ):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if len(value) > MAX_VALUE_LEN:
            raise ValueError(f".env 变量 {key} 过长（最多 {MAX_VALUE_LEN} 字符）")
        out[key] = value
        if len(out) > MAX_ENV_VARS:
            raise ValueError(f".env 最多 {MAX_ENV_VARS} 个变量")
    return out
