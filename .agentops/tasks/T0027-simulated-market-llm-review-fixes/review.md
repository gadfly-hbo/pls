# Review

Decision: approved

## Notes

Approved. Timeout finding is fixed: simulated-market-provider no longer contains Math.max(..., 120000), and runPiPrompt receives config.timeoutMs directly from parseTimeoutMs. ws_demo handling now matches the requested baseline+V004 state. I compared HEAD vs current counts: HEAD has simulation_run=3, idempotency_key=3, audit_event=2006, simulated_market_run/create audit=3 and no subagent table; current has the same data counts plus simulated_market_subagent table with 0 rows and schema_migration V004 applied. After rerunning smoke, ws_demo remained unchanged at simulation_run=3, idempotency_key=3, audit_event=2006, sim_audit=3, subagent_rows=0. Validation reproduced: cd apps/server && npm run typecheck passed; cd apps/server && npm run schema:check passed with 4 applied migrations; cd apps/server && npm run smoke:simulated-market passed 77/77; git diff --check passed. Memory candidates were reviewed but not applied because they lack lifecycle metadata; no memory lifecycle update.

## Out Of Scope Diffs

- .mimocode/.cron-lock
- AGENTS.md
- apps/model/src/simulated-market-contract-test.ts
- apps/model/src/simulated-market.ts
- apps/server/src/db/schema.ts
- apps/server/src/routes/simulated-market.ts
- apps/server/src/services/simulated-market-adapter.ts
- apps/web/e2e/simulated-market.spec.ts
- apps/web/src/index.css
- apps/web/src/pages/SimulatedMarketWorkbench.tsx
- apps/web/src/services/api.ts
- apps/web/src/types/index.ts
- docs/notes-app.md
- "\345\220\257\345\212\250PLS\345\267\245\344\275\234\345\217\260.command"
