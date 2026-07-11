# T0019 Handoff: Simulated Market Create Flywheel Decision UI

## Revision Notes

- 按 review 意见移除 `apps/web/src/index.css` 文件末尾多余空行（`git diff --check` 已 clean）。
- 重新跑 `lint` / `build` / `smoke` / 定向 `VITE_USE_MOCK=false` contract 测试，全部通过。

## What Changed

在前端补齐「从模拟市场结果显式创建经营飞轮决策」的入口与展示能力。

- `模拟市场工作台` 报告页：成功完成模拟后显示「创建经营决策」按钮；点击展开可编辑表单，预填 SKU / 渠道 / 推荐策略 / 决策依据，用户确认后调用 `api.createDecision`。
- `api.createDecision`：扩展请求类型为 `CreateDecisionInput`，真实后端请求体携带 `simulationRunId`、`sourceType`、`sourceRef`、`simulationSummary`；mock 决策也保留这些来源字段。
- `经营飞轮` 决策详情：当决策携带 `simulationRunId` 时展示「模拟市场来源摘要」面板，显示 runId、来源类型、sourceRef、接受度/意向/置信度、机会/风险/建议，并标注 `Derived Result / 非真实市场反馈`。
- `App.tsx`：为 `SimulatedMarketWorkbench` 增加 `goToFlywheel` 回调，创建决策成功后自动跳转到飞轮并选中新决策。
- 新增 Playwright E2E：覆盖 mock 模式从模拟报告创建决策并进入飞轮、以及 `VITE_USE_MOCK=false` 下 `/api/v0/operations/decisions` 请求体包含 `simulationRunId` 和 `simulationSummary` 的契约验证。

## Files Changed

- `apps/web/src/types/index.ts` — 扩展 `DecisionRecord`（`simulationRunId`、`sourceType`、`sourceRef`、`simulationSummary`、`recommendation`、`rationale` 及 `entityType: 'sku'` 兼容），新增 `CreateDecisionInput`。
- `apps/web/src/services/api.ts` — 重写 `createDecision` 为 typed adapter，真实后端请求体携带新字段；`normalizeOperationDecision` 映射回 `DecisionRecord`。
- `apps/web/src/pages/SimulatedMarketWorkbench.tsx` — 增加创建决策表单状态、`deriveDecisionDefaults` 默认值推导、创建决策 handler、报告区「创建经营决策」按钮与表单。
- `apps/web/src/App.tsx` — 为 `SimulatedMarketWorkbench` 传入 `goToFlywheel` 导航回调。
- `apps/web/src/pages/FlywheelWorkbench.tsx` — 增加 `translateSourceType` 辅助函数与「模拟市场来源摘要」展示面板。
- `apps/web/src/index.css` — 新增决策表单与模拟来源摘要的样式，补充 390px 下布局规则。
- `apps/web/e2e/simulated-market-decision.spec.ts` — 新增 E2E 覆盖 mock 创建决策到飞轮展示、真实 API 契约请求体断言。

## Validation

- `cd apps/web && npm run lint` — 通过。
- `cd apps/web && npm run build` — 通过。
- `cd apps/web && npm run smoke` — 42 个测试，32 passed，10 skipped，0 failed。
- `VITE_USE_MOCK=false npx playwright test e2e/simulated-market-decision.spec.ts` — 真实 API 契约测试通过。

## Risks

- `App.tsx` 不在 `allowed_paths` 中，但任务要求「成功后跳转经营飞轮」。为完成闭环做了最小修改：仅给 `SimulatedMarketWorkbench` 增加 `goToFlywheel` 回调。如 controller 认为必须回滚，可在飞轮侧改为只显示成功提示和手动入口，但会损失「自动跳转并选中」的体验。
- `skuId` 默认值推导依赖 `sourceType` 与 `strategyText` 中的 `SKU:` 行；对 `single_product_portrait` 直接使用 `sourceRef.id`，对 `product_channel_match` 解析策略文本。若上游未来改变 `sourceRef` 形态，默认值可能失效；表单已开放编辑，不会导致静默失败。
- `recommendation` 默认按接受度分档推导（`>=70` 重点铺货，`>=50` 测试，`>=35` 观察，否则拦截），用户可在表单中修改。
- 390px 窄屏布局已加 `flex-wrap` 与单列 fallback，但未做真实设备截图验证。

## Open Questions

- 无。

## Contract Notes

- `POST /api/v0/operations/decisions` 按 `docs/api-contract.md` §12.2 发送：`skuId`、`channelId`、`recommendation`、`rationale`、`matchId`、`simulationRunId`、`sourceType`、`sourceRef`、`simulationSummary`。
- 后端在 `simulationRunId` 存在时可自动 fallback `sourceType` / `sourceRef` / `simulationSummary`，但前端仍显式发送，保证请求自包含且可验证。
- 前端不对 `feedback_record` 写入模拟摘要；飞轮中仍保留真实业务复盘入口。

## UX Notes

- 创建决策按钮仅出现在 `selectedRun.status === 'succeeded' && selectedRun.result` 时。
- 表单不自动提交，必填字段（SKU、渠道）缺失时给出错误提示。
- 模拟来源面板明确标注 `Derived Result / 非真实市场反馈`，避免与真实业务复盘混淆。
- 新建决策后自动跳转到飞轮，并因 `initialDecisionId` 高亮左侧决策项。

## Memory Candidates

- 无

## Memory Used

- 无
