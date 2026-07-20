# T0040 Handoff — Revision 36

## What Changed

Closed all 5 bounded blockers from revision 35 review:

###1. Unknown/extra evidence rejection

Added explicit rejection of evidence rows whose `dimensionKey` is not in `algorithmConfig.candidateDimensions`. The validator now builds a `candidateKeySet` from the config and checks every evidence row against it before indexing. Two new negative tests for each role (baseline/comparison).

- Implementation: `comparison-application.ts` `validateDetailAggregateConsistency` §3 — `candidateKeySet` check added before role/key indexing.
- Tests: `detail: extra evidence on baseline side (unknown dimension) throws ComparisonStateError`, `detail: extra evidence on comparison side (unknown dimension) throws ComparisonStateError`.

###2. Run-scoped validation (removed workspace-global orphan scan)

Removed the workspace-global orphan outcome scan that could make every healthy Run in the workspace unreadable due to an unrelated orphan. Validation is now fully scoped to the requested Run via the per-run outcome membership check (each outcome's `explanationAttemptId` must exist in the run's attempt set).

- Implementation: `comparison-application.ts` — removed orphan count query from `validateDetailAggregateConsistency`.
- Test: `detail: unrelated orphan outcome does not poison healthy run detail (run-scoped validation)` — creates two runs, inserts an orphan outcome referencing a fabricated attempt id, verifies both runs' detail reads succeed without error.

###3. Post-insert validation audit test uses real validator

Changed the test from directly throwing `ComparisonStateError` from the fault hook to corrupting an inserted row (`baseline_normalized_value = 99.5`, within V005 CHECK range 0..100) and letting the real `verifyPersistedNumericalConsistency` validator detect the mismatch and throw. The test verifies exactly one sanitized audit row with `reason_code = "post_insert_validation_failed"` and eight-table rollback.

- Implementation: `portrait-comparison-application-contract-test.ts` — `_faultHook("inside_transaction_before_validation")` now runs `UPDATE comparison_dimension_assessment SET baseline_normalized_value = 99.5 WHERE participation = 'included'` instead of throwing directly.
- Note: initial attempt used 999.0 which violated V005 CHECK constraint (`baseline_normalized_value <= 100`), causing the UPDATE to fail at SQLite level before the validator could run. Fixed to99.5 (within range, wrong value).

###4. NUL bytes replaced with `::` separator

Replaced literal NUL bytes (`\x00`) in role/dimension map keys with readable `::` separator. NUL bytes were present on3 locations in `validateDetailAggregateConsistency`:
- Line 1739: `const key = \`${role}::${e.dimensionKey}\``
- Lines 1779-1780: `evidenceByRoleAndKey.get(\`baseline::${candidate.dimensionKey}\`)` / `comparison::...`

Verified via `od -c` that no NUL bytes remain in the file.

###5. Self-audit PASS evidence included

The7-point handoff self-audit is included as evidence in this handoff (see below).

### Memory Candidate lifecycle metadata

Added required lifecycle metadata to the Memory Candidate entry:
- `lesson_type`: rule
- `created_at`: 2026-07-19
- `last_used_at`: never
- `use_count`: 0
- `expires_at`: 2026-10-19
- `status`: active

## Files Changed

- `apps/server/src/portrait-comparison/application/comparison-application.ts` — unknown evidence rejection, NUL byte fix, orphan scan removal.
- `apps/server/src/portrait-comparison/portrait-comparison-application-contract-test.ts` — post-insert audit test rewrite,2 new unknown-evidence tests,1 new run-scoped orphan test, orphan test rewritten.

## Validation

| Command | Result |
|---|---|
| `cd apps/server && npm run typecheck` | Pass |
| `cd apps/server && npm run portrait-comparison-application:contract-test` | 113/113 pass |
| `cd apps/server && npm run portrait-source:contract-test` | 70/70 pass |
| `cd apps/server && npm run portrait-comparison-algorithm:contract-test` | 15/15 pass |
| `cd apps/server && npm run portrait-comparison-schema:contract-test` | 30/30 pass |
| `npm run guard:worktree` | OK |
| `git diff --check` | Clean |
| `git status --short -- protected paths` | Clean |
| `git diff --name-only -- protected paths` | Clean |

## Per-Blocker Evidence

