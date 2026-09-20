# Course Package Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pip dependencies at course generation, store path defaults + chapter extras with admin approval, and make Modal install only `approved(path) ∪ approved(chapter)`.

**Architecture:** New `package_extract` / `package_candidates` services own detection + aggregation + status merge. `learning_paths` / `chapters` gain `package_candidates` JSONB. Admin PATCH approves. `run-modal` requires `path_id`+`chapter_id`, loads effective set server-side, installs `detected ∩ effective`. Legacy global allow-list becomes soft hints + temporary empty-list fallback.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, existing Modal runner, Next.js learn page

**Spec:** `docs/superpowers/specs/2026-09-20-course-package-allowlist-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/services/package_extract.py` | Import/provider detection (incl. unmapped → pending names); stdlib skip |
| `backend/app/services/package_candidates.py` | Aggregate ≥2/exactly-1; merge statuses on regen; `effective_packages`; denylist |
| `backend/app/services/modal_sandbox.py` | Keep run helper; demote `ALLOWED_PACKAGES` → `KNOWN_SAFE_HINTS`; accept pre-resolved install list |
| `backend/app/models/models.py` | `package_candidates` on `LearningPath` + `Chapter` |
| `backend/app/db/migrations/versions/h8i9j0k1l2m3_add_package_candidates.py` | JSONB columns |
| `backend/app/api/v1/admin_path_packages.py` | Admin GET/PATCH packages |
| `backend/app/api/v1/code.py` | `run-modal` path/chapter context + server allow |
| `backend/app/services/course_generation.py` (and/or paths job) | After chapter content exists, extract + persist candidates |
| `backend/app/schemas/schemas.py` | Request/response models for admin + modal |
| `frontend/src/lib/api.ts` | Pass `path_id`/`chapter_id` to `run-modal` |
| `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx` | Wire ids; optional pending chip |
| `backend/tests/test_package_extract.py` | Detection unit tests |
| `backend/tests/test_package_candidates.py` | Aggregate / effective / merge |
| `backend/tests/test_run_modal_packages.py` | API allow decisions (as possible without live Modal) |

---

### Task 1: Package extraction (unmapped → candidate)

**Files:**
- Create: `backend/app/services/package_extract.py`
- Test: `backend/tests/test_package_extract.py`

- [ ] **Step 1: Write failing tests**

```python
from app.services.package_extract import extract_package_refs

def test_skips_stdlib():
    assert extract_package_refs("import os\nfrom json import loads\n") == []

def test_maps_known_alias():
    refs = extract_package_refs("from dotenv import load_dotenv\n")
    assert [(r.name, r.source) for r in refs] == [("python-dotenv", "import")]

def test_unmapped_import_becomes_candidate():
    refs = extract_package_refs("import langchain_foo\n")
    assert refs[0].name == "langchain-foo"
    assert refs[0].source == "import"

def test_deepseek_provider():
    code = 'init_chat_model("deepseek:deepseek-chat")\n'
    refs = extract_package_refs(code)
    assert any(r.name == "langchain-deepseek" and r.source == "provider" for r in refs)

def test_unknown_provider_heuristic():
    refs = extract_package_refs('init_chat_model("acme:model-x")\n')
    assert any(r.name == "langchain-acme" and r.source == "provider" for r in refs)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd backend && python -m pytest tests/test_package_extract.py -q`

- [ ] **Step 3: Implement `package_extract.py`**

```python
# Key pieces:
# - PackageRef dataclass: name, source ("import"|"provider")
# - STDLIB from sys.stdlib_module_names (plus common backports if needed)
# - _IMPORT_ALIASES: dotenv→python-dotenv, langchain_deepseek→langchain-deepseek, …
# - _PROVIDER_ALIASES: deepseek→langchain-deepseek, openai→langchain-openai
# - unmapped import: top.replace("_", "-")
# - unknown provider: f"langchain-{provider}"
# - dedupe by name (first source wins)
```

Move alias maps out of `modal_sandbox.py` into this module (or re-export from here) so generation and runtime share one detector.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/package_extract.py backend/tests/test_package_extract.py
git commit -m "$(cat <<'EOF'
feat: extract course pip candidates including unmapped imports

