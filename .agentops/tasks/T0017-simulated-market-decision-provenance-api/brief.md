---
id: "T0017"
slug: "simulated-market-decision-provenance-api"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-bridge-v1"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/src/db/schema.ts"
  - "apps/server/src/db/migrate.ts"
  - "apps/server/src/db/schema-check.ts"
  - "apps/server/src/db/migrations"
  - "apps/server/src/routes/flywheel.ts"
  - "apps/server/scripts"
  - "apps/server/package.json"
  - "docs/api-contract.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run schema:check"
---

## Objective

在 `apps/server` 中补齐「从模拟市场结果创建经营飞轮决策」所需的后端契约与溯源存储。

当前 `POST /api/v0/operations/decisions` 只支持从 `match_result` 创建决策，`decision_record` 也只有 `match_id` 关联。后续前端需要用户在模拟市场报告中显式点击，基于 `simulation_run` 创建经营决策，因此后端必须支持保存模拟来源，但不得自动创建决策。

实现目标：

- 扩展 `decision_record` schema，使决策可追溯到模拟市场结果。
- `POST /api/v0/operations/decisions` 继续兼容现有匹配结果创建路径。
- 新增或扩展请求体字段，支持模拟来源：
  - `simulationRunId`
  - `sourceType`，至少支持 `product_channel_match` / `single_product_portrait` / `campaign_product_strategy` / `manual_strategy`
  - `sourceRef` 或等价 JSON 字段，用于保存原始策略来源引用。
  - `simulationSummary` 或等价 JSON 字段，用于保存模拟输出摘要，包括整体接受度、购买/互动意向、风险、建议调整。
- 当请求携带 `simulationRunId` 时，必须验证该 `simulation_run` 属于当前 `workspaceId`；不存在或跨 workspace 返回 `not_found` 或明确的 `invalid_input`。
- 决策仍然必须由 `POST /operations/decisions` 显式创建；不要在 `POST /simulated-market/runs` 中自动写入 `decision_record`。
- `GET /operations/decisions` 和 `GET /operations/decisions/:decisionId` 返回新溯源字段，供前端经营飞轮展示。
- 更新 `docs/api-contract.md`，说明从模拟结果创建决策的请求体、响应字段和非自动写入原则。
- 新增后端 smoke，覆盖：
  - 从模拟结果创建 decision 成功。
  - `simulationRunId` 不存在时失败。
  - 跨 workspace 不可引用其他 workspace 的 `simulation_run`。
  - 旧的 match suggestion 创建路径仍兼容。
  - `POST /simulated-market/runs` 不会自动创建 `decision_record`。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不做前端 UI。
- 不接外部 LLM provider。
- 不把模拟结果写入 `feedback_record`、真实销售事实表、`sales`、`gmv`、`conversion` 或任何 Fact Table。
- 不改变现有 `match_result` 生成逻辑。
- 不引入自动执行动作；经营飞轮仍然只记录与复盘。

## 关键约束

- 先读真实代码再改：`apps/server/src/routes/flywheel.ts`、`apps/server/src/routes/simulated-market.ts`、`apps/server/src/db/schema.ts`、现有 migration / schema-check 模式。
- 受控写入和 smoke 必须遵守 `AGENTS.md` 的 workspace 隔离规则；新增 smoke 不得默认写 `ws_demo`，应使用临时 workspace 或项目已有 isolated wrapper 模式。
- API 响应必须继续遵守 PLS wrapper：`{ code, requestId, generatedAt, data }`。
- 不要使用 `any`；必须显式处理 JSON parse / stringify 错误和 unknown 输入。
- 如果需要新增 migration，使用现有 versioned migration 风格，并更新 schema-check 覆盖。
- 如果需要新增 `npm` script，限定在 `apps/server/package.json`。

## 建议实现方向

- 在 `decision_record` 增加模拟来源字段，例如：
  - `simulation_run_id TEXT`
  - `source_type TEXT`
  - `source_ref TEXT NOT NULL DEFAULT '{}'`
  - `simulation_summary TEXT NOT NULL DEFAULT '{}'`
- `POST /operations/decisions` 中：
  - 保留 `skuId`、`channelId`、`recommendation` 的现有校验。
  - 如果有 `simulationRunId`，先查询 `simulation_run` 当前 workspace 是否存在。
  - 写入新增字段。
- 详情接口返回结构字段名建议使用 camelCase：
  - `simulationRunId`
  - `sourceType`
  - `sourceRef`
  - `simulationSummary`

## Validation

必须运行并在 `handoff.md` 记录结果：

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- 新增 smoke，例如 `cd apps/server && npm run smoke:simulated-market-decision`，名称可按项目脚本风格调整。

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Notes
- Memory Candidates（如无可写“无”）

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-bridge-v1
- 顺序：1
- 依赖：无
