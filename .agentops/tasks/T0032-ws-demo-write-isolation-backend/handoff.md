# T0032 Handoff: ws-demo write isolation (backend)

## What Changed

- Added a shared workspace write guard: `apps/server/scripts/lib/workspace-guard.mjs`.
  - `guardWriteWorkspace(workspace, { purpose })` fails fast when the target is `ws_demo`, unless controller-only override `PLS_ALLOW_WS_DEMO_WRITE=1` is set.
  - `makeTempWorkspace(prefix)` generates temporary workspace names.
- Protected direct DB writers:
  - `apps/server/scripts/import-douyin-bi.mjs`
  - `apps/server/scripts/seed-data-sources.mjs`
  - `apps/server/scripts/sync-channel-entities.mjs`
- Protected API-writing smoke scripts:
  - `apps/server/scripts/smoke-admin-import.mjs` (imported mode only)
  - `apps/server/scripts/smoke-admin-dangerous.mjs` (start-of-script guard)
  - `apps/server/scripts/smoke-p2-api.mjs` (start-of-script guard)
- Converted `apps/server/scripts/smoke-channel-object-library.mjs` to always use a temporary workspace (`ws_col_${timestamp}`), even in `dry-run` mode, so GET endpoints that write audit events do not dirtify `ws_demo`.
- Fixed two server-side causes of unintended `ws_demo` writes discovered while validating the smoke test:
  - `apps/server/src/lib/idempotency.ts`: moved the expired-row `DELETE` from the middleware (which ran on every POST with `Idempotency-Key`, including failed/401/400 requests) into `cloneAndStore`, so pruning only happens when a successful response is actually cached.
  - `apps/server/src/routes/channel-objects.ts`: removed the `audit_event` write from the `POST /channel-objects/analysis` stub, which returns `501` and should not mutate the fixture DB.
- Removed local `audit()` helpers from read-only `GET` routes so background frontend polls no longer dirtify `ws_demo`:
  - `apps/server/src/routes/channel-entities.ts`: removed audit writes from `GET /channels/entities` and `GET /channels/entities/:entityId`.
  - `apps/server/src/routes/channel-objects.ts`: removed audit writes from `GET /channel-objects`, `GET /channel-objects/:canonicalObjectKey`, `GET /channel-objects/:canonicalObjectKey/audience-profiles`, `GET /channel-objects/:canonicalObjectKey/product-fit-profiles`, and `GET /channel-objects/:canonicalObjectKey/bindings`.
- Updated documentation:
  - `apps/server/scripts/README-admin-smoke.md`: added "安全红线" section explaining `PLS_ALLOW_WS_DEMO_WRITE` and the guard behavior.
  - `docs/notes-backend.md`: created backend notes with current state and isolation rules.
  - `docs/notes-data.md`: added `ws_demo` fixture protection to data-domain principles.

## Files Changed

- `apps/server/scripts/lib/workspace-guard.mjs` (new)
- `apps/server/scripts/import-douyin-bi.mjs`
- `apps/server/scripts/seed-data-sources.mjs`
- `apps/server/scripts/sync-channel-entities.mjs`
- `apps/server/scripts/smoke-admin-import.mjs`
- `apps/server/scripts/smoke-admin-dangerous.mjs`
- `apps/server/scripts/smoke-p2-api.mjs`
- `apps/server/scripts/smoke-channel-object-library.mjs`
- `apps/server/scripts/README-admin-smoke.md`
- `apps/server/src/lib/idempotency.ts`
- `apps/server/src/routes/channel-entities.ts`
- `apps/server/src/routes/channel-objects.ts`
- `docs/notes-backend.md` (new)
- `docs/notes-data.md`

## Workspace isolation behavior

- Any script that writes to a workspace DB or performs API writes now refuses to target `ws_demo` by default.
- The fail-fast error tells the operator to either:
  - Set `PLS_WORKSPACE=ws_<purpose>_<timestamp>` to use a temporary workspace, or
  - Set `PLS_ALLOW_WS_DEMO_WRITE=1` (controller-only override) and explicitly accept the risk.
- Wrapper scripts that already created temporary workspaces (`smoke-admin-empty`, `smoke-admin-imported`, `smoke-admin-summary`, `smoke-tools-import`) are unchanged; they continue to inject a temporary workspace.
- `smoke-channel-object-library` now creates a temporary workspace in both `dry-run` and `imported` modes, so no test path touches `ws_demo`.
- The server-side idempotency, 501-audit, and read-only GET audit fixes eliminate accidental writes from read-only/dry-run requests and background frontend polls.

