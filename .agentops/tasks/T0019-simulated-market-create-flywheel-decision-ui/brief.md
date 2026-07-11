---
id: "T0019"
slug: "simulated-market-create-flywheel-decision-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-bridge-v1"
sequence: "3"
depends_on: 
  - "T0018"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/pages/SimulatedMarketWorkbench.tsx"
  - "apps/web/src/pages/FlywheelWorkbench.tsx"
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

在前端补齐「从模拟市场结果创建经营飞轮决策」的用户显式入口，并让经营飞轮能展示模拟来源摘要。

此任务依赖：

- T0017 已批准：后端 `POST /operations/decisions` 支持 `simulationRunId/sourceType/sourceRef/simulationSummary` 等溯源字段。
- T0018 已批准：模拟市场可接收上游预填，但不自动运行、不自动创建决策。

实现目标：

1. 模拟市场报告页：
   - 当 `selectedRun.status === "succeeded"` 且有 `selectedRun.result` 时，显示「创建经营决策」按钮。
   - 用户点击后调用 `api.createDecision`，请求必须携带：
     - `simulationRunId`
     - `sourceType`
     - `sourceRef`
     - `simulationSummary`
     - `skuId` / `channelId` / `recommendation`
     - `rationale`
   - 如果原始 `sourceRef` 或 `marketContext` 缺少 SKU/channel/recommendation，必须给出可编辑或可确认的默认值，不得发送空的必填字段导致静默失败。
   - 成功后跳转经营飞轮并选中新创建的 decision。
   - 失败时展示明确错误，不要只 `console.error`。

2. `api.createDecision` adapter：
   - 扩展前端请求类型，不使用 `any`。
   - `USE_MOCK=false` 时按 T0017 真实后端契约发送字段。
   - `USE_MOCK=true` 时 mock decision 也保留模拟来源字段，便于飞轮本地展示。

3. 经营飞轮：
   - 决策详情中展示模拟来源信息，例如：
     - `simulationRunId`
     - 来源类型
     - 整体接受度 / 购买意向
     - 主要风险 / 建议调整
   - 必须明确这是模拟 Derived Result，不是真实市场反馈。
   - 不把模拟摘要伪装成 `feedback_record`；真实业务复盘仍由用户在飞轮中提交。

4. E2E：
   - 覆盖从模拟市场报告创建经营决策并进入飞轮。
   - 覆盖 mock 模式下飞轮展示模拟来源摘要。
   - 如新增 `VITE_USE_MOCK=false` contract 测试，必须确保真实请求命中 `/api/v0/operations/decisions`，且请求体包含 `simulationRunId`。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不修改后端；后端契约问题应阻塞并写入 Open Questions，不要在前端绕过。
- 不自动创建经营决策；必须用户点击。
- 不把模拟结果写入 `feedback_record`、真实销售事实或 Fact Table。
- 不修改模拟模型评分逻辑。
- 不新增路由库或全局状态库。

## 关键约束

- 先读 T0017 handoff / review 和真实 `docs/api-contract.md` 新增契约，再改前端 adapter。
- 先读现有 `FlywheelWorkbench.tsx` 的状态流转和 `api.updateDecision` 行为，不改变真实业务复盘路径。
- 不要使用 `any`。
- 错误处理显式展示到 UI。
- 390px 窄屏下新增按钮、摘要卡片、飞轮详情不得重叠。
- 保持模拟市场结果是 Derived Result 的文案和数据边界。

## Validation

必须运行并在 `handoff.md` 记录结果：

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- 定向 Playwright：覆盖从模拟报告创建 decision 到飞轮展示来源摘要。
- 若 T0017 新增了后端 smoke，本任务不需要重复跑后端全量 smoke，但如果改动依赖真实契约，建议补跑相关 `VITE_USE_MOCK=false` 前端 contract 测试。

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Notes
- UX Notes
- Memory Candidates（如无可写“无”）

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-bridge-v1
- 顺序：3
- 依赖：T0018
- 只有依赖任务全部 approved 后才可领取。