EOF
)"
```

---

### Task 2: Aggregate path defaults + chapter extras

**Files:**
- Create: `backend/app/services/package_candidates.py`
- Test: `backend/tests/test_package_candidates.py`

- [ ] **Step 1: Write failing tests**

```python
from uuid import uuid4
from app.services.package_candidates import aggregate_candidates, merge_status, approved_names, effective_packages

def test_aggregate_shared_and_unique():
    c1, c2, c3 = uuid4(), uuid4(), uuid4()
    path_c, chapter_c = aggregate_candidates({
        c1: [("langchain", "import"), ("httpx", "import")],
        c2: [("langchain", "import"), ("python-dotenv", "import")],
        c3: [("numpy", "import")],
    })
    path_names = {x["name"] for x in path_c}
    assert path_names == {"langchain"}  # in ≥2 chapters
    assert {x["name"] for x in chapter_c[c1]} == {"httpx"}
    assert {x["name"] for x in chapter_c[c2]} == {"python-dotenv"}
    assert {x["name"] for x in chapter_c[c3]} == {"numpy"}

def test_aggregate_preserves_provider_source():
    c1 = uuid4()
    path_c, _ = aggregate_candidates({c1: [("langchain-deepseek", "provider")]})
    assert path_c[0]["source"] == "provider"

def test_merge_drops_missing_and_resets_cross_scope():
    # disappear → drop
    assert merge_status(
        [{"name": "httpx", "status": "approved", "source": "import"}],
        [],
    ) == []
    # new scope must not inherit old approval (caller drops from old list, inserts pending on new)
    ...

def test_aggregate_single_chapter_all_on_path():
    c1 = uuid4()
    path_c, chapter_c = aggregate_candidates({c1: ["langchain", "httpx"]})
    assert {x["name"] for x in path_c} == {"langchain", "httpx"}
    assert chapter_c[c1] == []

def test_merge_keeps_approved():
    old = [{"name": "httpx", "status": "approved", "source": "import"}]
    new = [{"name": "httpx", "status": "pending", "source": "import"},
           {"name": "numpy", "status": "pending", "source": "import"}]
    merged = merge_status(old, new)
    assert {x["name"]: x["status"] for x in merged} == {"httpx": "approved", "numpy": "pending"}

def test_effective_union():
    path = [{"name": "langchain", "status": "approved", "source": "import"}]
    ch = [{"name": "httpx", "status": "approved", "source": "import"},
          {"name": "evil", "status": "pending", "source": "import"}]
    assert effective_packages(path, ch) == ["langchain", "httpx"]
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && python -m pytest tests/test_package_candidates.py -q`

- [ ] **Step 3: Implement helpers**

Include:
- `aggregate_candidates(chapter_to_refs: dict[UUID, list[tuple[str, str]]])` — `(name, source)` so provider source is preserved
- `merge_status(old, new)` — drop missing names; same-scope keep status
- `approved_names(candidates) -> list[str]`
- `effective_packages(path_c, chapter_c) -> list[str]`
- `package_status_lookup(path_c, chapter_c) -> dict[str, str]` for error messages
- `HARD_DENYLIST: frozenset` (empty Phase 1) + `sanitize_name`
- `KNOWN_SAFE_HINTS` (copy of today’s teaching allow-list) — admin UX only

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/package_candidates.py backend/tests/test_package_candidates.py
git commit -m "$(cat <<'EOF'
feat: aggregate path/chapter package candidates with status merge

EOF
)"
```

---

### Task 3: DB migration + models

**Files:**
- Modify: `backend/app/models/models.py` (`LearningPath`, `Chapter`)
- Create: `backend/app/db/migrations/versions/h8i9j0k1l2m3_add_package_candidates.py`

- [ ] **Step 1: Add columns on models**

```python
# LearningPath + Chapter:
package_candidates: Mapped[list | None] = mapped_column(
    JSONB, nullable=False, server_default="[]"
)
```

(Use `nullable=False` with server default `[]`; adjust if project prefers nullable.)

- [ ] **Step 2: Migration**

```python
revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"  # verify current head first

def upgrade():
    op.add_column("learning_paths", sa.Column("package_candidates", postgresql.JSONB(), server_default="[]", nullable=False))
    op.add_column("chapters", sa.Column("package_candidates", postgresql.JSONB(), server_default="[]", nullable=False))
```

