# Handoff: T0022 模拟市场真实对象语境 UI

## What Changed

1. **市场场景区 UX 升级**
   - 用现有对象库 API 加载渠道对象（`targetObject=ChannelEntity`）、营销活动（`marketing_event`）、业务场景（`business_scenario`），为每个字段提供下拉选择器。
   - 下拉选择器旁保留文本输入框，支持手动填写/未选择状态；未选择真实对象时输入框不做存在性校验。
   - 替换误导性 placeholder：`douyin:shop:semir_official` → `account:mock_account_douyin_style`，`event_001` → `marketing_event:mock_event_618`，`scenario_001` → `business_scenario:new_product_launch:mock_style`。
   - 新增手动输入提示说明，避免用户误以为下拉未命中即已校验。

2. **报告区 provider / model 与 fallback 警示**
   - 新增 `ProviderBadge`：当 `provider=minimax` 且 `modelVersion=minimax-m3` 时显示“LLM agent 模拟”成功标签；否则显示 fallback 警告标签。
   - 新增 `FallbackWarning`：当 `qualityFlags` 包含 `fallback` 相关标记时，显示“当前运行使用 deterministic fallback 兜底，不是 LLM agent 模拟结果”的警告横幅。
   - 报告质量区继续保留 `provider / modelVersion` 文本与 `qualityFlags` 标签。

3. **Mock 数据与模拟路径**
   - 在 `api.ts` 的 `mockChannelObjects` 中新增真实 mock 示例：`account:mock_account_douyin_style`、`marketing_event:mock_event_618`、`business_scenario:new_product_launch:mock_style`。
   - `buildMockSimulatedMarketRun` 根据 `marketContext.channelEntityId` 是否为真实 ChannelEntity 决定返回 `minimax/minimax-m3`（LLM 路径）或 `deterministic_fallback/deterministic-fallback-0.1` + `llm_unavailable_fallback_used`（fallback 路径）。
   - fallback 质量标记从 `deterministic_fallback_used` 改为 `llm_unavailable_fallback_used`，与 PRD 口径一致。

4. **E2E 测试更新**
   - `simulated-market.spec.ts`：拆分为 mock 模式 LLM 标签测试、mock 模式 fallback 警示测试、390px 无溢出测试、真实 API contract 测试；补充 `channel-objects` 路由拦截，避免 `VITE_USE_MOCK=false` 时页面因空响应崩溃。
   - `simulated-market-prefill.spec.ts`：更新渠道输入 placeholder 断言；统一 route fallback 质量标记为 `llm_unavailable_fallback_used`。
   - `simulated-market-decision.spec.ts`：统一 route fallback 质量标记为 `llm_unavailable_fallback_used`。

5. **响应式 CSS**
   - 新增 `.sim-market-context-row`、`.sim-provider-badge`、`.sim-market-context-hint` 样式。
   - 在 `640px` 和 `390px` 断点下将选择器与输入框垂直堆叠，避免窄屏溢出。

## Files Changed

- `apps/web/src/pages/SimulatedMarketWorkbench.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/index.css`
- `apps/web/e2e/simulated-market.spec.ts`
- `apps/web/e2e/simulated-market-prefill.spec.ts`
- `apps/web/e2e/simulated-market-decision.spec.ts`

## Validation

- `cd apps/web && npm run lint` ✅ 通过
- `cd apps/web && npm run build` ✅ 通过
- `cd apps/web && npm run smoke` ✅ 43 个测试中 33 通过，10 跳过（无失败）
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts` ✅ 通过（2 跳过，2 通过）
- `git diff --check` ✅ 无空白字符问题

## Risks

1. **真实对象选择器依赖对象库 API**：`api.getChannelObjects({ pageSize: 100 })` 在真实后端不存在或未返回 `data.items` 时，页面仍通过 `(channelObjects ?? [])` 兜底，不会崩溃，但选择器将为空。建议在 controller 验收前确认 `/api/v0/channel-objects` 返回结构与 `ChannelObjectListResponse` 一致。
2. **Mock 路径判定单一**：当前 mock 仅通过 `channelEntityId` 是否命中真实 ChannelEntity 决定 LLM 还是 fallback，未覆盖营销活动/业务场景选择。用户可能误以为选择活动/场景也会触发 LLM。真实后端会基于实际 provider 可用性返回，不影响线上逻辑。
3. **prefill 来源仍可能带入非 canonical ID**：从货渠匹配 prefill 的 `channelEntityId` 仍是 `matchDetail.channelId`（source key），不是 canonical object key。UI 会显示为手动输入，符合“未校验手动输入”口径，但可能需要产品侧决定是否将匹配结果映射为 canonical key。

## Open Questions

1. 是否需要从 MatchCoreWorkbench 的 prefill 中把 `matchDetail.channelId` 映射为 `channelEntityId` 的真实 canonicalObjectKey？当前行为是手动输入，未改变 API contract。
2. 真实后端 `/api/v0/simulated-market/runs` 在 LLM 不可用时是否返回 `llm_unavailable_fallback_used` 质量标记？前端已按该标记显示 fallback 警示，需后端确认标记名。
3. 渠道对象选择器当前只展示 `displayName (canonicalObjectKey)`，是否需要在选项中展示平台类型、对象类型等额外信息？

## UX Notes

- 报告区 provider/model 文本 + badge 的组合让“LLM agent 模拟”与“deterministic fallback”一目了然；fallback 警告横幅使用 `alert-banner--warning` 与现有设计系统一致。
- 市场场景选择器采用“下拉选择 + 并列输入框”模式，既鼓励用户选择真实对象，又保留手动输入灵活性。未选择时输入框 placeholder 为真实示例，降低误导。
- 390px 窄屏下选择器与输入框垂直堆叠，避免横向溢出；历史记录、报告 meta 等也在 `390px` 断点下垂直堆叠。

## Contract Drift or Change Requests

- 无 API contract 变更。`marketContext` 仍提交 `channelEntityId` / `marketingEventId` / `businessScenarioId` / `contextText`。
- 前端新增对 `qualityFlags` 中包含 `fallback` 的警示展示，建议后端在 fallback 路径中统一使用 `llm_unavailable_fallback_used`（或任何包含 `fallback` 的标记），以保持 UI 警示一致。
- 若后端对象库接口返回结构与 `ChannelObjectListResponse` 不一致，需通过 `api.getChannelObjects` 的 adapter 做映射，当前无映射开销。

## Memory Candidates

- 在做真实 API contract 的 Playwright 测试时，必须把所有新增组件在 `VITE_USE_MOCK=false` 下会调用的接口都加入 `page.route` 拦截，否则默认 `{ data: {} }` 的 fallback 可能让组件在 `.filter` 等操作上报 `undefined` 错误（本次 `channel-objects` 拦截）。
- 修改全局 mock 数据（如 `mockChannelObjects`）时要检查依赖文本匹配的 e2e，避免新增对象 displayName 意外命中其他测试的 `hasText`（本次 `Mock 抖音风格账号` 命中了 channel-object-library 的 `抖音` 断言）。
