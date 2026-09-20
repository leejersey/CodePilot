# Configurable Sandbox Providers — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per active editor tab, route LangChain-style code to cloud run using the learner’s own Modal credentials from个人中心; hide unsuitable run buttons; keep chapter `.env` separate from provider keys.

**Architecture:** Add pure resolution helpers (`resolveTabExecution` + `pickCloudProvider`). Store Modal BYOK + default provider on `User.preferences.sandbox` (same JSONB pattern as LLM profiles). Adapt Modal runner to accept per-request tokens (no platform env for learner runs). Learn page drives a button matrix from the active tab.

**Tech Stack:** FastAPI, User.preferences JSONB, Next.js settings routes, existing Modal sandbox + package allowlist

**Spec:** `docs/superpowers/specs/2026-09-20-configurable-sandbox-providers-design.md` (Phase A only; B/C deferred at end)

---

## File map (Phase A)

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/tabRuntime.ts` | Tag + heuristic → mode; cloud provider pick |
| `frontend/src/lib/languageRuntime.ts` | Keep Sandpack/web/pyodide helpers; call into or share with `tabRuntime` |
| `frontend/src/lib/tabRuntime.test.ts` | Resolution matrix tests |
| `backend/app/api/v1/settings.py` | Add `/settings/sandbox` GET/PUT (or nested under settings) |
| `frontend/src/app/settings/sandbox/page.tsx` | Modal id+secret + default provider UI |
| `frontend/src/components/settings/SettingsNav.tsx` | Nav item |
| `frontend/src/lib/api.ts` | Sandbox settings + cloud run client |
| `backend/app/services/modal_sandbox.py` | Accept user token id/secret; stop learner use of platform env |
| `backend/app/api/v1/code.py` | Load user Modal creds; 422 if missing |
| `frontend/src/app/learn/.../page.tsx` | Button matrix from active tab |
| `backend/tests/test_sandbox_settings.py` | Settings API |
| `backend/tests/test_run_modal_byok.py` | BYOK required |

---

### Task 1: Tab runtime resolution (frontend pure helpers)

**Files:**
- Create: `frontend/src/lib/tabRuntime.ts`
- Test: `frontend/src/lib/tabRuntime.test.ts`
- Optionally thin-wrap from `languageRuntime.ts` (do not break existing `executionModeForLanguage` callers until Task 5)

- [ ] **Step 1: Write failing tests** (use `node:test`, same as `languageRuntime.test.ts`)

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { pickCloudProvider, resolveTabExecution } from "./tabRuntime.ts";

test("tag wins over heuristics", () => {
  assert.equal(
    resolveTabExecution({
      language: "python",
      code: "import langchain\n",
      tag: "browser",
    }).mode,
    "pyodide"
  );
});

test("langchain import → cloud", () => {
  assert.equal(
    resolveTabExecution({
      language: "python",
      code: "from langchain.chat_models import init_chat_model\n",
    }).mode,
    "cloud"
  );
});

test("vue → sandpack", () => {
  assert.equal(
    resolveTabExecution({ language: "vue", code: "<template></template>" }).mode,
    "sandpack"
  );
});

test("plain python → pyodide", () => {
  assert.equal(
    resolveTabExecution({ language: "python", code: "print(1)\n" }).mode,
    "pyodide"
  );
});

test("pickCloudProvider uses default when keyed", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "modal",
      modalConfigured: true,
      daytonaConfigured: false,
    }),
    "modal"
  );
});

test("pickCloudProvider uses sole keyed when default missing key", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: null,
      modalConfigured: true,
      daytonaConfigured: false,
    }),
    "modal"
  );
});

test("pickCloudProvider returns null when unmet", () => {
  assert.equal(
    pickCloudProvider({
      defaultProvider: "modal",
      modalConfigured: false,
      daytonaConfigured: false,
    }),
    null
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && node --experimental-strip-types --test src/lib/tabRuntime.test.ts`

- [ ] **Step 3: Implement `tabRuntime.ts`**

```typescript
export type RuntimeTag = "browser" | "sandpack" | "web" | "judge0" | "cloud";
export type ExecutionUiMode = "pyodide" | "sandpack" | "web" | "remote" | "cloud";

export function resolveTabExecution(input: {
  language: string;
  code: string;
  tag?: RuntimeTag | null;
}): { mode: ExecutionUiMode; tagApplied: boolean } {
  // 1) map tag → mode
  // 2) else: cloud heuristics (langchain|langgraph|init_chat_model)
  // 3) else: reuse sandpackTemplateFor / executionModeForLanguage from languageRuntime
}

export function pickCloudProvider(input: {
  defaultProvider: "modal" | "daytona" | null;
  modalConfigured: boolean;
  daytonaConfigured: boolean; // Phase A always false from settings
}): "modal" | "daytona" | null {
  // default-if-keyed → sole-keyed → null
}
```

