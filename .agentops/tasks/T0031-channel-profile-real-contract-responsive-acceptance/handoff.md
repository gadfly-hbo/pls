# Handoff: T0031 Channel Profile Real Contract Responsive Acceptance

## What Changed
- Added `VITE_USE_MOCK=false` channel profile contract coverage that uses backend-shaped `page.route` responses and asserts route hits for:
  - `/api/v0/channel-objects` list
  - `/api/v0/channel-objects/:id` detail
  - `/api/v0/channel-objects/:id/audience-profiles`
  - `/api/v0/channel-objects/:id/product-fit-profiles`
  - `/api/v0/channel-objects/:id/bindings`
  - `/api/v0/channels/entities/:id`
- Split mock-only fixture tests from the real contract path by skipping local mock fixture assumptions when `VITE_USE_MOCK=false`.
- Added desktop and 390px mobile overflow checks for the channel profile import modal and batch match analysis modal.
- Replaced visible engineering labels in the channel object overview table with Chinese business labels.
- Updated `docs/notes-viz.md` current status with the completed channel profile acceptance state, passed validation results, and remaining live-backend risk.
- Revision: corrected `docs/notes-viz.md` wording after review so it no longer says T0031 is in progress or describes a worker validation plan.
- Revision: restored `data/workspaces/ws_demo/db.sqlite` to `HEAD` after review because T0031 explicitly must not include fixture DB changes.
- Revision: re-verified fixture DB cleanup after second review; `git status --short -- data/workspaces/ws_demo/db.sqlite` and `git diff --name-only -- data/workspaces/ws_demo/db.sqlite` now return no output.
- Restored generated `apps/web/playwright-report/index.html` after Playwright runs; no report artifact is included in this handoff.

## Files Changed
- `apps/web/e2e/channel-object-library.spec.ts`
  - Adds real API mode gate, backend-shaped contract route stubs, route hit assertions, and desktop/mobile modal overflow coverage.
- `apps/web/src/pages/ChannelObjectLibrary.tsx`
  - Changes the dry-run failure wording to `导入前检查失败` and replaces overview field labels such as `canonicalObjectKey` with Chinese labels.
- `docs/notes-viz.md`
  - Adds T0031 acceptance notes and validation/risk summary.

## Validation
- Passed: `cd apps/web && npm run build`
- Passed: `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
  - Result: `10 passed, 1 skipped`
- Passed: `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium`
  - Result: `1 passed, 10 skipped`
  - The passing test asserts all target channel profile routes were hit through backend-shaped `page.route` responses.
  - The local real backend was not running; Vite logged expected proxy `ECONNREFUSED` noise for unrelated AppShell requests.
- Passed: `git diff --check`
- Revision validation passed: `git diff --check`
- Fixture DB cleanup validation passed: `git diff --check`; `data/workspaces/ws_demo/db.sqlite` and `apps/web/playwright-report/index.html` are not in diff.
- Second fixture DB cleanup validation passed: `git diff --check`; `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` returned no output; `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` returned no output.
- Additional cleanup: terminated one leftover Playwright dev server on port `5175` from a timed-out earlier run, then reran the real contract test successfully.

## Risks
- The real backend was not running, so the real contract validation used same-shape Playwright route interception as allowed by the brief. This verifies frontend adapter shape and route usage, but not live backend availability or seeded `ws_demo` data.
- Real channel object light edit and batch analysis are still not supported by backend API; frontend real mode continues to avoid faking success.
- Current worktree includes unrelated/pre-existing changes outside T0031 scope, including server files, T0028/T0029/T0030 task artifacts, `apps/web/src/App.tsx`, `MatchCoreWorkbench.tsx`, `api.ts`, and `types/index.ts`. T0031 did not revert or modify those unrelated changes.

## Open Questions
- None for the frontend acceptance scope.

## Memory Used
- `agentops/memory/kilo-frontend.md` / `docs/notes-viz.md` guidance on `VITE_USE_MOCK=false` contract tests influenced the decision to assert explicit route hits and avoid trusting local mock-only smoke.
- Frontend memory guidance on Playwright generated artifacts influenced restoring `apps/web/playwright-report/index.html` before handoff.