- [ ] **Step 3: `alembic upgrade head`**

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/models.py backend/app/db/migrations/versions/h8i9j0k1l2m3_add_package_candidates.py
git commit -m "$(cat <<'EOF'
feat: store package_candidates on learning paths and chapters

EOF
)"
```

---

### Task 4: Persist candidates during course generation

**Files:**
- Modify: `backend/app/services/course_generation.py` (and/or legacy path generation in `paths.py` / worker)
- Create helper in `package_candidates.py`: `refresh_path_packages(db, path, chapters_with_code: dict[UUID, list[str]])`
- Test: extend `backend/tests/test_package_candidates.py` or add generation unit test with fakes

- [ ] **Step 1: Define code-source helper (concrete Phase 1 scan set)**

Scan, in order, whatever exists at persist time:
1. Path `outline` JSON stringified chapter entries (titles/summaries/any embedded fences)
2. Skill `teach_prompt` / `goal` / `objectives` text for that chapter
3. Exercise `starter_code` / prompt fields for that chapter (if present)

Extract fenced ` ```python ` / ` ```py ` blocks **and** raw text that looks like imports (full-field scan via `extract_package_refs` is OK).

If almost no code exists yet, still write empty/`[]` candidates; add a later `refresh_path_packages(path_id)` call when exercises/docs land (same helper).

YAGNI: skip conversation transcript mining in Phase 1.

- [ ] **Step 2: After chapters saved, call refresh**

```python
# Pseudocode
from app.services.package_extract import extract_package_refs
from app.services.package_candidates import aggregate_candidates, merge_status

per_chapter_names = {
  ch.id: sorted({r.name for r in extract_package_refs(text)})
  for ch, text in chapter_texts.items()
}
path_new, chapter_new = aggregate_candidates(per_chapter_names)
path.package_candidates = merge_status(path.package_candidates or [], path_new)
for ch in chapters:
    ch.package_candidates = merge_status(ch.package_candidates or [], chapter_new.get(ch.id, []))
```

- [ ] **Step 3: Unit-test refresh merge with in-memory lists (no DB required)**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: extract and persist package candidates on course generation

EOF
)"
```

---

### Task 5: Admin approve/reject API

**Files:**
- Create: `backend/app/api/v1/admin_path_packages.py`
- Modify: `backend/app/main.py` (router)
- Modify: `backend/app/schemas/schemas.py`
- Test: `backend/tests/test_admin_path_packages.py` (pattern from `test_account_permissions.py` / course admin tests)

- [ ] **Step 1: Schemas**

```python
class PackageCandidateOut(BaseModel):
    name: str
    status: Literal["pending", "approved", "rejected"]
    source: Literal["import", "provider"]
    reason: str | None = None
    scope: Literal["path", "chapter"]
    chapter_id: UUID | None = None

class PackageStatusUpdate(BaseModel):
    name: str
    status: Literal["approved", "rejected"]
    scope: Literal["path", "chapter"]
    chapter_id: UUID | None = None
    reason: str | None = None
```

- [ ] **Step 2: Endpoints** (`require_admin`)

- `GET /api/v1/admin/paths/{path_id}/packages` → flattened list (path + chapter scopes)
- `PATCH /api/v1/admin/paths/{path_id}/packages` → update one candidate status

Reject if name not in that scope’s list. Creators must get 403 on PATCH.

- [ ] **Step 3: Tests — non-admin 403; admin approve flips status**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: admin API to approve course Modal package candidates

EOF
)"
```

---

### Task 6: Modal runtime uses course effective set

**Files:**
- Modify: `backend/app/api/v1/code.py`
- Modify: `backend/app/services/modal_sandbox.py` (`resolve_packages` / run entry)
- Modify: `backend/app/schemas` or inline `ModalRunRequest`
- Test: `backend/tests/test_run_modal_packages.py`

- [ ] **Step 1: Failing tests (logic-level)**

```python
def test_to_install_intersection():
    from app.services.package_candidates import resolve_modal_install
    # detected needs httpx+numpy; effective only httpx → install [httpx], blocked [numpy]
    install, blocked = resolve_modal_install(
        code="import httpx\nimport numpy\n",
        effective=["httpx"],
        statuses={"numpy": "pending"},
    )
    assert install == ["httpx"]
    assert blocked[0][0] == "numpy"

