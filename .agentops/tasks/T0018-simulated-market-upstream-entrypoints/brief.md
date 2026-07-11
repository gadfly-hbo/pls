---
id: "T0018"
slug: "simulated-market-upstream-entrypoints"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-bridge-v1"
sequence: "2"
depends_on: 
  - "T0017"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/App.tsx"
  - "apps/web/src/pages/Dashboard.tsx"
  - "apps/web/src/components/SingleProductPortrait.tsx"
  - "apps/web/src/pages/MatchCoreWorkbench.tsx"
  - "apps/web/src/pages/SimulatedMarketWorkbench.tsx"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/types/index.ts"
  - "apps/web/src/index.css"
  - "apps/web/e2e"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
---

## Objective

在前端补齐两个上游入口：新品预测结果页和人货匹配结果页可以把当前策略上下文「送入模拟市场」，并在模拟市场工作台预填来源、策略文本和场景信息。

当前模拟市场一级模块已存在，但只能手动选择 `sourceType/sourceRef` 并粘贴策略文本。此任务要把现有结果页与模拟市场连接起来：

1. 新品预测结果页：
   - 在单款预测结果 `SinglePortraitResult` 中增加明确入口，例如「送入模拟市场」。
   - 点击后跳转模拟市场，预填：
     - `sourceType = "single_product_portrait"`
     - `sourceRef.id = predictionId 或 skuId`；如果当前结果没有稳定 `predictionId`，使用 `skuId` 并在 sourceRef.type 中明确 `single_product_portrait`。
     - `strategyText`：由 SKU、Top 标签、风险标记、模型版本和关键 evidence 生成可读策略摘要。
   - 批量结果详情可只支持当前选中的单个 SKU，不要求批量一次性送入模拟市场。

2. 人货匹配结果页：
   - 在 `MatchCoreWorkbench` 的匹配详情区增加入口，例如「模拟目标用户反馈」。
   - 点击后跳转模拟市场，预填：
     - `sourceType = "product_channel_match"`
     - `sourceRef.id = matchDetail.matchId`
     - `strategyText`：由 SKU、channelId、recommendation、matchScore、confidence、positiveDrivers、negativeDrivers、risks 生成可读策略摘要。
     - `marketContext.channelEntityId = matchDetail.channelId`

3. 模拟市场工作台：
   - 支持从 App 级导航状态接收 prefill。
   - 接收 prefill 后展示在配置表单中，用户仍需显式点击「运行模拟」。
   - 不要自动运行模拟。
   - 不要自动创建经营决策。
   - 保留用户手动编辑能力。

4. App 导航：
   - 扩展 `App.tsx` 中的跨模块跳转状态，允许 `Dashboard` / `MatchCoreWorkbench` 跳转到 `SimulatedMarketWorkbench` 并传入 prefill。
   - 不引入 URL router；沿用当前单页状态导航模式。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不修改后端。
- 不新增外部依赖。
- 不从模拟结果创建经营决策；这是 T0019。
- 不把新品预测结果写入 `prediction` 表。
- 不改变现有预测、匹配算法和 API 响应。
- 不实现批量结果一键全部送入模拟市场。

## 关键约束

- 先读现有组件和类型：`App.tsx`、`Dashboard.tsx`、`SingleProductPortrait.tsx`、`MatchCoreWorkbench.tsx`、`SimulatedMarketWorkbench.tsx`、`api.ts`、`types/index.ts`。
- UI 需沿用现有 `btn`、`panel`、`status-badge`、`alert-banner`、`segmented-control` 风格。
- 390px 窄屏不得出现文字、按钮、工具栏重叠；新增按钮需要 `flex-wrap` / `min-width: 0` 等防御性布局。
- 不要使用 `any`。
- Mock 与真实 API 形态保持同构；如果新增 E2E route mock，字段层级必须与真实 adapter 期望一致。
- `VITE_USE_MOCK=true` 时入口应可演示；`VITE_USE_MOCK=false` 的 contract 测试若涉及真实请求，必须确认 route 被命中，不能被本地 mock 短路。

## 建议类型

可在 `types/index.ts` 增加前端-only prefill 类型，例如：

```ts
export interface SimulatedMarketPrefill {
  sourceType: SimulatedMarketSourceType;
  sourceRef?: { id: string; type: string };
  strategyText: string;
  marketContext?: SimulatedMarketMarketContext;
}
```

具体字段可按现有类型命名调整，但要保持可读、可测试、无 `any`。

## Validation

必须运行并在 `handoff.md` 记录结果：

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- 至少新增或更新一个 Playwright E2E，覆盖：
  - 新品预测结果点击「送入模拟市场」后，模拟市场表单被预填且未自动运行。
  - 人货匹配详情点击「模拟目标用户反馈」后，模拟市场表单被预填且未自动运行。

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- UX Notes
- Memory Candidates（如无可写“无”）

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-bridge-v1
- 顺序：2
- 依赖：T0017
- 只有依赖任务全部 approved 后才可领取。
