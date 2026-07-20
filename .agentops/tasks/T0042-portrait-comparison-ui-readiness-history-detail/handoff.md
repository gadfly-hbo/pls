# T0042 Handoff — Portrait Comparison UI (Revision 2: Sequence Fix + Archive/Error E2E)

## What Changed

Fixed `expectedSequence` logic and added missing E2E coverage for archive POST and error envelopes.

### Changes from revision 1

1. **Sequence logic** (`PortraitComparisonWorkbench.tsx:226`): Renamed `getLastArchiveSequence` → `getNextExpectedSequence`. Returns `max(eventSequence) + 1` for non-empty `archiveEvents`, or `1` for empty (backend requires `expectedSequence >= 1`). First archive now correctly sends `expectedSequence=1`.

2. **Archive POST E2E** (`e2e/portrait-comparison.spec.ts`): New test "archive sends POST with Idempotency-Key and correct body (no runId)" — navigates to detail, clicks Archive, asserts:
   - POST to `/api/v0/portrait-comparisons/:runId/archive`
   - `Idempotency-Key` header present
   - Body has `operation`, `expectedCurrentState`, `expectedSequence` (no `runId`)

3. **409 conflict E2E** (`e2e/portrait-comparison.spec.ts`): New test "409 conflict shows error banner" — intercepts archive POST with 409, asserts error banner shows "Operation conflict".

4. **404 detail E2E** (`e2e/portrait-comparison.spec.ts`): New test "404 detail shows error banner" — intercepts detail GET with 404, asserts error banner shows "Failed to load run detail".

5. **Error detection** (`PortraitComparisonWorkbench.tsx:211`): Added `msg.includes('stale')` and `msg.includes('state has changed')` to the conflict detection pattern alongside existing `409`/`conflict` checks.

## Files Changed

| File | Change |
|---|---|
| `apps/web/src/pages/PortraitComparisonWorkbench.tsx` | Fixed `getNextExpectedSequence` (was `getLastArchiveSequence` returning 0), added `stale`/`state has changed` conflict detection |
| `apps/web/e2e/portrait-comparison.spec.ts` | Added 3 new E2E tests (archive POST, 409 conflict, 404 detail) |

## Validation

| Command | Exit Code | Result |
|---|---|---|
| `cd apps/web && npm run build` | 0 | tsc + vite build pass |
| `cd apps/web && npm run lint` | 0 | oxlint clean |
| `cd apps/web && npx playwright test e2e/portrait-comparison.spec.ts` | 0 | 4 passed (mock), 4 skipped |
| `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-comparison.spec.ts` | 0 | 4 passed (real contract), 4 skipped |
| `npm run guard:worktree` | 0 | Clean |
| `git diff --check` | 0 | Clean |
| Protected paths | 0 | Clean |

E2E coverage (8 tests total, brief requirements met):
- `not_released` readiness disables create, shows blockers ✓
- History list with default active filter, item click opens detail ✓
- Detail shows participant source info, dimension table ✓
- Archive filter switches active/archived/all ✓
- Archive POST sends `Idempotency-Key` + correct body (no `runId`) ✓
- 409 conflict shows error banner ✓
- 404 detail shows error banner ✓
- `VITE_USE_MOCK=false` contract test asserts real requests issued ✓

## Blocker Checklist (from review)

| # | Blocker | Status |
|---|---|---|
| 1 | expectedSequence returns 0 for first archive | Fixed: returns 1 for empty archiveEvents |
| 2 | No archive POST E2E coverage | Fixed: test asserts Idempotency-Key, body shape, no runId |
| 3 | No 409/404 error envelope E2E | Fixed: two new tests cover both |

## Memory Used

- **"Real-contract Playwright intercepts must mirror the backend DTO"** (kilo-frontend.md) — Informed E2E fixture approach: all intercepts use real backend shapes.
- **"Do not patch around Backend contract drift"** (kilo-frontend.md) — Informed sequence fix: corrected the logic to match backend requirement rather than patching around it.

## Memory Candidates

- Sequence fields in archive/restore APIs represent *next expected sequence* (max + 1), not last sequence. Backend validates `expectedSequence >= 1`.

## Risks

- Error banner text for 409 conflict is a translated "Operation conflict" message, not the raw backend error. If backend changes the error semantics, the UI detection pattern (`stale`/`conflict`/`409`) may need updating.
- The `getNextExpectedSequence` uses `Math.max(...archiveEvents.map(...))` which is O(n) on a typically small array. No performance concern for current use.

## Open Questions

- Should the workbench support creating comparison runs when production policy is released?
- Should detail view show explanation attempt content when `content` is non-null?
