# T0043 Handoff — Portrait Comparison Acceptance (Revision 2)

## What Changed

Fixed all 3 blockers from revision 1:

1. **Responsive test now uses controlled `page.route` intercepts** — test skips in mock mode, runs only with `VITE_USE_MOCK=false`. All `/api/v0/portrait-comparisons*` routes intercepted with backend-shaped DTOs. No ECONNREFUSED/502.

2. **Responsive test covers detail view with long fields** — uses a 64-char run ID, 64-char checksums (`algorithmConfigChecksum`, `comparisonContractChecksum`, `qualityPolicyConfigChecksum`), and long `sourceBatchId`. Asserts `body.scrollWidth` AND `documentElement.scrollWidth` against `window.innerWidth` for both history list and detail view.

3. **Docs updated** — `docs/notes-app.md` records T0043 execution fact; `docs/workpls-absorption-retirement-checklist.md` W08 row updated to `completed` with evidence.

## Files Changed

| File | Change |
|---|---|
| `apps/web/e2e/portrait-comparison.spec.ts` | Responsive test: added `page.route` intercepts, long-field detail, dual scrollWidth assertions |
| `docs/notes-app.md` | Added T0043 execution fact to status section |
| `docs/workpls-absorption-retirement-checklist.md` | W08 row: `changes_requested` → `completed` with revision 2 evidence |

## Acceptance Matrix

| Requirement | Test/Evidence | Status |
|---|---|---|
| `not_released` readiness disables create | Test 1 (mock): `pc-create-disabled-notice` visible | ✅ |
| History list `{ data: { items, page } }` | Test 2 (mock): list visible, item text matches | ✅ |
| Detail: nested `source`, `dimensionAssessments`, `archiveEvents` | Test 3 (mock): `pls_workspace`, `included`, dimension table | ✅ |
| Archive POST `Idempotency-Key`, no `runId`, correct body | Test 6 (real): header + body assertions | ✅ |
| `expectedSequence` next logic (empty => 1) | Test 6 (real): `expectedSequence === 1` | ✅ |
| 409 conflict error UI | Test 7 (real): "Operation conflict" visible | ✅ |
| 404 detail error UI | Test 8 (real): "Failed to load run detail" visible | ✅ |
| No SQL/stack/DB-path leak | Test 10 (real): banner text scan | ✅ |
| Responsive 390px history + detail, long fields | Test 9 (real): `page.route` intercepts, long run id/checksum/source, dual scrollWidth | ✅ |
| Real contract request hit | Test 5 (real): readiness + list + detail assertions | ✅ |
| Archive filter active/archived/all | Test 4 (mock): filter switching | ✅ |

## Responsive Evidence

- Test 9 runs with `VITE_USE_MOCK=false` and `page.route` intercepts for all `/api/v0/portrait-comparisons*` paths.
- Uses `longRunId` (64+ chars), `longChecksum` (64 chars), `longSourceBatchId` (73 chars).
- Checks both history list and detail view after clicking through.
- Asserts `document.body.scrollWidth <= window.innerWidth` AND `document.documentElement.scrollWidth <= window.innerWidth`.

## Validation

| Command | Exit Code | Result |
|---|---|---|
| `cd apps/web && npm run build` | 0 | tsc + vite build pass |
| `cd apps/web && npm run lint` | 0 | oxlint clean |
| `cd apps/web && npx playwright test e2e/portrait-comparison.spec.ts` | 0 | 4 passed, 6 skipped (mock) |
| `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-comparison.spec.ts` | 0 | 6 passed, 4 skipped (real) |
| `npm run guard:worktree` | 0 | Clean |
| `git diff --check` | 0 | Clean |
| Protected paths | 0 | Clean |

Total: 10 tests. Mock: 4 passed / 6 skipped. Real contract: 6 passed / 4 skipped.

## Protected Paths Cleanup

- `data/workspaces/ws_demo/db.sqlite` — no changes
- `apps/web/playwright-report/` — not generated (output to /tmp)
- `apps/web/test-results/` — not generated (output to /tmp)

## Risks

- Responsive test only checks `scrollWidth` overflow, not visual quality or text truncation. Screenshot-based regression would require additional tooling.
- The long run ID (`run_0123456789abcdef..._very_long_id_suffix`) uses `font-family: monospace` in CSS which may wrap differently across browsers.

## Open Questions

- Should W09 (WorkPLS retirement audit) verify `comparisonContractChecksum` field format?

## Memory Used

- **"Real-contract Playwright intercepts must mirror the backend DTO"** — Informed the fix: responsive test must intercept all API routes with backend-shaped DTOs.
- **"Match visual assertions to screenshot-visible containers"** — Informed dual `scrollWidth` assertion approach.

## Memory Candidates

- Responsive acceptance tests in `VITE_USE_MOCK=false` mode must install `page.route` intercepts for all API paths the page uses, not just the primary one. Unintercepted paths cause ECONNREFUSED/502 proxy errors that corrupt test evidence.

## Handoff Self-Audit PASS Evidence

```
handoff-self-audit: T0043 .agentops/tasks/T0043-portrait-comparison-acceptance-real-contract-e2e/handoff.md

  1. Contract version everywhere — PASS (no new contract; consumes T0041)
  2. Notes history retired — PASS (docs/notes-app.md + checklist updated)
  3. Real fixture for each null/invalid case — PASS (not applicable)
  4. Distinct validator failure codes — PASS (not applicable)
  5. Contract drift scan — PASS (no code changes; E2E confirms alignment)
  6. Smoke executed — PASS (4 mock + 6 real-contract passed)
  7. Memory honesty — PASS (two lessons cited)
  G. Worker Delivery Governance — PASS (acceptance task)

Result: PASS — submit
```
