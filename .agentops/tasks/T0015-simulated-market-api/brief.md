---
id: "T0015"
slug: "simulated-market-api"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-v1"
sequence: "2"
depends_on: 
  - "T0014"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "docs/prd-simulated-market.md"
  - "docs/api-contract.md"
  - "apps/server/src"
  - "apps/server/package.json"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run schema:check"
  - "cd apps/server && npm run smoke:simulated-market"
---

## Objective

在 `apps/server` 中实现模拟市场一期 API、落库保存和 smoke，依赖 `T0014` 的模型层 contract。

后端必须把模拟结果保存为 Derived Result / SimulationRun，不写入真实销售事实、真实反馈事实或经营飞轮决策。默认 LLM 模型口径为 `minimax-m3`，但必须在 provider 不可用、未配置或失败时走 deterministic fallback，并在结果中保留 provider/modelVersion/qualityFlags。

## Context

- 上游任务：`T0014` 必须 approved 后才能领取。
- 产品口径：`docs/prd-simulated-market.md`。
- 一期新增 API 前缀建议：`/api/v0/simulated-market`。
- 结果需要支持列表与详情回看，并遵守 workspace 隔离。
- 新品预测、人货匹配、经营飞轮的衔接入口本轮不实现，只在 API 设计中为后续保留 sourceRef 能力。

## Deliverables

- 新增模拟市场 API route，并在主 API 注册。
- 新增必要 DB schema / migration / schema check 定义，用于保存 SimulationRun。
- 新增服务层，调用 `apps/model` 的模拟市场 contract。
- API 至少包含：
  - `GET /api/v0/simulated-market/agent-templates`
  - `POST /api/v0/simulated-market/runs`
  - `GET /api/v0/simulated-market/runs`
  - `GET /api/v0/simulated-market/runs/:runId`
- 响应必须使用 PLS 统一 wrapper：`{ code, requestId, generatedAt, data }`。
- 落库字段至少覆盖：
  - `runId`
  - `workspaceId`
  - `status`
  - `inputSnapshot`
  - `result`
  - `provider`
  - `modelVersion`
  - `qualityFlags`
  - `generatedAt`
- 新增 smoke script 和 npm script `smoke:simulated-market`。
- 更新 `docs/api-contract.md`，新增模拟市场 API 章节。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不实现前端页面。
- 不自动创建经营飞轮 decision。
- 不写入 `sales`、`gmv`、`conversion`、`feedback_record` 等真实反馈事实。
- 不做新品预测、人货匹配、经营飞轮三个模块的入口改造。
- 不安装新依赖。
- 不接入未配置的外部平台写操作。

## Allowed Files

- `apps/server/src/**`
- `apps/server/package.json`
- `docs/api-contract.md`
- `docs/prd-simulated-market.md` 仅允许做与 API 契约一致的最小澄清。

## API Sand Table

实现前必须先读取现有 route 注册方式、DB schema、migration 和统一响应 helper。不得凭旧 mock 猜测。

请求要求：

- 所有请求必须遵守现有 workspace header 口径，使用 `X-PLS-Workspace`。
- 写入型 `POST /runs` 如项目现有规范要求 idempotency，则必须携带并校验 `Idempotency-Key`；若判断无需 idempotency，需在 handoff 中说明依据。
- `POST /runs` body 必须精确对齐 `SimulatedMarketInput`。

错误情况至少覆盖：

- strategy text 缺失或过短。
- target agents 为空。
- 非法 score / malformed payload。
- runId 不存在。
- 跨 workspace 读取被拒绝或返回 not found。
- provider 失败时 fallback 成功，并输出 `llm_unavailable_fallback_used` 或等价 quality flag。

## Validation Required

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- `cd apps/server && npm run smoke:simulated-market`

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-v1
- 顺序：2
- 依赖：T0014
- 只有依赖任务全部 approved 后才可领取。
