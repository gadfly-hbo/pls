# Acceptance Scope

- Final acceptance for the `ws-demo-fixture-isolation` batch.
- Covered T0032 backend write isolation, T0033 frontend Playwright artifact/workspace isolation, and T0034 unified worktree diff guard.
- Verified the acceptance without modifying `data/workspaces/ws_demo/db.sqlite`, `apps/web/playwright-report/index.html`, or `apps/web/test-results/`.

# What Changed

- Updated `docs/notes-infra.md` with T0035 batch acceptance status, validation evidence, remaining risks, and the recommendation to evaluate making tracked SQLite fixtures rebuildable generated artifacts.
- Updated `docs/notes-backend.md` with the T0035 backend smoke revalidation result and the completed status of T0033/T0034/T0035 follow-up work.
- Updated `docs/notes-data.md` with `ws_demo` fixture isolation acceptance status and the long-term generated-fixture recommendation.
- Updated `docs/notes-viz.md` with the T0035 Playwright artifact isolation revalidation result.
- Revision: removed the generated temporary smoke workspace artifact `data/workspaces/ws_col_1783861748037/` after controller review flagged it as out of scope.

# Files Changed

- `docs/notes-infra.md`
- `docs/notes-backend.md`
- `docs/notes-data.md`
- `docs/notes-viz.md`
- `.agentops/tasks/T0035-ws-demo-isolation-acceptance/handoff.md`

# Validation Results

- `npm run guard:worktree` passed before smoke validation: `OK: no forbidden generated artifacts in worktree diff.`
- `cd apps/server && npm run smoke:channel-object-library` first failed because no API server was running at `localhost:3100` (`ECONNREFUSED`). This did not touch `ws_demo`; the script selected temporary workspace `ws_col_1783861733305`.
- Started local API server with `cd apps/server && npm run start`, then reran `cd apps/server && npm run smoke:channel-object-library` successfully.
- Backend smoke result: `RESULT: {"name":"channel-object-library","mode":"dry-run","workspace":"ws_col_1783861748037","passed":22,"failed":0,"ok":true}`.
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts` passed: 10 passed, 1 skipped.
- `git diff --check` passed after notes updates.
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` produced no output.
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results apps/web/playwright-report` produced no output.
- Final `npm run guard:worktree` passed after stopping the local API server and after notes updates.
- Revision validation: `git status --short -- data/workspaces/ws_col_1783861748037 data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results apps/web/playwright-report` produced no output after cleanup.
- Revision validation: `npm run guard:worktree` passed after cleanup.
- Revision validation: `git diff --check` passed after cleanup.
- Revision validation: `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` produced no output after cleanup.

# Validation

- See `Validation Results` above. Required guard, backend smoke, frontend smoke, diff hygiene, and protected artifact checks all passed after starting the local API server for the backend smoke.

# Remaining Risks

- `apps/server/scripts/seed.ts` remains a known manual `ws_demo` write path outside this batch's `.mjs` script guard scope.
- `PLS_ALLOW_WS_DEMO_WRITE=1` and `PLS_ALLOW_DIRTY_WORKTREE=1` are controller-only overrides; misuse can bypass the new guardrails.
- `ws_demo/db.sqlite` is still a tracked runtime SQLite binary, so non-script/manual writes can still dirty it. The guard catches diff pollution, but does not eliminate the architectural source of risk.
- Backend smoke requires a running API server; direct script execution fails fast with `ECONNREFUSED` when no server is available.

# Risks

- See `Remaining Risks` above. The main residual risks are the out-of-scope `seed.ts` write path, controller-only override misuse, and the tracked runtime SQLite fixture model.

# Whether further architecture work is recommended

- Yes. Recommended next architecture step is to evaluate turning `data/workspaces/ws_demo/db.sqlite` into a rebuildable generated artifact backed by migrations and demo/import packages, instead of relying on a long-lived tracked runtime DB binary.
- Keep `npm run guard:worktree` as a mandatory pre-handoff/controller-review check even if fixture generation is redesigned.

# Open Questions

- Should `apps/server/scripts/seed.ts` receive the same `ws_demo` guard, or be replaced by a temporary-workspace-only fixture initializer?
- Should CI or Task Bus tooling enforce `npm run guard:worktree` automatically before `handoff_ready`?
- Should future work expand the forbidden artifact list beyond `ws_demo/db.sqlite`, Playwright report, and `test-results/`?