def test_legacy_fallback_when_candidates_empty():
    # path+chapter candidates both [] → use KNOWN_SAFE_HINTS ∩ detected (temporary)
    ...
```

- [ ] **Step 2: Update `ModalRunRequest`**

```python
class ModalRunRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=100_000)
    language: str = Field("python")
    path_id: UUID
    chapter_id: UUID
    dotenv: str = Field("", max_length=20_000)
    # packages: omit or ignore — do not trust client
```

- [ ] **Step 3: `run_code_modal` flow**

1. Load chapter; 404 if missing or `chapter.path_id != path_id`
2. Authz: reuse path access helper (same as learn)
3. `effective = effective_packages(path.package_candidates, chapter.package_candidates)`
4. If both candidate lists empty → legacy fallback (`KNOWN_SAFE_HINTS`) + log warning
5. `detected = [r.name for r in extract_package_refs(code)]`
6. If `detected - effective` → HTTP 422 with Chinese message listing status
7. `to_install = detected ∩ effective` (cap 8); call Modal

- [ ] **Step 4: Demote `ALLOWED_PACKAGES` in `modal_sandbox.py`**

`run_python_in_modal(code, packages, ...)` should install the **pre-validated** list (still sanitize + denylist + max 8). Stop auto-merging from old allow-list for course runs.

- [ ] **Step 5: Tests pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: Modal run installs only admin-approved course packages

EOF
)"
```

---

### Task 7: Frontend wire path/chapter + pending hint

**Files:**
- Modify: `frontend/src/lib/api.ts` (`runModalCode`)
- Modify: `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx`

- [ ] **Step 1: Update API client**

```typescript
export async function runModalCode(
  code: string,
  language: string = "python",
  dotenv: string = "",
  pathId: string,
  chapterId: string,
): Promise<CodeRunResponse> {
  return fetchAPI<CodeRunResponse>("/api/v1/code/run-modal", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      dotenv,
      path_id: pathId,
      chapter_id: chapterId,
    }),
  });
}
```

- [ ] **Step 2: Call site passes `pathId`, `chapterId`**

- [ ] **Step 3 (optional Phase 1):** If skills/API already loaded, show thin chip when any needed dep is pending — can skip if no packages GET for learners yet; rely on 422 message.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: send path/chapter ids with Modal cloud run

EOF
)"
```

---

### Task 8: Backfill one-off module (legacy courses)

**Files:**
- Create: `backend/app/services/backfill_package_candidates.py` with `python -m app.services.backfill_package_candidates` entry (no `backend/scripts/` convention in this repo)

- [ ] **Step 1: Module**

For each learning path with chapters:
1. Collect python fences from available stored text (outline, exercises, conversations optional)
2. Aggregate + write candidates
3. If name ∈ `KNOWN_SAFE_HINTS`, set `approved` during backfill only; else `pending`

- [ ] **Step 2: Dry-run flag + run on staging/local**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: backfill package_candidates for existing learning paths

EOF
)"
```

---

### Task 9: Docs touch-up

**Files:**
- Modify: `README.md` (short note under Modal / admin)
- Modify: `docs/superpowers/specs/2026-09-20-modal-cloud-run-design.md` (point to course allowlist)

- [x] **Step 1: Document admin approve + run-modal ids**

- [x] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: course package allowlist for Modal cloud run

EOF
)"
```

---

## Out of scope (this plan)

- Full admin UI page (API is enough; thin UI later)
- Creator self-approve
- Manual “add arbitrary package” API
- Removing legacy fallback (do after backfill verified)
- Course-version (`course_chapters`) mirror — follow-up if publish pipeline needs same field

## Verification checklist

- [ ] `pytest tests/test_package_extract.py tests/test_package_candidates.py tests/test_admin_path_packages.py tests/test_run_modal_packages.py -q`
- [ ] New course gen writes `pending` candidates without editing allow-list for new import names
- [ ] Admin approve → Modal installs; pending → 422 clear message
- [ ] Client cannot widen installs via body.packages
- [ ] Learn page cloud run still works with dotenv flow
