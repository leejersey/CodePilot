# Skills + Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Skill as the atomic learn-and-pass unit under Chapter, with hard unlock rules; Phase A ships list + manual pass, later phases add Checkpoint / Mastery / Agent routing.

**Architecture:** Chapter remains the topic container. Each chapter owns 3–6 Skills (`skills` table on legacy `chapters.id`). Learner state lives in `skill_progress`. Generation extends outline JSON with `skills[]`. Learn page shows Skill rail; passing Skill N unlocks N+1. Chapter complete requires all Skills passed (enforced in Phase B; Phase A soft-guides).

**Tech Stack:** FastAPI + SQLAlchemy + Alembic, Next.js learn page, existing path/course generation jobs.

---

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| A | DB + generate skills + list/start/complete APIs + learn UI rail | **Done** |
| B | Quiz + Coding checkpoints; hard gate chapter complete | Pending |
| C | Mastery score / needs_review rules + dashboard | Pending |
| D | Agent routing (补学/复习) | Deferred |

---

## Phase A Tasks

### Task 1: Models + migration

**Files:**
- Modify: `backend/app/models/models.py`
- Create: `backend/app/db/migrations/versions/g7h8i9j0k1l2_add_skills.py`

- [x] Add `Skill` and `SkillProgress` models
- [x] Migration with indexes + status checks
- [x] `alembic upgrade head`

### Task 2: Outline generation includes skills

**Files:**
- Modify: `backend/app/api/v1/paths.py` (`_generate_outline`)
- Modify: `backend/app/services/course_generation.py` (chapter create loops)
- Create: `backend/app/services/skills.py` (normalize + persist helpers)
- Test: `backend/tests/test_skills.py`

- [x] Prompt asks for 3–6 skills per chapter
- [x] On chapter create, insert Skill rows (fallback: 1 skill from chapter title)
- [x] Unit tests for normalize_skills_from_chapter_item

### Task 3: Skills API

**Files:**
- Create: `backend/app/api/v1/skills.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/schemas/schemas.py`

- [x] `GET /api/v1/chapters/{chapter_id}/skills`
- [x] `POST /api/v1/skills/{skill_id}/start`
- [x] `POST /api/v1/skills/{skill_id}/complete` (manual Phase A pass → unlock next)
- [x] Ensure progress rows on first list

### Task 4: Learn page Skill rail

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx`
- Modify: `README.md` (V2.4 note)

- [x] Fetch skills on chapter load
- [x] Show list; highlight active; complete button on active skill
- [x] Inject current skill goal into AI guide context when present

---

## Out of scope (Phase A)

- skill_checkpoints table
- Blocking chapter complete
- Agent routing
- Teacher per-skill review UI
