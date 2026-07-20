# Handoff: T0039 portrait-source-adapters (revision 7)

## What Changed

Revision 7 closes all 3 controller review blockers from revision 6:

1. **Probe lifecycle test injects _closeDb and asserts identity** (blocker 1): Probe test now injects both `_probeEvidence` and `_closeDb`. The probe captures the `DatabaseSync` identity. The injected `_closeDb` asserts strict identity (`assert.strictEqual(db, closedDbIdentity)`) and calls `db.close()`. Test asserts exactly one cleanup before the controlled exception.

2. **Unified ownership-transfer guard** (blocker 2): All post-open initialization (query_only exec + verify, schema gate, probe) is now wrapped in a single `try { ... return new AgentHarnessPortraitSource(...); } catch { cleanupDb(db); throw error; }`. Every exception before successful adapter construction calls `cleanupDb` exactly once. Ownership transfers to the adapter only on the `return` statement. Added a new test that proves schema gate failure triggers cleanup via injected `_closeDb`.

3. **docs/notes-backend.md consistency** (blocker 3): Updated heading and progress line to both say revision 7 and70/70 tests.

## Files Changed

- `apps/server/src/portrait-comparison/portrait-source/agentharness-adapter.ts` (modified: unified ownership-transfer try/catch wrapping all post-open initialization, cleanupDb called exactly once on any failure)
- `apps/server/src/portrait-comparison/portrait-source-contract-test.ts` (modified: 70 tests, probe test injects _closeDb with identity assertion, new schema gate cleanup test)
- `docs/notes-backend.md` (modified: revision 7, 70/70 tests, consistency)

## Validation

| Command | Exit | Result |
| --- | --- | --- |
| cd apps/server && npm run typecheck | 0 | Pass |
| cd apps/server && npm run portrait-source:contract-test | 0 | 70/70 pass |
| cd apps/server && npm run portrait-comparison-algorithm:contract-test | 0 | 15/15 pass |
| cd apps/server && npm run portrait-comparison-schema:contract-test | 0 | 30/30 pass |
| npm run guard:worktree | 0 | OK |
| git diff --check | 0 | Clean |
| git status --short -- protected paths | 0 | Clean |

### Key negative test cases (70 total)

**PLS adapter (11 tests):** not_ready + resolve throw, unapproved type, blank name, product no snapshots, unknown object, workspace mismatch, close, invalid time_window, case-sensitive ID, stable sort

**AH adapter (37 tests):**
- schema gate: missing view/column/extra/reorder, table masquerading
- path: relative/symlink/directory/self-DB
- capability: not_ready when no evidence, ready with evidence
- workspace mismatch, cross-workspace empty
- object not found, snapshot not found (with evidence), resolve not_ready without evidence, resolve empty evidence fails closed
- close, empty refs, wrong sourceSystem refs
- blank name, unapproved type, case-sensitive, product filter empty
- full resolve with evidence
- duplicate objectId, duplicate snapshotId, ambiguous snapshotId in resolve
- evidence binding: data_version/profile_time_window/source_batch_id/profile_id mismatch, metric_aggregation != sum, quality flags mismatch, ref sourceBatchId mismatch, ref sourceRecordType wrong, duplicate dimension_key
- mixed workspace: snapshot without evidence fails closed
- **lifecycle**: probe failure closes connection via injected seam (identity asserted), schema gate failure triggers cleanup via injected close, close failure is controlled and retryable then success marks closed and releases connection, probe and close errors use stable public messages

**Resolver (18 tests):** no-row default, table-absent fail closed, pls valid/invalid config, ah valid, inactive, unknown adapter, bad JSON, array config, missing/empty dbPath, extra keys, nonexistent path, schema drift

**Timestamp (4 tests):** date-only, offset, invalid leap year, invalid hour 24, preserves non-zero milliseconds

## Unified Ownership Guard

All post-open initialization is wrapped in a single ownership-transfer try/catch:

```typescript
try {
  db.exec("PRAGMA query_only = ON");
  // ... verify, schema gate, probe ...
  return new AgentHarnessPortraitSource(db, ...); // ownership transfers here
} catch (error) {
  cleanupDb(db); // exactly once on any failure
  throw error;
}
```

- Every exception before successful construction calls `cleanupDb` exactly once
- Ownership transfers to the adapter only on the `return` statement
- Controlled errors (PortraitSourceSchemaError, PortraitSourceUnavailableError) are thrown as-is
- Tests inject `_closeDb` that receives the exact `DatabaseSync` for identity assertion

## Risks

1. PLS audience_profile.confidence is NOT NULL but PortraitSnapshot.confidence allows null. Adapter is null-safe.
2. PLS adapter queries audience_profile base table (not _latest) for listing snapshots - intentional for multi-version comparison.
3. AH v_pls_channel_profile_overview allows extras; snapshots/evidence views require exact columns.
4. data_source table existence check now fails closed - a workspace without DATA_MANAGEMENT_DDL cannot use the resolver until the table is created.
5. AH evidence quality flags must match snapshot quality flags exactly - this is strict but ensures binding integrity.
6. close() only marks closed after successful close - if close fails, the connection remains retryable.

## Open Questions

- W05: how PortraitSource quality flags map to V005 ready|limited + algorithm qualityEligibility
- W05: where application code converts algorithm assessments to V005 rows
- Should resolver be wired into server DI?

## Contract Drift

None. Module is purely additive. Only existing files modified: index.ts (one re-export) and package.json (one script).

## Protected Paths And Generated Artifacts

- npm run guard:worktree passed
- git status --short -- protected paths returned no output
- All contract tests use /tmp temp dirs, cleaned in finally blocks

## Memory Used

- Do not trust PRD or subagent summaries for falsifiable external-repo facts: Read real PLS schema.ts, AgentHarness migrations 019/029/030 + validation 030, and WorkPLS reference before implementing. Affected: all adapter implementations.
- External data adapters must fail-closed at every contract boundary: Every mapper validates non-blank fields; evidence refs validated per-element; schema gate rejects drift; resolver fails closed without fallback. Affected: all revision 1-7 fixes.
- Handoff claims must be verified against actual test evidence: Ran all 70 tests and confirmed pass count. Updated docs/notes-backend.md to reflect actual state. Affected: handoff validation section.

## Memory Candidates

- All post-open initialization must be wrapped in a single ownership-transfer try/catch. Every exception before successful construction must call cleanup exactly once. Ownership transfers only on successful return. (lesson_type: rule, suggested review: 2026-10-17)
- Internal test seams must assert identity: injected cleanup must receive the exact same resource as the production code. Use assert.strictEqual for identity checks. (lesson_type: rule, suggested review: 2026-10-17)

## Suggested Next Task

W05: Comparison repository/application transaction, idempotent Run, list/detail, rule explanation persistence, archive. The PortraitSource interface from W04 provides the stable source seam.
