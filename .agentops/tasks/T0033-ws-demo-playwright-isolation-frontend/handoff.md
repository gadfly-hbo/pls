# What Changed

- Updated Playwright config so HTML reports and test output default to system temp directories instead of tracked `apps/web/playwright-report/` or in-repo `test-results`.
- Added `VITE_PLS_WORKSPACE` support to the frontend API adapter for real backend requests that previously hardcoded `X-PLS-Workspace: ws_demo`.
- In `VITE_USE_MOCK=false` Playwright runs, the config now injects a temporary `ws_playwright_<timestamp>` workspace by default.
- Strengthened `channel-object-library.spec.ts` real contract test to assert intercepted real-shape requests carry the injected workspace header and do not use `ws_demo`.
- Updated `docs/notes-viz.md` with the Playwright artifact and workspace isolation behavior.

# Files Changed

- `apps/web/playwright.config.ts`
- `apps/web/src/services/api.ts`
- `apps/web/e2e/channel-object-library.spec.ts`
- `docs/notes-viz.md`
- `.agentops/tasks/T0033-ws-demo-playwright-isolation-frontend/handoff.md`

# Playwright artifact isolation behavior

- Default HTML report path is now `${TMPDIR}/pls-web-playwright-report` unless `PLAYWRIGHT_HTML_REPORT` is explicitly set.
- Default test output path is now `${TMPDIR}/pls-web-test-results` unless `PLAYWRIGHT_TEST_OUTPUT_DIR` is explicitly set.
- Running the required Playwright commands did not modify tracked `apps/web/playwright-report/index.html` or create tracked `apps/web/test-results` changes.

# Real API / route contract behavior

- `fetchApi`, single product batch upload, CSV dry-run upload, and tool artifact fetches now use `import.meta.env.VITE_PLS_WORKSPACE || 'ws_demo'` for `X-PLS-Workspace`.
- Playwright config keeps mock mode defaulting to `ws_demo`, but real API mode defaults to a temporary `ws_playwright_<timestamp>` workspace.
- The channel object real contract test still uses same-shape `page.route` interception and asserts all intercepted channel object/profile requests include the temporary workspace header instead of `ws_demo`.

# Validation

- `cd apps/web && npm run build` passed.
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts` passed: 10 passed, 1 skipped.
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium` passed: 1 passed, 10 skipped.
- `git diff --check` passed.
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` produced no output.
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results apps/web/playwright-report` produced no output.

# Risks

- Real contract validation still uses Playwright route interception because no live backend was running; unrelated overview preload requests logged Vite proxy `ECONNREFUSED`, but the target channel-object contract requests were intercepted and asserted.
- `VITE_PLS_WORKSPACE` changes runtime headers for all real-mode frontend requests. Default production/local behavior remains `ws_demo` unless the env var or Playwright real-mode config overrides it.
- The worktree already had pre-existing frontend and docs changes from prior tasks in some touched files; this handoff only claims the isolation additions listed above.

# Open Questions

- None.

# Memory Used

- `Scope mock edits to the task-relevant sections`: used while reviewing `apps/web/src/services/api.ts` to keep the task change limited to workspace/header behavior and avoid modifying unrelated mock data blocks.
