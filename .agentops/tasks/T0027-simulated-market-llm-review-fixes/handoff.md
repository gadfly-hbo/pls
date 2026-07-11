# Handoff: T0027-simulated-market-llm-review-fixes (Revision 1)

## What Changed

1. **Timeout fix in `apps/server/src/services/simulated-market-provider.ts`**: removed the silent `Math.max(config.timeoutMs, 120000)` floor in `callPiSimulatedMarketLlm()` and passed `config.timeoutMs` directly to `runPiPrompt()`. The existing `parseTimeoutMs()` already defaults invalid/empty/non-positive values to `30000`.
2. **ws_demo restore and clean V004 migration**: after review feedback that the first cleanup had deleted baseline HEAD rows, restored `data/workspaces/ws_demo/db.sqlite` from `HEAD` and reapplied only the current schema/migrations via `npm run migrate`. The resulting DB preserves all HEAD baseline data and adds only the V004 `simulated_market_subagent` table and schema migration record.

## Files Changed

- `apps/server/src/services/simulated-market-provider.ts` (removed `Math.max(..., 120000)`)
- `data/workspaces/ws_demo/db.sqlite` (restored from HEAD and migrated to V004; no data changes relative to HEAD)

## Validation

```bash
cd apps/server && npm run typecheck
# ✅ tsc --noEmit passed

cd apps/server && npm run schema:check
# ✅ Schema check passed (ws_demo: 4 migrations applied, 0 pending, 0 failed)

cd apps/server && npm run smoke:simulated-market
# ✅ RESULT: {"ok":true,"passed":77,"failed":0}

git diff --check
# ✅ No whitespace/diff hygiene issues
```

Post-restore/migrate verification (`data/workspaces/ws_demo/db.sqlite`):

| Table / Metric | Count |
|---|---|
| `simulation_run` | 3 |
| `idempotency_key` | 3 |
| `audit_event` total | 2006 |
| `audit_event` simulated_market_run/create | 3 |
| `simulated_market_subagent` | 0 |
| `schema_migration` V004 | applied |

These counts match the reviewer's required HEAD baseline + V004 state.

## Review Findings Addressed

- **P2 timeout override**: `runPiPrompt()` now receives `config.timeoutMs` directly, with no silent raise to `120000ms`. Default/fallback stays `30000ms` per `docs/api-contract.md`.
- **P2 ws_demo smoke pollution**: restored `ws_demo` to the approved HEAD baseline, then applied the current schema migration. The file still appears in `git status` because of the V004 schema addition, but the data content matches HEAD exactly and no simulated-market smoke rows remain.
- **Smoke isolation preserved**: `smoke-simulated-market.mjs` writes only to `WS_MAIN` / `WS_OTHER` temporary workspaces; `ws_demo` is untouched by the smoke run.

## Risks

- `data/workspaces/ws_demo/db.sqlite` remains modified in `git status` because V004 added the `simulated_market_subagent` table. This is structural only; the data counts match HEAD baseline. Once V004 is committed to `HEAD`, this diff will resolve naturally.
- Restoring from `HEAD` was a controlled operation scoped to this single file; no other workspace directories were touched.

## Open Questions

1. Should the V004 migration file be committed so that `ws_demo` no longer shows as modified relative to `HEAD`? (This is outside the bounded scope of this task.)
2. Does the controller want the broader `apps/server/scripts/smoke-simulated-market.mjs` subagent changes reviewed as part of this follow-up, or were they already accepted in the approved `T0021`?

## ws_demo Handling Notes

- Restored the file from `HEAD` using `git checkout HEAD -- data/workspaces/ws_demo/db.sqlite`.
- Reapplied schema via `cd apps/server && npm run migrate`.
- Did not delete or rebuild any temporary workspace directories.
- Did not modify `ws_demo` data rows; only the V004 schema + migration record was added.
- Baseline counts verified against HEAD: `simulation_run=3`, `idempotency_key=3`, `audit_event=2006`, `simulated_market_run/create=3`.

## Whether Controller Review Is Needed

Recommended for a final sign-off on the remaining `ws_demo` binary diff (structural V004 only) and to decide whether the V004 migration should be committed separately.

## Memory Candidates

- **Backend timeout configuration**: silent `Math.max(..., largeDefault)` overrides bypass explicit env-based timeout control and can mask slow calls. Provider code should pass parsed env values directly unless a documented safety floor is required.
- **Fixture DB cleanup discipline**: when a tracked fixture DB like `ws_demo` is polluted by smoke runs, restore from `HEAD` and reapply migrations rather than hand-deleting rows. Hand-deleting risks removing baseline demo data that existed in the committed fixture.
- **Baseline verification before cleanup**: compare `HEAD` counts against current counts before deleting rows from a fixture DB. What looks like "smoke-generated" may include intentional demo rows.
