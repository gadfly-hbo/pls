# Handoff: T0012 three-audience-tolerance-ui

## What Changed

- Updated frontend share-total validation to reuse the model-layer `threeAudienceInputTotalTolerance(channel)` entrypoint instead of hardcoding frontend tolerance values.
- Re-exported `threeAudienceInputTotalTolerance` from the local parser utility so the page prompt and parser validation use the same model source.
- Updated the mapping confirmation prompt to explain that totals up to approximately `100.01%` are handled as rounding error.
- Added E2E coverage for Douyin native eight-segment input totaling `100.01%`: no total error appears, calculation is enabled, and results are visible without expert prior.
- Added E2E coverage for Douyin input totaling `100.02%`: total error appears and calculation remains disabled.
- Updated `docs/notes-viz.md` with the T0012 frontend status.

## Files Changed

- `apps/web/src/utils/three-audience-local-parser.ts`
- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/e2e/three-audience-local-estimator.spec.ts`
- `docs/notes-viz.md`

## Validation

- Passed: `cd apps/web && npm run build`
- Passed: `cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts` (`10 passed`)
- Passed: `cd apps/model && npm run three-audience-share-contract-test`

## Risks

- Existing worktree contains unrelated modified/untracked files outside this task's allowed paths, including T0009/T0011 model/docs files, `data/workspaces/ws_demo/db.sqlite`, `.mimocode/.cron-lock`, and Task Bus folders. I did not modify or revert those unrelated files.
- `apps/web/playwright-report/index.html` appears modified after Playwright validation and is outside the allowed paths. I did not include it as an intentional task change.
- The diff against the old base includes T0010 frontend changes because this task builds on the approved T0010 behavior; I kept this revision bounded to the tolerance UI/parser work on top of that state.

## Open Questions

- None.

## Memory Used

- `Cross-app source import verification and blocker evidence`: used to keep the existing verified cross-app import path from `apps/web/src/utils/three-audience-local-parser.ts` to `../../../model/src/three-audience-share` and only add the new T0011 export on that same boundary.
