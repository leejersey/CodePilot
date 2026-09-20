# Modal Cloud Run (Phase 1 B)

**Status:** Implementing  
**Decision:** Keep Judge0; add optional Modal run on learn page.

## Scope
- `POST /api/v1/code/run-modal` — Python only
- Learn page button「云端运行」
- Whitelist `pip` packages; timeout; no Tunnel/HTTP preview

**Package allow decisions:** See [`2026-09-20-course-package-allowlist-design.md`](./2026-09-20-course-package-allowlist-design.md) — path/chapter `package_candidates`, admin approve, server-side effective set at runtime (replaces global allow-list as the primary gate).

## Config
`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, optional timeouts / app name.
