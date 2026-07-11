---
id: "T0026"
slug: "simulated-market-subagent-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "e037f60e13d5695469944063761dfe3785e839da"
batch: "simulated-market-subagents-v1"
sequence: "3"
depends_on: 
  - "T0025"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/pages/SimulatedMarketWorkbench.tsx"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/types/index.ts"
  - "apps/web/src/index.css"
  - "apps/web/e2e/simulated-market.spec.ts"
  - "apps/web/e2e/simulated-market-prefill.spec.ts"
  - "apps/web/e2e/simulated-market-decision.spec.ts"
  - "apps/web/package.json"
  - "docs/prd-simulated-market.md"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts"
  - "git diff --check"
---

## Objective

在模拟市场页面新增二级 tab `subagent 管理`，实现 subagent 的新增、编辑、启用/停用、删除和渠道画像联动，并把 enabled subagents 接入工作台“目标用户 Agent”候选池参与模拟。

## Context

- 依赖 backend subagent API/schema 任务 approved 后领取。
- 用户提供的参考图是 pi-xanthil 控制台 `subagents 管理`，PLS 只参考“列表 + 编辑表单 + 画像联动”的结构，不复刻 pi-xanthil UI，也不依赖其 runtime。
- 当前前端文件：
  - `apps/web/src/pages/SimulatedMarketWorkbench.tsx`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/index.ts`
  - `apps/web/e2e/simulated-market.spec.ts`
- 当前工作台已经有一级模块“模拟市场”，内部 tab 为 `运行配置` / `历史记录`。本任务要在模拟市场内部增加二级能力入口，不新增一级导航。
- `USE_MOCK=true` 会短路网络请求；真实 contract 测试必须使用 `VITE_USE_MOCK=false` 并断言新 API 请求被命中。

## Deliverables

- 类型与 API adapter：
  - 新增 `SimulatedMarketSubagent` 等前端类型，严格对齐后端 wrapper。
  - 在 `api.ts` 增加 subagent CRUD 和 `createSubagentFromChannelObject` 方法。
  - Mock 数据与真实 API response shape 同构，支持本地新增/编辑/删除/启用状态。
- 模拟市场二级 tab：
  - 顶部或模块内提供 `工作台` / `subagent 管理` 切换。
  - `工作台` 保持现有策略输入、目标 Agent、市场场景、运行模拟、报告功能。
  - `subagent 管理` 包含左侧 subagent 列表、右侧编辑/新增表单。
- 管理能力：
  - 新增 subagent：填写名称、persona 描述、偏好、顾虑、决策因素、权重、启用状态。
  - 编辑 subagent：只编辑后端允许字段。
  - 启用/停用：禁用后不进入工作台默认候选池。
  - 删除：使用按钮触发，删除前需有明确确认交互；不要误删 ABC 默认模板。
  - 从渠道画像生成：选择 `ChannelEntity` / `AudienceProfile`，调用后端 `from-channel-object` API；若没有可用画像，显示清晰错误，不编造画像。
- 工作台候选池：
  - 候选池 = 默认 ABC 模板 + enabled subagents。
  - 卡片需区分来源：三大人群 / 已保存 subagent / 渠道画像派生。
  - 选中的 subagent 传入 `SimulatedMarketInput.targetAgentSet`，保持后端可运行。
  - 保留“临时手写 persona”，它仍只用于本次模拟，不落库。
- UI/体验：
  - 沿用现有 AppShell、panel、segmented-control、form-control、alert-banner、data-table-wrapper 风格。
  - 不做营销页，不新增说明性大段文案。
  - 390px 窄屏不得出现文字、按钮、卡片、工具栏重叠或页面级横向溢出。
- E2E：
  - Mock 模式覆盖：进入 subagent 管理、新增、编辑、禁用后候选池消失、从渠道画像生成、运行模拟包含新 agent。
  - `VITE_USE_MOCK=false` contract test 覆盖：真实请求命中 subagent list/create/update/delete/from-channel-object 至少核心路径；如删除会写库，使用 page.route 同构拦截即可，不要对真实主 workspace 做破坏性写入。
  - 保留现有模拟市场 smoke、prefill、decision 测试通过。

## Non-goals

- 不修改后端 API、DB schema、模型契约。
- 不新增一级导航。
- 不把 subagent 描述为真实用户、真实购买反馈或 AB test。
- 不自动运行模拟，不自动创建经营飞轮决策。
- 不安装依赖。
- 不提交，不推送。
- 不修改与本功能无关页面。

## Allowed Scope

- `apps/web/src/pages/SimulatedMarketWorkbench.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/index.css`
- `apps/web/e2e/simulated-market.spec.ts`
- `apps/web/e2e/simulated-market-prefill.spec.ts`
- `apps/web/e2e/simulated-market-decision.spec.ts`
- `apps/web/package.json`
- `docs/prd-simulated-market.md`

当前 worktree 已有未提交改动，worker 必须先读 `git status --short` 和相关 diff，避免覆盖他人改动。运行 Playwright 后不要提交 `playwright-report/` 或 `test-results/` 生成产物。

## Validation Required

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts`
- `git diff --check`

## Handoff Format

写 `handoff.md`，包含：

- What Changed
- Files Changed
- UX Notes
- API Contract Usage
- Validation
- Risks
- Open Questions
- Screenshots / Responsive Notes
- Whether Controller Review Is Needed

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-subagents-v1
- 顺序：3
- 依赖：T0025
- 只有依赖任务全部 approved 后才可领取。
