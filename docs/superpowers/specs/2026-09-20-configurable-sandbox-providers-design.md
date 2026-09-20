# Configurable Sandbox Providers (Modal + Daytona)

**Status:** Design approved 2026-09-20  
**Problem:** Cloud run is hard-wired to platform Modal tokens and a single「云端运行」入口. Learners need BYOK providers (Modal, later Daytona), and a single chapter can mix browser / Sandpack / cloud samples—so runtime must not be chapter-global.

## Goals
- Route **per active editor tab** (language + optional tag + code heuristics).
- Personal-center config for cloud provider credentials and a **default cloud provider**.
- **Learner BYOK only** for Modal / Daytona (platform does not run cloud sandboxes on behalf of users).
- Keep chapter `.env` (e.g. `DEEPSEEK_API_KEY`) separate from provider API keys.
- Learn page only shows run actions that fit the **current tab**.

## Non-goals (Phase 1)
- Platform-funded Modal/Daytona fallback.
- Full Daytona implementation (design the provider interface; ship Modal path first, Daytona stub OK).
- Chapter- or path-level single `runtime` that forces one mode for the whole chapter.
- Replacing Judge0 for exercises / non-cloud languages.
- Admin UI for sandbox providers.

## Runtime model

### Mode vocabulary (align with existing `ExecutionMode`)
| Spec / tag | Learn-page mode today |
|------------|------------------------|
| `browser` | `pyodide` |
| `sandpack` | `sandpack` |
| `web` | `web` |
| `judge0` | `remote` |
| `cloud` | new cloud path (Modal / Daytona) — not Pyodide |

### Layers
| Layer | Role |
|-------|------|
| Editor | Always Monaco (existing) |
| Local / browser | Pyodide (Python), web preview (HTML/CSS/JS), Sandpack (Vue/React) |
| Remote Judge0 | Other languages (`go`, `java`, …) via `remote` |
| Cloud sandbox | Modal or Daytona — only when tab resolves to `cloud` **and** user has a usable provider credential |

### Resolution order (active tab)
1. Explicit tab / code-block tag `runtime` if present: `browser` | `sandpack` | `web` | `judge0` | `cloud`.
2. Else code / language heuristics:
   - LangChain / LangGraph signals (`langchain`, `langgraph`, `init_chat_model`, …) → `cloud`
   - Vue / React (existing Sandpack heuristics) → `sandpack`
   - `python` → `browser` (`pyodide`)
   - `html` / `css` / `javascript` / `typescript` (non-React/Vue) → `web`
   - else → `judge0` (`remote`)
3. If resolved mode is `cloud`, pick provider:
   - Prefer user's **default cloud provider** when that provider has a stored key.
   - Else if default has no key but exactly one other provider is keyed → use that sole keyed provider.
   - Else → `cloud` unmet (no runnable provider).

Tags take priority over heuristics. Tags attach to **tab / synced code block**, not the whole chapter.

### UI on learn page (button matrix)

| Tab resolves to | User cloud creds | Visible primary action |
|-----------------|------------------|-------------------------|
| `browser` / `web` / `sandpack` / `judge0` | (ignored) | Existing「运行」only — **no** cloud button |
| `cloud` | Default (or sole) provider keyed | **Only**「云端运行」(or provider name) — **hide** Pyodide/Judge0「运行」 |
| `cloud` | No usable provider key | **Only** CTA → 个人中心沙箱配置 — **no** Pyodide「运行」, **no** dead cloud button |

Switching tabs recalculates the matrix. Cloud tabs must not fall back to Pyodide (would confuse LangChain demos that need pip + network).

## Personal center (sandbox settings)

New settings subsection (e.g. `/settings/sandbox`):

| Field | Phase | Notes |
|-------|-------|--------|
| Modal token id + secret | A | Same shape as today's `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`; stored server-side, masked in API |
| Default cloud provider | A | Phase A enum: `modal` only in UI (or allow `daytona` in storage but unmet until Phase B key exists; prefer **Phase A UI = `modal` only**) |
| Daytona API key | B | Stored + masked; then default enum includes `daytona` |

**Not stored here:** in-sandbox secrets (`DEEPSEEK_API_KEY` etc.) — remain chapter `localStorage` / `.env` tab and still pass into `CloudSandboxProvider.run(..., env=...)`.

When ≥1 provider is configured, user must set a default; provider picker unit tests: default-if-keyed → else sole-keyed → else unmet.

## Backend

### Provider interface
```text
CloudSandboxProvider.run(code, *, env, packages, timeouts) -> RunResult
```
- `modal`: existing `modal_sandbox` adapted to use **per-user** credentials from settings (not only `MODAL_TOKEN_*` env).
- `daytona`: implement behind same interface in a later task; Phase 1 can return 501 with clear message if selected.

### `run-modal` / unified cloud run
- Prefer a provider-agnostic endpoint later (`POST /api/v1/code/run-cloud` with `provider` optional = user default).
- Phase 1 may keep `/run-modal` but load user Modal creds; reject if user has no Modal key.
- Continue requiring `path_id` / `chapter_id` for package allowlist (`detected ∩ approved`).
- Platform `MODAL_TOKEN_*` env: **ops/dev only**, not used for learner runs once BYOK ships (or restricted to admin test endpoint).

### Authz
- Cloud run requires authenticated user with stored provider secret for the chosen provider.
- Package allowlist rules unchanged (admin-approved course packages).

## Detection helpers
- Reuse / extend `package_extract` and learn-page language heuristics for “needs cloud”.
- Optional fence metadata when syncing to editor, e.g. ` ```python runtime=cloud `, written onto the tab as `runtime` tag.
- Generation may emit fence tags for LangChain samples; absence falls back to scan.

## Migration / compatibility
- Existing learn page behavior for Pyodide / Sandpack / Judge0 stays on **non-cloud** tabs.
- Users without sandbox settings: non-cloud tabs unchanged; **cloud** tabs show settings CTA only (no Pyodide fallback, no dead cloud button).
- Backfill: none required for tags; heuristics cover legacy courses.

## Testing
- Unit: resolution matrix (tag wins; langchain → cloud; vue → sandpack; plain py → pyodide).
- Unit: cloud provider pick (default if keyed; sole configured; none → no provider).
- API: cloud run without user Modal key → 401/422; with key → uses user creds (mock provider).
- Frontend: tab switch updates visible run actions.

## Success criteria
- One chapter can expose different run UIs as the user switches tabs.
- No platform Modal token used for learner cloud runs.
- Default cloud provider is user-explicit when multiple keys exist.
- Daytona can be added without changing learn-page routing (only provider registry + settings fields).

## Phased delivery
| Phase | Scope |
|-------|--------|
| A | Resolution helpers + learn-page button matrix; settings for **Modal id+secret** + default provider; Modal BYOK on cloud run; chapter `.env` still injected as run `env` |
| B | Daytona key field in settings + Daytona `CloudSandboxProvider` implementation |
| C | Fence `runtime=` tags from course generation; settings UX polish |
