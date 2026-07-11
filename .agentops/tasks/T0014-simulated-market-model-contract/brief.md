---
id: "T0014"
slug: "simulated-market-model-contract"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-v1"
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

在 `apps/model` 中实现模拟市场一期的模型层 contract 与 deterministic fallback，供后端 `T0015` 调用。

模型层必须以 `docs/prd-simulated-market.md` 为冻结口径：核心输出是「策略压力测试报告」，默认 LLM 口径为 `minimax-m3`，但本任务只负责可测试的类型、输入校验、agent 模板、fallback 评分和 contract test，不接外部 LLM provider。

## Context

- 产品新增一级模块：模拟市场。
- 一期 agent 来源只支持三大人群模板和临时手写 persona。
- 模拟反馈是 Derived Result，不是真实市场反馈、销售事实或 AB test。
- 一期结果需要落库保存，但落库由 `T0015` backend 负责。
- 跨模块入口「新品预测送入模拟市场」「人货匹配送入模拟市场」「从模拟结果创建经营决策」只记录为后续衔接点，不进入本任务。

## Deliverables

- 新增或扩展 `apps/model/src` 下的模拟市场模型模块，导出稳定 TypeScript 类型和函数。
- 至少提供：
  - `buildDefaultTargetUserAgents()`
  - `validateSimulatedMarketInput()`
  - `runDeterministicSimulatedMarket()`
  - `SimulatedMarketInput`
  - `TargetUserAgent`
  - `SimulationRun`
  - `SimulatedMarketResult`
- 默认三大人群 agent 必须覆盖：
  - `A / 质感流行派`
  - `B / 都市体面家`
  - `C / 百搭优选客`
- deterministic fallback 必须输出：
  - `overall.acceptanceScore`
  - `overall.purchaseIntentScore`
  - `overall.confidence`
  - `opportunitySummary`
  - `riskSummary`
  - `recommendedAdjustments`
  - `agentFeedback[]`
  - `qualityFlags`
  - `provider = "deterministic_fallback"`
  - `modelVersion` 含 fallback 版本，不冒充 `minimax-m3`
- 新增 npm script `simulated-market-contract-test`。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不接入真实外部 LLM provider。
- 不修改 `apps/server`、`apps/web`、DB schema 或 API route。
- 不新增 taxonomy tagId。
- 不生成渠道画像 agent、DMP agent、会员明细 agent 或长期 persona 库。
- 不写入 `data/`、workspace DB 或工具 artifact。

## Allowed Files

- `apps/model/src/**`
- `apps/model/package.json`
- `docs/prd-simulated-market.md` 仅允许在发现 contract 矛盾时做最小澄清；如需改核心口径，写入 handoff 的 Open Questions，等待总控。

## Required Contract

参考 `docs/prd-simulated-market.md` 的 `SimulatedMarketInput`、`TargetUserAgent`、`SimulationRun`、`SimulatedMarketResult`。

评分范围：

- `acceptanceScore`: `0-100`
- `purchaseIntentScore`: `0-100`
- `confidence`: `0-1`

必备 quality flags：

- `strategy_text_too_short`
- `missing_target_agent_profile`
- `missing_market_context`
- `deterministic_fallback_used`

错误处理必须显式，不吞异常。TypeScript 不得使用 `any`。

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

- 批次：simulated-market-v1
- 顺序：1
- 依赖：无
