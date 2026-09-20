# Sandpack Preview (Vue/React) Design

**Date:** 2026-09-20  
**Status:** Approved (A1) — implementing

## Goal

Let learners preview Vue/React component UIs on the learn page without leaving Monaco. No CodeSandbox accounts, SDK, or VMs.

## Decision

- **Editor:** Monaco (unchanged)
- **Runtime:** Sandpack browser templates (`react` / `vue`), preview-only
- **Sync:** On Preview/Run click only (not live `onChange`)

## Execution routing

Extend `ExecutionMode` with `"sandpack"`.

| Signal | Mode |
|--------|------|
| lang `react` / `jsx` / `tsx`, or React-like source | sandpack + `react` |
| lang `vue`, or `.vue` / SFC source | sandpack + `vue` |
| html / css / plain javascript | existing `web` iframe |
| python | pyodide |
| else | remote Judge0 |

## UI

Bottom pane: when mode is sandpack, render `SandpackProvider` + `SandpackLayout` + `SandpackPreview` (no Sandpack editor). Button label stays **Preview**.

## Files

- `frontend/src/lib/languageRuntime.ts` — modes + detection
- `frontend/src/lib/sandpackFiles.ts` — Monaco tabs → Sandpack `files`
- `frontend/src/components/SandpackPreview.tsx` — preview shell
- `frontend/src/app/learn/[pathId]/[chapterId]/page.tsx` — wire run path
- tests for routing + file mapping

## Out of scope

Next/Nuxt, LangChain, Judge0 changes, commercial Vite/Nodebox templates, live sync.
