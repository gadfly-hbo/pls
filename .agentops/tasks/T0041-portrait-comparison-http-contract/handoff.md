# T0041 Handoff — Revision 3

## What Changed

Closed the scope/authorization blocker from revision 2: moved algorithm config from application layer into the HTTP route (within allowed_paths).

### Reverted out-of-scope changes

- Deleted `apps/server/src/portrait-comparison/application/algorithm-config.ts` (was not in allowed_paths).
- Reverted `apps/server/src/portrait-comparison/application/index.ts` to original state (removed PLS_DEFAULT_ALGORITHM_CONFIG and getProductionQualityPolicy exports).
- Removed `PLS_DEFAULT_ALGORITHM_CONFIG` from `apps/server/src/portrait-comparison/index.ts` re-exports.

### Moved config into route

- Defined `PORTRAIT_COMPARISON_ALGORITHM_CONFIG` directly in `apps/server/src/routes/portrait-comparisons.ts` (within allowed_paths).
- Exported it so the test can import it.
- Config matches the approved T0038/T0040 runtime contract: algorithmVersion "pls-v1", 2 candidate dimensions (audience_age_distribution, audience_gender_distribution), weights 0.5/0.5.

### Updated test

- Test imports `PORTRAIT_COMPARISON_ALGORITHM_CONFIG` from `../routes/portrait-comparisons.js` instead of from `../portrait-comparison/index.js`.

## Files Changed

- `apps/server/src/routes/portrait-comparisons.ts` — algorithm config defined locally, exported
- `apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts` — import from route
- `apps/server/src/portrait-comparison/index.ts` — removed PLS_DEFAULT_ALGORITHM_CONFIG re-export
- `apps/server/src/portrait-comparison/application/index.ts` — reverted to original (no changes)
- `apps/server/src/portrait-comparison/application/algorithm-config.ts` — deleted

## Scope Compliance

All changes are within T0041 allowed_paths:
- `apps/server/src/routes/portrait-comparisons.ts` — allowed
- `apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts` — allowed
- `apps/server/src/portrait-comparison/index.ts` — allowed (re-exports only)
- `apps/server/package.json` — allowed (no changes this revision)
- `docs/notes-backend.md` — allowed
- `docs/workpls-absorption-retirement-checklist.md` — allowed

No files in `apps/server/src/portrait-comparison/application/` were modified.

## Validation

| Command | Result |
|---|---|
| `cd apps/server && npm run typecheck` | Pass |
| `cd apps/server && npm run portrait-comparison-http:contract-test` | 32/32 pass |
| `cd apps/server && npm run portrait-comparison-application:contract-test` | 113/113 pass |
| `cd apps/server && npm run portrait-source:contract-test` | 70/70 pass |
| `cd apps/server && npm run portrait-comparison-algorithm:contract-test` | 15/15 pass |
| `cd apps/server && npm run portrait-comparison-schema:contract-test` | 30/30 pass |
| `npm run guard:worktree` | OK |
| `git diff --check` | Clean |
| `git diff -- apps/server/src/portrait-comparison/application/` | No changes |

## Risks

- Algorithm config is defined in the HTTP route layer rather than the application layer. If the application layer's algorithm config changes, the HTTP route config must be updated manually to stay in sync. This is acceptable because T0041 scope is HTTP transport only.

## Open Questions

- None.

## Self-Audit Evidence (7-Point PASS)

```
handoff-self-audit: T0041 .agentops/tasks/T0041-portrait-comparison-http-contract/handoff.md
  1. Contract version everywhere — PASS
     - PLS_COMPARISON_CONTRACT_VERSION = "1" (application/types.ts:9, unchanged)
     - Route uses constant (routes/portrait-comparisons.ts:123)
     - No application layer changes

  2. Notes history retired — PASS
     - docs/notes-backend.md §0 updated
     - docs/workpls-absorption-retirement-checklist.md W06 row updated

  3. Real fixture for each null/invalid case — PASS
     - Real runs seeded via application layer with released policy
     - All HTTP tests use real Hono server with real middleware
     - Zero-write assertion counts all 8 tables

  4. Distinct validator failure codes — PASS
     - Route error mapping covers all application error types
     - Tests assert specific HTTP codes

  5. Contract drift scan — PASS
     - All HTTP contract requirements from brief are covered
     - No application layer changes
     - Algorithm config defined in allowed path

  6. Smoke executed if brief demands — PASS
     - No smoke commands in brief validation

  7. Memory honesty — PASS
     - Memory Used: "External data adapters must fail-closed" — shaped config alignment
     - Memory Used: "Handoff claims must be verified" — all counts verified

Result: PASS — submit
```
