# Handoff: T0038 portrait-comparison-algorithm-foundation（revision 2）

## What Changed

Implemented a pure TypeScript Portrait Comparison foundation under `apps/server/src/portrait-comparison/`:

1. Canonical JSON v1 + UTF-8 SHA-256 checksum helpers.
2. `pls-portrait-comparison` deterministic algorithm with exact unit matching, no zero-fill, controlled exclusions, coverage, and included-weight normalized similarity.
3. Versioned production quality policy query that explicitly returns `not_released` and no production numeric thresholds.
4. Deterministic `rule` summary seam with PLS generator identity, same-Run evidence manifest, manifest checksum, bounded claim arrays, and no AI/model/prediction/recommendation masquerade.
5. Focused contract test suite (`15/15`) covering canonical checksum, sparse array rejection, algorithm edge cases, finite-output guard, V005-compatible quality projection, clamp/V005 projection boundary, policy gate, and rule summary guardrails.

Revision 1 closes all six Controller review blockers:

1. `canonicalJson()` is now a checked public entrypoint; unchecked serialization is private.
2. Algorithm config and output calculations now fail closed on unsafe integer config values, infinite normalization spans, and non-finite normalized/delta/contribution/score outputs.
3. Formal rule summary now requires finite `similarityScore` and rejects `null`, matching V005 `comparison_run.similarity_score NOT NULL`.
4. Rule summary no longer classifies similarities/differences by hardcoded thresholds while policy remains `not_released`.
5. Evidence projection now keeps persisted `qualityStatus` aligned to V005 (`ready|limited`) and uses separate `qualityEligibility` for `quality_insufficient` exclusion.
6. Evidence manifest ordering now uses explicit UTF-16 code-unit comparison instead of `localeCompare()`.

Revision 2 closes the remaining two Controller review blockers:

1. Canonical JSON now rejects sparse array holes, including leading, middle, and trailing holes, so sparse arrays cannot collide with dense arrays or empty arrays.
2. Algorithm config now requires `normalization.clamp=true`, ensuring successful normalized values stay in `0..100` and normalized delta stays in `-100..100`, matching V005 projection bounds.

## Files Changed

- `apps/server/src/portrait-comparison/canonical-json.ts` added.
- `apps/server/src/portrait-comparison/algorithm.ts` added.
- `apps/server/src/portrait-comparison/quality-policy.ts` added.
- `apps/server/src/portrait-comparison/rule-summary.ts` added.
- `apps/server/src/portrait-comparison/index.ts` added.
- `apps/server/src/portrait-comparison/portrait-comparison-algorithm-contract-test.ts` added.
- `apps/server/package.json` added `portrait-comparison-algorithm:contract-test` script.
- `docs/notes-model.md` updated `## 0. 当前状态` with T0038 facts and checksum scope.
- `docs/workpls-absorption-retirement-checklist.md` updated W03 execution evidence; status is `running`, not `completed`.
- `.agentops/tasks/T0038-portrait-comparison-algorithm-foundation/handoff.md` added.

## Constraint Matrix

| Area | Constraint | Implementation Evidence |
| --- | --- | --- |
| Canonical JSON | Accept only JSON-safe values; reject undefined/function/symbol/bigint/non-finite/unsafe integer/cycle/non-plain object/sparse array holes | `canonicalJson()` and `checksumCanonicalJson()` validate before serialization/hashing; direct negative tests |
| Checksum | UTF-8 SHA-256 over canonical JSON, object keys UTF-16 sorted, arrays order-sensitive | `canonicalJson()` + `checksumCanonicalJson()`; stable insertion-order and array-order tests |
| Algorithm identity | PLS identity only | `PLS_COMPARISON_ALGORITHM_IDENTITY = "pls-portrait-comparison"`; test rejects WorkPLS identity by construction |
| Candidate config | Non-empty, unique key, nonblank label/unit, positive finite weight, finite `min < max` normalization | `validateComparisonAlgorithmConfig()` and negative tests |
| Evidence | Side enum, unique side+dimension, finite value, nonblank unit, V005-compatible `qualityStatus`, separate `qualityEligibility` | `validateEvidence()` and duplicate/invalid/V005 projection tests |
| Inclusion/exclusion | Exact unit only; missing not zero-filled; five exclusion reasons fixed | `excludeIfNeeded()` and five-reason tests |
| Coverage/score | Coverage = included weight / all candidate weight * 100; score normalized within included weight; low coverage suppresses score | `computeComparisonAlgorithmResult()` and coverage/suppression tests |
| V005 projection | Successful normalized values/deltas must fit V005 bounds | `normalization.clamp` must be `true`; projection boundary test covers out-of-range raw values clamped into durable ranges |
| Config checksum | Covers all output-affecting fields and formula/rule identities | `computeAlgorithmConfigChecksum()` includes identity/version/candidates/normalization/formulas/unit/exclusion/policy/tolerance; sensitivity tests |
| Quality policy | Production policy explicitly `not_released`; no thresholds | `getProductionQualityPolicy()` returns `releaseStatus: "not_released"` and `numericThresholds: null` in checksum input; policy test |
| Rule summary | Generator type `rule`; PLS identity; same Run five deterministic record types; max 3 claims per array; finite score required; fail closed | `createRuleSummary()`, manifest validation, content validation, contract tests |
| No unreleased thresholds | No hardcoded 80 score opportunity or 90 similarity/difference split migrated | `opportunities`, `similarities`, and `differences` remain empty until released policy supplies thresholds; explicit test asserts this |
| Manifest ordering | Durable checksum must not depend on locale/ICU | explicit UTF-16 code-unit comparator and non-ASCII ordering/checksum stability test |

