---
id: "T0021"
slug: "simulated-market-minimax-provider-api"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "68c28c67f991d533e04248542f34566fbd4c2184"
batch: "simulated-market-llm-v2"
sequence: "2"
depends_on: 
  - "T0020"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "docs/api-contract.md"
  - "docs/prd-simulated-market.md"
  - "apps/server/src"
  - "apps/server/scripts"
  - "apps/server/package.json"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run schema:check"
  - "cd apps/server && npm run smoke:simulated-market"
---

## Objective

在后端接入模拟市场 LLM provider：默认使用与 pi-xanthil 一致的 `minimax-m3`，让 `POST /api/v0/simulated-market/runs` 优先调用真实 LLM agent 模拟；仅当 provider 未配置、不可用、超时、返回非法 JSON 或模型层校验失败时，才使用 deterministic fallback。

配置口径已由用户确认：

- `MINIMAX_API_KEY`：server 端读取，绝不下发前端。
- `MINIMAX_API_HOST`：默认可为 `https://api.minimaxi.com`，允许 env 覆盖。
- `SIMULATED_MARKET_MODEL`：默认 `minimax-m3`。
- live LLM 验证是可选 smoke：只有显式 env 存在时才运行；默认 CI / smoke 必须使用 fake provider 或 fallback，不因无 key / 无网络失败。

## Context

- 依赖 `T0020` approved 后领取。
- 当前 `apps/server/src/services/simulated-market-adapter.ts` 只调用 `runDeterministicSimulatedMarket()`，导致报告不是 LLM agent 模拟。
- `docs/prd-simulated-market.md` 已写明 LLM 优先、fallback 兜底的产品口径。
- PLS 数据准入口径允许用户授权进入 PLS 的数据进入 LLM；但 secret/API key 不得写入仓库、日志、audit meta 或前端响应。

## API Sand Table

写代码前必须先读：

- `apps/server/src/routes/simulated-market.ts`
- `apps/server/src/services/simulated-market-adapter.ts`
- `apps/model/src/simulated-market.ts`
- `apps/server/src/lib/response.ts`
- `apps/server/src/lib/idempotency.ts`
- `apps/server/src/db/migrations/V003_simulated_market_run.ts`
- `docs/api-contract.md` 模拟市场章节

真实请求：

- Method: `POST`
- URL: `/api/v0/simulated-market/runs`
- Headers: `Authorization: Bearer ...`、`X-PLS-Workspace`、`Idempotency-Key`
- Body: `SimulatedMarketInput`
- Response: PLS wrapper `{ code, requestId, generatedAt, data: SimulationRun }`

LLM provider 行为：

- 成功时：
  - `run.provider = "minimax"` 或明确的 minimax provider 标识。
  - `run.modelVersion = "minimax-m3"`。
  - `qualityFlags` 不应包含 fallback flag。
  - `inputSnapshot` 和 `result` 仍完整落库。
- fallback 时：
  - `run.provider = "deterministic_fallback"`。
  - `run.modelVersion = "deterministic-fallback-..."`。
  - `qualityFlags` 必须包含 `deterministic_fallback_used`，并建议补充 `llm_unavailable_fallback_used` 或等价 flag。
  - 不得把 LLM 错误原文、API key 或敏感 header 写入响应或 audit。

## Deliverables

- 后端 provider adapter：封装 Minimax 调用、超时、错误处理、结构化响应解析。
- Fake provider 测试入口：默认 smoke 可验证 LLM 成功路径，不依赖真实网络和真实 key。
- 可选 live smoke：显式 env 存在时才打真实 Minimax；无 env 时跳过并说明 skip，不失败。
- 更新 `apps/server/scripts/smoke-simulated-market.mjs`：
  - 覆盖 fake LLM 成功路径。
  - 覆盖 provider missing/failure fallback 路径。
  - 保持临时 workspace 隔离，不触碰 `ws_demo`。
- 更新 `docs/api-contract.md`：
  - 把“当前固定 deterministic_fallback”改为“默认 minimax-m3，fallback 兜底”。
  - 说明 env、provider/modelVersion、qualityFlags、live smoke 可选口径。
- 如需新增 env 名称，必须在文档写清用途和是否需要重启 server。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不安装新依赖，除非先回流总控并获批。
- 不把 API key 写入仓库、日志、DB、audit meta、前端响应或 e2e fixture。
- 不修改前端 UI。
- 不改变 `simulation_run` 的 Derived Result 定位。
- 不自动创建经营飞轮 decision。
- 不写入 `sales`、`gmv`、`conversion`、`feedback_record` 等真实反馈事实。
- 不把 fallback 结果伪装成 `minimax-m3`。

## Validation Required

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- `cd apps/server && npm run smoke:simulated-market`
- 如实现 live smoke：记录在无 env 时 skip、有 env 时如何手动运行；不要让默认验证依赖真实 key。

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Env / Restart Notes
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-llm-v2
- 顺序：2
- 依赖：T0020
- 只有依赖任务全部 approved 后才可领取。
