# Sandpack Preview Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Monaco edit + Sandpack preview for Vue/React on the learn page (sync on Run).

**Architecture:** Add `sandpack` execution mode; map editor tabs to Sandpack files; show preview-only Sandpack in the existing output pane.

**Tech Stack:** Next.js, Monaco, `@codesandbox/sandpack-react`

---

### Task 1: Language routing + file mapper

**Files:**
- Modify: `frontend/src/lib/languageRuntime.ts`
- Create: `frontend/src/lib/sandpackFiles.ts`
- Test: `frontend/src/lib/languageRuntime.test.ts`, `frontend/src/lib/sandpackFiles.test.ts`

- [x] Fail then pass: `vue`/`react` → sandpack; plain `javascript` → web
- [x] Map tabs to `/App.js` or `/src/App.vue`

### Task 2: Preview component + learn page

**Files:**
- Create: `frontend/src/components/SandpackPreview.tsx`
- Modify: `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx`
- Modify: `frontend/package.json` (dependency)

- [x] Install `@codesandbox/sandpack-react`
- [x] Wire `runCode` sandpack branch + bottom pane
