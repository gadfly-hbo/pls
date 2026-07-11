## What Changed

- Unified all seven-channel input total share tolerance to `0.0001 + 1e-12`.
- Added exported read-only `threeAudienceInputTotalTolerance(channel)` and routed both input validation and pre-mapping normalization through it.
- Kept algorithm version, matrices, prior handling, coverage semantics, and error code semantics unchanged.
- Updated contract tests to cover non-JD `100.01%` overflow with prior, all-channel within-tolerance normalization, all-channel slightly-over-tolerance failure, and tolerance entry consistency.
- Updated `docs/notes-model.md` current status to record the unified tolerance and reusable tolerance entry.

## Files Changed

- `apps/model/src/three-audience-share.ts`
- `apps/model/src/three-audience-share-contract-test.ts`
- `docs/notes-model.md`

## Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run three-audience-share-contract-test` passed with `ok: true` and `failures: []`.

## Risks

- The task brief referenced `agentops/memory/opencode-algorithm.md` under the repo, but that file was missing. I read the canonical memory at `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md` before editing.
- The working tree already contained unrelated modifications outside this task scope, including frontend files, `data/workspaces/ws_demo/db.sqlite`, docs, `.agentops/tasks/T0010-three-audience-local-file-filter/`, `.agentops/tasks/T0012-three-audience-tolerance-ui/`, and `.mimocode/.cron-lock`; I did not modify or revert them.
- The same allowed model files also include uncommitted T0009 changes for `isSemirThreeAudienceNativeLabel`; I preserved them and only added the T0011 tolerance behavior on top.

## Open Questions

- None for this bounded task.