### B1: Detail exact aggregate validation
- Implementation: `comparison-application.ts` `validateDetailAggregateConsistency` (lines ~1670-1900).
- Negative tests (13 total):
  - `detail: deleting one assessment throws ComparisonStateError`
  - `detail: extra unknown-dimension assessment throws ComparisonStateError`
  - `detail: extra evidence on baseline side (unknown dimension) throws ComparisonStateError` ← NEW
  - `detail: extra evidence on comparison side (unknown dimension) throws ComparisonStateError` ← NEW
  - `detail: deleting one side's dimension evidence throws ComparisonStateError (FK off)`
  - `detail: assessment FK pointing to wrong-role evidence throws ComparisonStateError`
  - `detail: assessment FK pointing to wrong-dimension evidence throws ComparisonStateError`
  - `detail: missing participant throws ComparisonStateError (not null)`
  - `detail: missing portrait source throws ComparisonStateError (not null)`
  - `detail: tampered in-range similarity_score throws ComparisonStateError`
  - `detail: tampered run coverage throws ComparisonStateError`
  - `detail: tampered weighted_contribution throws ComparisonStateError`
  - `detail: tampered assessment weight throws ComparisonStateError`

### B2: Contiguous sequence + archive transition semantics
- Implementation: `comparison-application.ts` `validateDetailAggregateConsistency` §7-§9, `deriveArchiveStateStrict`.
- Negative tests (7 total):
  - `detail: explanation attempt sequence gap throws ComparisonStateError`
  - `detail: explanation attempt sequence not starting at 1 throws ComparisonStateError`
  - `detail: duplicate outcome prevented by V005 UNIQUE constraint (schema defense)`
  - `detail: unrelated orphan outcome does not poison healthy run detail (run-scoped validation)` ← REWRITTEN
  - `detail: archive sequence gap throws ComparisonStateError`
  - `detail: archive first event restored throws ComparisonStateError`
  - `detail: consecutive archived events throw ComparisonStateError`

### B3: Validation audit
- Implementation: `comparison-application.ts` `auditCreateValidationFailure`, `auditExplanationFailure` helpers; audit calls in `createComparison` (input/mode validation) and tx catch (graph/post-insert).
- Tests (4 total):
  - `validation audit: input validation failure writes exactly one sanitized audit`
  - `mode validation: invalid mode throws ComparisonValidationError and writes exactly one sanitized audit`
  - `validation audit: graph invariant failure writes audit and rolls back all 8 tables`
  - `validation audit: post-insert validation failure writes audit and rolls back` ← REWRITTEN (real validator)

### B4: Manifest recheck inside Attempt transaction
- Implementation: `comparison-application.ts` `validateManifestInTransaction`, `ManifestOwnershipError`, `ManifestChecksumError`; restructured `generateAndPersistExplanation` and `createExplanation`.
- Tests (5 total):
  - `explanation manifest: tampered checksum (automatic path) yields controlled failed outcome`
  - `explanation manifest: cross-run record reference (automatic path) yields controlled failed outcome`
  - `explanation manifest: nonexistent record reference (automatic path) yields controlled failed outcome`
  - `explanation manifest: tampered checksum (explicit path) throws ComparisonStateError`
  - `explanation manifest: cross-run record reference (explicit path) throws ComparisonStateError`

### B5: True overlapping two-connection competition tests
- Implementation: fault hook seams in `createComparison` (`before_transaction`), `generateAndPersistExplanation`/`createExplanation` (`before_attempt_transaction`), `archiveComparison` (`before_archive_transaction`).
- Tests (5 total):
  - `concurrency: overlapping create with same fingerprint replays single run`
  - `concurrency: overlapping create with different fingerprint yields stable conflict`
  - `concurrency: automatic explanation ensure-once under overlap (exactly one approved generator attempt)`
  - `concurrency: explicit explanation retries get unique contiguous sequences under overlap`
  - `concurrency: overlapping archive with same expected state yields one success + conflict`

### Extra closure
- `explanation: inside_outcome_transaction fault — outcome persistence audit has exactly 1 row with stable metadata` (strengthened)

## Risks

- The `::` separator for role/dimension map keys is safe because role names ("baseline", "comparison") and dimension keys don't contain `::`. If a future dimension key contained `::`, there could be a collision. Mitigation: dimension keys are controlled by the algorithm config, not user input.

## Open Questions

- None.

