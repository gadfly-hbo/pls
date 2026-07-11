# Handoff: T0016 Simulated Market Workbench

## What Changed

在 `apps/web` 中新增「模拟市场」一级模块，作为策略压力测试入口。页面以「策略压力测试报告」为主输出，支持策略输入、目标用户 agent 选择、市场场景配置、运行模拟和历史回看。

- AppShell 一级导航新增「模拟市场」（位于「新品预测」与「经营飞轮」之间）。
- 新增 `SimulatedMarketWorkbench` 页面组件，分为四区：策略输入、目标用户 Agent、市场场景、结果报告。
- 前端 API adapter 新增 `getSimulatedMarketAgentTemplates`、`createSimulatedMarketRun`、`getSimulatedMarketRuns`、`getSimulatedMarketRun` 四个方法，严格解包 `{ code, data }` 包装。
- Mock 数据与真实后端 shape 同构（`SimulationRun`、`SimulatedMarketResult`、`TargetUserAgent` 等）。
- 新增 Playwright E2E：mock 模式完成一次模拟、390px 窄屏无横向溢出、`VITE_USE_MOCK=false` contract test 断言真实请求命中 `/api/v0/simulated-market/*`。

## Files Changed

- `apps/web/src/types/index.ts`
  - 新增 `TargetUserAgent`、`SimulatedMarketInput`、`SimulatedMarketResult`、`SimulationRun`、`SimulatedMarketRunListResponse` 等类型。
- `apps/web/src/services/api.ts`
  - 新增 `mockSimulatedMarketAgentTemplates`、`buildMockSimulatedMarketRun`。
  - 新增 `getSimulatedMarketAgentTemplates`、`createSimulatedMarketRun`、`getSimulatedMarketRuns`、`getSimulatedMarketRun`。
- `apps/web/src/pages/SimulatedMarketWorkbench.tsx`
  - 新增模拟市场工作台页面，含策略输入、目标 agent 选择、手写 persona、市场场景、报告结果、历史记录。
- `apps/web/src/App.tsx`
  - 新增 `simulated-market` view、导航项、路由渲染。
- `apps/web/src/index.css`
  - 新增模拟市场工作台、报告、卡片、分数、置信度、历史列表、移动端响应式样式。
- `apps/web/e2e/simulated-market.spec.ts`
  - 新增 mock 模式 E2E、390px 窄屏溢出测试、VITE_USE_MOCK=false contract test。

## Validation

- `cd apps/web && npm run lint` ✅ 通过
- `cd apps/web && npm run build` ✅ 通过
- `cd apps/web && npm run smoke` ✅ 30 passed / 8 skipped（跳过项为依赖后端真实服务的测试）
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts` ✅ 2 passed / 1 skipped（mock 模式测试在真实模式下跳过）

## Revision Notes

- 按 review 要求，将 `e2e/simulated-market.spec.ts` 中的 `page: any` 与 `route: any` 替换为 `Page` / `Route` 精确类型。
- 检查 `apps/web/src/services/api.ts` 并恢复 `mockSinglePortraitMetadata` 中与本任务无关的 mock 数据变更，确保只保留模拟市场 adapter / mock 相关改动。
- 复查新增代码无 `any` 类型。

## Risks

- 手写 persona 的 agentId 使用时间戳生成；mock 环境下历史列表不会自动持久化，刷新后丢失，与后端行为一致。
- 真实模式依赖后端 `/api/v0/simulated-market/*` 服务可用；contract test 使用 Playwright route 拦截，不验证后端真实响应数据。
- 页面未接入新品预测、人货匹配、经营飞轮的衔接入口（本轮非目标，已在页面中预留 TODO 空间并在 handoff 中记录）。
- 390px 溢出测试基于页面加载完成后的 `document.body.scrollWidth`，若未来在结果区加入超宽表格，需重新验证。

## Open Questions

- 是否需要从「新品预测结果页」「人货匹配结果页」或「经营飞轮」向模拟市场跳转？本期 PRD 明确列为后续任务，未在本轮实现。
- 是否需要支持从渠道画像对象库选择 channelEntityId / marketingEventId / businessScenarioId？当前为文本输入，后续可接入对象库选择器。
- 是否需要模拟结果的 CSV / 报告导出？本期未实现，可在后续任务中补充。

## Contract Drift or Change Requests

- 未发现后端 route / schema 与前端契约不一致。adapter 已按真实后端 `apps/server/src/routes/simulated-market.ts` 的 `{ code, data }` 层级精准解包。
- 后端 `POST /runs` 返回 `SimulationRun` 对象（`data` 直接为 run），与 PRD 一致；前端未做额外包装假设。
