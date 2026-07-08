# Handoff: T0003 single-product-portrait-dashboard-ui

## What Changed

- Implemented the `单品画像预测` area inside the existing `新品预测` Dashboard with `单款预测` / `批量预测` modes.
- Replaced the old Dashboard Tools artifact flow with dedicated `/api/v0/single-product-portrait/*` API adapter calls.
- Added metadata-driven single prediction form: `款号`、`版型`、`面料`、`FAB`; `版型` options and `填入示例` fit type come from metadata.
- Added model unavailable handling: disables single/batch actions and shows `模型文件未生成，请先训练模型` when `modelAvailable: false`.
- Added batch template download, preview summary, file errors, row errors, warnings, extra columns, execute gating, batch result table, row detail reuse, and result/error/json downloads.
- Added model info panel showing risk flags, modelVersion, sampleCount, trainedAt/generatedAt, metricsSummary, and supported fit types.
- Revision: isolated single-product portrait result state inside `Dashboard` module state (`singlePrediction` / `batchResult`) and stopped writing to App-level `prediction/currentSku` via `setPrediction` / `setCurrentSku`.
- Revision: added `清空结果` actions for single and batch results; mock E2E now covers both clear actions.
- Revision: restored generated `apps/web/playwright-report/index.html` so it is no longer part of this task diff.
- Added responsive styles for 390px narrow screens and table overflow containment.
- Updated E2E coverage for mock and `VITE_USE_MOCK=false` real contract paths.
- Updated `docs/notes-viz.md` current status.

## Files Changed

- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/components/SingleProductPortrait.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/index.css`
- `apps/web/e2e/portrait-workbench.spec.ts`
- `apps/web/e2e/portrait-workbench-real.spec.ts`
- `apps/web/e2e/smoke.spec.ts`
- `docs/notes-viz.md`

## Validation

- `cd apps/web && npm run lint`: passed.
- `cd apps/web && npm run build`: passed.
- `cd apps/web && npx playwright test e2e/portrait-workbench.spec.ts`: passed.
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-workbench-real.spec.ts`: passed.
- `cd apps/web && npm run smoke`: passed, 18 passed / 6 skipped.
- Revision validation rerun after changes requested: `npm run lint`, `npm run build`, `npx playwright test e2e/portrait-workbench.spec.ts`, `npm run smoke`, and `VITE_USE_MOCK=false npx playwright test e2e/portrait-workbench-real.spec.ts` all passed.

## Risks

- The `VITE_USE_MOCK=false` real contract test uses `page.route` with backend-shaped responses to prove adapter paths, headers, multipart upload, and response shape. It does not require a live backend/model file and therefore does not prove the actual model file is present on this machine.
- During the real contract test, the default Overview page still makes unrelated `VITE_USE_MOCK=false` requests before navigating to Dashboard. With no live backend, Vite logs proxy `ECONNREFUSED` for unrelated modules; the single-product portrait endpoint requests are intercepted and asserted successfully.
- Mock batch preview intentionally simulates validation outcomes by file name (`missing`, `partial`, `mixed`) instead of parsing browser-side CSV/XLSX content, preserving the UI rule that batch mode uploads files to backend preview rather than parsing them in the component.

## Open Questions

- None.

## Memory Used

- `docs/notes-viz.md` decision guidance on API contract discipline, `VITE_USE_MOCK=false` contract tests, and avoiding `USE_MOCK` short-circuit blind spots directly shaped the adapter and Playwright design.
