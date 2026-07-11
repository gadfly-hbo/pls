---
id: "T0020"
slug: "simulated-market-llm-agent-contract"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "68c28c67f991d533e04248542f34566fbd4c2184"
batch: "simulated-market-llm-v2"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "docs/prd-simulated-market.md"
  - "apps/model/src"
  - "apps/model/package.json"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run simulated-market-contract-test"
---

## Objective

将模拟市场模型层从“deterministic fallback 即主实现”升级为“LLM agent 模拟优先、deterministic fallback 兜底”的稳定 contract。

本任务只负责 `apps/model` 的类型、prompt/schema、响应解析、fake provider contract test 和 fallback 兼容，不直接调用真实 Minimax 网络 API。真实 provider 接入由 `T0021` backend 完成。

核心目标：

- 三大人群 `TargetUserAgent` 必须真正进入 LLM prompt，LLM 需要分别扮演每个 agent，输出分 agent 反馈。
- 输出仍是 `SimulationRun` / `SimulatedMarketResult` 结构化报告，属于 Derived Result，不是真实市场反馈。
- `provider = "minimax"` 且 `modelVersion = "minimax-m3"` 只允许在上游 caller 明确提供 LLM 结果成功时使用；模型层 fallback 不得冒充 LLM。
- deterministic fallback 保留为兜底与离线测试路径，但不再被定义为“主路径”。

## Context

- 现有一期任务 `T0014-T0019` 已 approved，但 `T0014` 当时明确“不接外部 LLM provider”，导致当前报告实际由关键词规则生成。
- `docs/prd-simulated-market.md` 已写明默认 LLM 模型采用与 pi-xanthil 一致的 `minimax-m3`，provider 不可用时才 fallback。
- 用户已确认二期口径：Minimax 配置按 `MINIMAX_API_KEY` + `MINIMAX_API_HOST` + `SIMULATED_MARKET_MODEL=minimax-m3`；live LLM 验证作为显式 env 才运行的可选 smoke，不进入默认 CI。

## Deliverables

- 在 `apps/model/src/simulated-market.ts` 或相邻模块中新增 LLM agent simulation contract。建议提供：
  - `buildSimulatedMarketPrompt(input)` 或等价 prompt builder。
  - `parseSimulatedMarketLlmResponse(raw)` 或等价 parser。
  - `runLlmSimulatedMarket(input, llmResponse, options)` 或清晰的模型层装配函数。
  - fake provider / fake response test fixture，用于默认 contract test。
- LLM 输出 schema 必须覆盖现有 `SimulatedMarketResult`：
  - `overall.acceptanceScore`
  - `overall.purchaseIntentScore`
  - `overall.confidence`
  - `overall.opportunitySummary`
  - `overall.riskSummary`
  - `overall.recommendedAdjustments`
  - `agentFeedback[]`
- `agentFeedback[]` 必须逐个对应输入 `targetAgentSet`，不得少 agent、重复 agent、输出未知 agent。
- Parser 必须做边界校验：
  - score clamp 或拒绝非法分数的策略必须明确且测试覆盖。
  - 数组字段缺失、JSON 不合法、agentId 不匹配时必须显式失败，供 backend fallback。
  - 不吞异常，不使用 `any`。
- 更新 contract test：保留 fallback 测试，同时新增 LLM fake response 成功、JSON 解析失败、agent 不匹配、分数越界等用例。
- 如需更新 `docs/prd-simulated-market.md`，只做二期口径澄清，不扩大产品范围。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不调用真实 Minimax API。
- 不读取 server env 或 API key。
- 不修改 `apps/server` / `apps/web` / DB schema。
- 不新增 taxonomy tagId、长期 persona 库、DMP 明细 agent 或真实用户 agent。
- 不把模拟反馈写成真实销售事实、真实用户反馈或 AB test 结果。

## Validation Required

- `cd apps/model && npm run typecheck`
- `cd apps/model && npm run simulated-market-contract-test`

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-llm-v2
- 顺序：1
- 依赖：无