## Validation

- `cd apps/server && npm run typecheck` — passed.
- `cd apps/server && npm run smoke:channel-object-library` — passed (22 checks, workspace `ws_col_1783853601114`, `ok: true`).
- `cd apps/server && PLS_ADMIN_SMOKE_MODE=imported npm run smoke:channel-object-library` — passed (60 checks, workspace `ws_col_...`, `ok: true`).
- Guard behavior verified (server stopped, from clean `HEAD` baseline):
  - `node apps/server/scripts/import-douyin-bi.mjs` fails with `WS_DEMO_WRITE_BLOCKED`.
  - `node apps/server/scripts/seed-data-sources.mjs` fails with `WS_DEMO_WRITE_BLOCKED`.
  - `node apps/server/scripts/sync-channel-entities.mjs` fails with `WS_DEMO_WRITE_BLOCKED`.
  - `npm run smoke:admin-dangerous` fails with `WS_DEMO_WRITE_BLOCKED`.
  - `PLS_ADMIN_SMOKE_MODE=imported npm run smoke:admin-import` fails with `WS_DEMO_WRITE_BLOCKED`.
  - `npm run smoke:p2-api` fails with `WS_DEMO_WRITE_BLOCKED`.
- Path-specific git checks after validation (run from repo root, server stopped):
  - `git diff --check` — passed.
  - `git diff --quiet -- data/workspaces/ws_demo/db.sqlite` — clean (exit 0).
  - `git diff --name-only -- data/workspaces/ws_demo/db.sqlite` — no output.
  - Note: `git diff --name-only` always exits 0 even with output; use `git diff --quiet` or capture the output bytes to reliably assert cleanliness.

## Risks

- `apps/server/scripts/seed.ts` (TypeScript, not `.mjs`) still hardcodes `wsId = "ws_demo"` and is not covered by the new guard. It is outside the allowed `.mjs` scope and is a one-time fixture initializer, but it remains a manual write path to `ws_demo`. Recommended: add the same guard if it becomes a recurring script.
- `smoke-admin-dangerous` now refuses to run against `ws_demo` even though its destructive operations are already on hardcoded temporary workspaces. The dry-run checks run against whatever workspace is passed; wrapper scripts pass a temporary workspace, so behavior is preserved. Direct execution now requires an explicit workspace or override.
- `smoke-p2-api` now fails by default. To run it, a user must set `PLS_WORKSPACE` to a workspace that already exists (or create one via `admin/database/rebuild`), then rerun.
- The server-side idempotency change delays pruning until a successful POST. This is semantically equivalent but could lead to slightly larger `idempotency_key` tables on low-traffic workspaces until the first successful POST. The 24h TTL still applies.
- `ws_demo` was restored to `HEAD` (`git checkout HEAD -- data/workspaces/ws_demo/db.sqlite`) before final validation. The server was started from that clean baseline, the smoke test ran against a temporary workspace, and the server was then stopped. `git diff --quiet -- data/workspaces/ws_demo/db.sqlite` confirms the fixture DB is clean.

## Open Questions

- Should `ws_demo` write protection be pushed down to the API layer (e.g., a middleware guard on admin/import routes)? The current task scope intentionally avoided changing production API semantics, but that may be needed for complete isolation.
- Should `apps/server/scripts/seed.ts` receive the same guard, or should it be converted to `.mjs` and included in the protected set?
- Should CI/pre-commit add a mandatory `git diff --quiet -- data/workspaces/ws_demo/db.sqlite` check so future regressions are caught automatically?

## Memory Candidates

- Backend scripts that open a workspace SQLite directly must fail-fast before `new DatabaseSync()` when the target is `ws_demo`.
- API-level read-only/dry-run requests can still dirtify `ws_demo` if handlers or middleware write audit events or prune idempotency caches. Smoke isolation must be validated by observing the actual DB file, not by assuming dry-run semantics.
- Read-only `GET` endpoints that call a local `audit()` helper can continuously modify `ws_demo` when the frontend dev server or a browser polls them. Removing audit writes from these routes is a safe implementation fix; response payloads are unchanged.
- `git diff --name-only` returns exit 0 even when there is output; use `git diff --quiet` to reliably test for a clean fixture DB.
- A running PLS server can re-dirty `ws_demo` via read-only routes or background jobs. Stop the server before the final fixture DB cleanliness check.

## Memory Used

- None of the durable entries in `agentops/memory/mimo-backend.md` directly affected a specific implementation decision. The domain memory file was read and its working rules (read real routes/handler/schemas, keep errors explicit, prefer handler-level validation) were followed.
