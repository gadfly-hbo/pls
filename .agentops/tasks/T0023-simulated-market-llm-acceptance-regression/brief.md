---
id: "T0023"
slug: "simulated-market-llm-acceptance-regression"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "68c28c67f991d533e04248542f34566fbd4c2184"
batch: "simulated-market-llm-v2"
sequence: "4"
depends_on: 
  - "T0022"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/scripts"
  - "apps/server/package.json"
  - "apps/web/e2e"
  - "apps/web/src/services/api.ts"
  - "docs/api-contract.md"
  - "docs/prd-simulated-market.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run schema:check"
  - "cd apps/server && npm run smoke:simulated-market"
  - "cd apps/web && npm run build"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts"
---

## Objective

为模拟市场 LLM 二期做最终验收与回归收口，确保 `T0020-T0022` 合并后形成可验证闭环：

- 默认路径可验证 LLM agent 成功，但不依赖真实 Minimax 网络。
- fallback 路径仍可用且被清楚标记。
- live Minimax smoke 是显式 env 才运行的可选验证。
- 前端不会再用不存在的 `event_001/scenario_001` 误导用户。
- 模拟结果仍是 Derived Result，不写真实事实表，不自动执行经营动作。

## Context

- 依赖 `T0022` approved 后领取。
- 本任务是二期批次最后一道回归任务，可以补充 smoke / e2e / docs，但不应大改核心实现。
- 如发现 `T0020-T0022` 存在实现缺口，应优先在 handoff 中列出 review finding；仅做小范围修补。

## Deliverables

- 后端 smoke 收口：
  - `apps/server/scripts/smoke-simulated-market.mjs` 能覆盖 fake minimax 成功、fallback、run detail、workspace 隔离、idempotency。
  - 若有 live Minimax smoke，必须是显式命令或 env gate，例如需要 `RUN_SIMULATED_MARKET_LIVE_LLM=1` 且存在 `MINIMAX_API_KEY` 才执行。
  - 默认 `npm run smoke:simulated-market` 不因无 key / 网络不可用失败。
- 前端 e2e 收口：
  - `e2e/simulated-market.spec.ts` 覆盖 provider 状态、fallback 警示、真实请求命中。
  - 如果 `T0022` 新增对象选择器，测试覆盖选择真实对象 key 或手动输入真实示例。
- 文档收口：
  - `docs/api-contract.md` 与 `docs/prd-simulated-market.md` 对齐最终状态。
  - 明确 env、默认模型、fallback 标记、live smoke 手动运行方式、是否需要重启 server。
- 运行并记录验证结果。代码任务收尾前运行 `git diff --check`。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不安装依赖。
- 不重构模拟市场核心算法或 UI。
- 不改 DB schema，除非发现不可避免的兼容 bug 并回流总控。
- 不把 live Minimax 调用设为默认 CI 必跑。
- 不提交或推送。

## Validation Required

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- `cd apps/server && npm run smoke:simulated-market`
- `cd apps/web && npm run build`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts`
- `git diff --check`

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Acceptance Summary
- Env / Live Smoke Notes
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-llm-v2
- 顺序：4
- 依赖：T0022
- 只有依赖任务全部 approved 后才可领取。
