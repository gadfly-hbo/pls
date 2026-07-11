## What Changed

- Added `isSemirThreeAudienceNativeLabel(channel, label)` as a read-only selector in `apps/model/src/three-audience-share.ts`.
- The selector reuses the existing `MATRIX_BY_CHANNEL` and `normalizeLabel` rules, so recognized aliases follow the already frozen rules and unrelated labels return `false`.
- Added contract-test coverage for one recognizable label per channel, unrelated labels, and frozen aliases for Douyin, WeChat Channels, and Pinduoduo.
- Updated `docs/notes-model.md` current status with the new selector and validation note.

## Files Changed

- `apps/model/src/three-audience-share.ts`
- `apps/model/src/three-audience-share-contract-test.ts`
- `docs/notes-model.md`

## Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run three-audience-share-contract-test` passed with `ok: true` and `failures: []`.

## Risks

- The task brief referenced `agentops/memory/opencode-algorithm.md` under the repo, but that file was missing. I read the canonical memory at `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md` before editing.
- Working tree had unrelated pre-existing modifications outside this task scope, including `apps/web/playwright-report/index.html`, `data/workspaces/ws_demo/db.sqlite`, `docs/model-three-audience-share-contract.md`, `docs/prd-three-audience-local-estimator-ui.md`, `.agentops/tasks/T0010-three-audience-local-file-filter/`, and `.mimocode/.cron-lock`; I did not modify or revert them.

## Open Questions

- None for this bounded task.
