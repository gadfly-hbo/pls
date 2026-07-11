# Handoff: T0014-simulated-market-model-contract

## What Changed

在 `apps/model` 中实现了模拟市场一期的模型层 contract 与 deterministic fallback：

- 新增三大人群 agent 模板生成器 `buildDefaultTargetUserAgents()`，覆盖 `A / 质感流行派`、`B / 都市体面家`、`C / 百搭优选客`。
- 新增输入校验 `validateSimulatedMarketInput()`，显式校验 sourceType、strategyText、marketContext、targetAgentSet 及各 agent 字段。
- 新增 deterministic fallback 运行入口 `runDeterministicSimulatedMarket()`，输出完整的 `SimulatedMarketResult` 与 `SimulationRun`。
- fallback 输出包含：overall 评分（acceptanceScore / purchaseIntentScore / confidence）、opportunitySummary、riskSummary、recommendedAdjustments、agentFeedback[] 与 qualityFlags。
- `provider` 固定为 `deterministic_fallback`，`modelVersion` 固定为 `deterministic-fallback-0.1`，不冒充 `minimax-m3`。
- 新增 npm script `simulated-market-contract-test`。

## Files Changed

- `apps/model/src/simulated-market.ts` （新增）
- `apps/model/src/simulated-market-contract-test.ts` （新增）
- `apps/model/package.json` （新增 `simulated-market-contract-test` script）

## Validation

- `cd apps/model && npm run typecheck`：通过
- `cd apps/model && npm run simulated-market-contract-test`：通过，所有断言通过

## Risks

- deterministic fallback 的评分逻辑基于关键词匹配和文本长度启发式，不是真实模型输出；替换为 LLM provider 时需要重新校准置信度和分数分布。
- 策略文本过短的阈值（10 字符）是硬性启发式，可能过严或过松，需产品确认。
- 当前手动 persona 仅校验 sourceType，未对 profile 内容做深度语义校验。
- 本次未接入 `minimax-m3`，`SimulationRun` 的 `provider`/`modelVersion` 由 fallback 填充；后端 `T0015` 调用时应注意不将 fallback 结果误标为真实模型结果。

## Open Questions

- 是否需要明确 `minimax-m3` 接入后的 `modelVersion` 命名规则与 provider 切换逻辑？（本次未实现）
- `qualityFlags` 中 `llm_unavailable_fallback_used`（PRD 原始）与 `deterministic_fallback_used`（任务口径）的差异是否需要总控统一？本次按任务口径使用 `deterministic_fallback_used`。
- 后续跨模块衔接（新品预测送入模拟市场、人货匹配送入模拟市场、从模拟结果创建经营决策）不在本任务范围，需要后续任务明确输入转换逻辑。

## Contract Drift or Change Requests

- 无 contract drift。实现严格遵循 `docs/prd-simulated-market.md` 的领域对象定义与任务要求的评分范围、质量标记和 fallback 输出字段。
- 未扩展 allowed_paths 之外的文件；未修改后端、前端、DB schema 或 taxonomy。

## Memory Used

- `agentops/memory/opencode-algorithm.md`：
  - 开工前读取了 brief 和 memory。
  - 遵循了「Preserve deterministic behavior」规则：使用纯函数、固定模板和确定性打分，同一输入两次运行输出一致。
  - 遵循了「Make edge cases explicit」规则：显式处理空输入、短策略文本、缺失 market context、缺失 agent profile、无效 sourceType 等边界。