Cloud heuristic helpers (keep in this file):

```typescript
export function looksLikeCloudFrameworkCode(code: string): boolean {
  return /\b(langchain|langgraph|init_chat_model)\b/.test(code);
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tabRuntime.ts frontend/src/lib/tabRuntime.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve editor-tab execution mode for cloud vs browser

EOF
)"
```

---

### Task 2: Sandbox settings API (Modal BYOK)

**Files:**
- Modify: `backend/app/api/v1/settings.py`
- Test: `backend/tests/test_sandbox_settings.py`

Store under `user.preferences["sandbox"]`:

```python
{
  "default_provider": "modal",  # Phase A only modal in writes
  "modal": {
    "token_id": "...",
    "token_secret": "...",  # never return raw in GET
  }
}
```

Follow LLM profile patterns: mask secrets, `has_modal_credentials: bool`, allow update with `keep_secret: true`.

- [ ] **Step 1: Failing handler-level tests** (pattern: `test_admin_path_packages.py` — fake `User` + call handlers; **no** HTTP `client` fixture)

```python
"""Sandbox settings stored on user.preferences['sandbox']."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import settings as settings_api


@pytest.fixture
def anyio_backend():
    return "asyncio"


def user_with_prefs(prefs=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role="learner",
        status="active",
        preferences=prefs if prefs is not None else {},
    )


class FakeDb:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True

    async def refresh(self, _obj):
        return None


@pytest.mark.asyncio
async def test_put_then_get_masks_secret():
    user = user_with_prefs()
    db = FakeDb()
    body = settings_api.SandboxSettingsUpdate(
        default_provider="modal",
        modal_token_id="ak-test",
        modal_token_secret="sk-secret",
        keep_modal_secret=False,
    )
    await settings_api.put_sandbox_settings(body, db=db, user=user)
    out = await settings_api.get_sandbox_settings(user=user)
    assert out.has_modal_credentials is True
    assert out.modal_token_id_masked  # masked, not raw
    assert "sk-secret" not in str(out.model_dump())


@pytest.mark.asyncio
async def test_put_rejects_daytona_default_phase_a():
    user = user_with_prefs()
    db = FakeDb()
    body = settings_api.SandboxSettingsUpdate(default_provider="daytona")  # type: ignore[arg-type]
    with pytest.raises((HTTPException, Exception)):
        await settings_api.put_sandbox_settings(body, db=db, user=user)
```

Wire handlers with the same `Depends` style as existing settings routes; if PUT validation uses Literal["modal"] only, the daytona case may be a Pydantic ValidationError at construction — assert that instead.

- [ ] **Step 2: Implement GET `/api/v1/settings/sandbox` + PUT `/api/v1/settings/sandbox`**

Schemas:

```python
class SandboxSettingsPublic(BaseModel):
    default_provider: Literal["modal"] | None
    has_modal_credentials: bool
    modal_token_id_masked: str | None

class SandboxSettingsUpdate(BaseModel):
    default_provider: Literal["modal"] | None = None
    modal_token_id: str | None = None
    modal_token_secret: str | None = None
    keep_modal_secret: bool = True
```

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: store learner Modal sandbox credentials in user settings

EOF
)"
```

---

### Task 3: Personal center `/settings/sandbox` UI

**Files:**
- Create: `frontend/src/app/settings/sandbox/page.tsx`
- Modify: `frontend/src/components/settings/SettingsNav.tsx`
- Modify: `frontend/src/lib/api.ts` (`getSandboxSettings`, `updateSandboxSettings`)
- Modify: `frontend/src/app/settings/page.tsx` if it redirects — ensure sandbox is reachable

- [ ] **Step 1: Add nav item**「沙箱配置」→ `/settings/sandbox` (icon e.g. `Cloud` from lucide)

- [ ] **Step 2: Page UI** (match LLM settings visual density)
  - Modal Token ID + Secret inputs
  - Show masked id / “已保存密钥” when `has_modal_credentials`
  - Default provider: Phase A fixed to Modal (read-only hint or single option)
  - Save button → PUT

- [ ] **Step 3: Manual smoke** — save → reload → still has credentials flag

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: personal-center UI for Modal sandbox BYOK

EOF
)"
```

---

### Task 4: Modal run uses user credentials (BYOK)

**Files:**
- Modify: `backend/app/services/modal_sandbox.py`
- Modify: `backend/app/api/v1/code.py`
- Test: `backend/tests/test_run_modal_byok.py` (and adjust `test_run_modal_packages.py` as needed)

