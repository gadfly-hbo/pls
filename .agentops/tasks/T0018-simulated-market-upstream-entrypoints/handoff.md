# T0018 Handoff: Simulated Market Upstream Entrypoints

## What Changed

Added frontend wiring so the two upstream workbenches can send their current strategy context into the Simulated Market workbench with prefill, without auto-running the simulation or creating decisions.

- `新品预测` result page: each `SinglePortraitResult` now shows a "送入模拟市场" button.
- `货渠匹配` detail page: the match decision explanation report now shows a "模拟目标用户反馈" button.
- `模拟市场` workbench: accepts an `initialPrefill` prop and applies it to the strategy form on mount; user must still click "运行模拟".
- App-level navigation state: extended `App.tsx` to carry `SimulatedMarketPrefill` across views.
- Added a new shared `SimulatedMarketPrefill` type.
- Added Playwright E2E coverage for both prefill paths (mock-mode portrait + real-API-contract match).

## Files Changed

- `apps/web/src/types/index.ts` — added `SimulatedMarketPrefill` type.
- `apps/web/src/App.tsx` — added `simulatedMarketPrefill` state, `goToSimulatedMarket` navigation, and wired `SimulatedMarketWorkbench initialPrefill`.
- `apps/web/src/pages/Dashboard.tsx` — accepted `goToSimulatedMarket` prop and passed it to `SinglePortraitResult`.
- `apps/web/src/components/SingleProductPortrait.tsx` — added `onSendToSimulatedMarket` prop, "送入模拟市场" button, and `buildSinglePortraitPrefill` strategy-text builder.
- `apps/web/src/pages/MatchCoreWorkbench.tsx` — accepted `goToSimulatedMarket` prop, "模拟目标用户反馈" button, and `buildMatchPrefill` strategy-text builder.
- `apps/web/src/pages/SimulatedMarketWorkbench.tsx` — accepted `initialPrefill` prop and applied prefill fields on mount.
- `apps/web/e2e/simulated-market-prefill.spec.ts` — new E2E spec covering both prefill paths and no-auto-run assertions.

## Validation

- `cd apps/web && npm run lint` — passed.
- `cd apps/web && npm run build` — passed.
- `cd apps/web && npm run smoke` — 31 passed, 9 skipped, 0 failed.
- `VITE_USE_MOCK=false npx playwright test e2e/simulated-market-prefill.spec.ts` — real-API-contract match prefill test passed.

## Risks

- `MatchCoreWorkbench` mock-mode path is not covered by the new prefill E2E because the mock heatmap depends on seeded `db.products`/`db.matches`. The real-API-contract test exercises the actual production code path and intercepts the backend routes.
- Prefill is applied on every fresh mount of `SimulatedMarketWorkbench` when `initialPrefill` is provided. If a user navigates away and back while the parent still holds the prefill, the form will reset to the prefill values. This is acceptable for the current task because the prefill is the source of truth for the entrypoint action.
- 390px narrow-screen layout relies on existing `flex-wrap` / `min-width: 0` rules; no new overlap was introduced, but a manual browser screenshot was not captured.

## Open Questions

- None.

## UX Notes

- Buttons use existing `btn` class and wrap with existing flex containers; no new custom styling needed.
- Strategy text is generated as a plain readable summary (SKU, top labels, risk flags, model version, evidence for portrait; SKU, channel, score, recommendation, drivers, risks for match).
- Source reference ID uses the stable `skuId` for portrait and `matchId` for match.

## Memory Candidates

- 无

## Memory Used

- 无