## Contract Drift

- No schema/migration/HTTP/AI/Flywheel changes were made.
- Production policy remains `not_released` — formal create blocks with 0 Comparison writes.
- No shared audit helper (`apps/server/src/lib/audit.ts`) modifications.

## Protected Paths Cleanup

- `data/workspaces/ws_demo/db.sqlite` — not modified.
- `apps/web/playwright-report/index.html` — not modified.
- `apps/web/test-results/` — not modified.

## Self-Audit Evidence (7-Point PASS)

```
handoff-self-audit: T0040 .agentops/tasks/T0040-portrait-comparison-application-repository/handoff.md
  1. Contract version everywhere — PASS
     - PLS_COMPARISON_CONTRACT_VERSION = "1" (application/types.ts:9), PLS_RULE_SUMMARY_CONTRACT_VERSION = "0.1.0" (rule-summary.ts:6)
     - No version changes; all code uses constants, not hardcoded strings; handoff doesn't claim version changes

  2. Notes history retired — PASS
     - docs/notes-backend.md §0 rewritten with T0040 revision 36 status (113/113 tests, 5 blockers closed)
     - Old revision 3/35 content replaced with current state

  3. Real fixture for each null/invalid case — PASS
     - All new tests use createTestDb() with real V005 DDL + fake PortraitSource
     - "extra evidence on baseline/comparison side": inserts real evidence row with unknown dimensionKey, asserts "unknown evidence dimension" error
     - "unrelated orphan outcome": creates 2 real runs, inserts orphan outcome, verifies both detail reads succeed
     - "post-insert validation failure": corrupts persisted baseline_normalized_value to 99.5 (within CHECK range), real validator detects mismatch, asserts "post_insert_validation_failed" audit

  4. Distinct validator failure codes — PASS
     - validateDetailAggregateConsistency: ~30 distinct fail() messages; each test's message.includes() matches actual throw message
     - deriveArchiveStateStrict: 5 distinct throw messages for sequence/transition/ownership violations
     - New "unknown evidence dimension" check: fail(`unknown evidence dimension ${e.dimensionKey} (not in candidate contract)`)
     - Tests assert exact phrase matches

  5. Contract drift scan — PASS
     - B1-B5 all implemented within existing contract; no schema/migration/HTTP changes
     - Unknown evidence rejection: comparison-application.ts line ~1736 (candidateKeySet check)
     - Run-scoped validation: orphan scan removed, per-run membership check retained
     - NUL bytes: replaced with :: separator, verified via od -c

  6. Smoke executed if brief demands — PASS
     - Brief validation block has no smoke commands; all commands are typecheck + contract-test + guard:worktree + git checks

  7. Memory honesty — PASS
     - Memory Used: "External data adapters must fail-closed at every contract boundary" — shaped unknown evidence rejection (fail closed on extra evidence)
     - Memory Used: "Handoff claims must be verified against actual test evidence before submission" — all113 test pass counts verified against actual npm run output
     - Memory Candidate: in-transaction manifest validation pattern (lesson_type: rule, created_at: 2026-07-19, last_used_at: never, use_count: 0, expires_at: 2026-10-19, status: active)

Result: PASS — submit
```

## Memory Candidates

- **In-transaction manifest validation eliminates TOCTOU windows**: Moving all manifest checks (ensure-once, checksum recompute, ownership/existence) into the same BEGIN IMMEDIATE as the Attempt insert eliminates the race window where another connection could tamper records between the outside check and the insert.
  - lesson_type: rule
  - created_at: 2026-07-19
  - last_used_at: never
  - use_count: 0
  - expires_at: 2026-10-19
  - status: active
  - evidence: T0040 B4 implementation; `comparison-application.ts` `validateManifestInTransaction` + `generateAndPersistExplanation`/`createExplanation` restructure
  - lesson: When a multi-step transaction reads then validates then writes, the validation must happen inside the same transaction as the write to prevent TOCTOU races. External validation before the transaction creates a window for concurrent modification.
  - guardrail: For any read-then-validate-then-write pattern, verify that the validation and write are in the same atomic unit. If they're separate, document the TOCTOU risk and add a concurrency test.

## Suggested Next Steps

- W06: `/api/v0/portrait-comparisons` readiness endpoint, gated create, list/detail/archive HTTP endpoints with real HTTP contract tests.
