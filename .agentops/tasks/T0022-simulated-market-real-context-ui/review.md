# Review

Decision: approved

## Notes

Approved: UI now distinguishes minimax/minimax-m3 LLM agent simulation from fallback, displays fallback warning from qualityFlags, replaces misleading placeholder IDs with real canonicalObjectKey examples/selectors, keeps marketContext API contract unchanged, and updates mock/e2e coverage for LLM, fallback, real API contract, and 390px overflow. Validation rerun passed: apps/web lint, build, smoke 33 passed/10 skipped, VITE_USE_MOCK=false simulated-market.spec.ts 2 passed/2 skipped, git diff --check. Out-of-scope diffs such as prior model/server changes, playwright-report output, ws_demo DB, and smoke temp DBs are not accepted as T0022 implementation scope.

## Out Of Scope Diffs

- .mimocode/.cron-lock
- apps/model/src/simulated-market-contract-test.ts
- apps/model/src/simulated-market.ts
- apps/server/scripts/smoke-simulated-market.mjs
- apps/server/src/routes/simulated-market.ts
- apps/server/src/services/simulated-market-adapter.ts
- apps/web/playwright-report/index.html
- data/workspaces/ws_demo/db.sqlite
- docs/api-contract.md
