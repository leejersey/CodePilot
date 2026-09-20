# Course Package Allowlist (Path + Chapter)

**Status:** Design approved 2026-09-20 (spec revision 2)  
**Problem:** Modal Phase 1 uses a global `ALLOWED_PACKAGES` list. Each new teaching demo (`python-dotenv`, `langchain-deepseek`, …) requires a code change. That does not scale.

**Decision:** Extract dependencies at **course generation** time; store them on **path (default) + chapter (optional extras)**; **platform admins** approve pending packages before Modal may install them.

## Goals
- Stop growing a single global teaching whitelist as the primary gate.
- Make “what this course needs” part of course data.
- Keep Modal installs bounded and auditable.

## Non-goals (Phase 1)
- Arbitrary learner-requested `pip install`.
- Creator self-approval of packages.
- Auto-approve from PyPI popularity or LLM trust alone.
- HTTP / tunnel / non-Python runtimes.
- Admin “manually add arbitrary package name” API (approve/reject candidates only).

## Data model

### Path (`learning_paths`)
- `package_candidates` JSONB — extracted at generation; items:
  `{ "name": "langchain-deepseek", "status": "pending"|"approved"|"rejected", "source": "import"|"provider", "reason"?: string }`
- **Path defaults** = items with `status === "approved"`.

### Chapter (`chapters`)
- `package_candidates` JSONB — same shape; **chapter-only extras** (see Generation aggregate rules).
- Empty / null = no chapter-unique packages; runtime uses path defaults only.

### Status retention on regen
- Match by normalized package `name` within the same scope (path vs that chapter).
- If a name remains in the new extraction for that scope: keep existing `approved` / `rejected` / `pending`.
- If a name moves between scopes (e.g. was chapter-only, now shared): drop from old scope, create on new scope as `pending` (do not silently inherit approval across scopes).
- If a name disappears: drop from that scope’s list.
- Approving on **path** covers shared defaults for all chapters; chapter extras need their own approval when present.

### Effective install set (runtime)
```
effective = uniq(approved(path) ∪ approved(chapter))
```
Then apply **global hard denylist**, name sanitization, and max count (keep current Modal cap, e.g. 8).

### Global layers (keep, but demote)
| Layer | Role |
|-------|------|
| Hard denylist | Never install; Phase 1 start: empty set + reject names failing `^[a-zA-Z0-9][a-zA-Z0-9_.+-]*$`, plus reserved/env-like blocks if any already used in dotenv parsing |
| Soft “known safe” hints | Current teaching list (`langchain`, `python-dotenv`, …) as **admin UX hints only** — does **not** auto-approve |
| Old `ALLOWED_PACKAGES` | Migrate into soft hints; stop being the sole runtime allow gate after backfill |

## Generation / extraction

Detectors must **emit candidates for unmapped third-party names**, not only today’s import→package map.

1. **Imports:** scan `import` / `from` top-level names.
   - Skip Python stdlib (maintain a stdlib frozenset, or `sys.stdlib_module_names` on the generator host).
   - Skip relative imports.
   - Map known aliases (`dotenv` → `python-dotenv`, `langchain_deepseek` → `langchain-deepseek`, …).
   - **Unmapped** top-level name → candidate pip name = that identifier with `_` → `-` heuristic (e.g. `langchain_foo` → `langchain-foo`), `source: "import"`, `status: pending`.
2. **Providers:** `init_chat_model("provider:…")`.
   - Known map (e.g. `deepseek` → `langchain-deepseek`) when available.
   - **Unknown provider** → candidate `langchain-{provider}` (document as heuristic), `source: "provider"`, `pending`. Admin may reject wrong guesses.
3. **Aggregate (path defaults + chapter extras — locked):**
   - Let `used(chapter)` = packages extracted from that chapter’s samples.
- **Path defaults (candidates)** = packages that appear in **≥2 chapters** (shared course deps). Runtime still uses only `status === "approved"` among them.
- **Chapter extras (candidates)** = packages that appear in **exactly one** chapter (that chapter only).
- **Single-chapter path:** put the full `used(chapter)` on **path** (chapter extras stay empty). Same if generation only has one chapter with code.
- Never store the same name on both path and a chapter list at once.
- Runtime effective remains `approved(path candidates) ∪ approved(chapter extras)`.
4. Generation never installs pending packages on Modal.

## Admin review

- **Who:** `admin` / `super_admin` only (`is_admin_role`).
- **What:** list pending for a path (path defaults + each chapter’s extras); approve / reject with optional note.
- **API (sketch):**
  - `GET /api/v1/admin/paths/{pathId}/packages`
  - `PATCH /api/v1/admin/paths/{pathId}/packages` — `{ name, status: "approved"|"rejected", scope: "path"|"chapter", chapter_id?: uuid }`
- Creators: read-only visibility of statuses on their course; cannot approve.

## Runtime (Modal)

### Request context
`POST /api/v1/code/run-modal` **must** accept course context so the server loads approved lists (never trust client-supplied allow lists):

- Required for course runs: `path_id`, `chapter_id` (UUIDs).
- Server verifies `chapter.path_id == path_id`, then loads path + chapter and computes `effective` from DB.
- Authz: caller must be allowed to access that path/chapter (reuse existing course/path access checks).
- Optional client `packages` field: **ignored for allow decisions** in Phase 1 (or rejected if present) to prevent bypass.

### Install policy
1. Detect packages referenced by the **submitted code** (same extractors as generation, including unmapped → normalized names).
2. `to_install = detected ∩ effective` (required, not optional).
3. If `detected - effective` is non-empty → **do not install**; return error naming each package and its status (`pending` / `rejected` / `absent`).
4. Apply denylist + max count before `pip_install`.
5. Learner `.env` / API key flow unchanged.

## Learner / creator UX (minimal Phase 1)

- Learn page: pass `pathId` / `chapterId` into `run-modal` (already available on the page).
- Optional chip if chapter’s needed deps include pending: “云端依赖待管理员审核”.
- Admin UI: list + Approve / Reject (API-first OK).

## Error handling

| Case | Behavior |
|------|----------|
| Pending / rejected / absent in effective | Refuse install; message lists package + status |
| Empty approved + code needs deps | Fail with “无已批准依赖” |
| Denylist hit | Fail even if marked approved |
| Missing path_id/chapter_id | 400 |
| chapter 不属于 path | 404 |
| Over max count | Fail before pip |

## Testing

- Unit: aggregate ≥2 → path, exactly-one → chapter, single-chapter → all on path.
- Unit: extract unmapped import → pending candidate; stdlib skipped.
- Unit: path∪chapter extras merge; detect∩effective; denylist.
- API: non-admin cannot PATCH; admin can; run-modal without ids → 400; client packages cannot widen allow set.
- Integration (optional): Modal mock receives only `to_install`.

## Migration

1. Add JSONB columns (default `[]`).
2. Soft-hint seed from current global teaching list (admin UX only).
3. Backfill: scan stored chapter code → write candidates (`pending`, or `approved` if name ∈ old allow-list **only during backfill** to avoid breaking live courses).
4. Temporary fallback: if both candidate lists empty (un-backfilled legacy), use old global allow-list **once** with a log; remove after backfill complete.

## Success criteria

- Teaching a new provider/package for a course does **not** require editing `modal_sandbox.py` maps to get a **pending** candidate (admin still approves before install).
- Unapproved packages never install on Modal.
- Admins clear a course’s pending queue without a deploy.
- `run-modal` allow decisions come only from server-side path/chapter data.