## WorkPLS -> PLS Identity/Contract Differences

- `workpls-portrait-comparison` -> `pls-portrait-comparison`.
- `workpls-normalized-absolute-delta-v1` -> `pls-normalized-absolute-delta-v1`.
- `workpls-comparison-exclusions-v1` -> `pls-comparison-exclusions-v1`.
- `workpls-formal-run-rule-summary` -> `pls-portrait-comparison-rule-summary`.
- WorkPLS `usable|insufficient` evidence status was not copied into the persisted-looking field; PLS evidence `qualityStatus` is `ready|limited` and `qualityEligibility` is `eligible|insufficient`.
- WorkPLS hardcoded score opportunity and similarity/difference thresholds were not migrated; PLS rule summary emits no threshold-derived opportunities/similarities/differences until a released policy authorizes thresholds.
- WorkPLS source refs/metric counters were not migrated because T0038 is pure algorithm foundation and not `PortraitSource`/adapter scope.

## Validation

1. `cd apps/server && npm run typecheck` -> pass, exit 0.
2. `cd apps/server && npm run portrait-comparison-algorithm:contract-test` -> pass, `15/15`, exit 0.
3. `cd apps/server && npm run portrait-comparison-schema:contract-test` -> pass, `30/30`, exit 0.
4. `npm run guard:worktree` -> `OK: no forbidden generated artifacts in worktree diff.`, exit 0.
5. `git diff --check` -> no output, exit 0.
6. `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` -> no output, exit 0.

## Production Quality Policy Gate

- `getProductionQualityPolicy()` returns `releaseStatus: "not_released"`.
- The not-released policy checksum input includes `numericThresholds: null`.
- No production candidate dimensions, min/max, weight, coverage threshold, or quality threshold is exported.
- Formal Run creation must remain closed until a calibrated policy is released by a later approved task.

## Side Effect Review

- New code is pure TypeScript functions only.
- No SQLite imports, DB handles, HTTP routes, filesystem reads/writes, network calls, environment reads, random IDs, or current-time calls were added under `apps/server/src/portrait-comparison/`.
- Contract tests use only in-memory pure fixtures and do not create workspace data.

## Risks

- Rule summary content is intentionally conservative and English-only for now; transport/UI copy can refine wording later without changing algorithm semantics.
- Evidence quality mapping now separates V005 persisted status (`ready|limited`) from algorithm eligibility (`eligible|insufficient`). W04/W05 must preserve that split when mapping source quality facts.
- Existing worktree contains out-of-scope diffs from T0036/T0037 and local state; I did not modify or revert them.

## Open Questions

- W04 should define how `PortraitSource` maps source quality facts into V005 `ready|limited` dimension evidence statuses plus algorithm `qualityEligibility`.
- W04/W05 should decide where application code converts algorithm assessments into V005 persistence rows and how it supplies stable record IDs for the rule manifest.

## Contract Drift

- No V005 schema, DB migration, HTTP route, adapter, ModelEvol artifact, or production policy numeric contract was changed.
- `apps/server/package.json` only added the requested targeted script.

## Protected Paths And Generated Artifacts

- `npm run guard:worktree` passed.
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` returned no output.
- `portrait-comparison-schema:contract-test` created only `/tmp` migration test artifacts and its own cleanup hooks removed them.

## Memory Used

- **Algorithm checksum must include every behavior-affecting config field** affected `computeAlgorithmConfigChecksum()`: the checksum input includes algorithm identity/version, each candidate key/label/unit/weight/normalization, coverage formula, dimension similarity formula, unit rule, exclusion mapping, overall score policy, and floating tolerance. The contract test perturbs version, weight, normalization, and coverage policy and asserts checksum changes.
- **Update controller notes whenever checksum/contract shape changes** affected documentation: `docs/notes-model.md` now records the checksum scope so W04+ can consume the true algorithm contract.

## Memory Candidates

- None.

## Suggested Next Task

- W04: implement `PortraitSource` interface/adapters and active source resolution in backend scope, consuming this pure foundation without adding production quality thresholds.
