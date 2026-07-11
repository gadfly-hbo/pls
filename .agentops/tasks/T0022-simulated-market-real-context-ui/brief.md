---
id: "T0022"
slug: "simulated-market-real-context-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68c28c67f991d533e04248542f34566fbd4c2184"
batch: "simulated-market-llm-v2"
sequence: "3"
depends_on: 
  - "T0021"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src"
  - "apps/web/e2e"
  - "apps/web/package.json"
  - "docs/prd-simulated-market.md"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts"
---

## Objective

更新模拟市场前端工作台，使用户能明确区分“LLM agent 模拟”和“deterministic fallback 兜底”，并把市场场景输入从误导性 placeholder 改成真实对象语境。

当前 UI 中 `douyin:shop:semir_official`、`event_001`、`scenario_001` 容易让用户误以为这些是真实存在 ID；总控只读核对过当前 `ws_demo` 中没有这些对象。二期需要改为真实可选对象或至少展示真实 `canonicalObjectKey` 示例。

## Context

- 依赖 `T0021` approved 后领取。
- 当前截图中的报告显示 `deterministic_fallback / deterministic-fallback-0.1`，用户已确认需要改成 LLM 驱动真 agent 模拟。
- 前端不得接触 Minimax API key；只消费后端 `SimulationRun.provider/modelVersion/qualityFlags`。
- 现有渠道对象库有 `channel_object_latest` / `channel_object`，真实 mock 示例包括：
  - `marketing_event:mock_event_618`
  - `business_scenario:new_product_launch:mock_style`
  - `account:mock_account_douyin_style`
- 若真实 API 不支持某类选择器，必须在 UI 中清楚表现为“手动填写/未校验”，不能暗示已校验存在。

## Deliverables

- 模拟市场报告区：
  - 明确展示 `provider` / `modelVersion` / `qualityFlags`。
  - 当 `provider` 是 `minimax` 且 `modelVersion` 为 `minimax-m3` 时，显示为 LLM agent 模拟。
  - 当 fallback flag 出现时，显示 fallback 警示，不让用户误以为是 LLM 结果。
- 市场场景区：
  - 移除或替换 `event_001` / `scenario_001` / `douyin:shop:semir_official` 这类不存在示例。
  - 优先复用现有对象库 API / mock，提供渠道对象、营销活动、业务场景选择；若后端无统一 selector，至少给出真实存在的 `canonicalObjectKey` 示例，并标注为手动输入。
  - 选择或填写后仍提交到 `marketContext.channelEntityId` / `marketingEventId` / `businessScenarioId` / `contextText`，不改变 API contract。
- 前端 adapter / mock：
  - Mock 响应必须同构真实后端 wrapper。
  - Mock 需覆盖 minimax 成功路径和 fallback 路径。
- E2E：
  - mock 模式覆盖 LLM provider 状态展示。
  - fallback 模式覆盖警示展示。
  - `VITE_USE_MOCK=false` contract test 断言真实请求命中 `/api/v0/simulated-market/*`。
  - 390px 窄屏无页面级横向溢出。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不修改后端 API、DB schema 或模型算法。
- 不在前端读取、保存或暴露 `MINIMAX_API_KEY`。
- 不自动运行模拟，不自动创建经营决策。
- 不把模拟结果描述为真实销量、真实用户反馈或 AB test。
- 不实现长期 persona 库或 DMP 明细 agent。

## Validation Required

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts`

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- UX Notes
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-llm-v2
- 顺序：3
- 依赖：T0021
- 只有依赖任务全部 approved 后才可领取。