- [ ] **Step 1: Failing / update existing tests**
  - New file `test_run_modal_byok.py`:
    - User `preferences` without sandbox modal → `run_code_modal` → HTTP 422 detail contains「个人中心」or「Modal」
    - User with `preferences["sandbox"]["modal"] = {token_id, token_secret}` → mock `run_python_in_modal` called with those kwargs (not platform env)
  - **Required:** Update `test_run_modal_packages.py` helpers:
    - Extend `_actor()` / fake user with Modal creds in `preferences`
    - Update every `run_python_in_modal` mock assertion / call signature to include `token_id=` / `token_secret=`
    - Ensure successful path tests still pass after BYOK

- [ ] **Step 2: Change `run_python_in_modal` / `_ensure_modal_env`**

```python
def run_python_in_modal(
    code: str,
    packages: list[str] | None = None,
    *,
    env_vars: dict[str, str] | None = None,
    token_id: str,
    token_secret: str,
) -> ...:
    # set os.environ for Modal SDK from args only for this call
```

- [ ] **Step 3: In `run_code_modal`**
  1. Load `preferences["sandbox"]`
  2. If missing token_id/secret → 422
  3. Resolve packages as today (`path_id`/`chapter_id`)
  4. Call with user tokens + chapter dotenv `env_vars`
  5. **Never** fall back to platform `MODAL_TOKEN_*` for learner runs

- [ ] **Step 4: Run** `pytest tests/test_run_modal_byok.py tests/test_run_modal_packages.py -q` — all PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: Modal cloud run requires learner BYOK credentials

EOF
)"
```

---

### Task 5: Learn page button matrix

**Files:**
- Modify: `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx`
- Modify: `frontend/src/lib/api.ts` if cloud run needs no API change beyond existing `runModalCode`
- Extend `EditorTab` with optional `runtimeTag?: RuntimeTag` (do **not** overload existing display `runtime: string` banner text)

- [ ] **Step 1: Load sandbox settings once** on page mount (`getSandboxSettings`) → `hasModal` + default provider

- [ ] **Step 2: Derive from active tab**

```typescript
const tabExec = resolveTabExecution({
  language: activeTab.language,
  code: activeTab.code,
  tag: activeTab.runtimeTag ?? null,
});
const cloudProvider = tabExec.mode === "cloud"
  ? pickCloudProvider({
      defaultProvider: sandboxSettings?.default_provider ?? "modal",
      modalConfigured: !!sandboxSettings?.has_modal_credentials,
      daytonaConfigured: false,
    })
  : null;
```

- [ ] **Step 3: Render matrix**
  - `mode !== "cloud"` → existing「运行」only; hide「云端运行」
  - `mode === "cloud" && cloudProvider` → **only**「云端运行」; hide Pyodide「运行」
    - **Keep** existing DeepSeek / chapter `.env` gate before calling Modal (do not move LLM keys into sandbox settings)
  - `mode === "cloud" && !cloudProvider` → link/button「去配置云端沙箱」→ `/settings/sandbox`; hide both run buttons

- [ ] **Step 4: When syncing code to tabs** (optional Phase A): if `looksLikeCloudFrameworkCode(code)`, set `runtimeTag: "cloud"` on that tab; else leave unset (heuristics still apply)

- [ ] **Step 5: Smoke** — plain Python shows 运行; LangChain sample shows 云端运行 or CTA; Vue still Sandpack

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: learn page run actions follow active-tab sandbox mode

EOF
)"
```

---

### Task 6: Docs + help copy

**Files:**
- Modify: `README.md` (sandbox BYOK + settings path)
- Modify: `frontend/src/app/help/page.tsx` if sandbox FAQ exists
- Spec already exists; link from README briefly

- [ ] **Step 1: Document** 个人中心 → 沙箱配置；云端仅学员 Modal Key；章节 `.env` 仍是代码内密钥

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: learner Modal BYOK for cloud sandbox

EOF
)"
```

---

## Deferred (do not implement in this plan)

### Phase B — Daytona
- Settings fields + `daytona` in `pickCloudProvider`
- `CloudSandboxProvider` implementation + `run-cloud` or provider switch in code API

### Phase C — Fence tags from generation
- Parse ` ```python runtime=cloud ` on sync
- Course generation emits tags for LangChain samples

---

## Verification checklist (Phase A)

- [ ] `cd frontend && node --experimental-strip-types --test src/lib/tabRuntime.test.ts`
- [ ] `pytest tests/test_sandbox_settings.py tests/test_run_modal_byok.py tests/test_run_modal_packages.py -q`
- [ ] Learner without Modal settings: LangChain tab → CTA, not Pyodide
- [ ] Learner with Modal settings: LangChain tab → 云端运行 uses user tokens; still prompts for chapter `DEEPSEEK_API_KEY` when needed
- [ ] Plain Python / Vue tabs unchanged (运行 / Sandpack)
- [ ] Platform `.env` `MODAL_TOKEN_*` unused for learner `run-modal`
