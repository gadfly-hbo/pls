# Handoff: T0010 three-audience-local-file-filter

## What Changed

- Updated the three-audience local estimator flow so users must select a channel before confirming column mapping.
- Removed the previous implicit `tmall` default, preventing unchosen files from being filtered with the Tmall native system.
- Updated local parsing validation to call the model-layer `isSemirThreeAudienceNativeLabel` before duplicate, share, and total validation.
- Ignored non-native rows are excluded from `threeAudienceSegments`, duplicate validation, share total validation, and algorithm input.
- The page now displays `已忽略 N 行非该渠道原生人群标签` after mapping confirmation.
- Changing the channel or column mapping invalidates the existing confirmation, parsed segments, errors, totals, and results, requiring reconfirmation.
- Added E2E coverage for a mixed generic Douyin profile containing eight native labels plus duplicate interest, region, and device rows; only native rows are kept and calculation works without expert prior.
- Updated `docs/notes-viz.md` current status for this frontend task.

## Files Changed

- `apps/web/src/utils/three-audience-local-parser.ts`
- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/e2e/three-audience-local-estimator.spec.ts`
- `docs/notes-viz.md`

## Validation

- Passed: `cd apps/web && npm run build`
- Passed: `cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts` (`8 passed`)
- Passed: `cd apps/model && npm run three-audience-share-contract-test`

## Risks

- Existing worktree contains unrelated modified/untracked files outside this task's allowed paths, including T0009 model/docs files, `data/workspaces/ws_demo/db.sqlite`, `.mimocode/.cron-lock`, and Task Bus folders. I did not modify or revert those unrelated files.
- `apps/web/playwright-report/index.html` appears modified after Playwright validation and is outside the allowed paths. I did not include it as an intentional task change.
- Blank-label rows are now ignored by the native-label prefilter because they are not native labels. This follows the brief's requirement to filter by raw label before row validation, but it changes the previous invalid-input UI expectation for empty labels.

## Open Questions

- None.

## Memory Used

- `Cross-app source import verification and blocker evidence`: used to keep the existing cross-app model import path intact and only add the T0009 model export to the existing parser import instead of changing the import boundary.
