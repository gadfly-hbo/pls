## What Changed

- 扩展 `TargetAgentSourceType`，新增 `saved_subagent` 与 `channel_audience_profile`，与既有 `three_audience_segment`、`manual_persona` 并列。
- 扩展 `TargetUserAgent.sourceRef`，在保留 `segmentCode`、`segmentName`、`profileVersion` 的基础上，新增：
  - `subagentId`：用于 `saved_subagent`。
  - `canonicalObjectKey`：渠道画像对象唯一键。
  - `profileId`：画像实例 ID。
  - `dataVersion`：数据版本 lineage。
- 更新 `validateSimulatedMarketInput()`，使用显式合法类型数组校验 agent `sourceType`，继续拒绝未知类型，继续强制 `agentId` 与 `name`。
- 更新 `buildSimulatedMarketPrompt()` 的 agent 描述，当 `sourceRef` 存在新 lineage 字段时将其写入 prompt，确保 LLM 路径能识别新来源。
- 更新 `simulated-market-contract-test.ts`，新增：
  - `saved_subagent` 通过验证并参与 deterministic fallback run。
  - `channel_audience_profile` 通过验证并参与 deterministic fallback run。
  - 未知 agent `sourceType` 仍被拒绝。
- 更新 `docs/prd-simulated-market.md` 与 `docs/api-contract.md` 中 `TargetUserAgent` 类型定义及 `sourceType` 枚举说明。

## Files Changed

- `apps/model/src/simulated-market.ts`
- `apps/model/src/simulated-market-contract-test.ts`
- `docs/prd-simulated-market.md`
- `docs/api-contract.md`

未触碰 allowed scope 外文件。

## Validation

- `cd apps/model && npm run typecheck`：通过。
- `cd apps/model && npm run simulated-market-contract-test`：通过，`{ "ok": true, "failures": [] }`。
- `git diff --check`：通过，无空白/行尾问题。

## Risks

- domain_memory 文件 `agentops/memory/opencode-algorithm.md` 不存在，本次实现基于任务 brief 与既有代码，未引用专业记忆。
- 当前 worktree 在任务创建前已有未提交改动（`simulated-market.ts` 的 `parseJsonFromRaw` preamble 解析、`simulated-market-contract-test.ts` 的 thinking preamble 用例、`docs/api-contract.md` 的 pi-agent 配置说明），本次修改基于这些既有 diff 之上追加，未覆盖。如后续 controller 评审，应确认这些 pre-existing 改动与本任务无关。
- 本任务仅冻结模型/共享契约，未实现 DB、API、UI；后续 `T0025`（backend API）与 `T0026`（frontend UI）需要依据本契约落地持久化与展示。

## Open Questions

- 是否需要 controller 决定是否将 `saved_subagent` / `channel_audience_profile` 的 lineage 字段补充进 `docs/api-contract.md` 的 `SimulationRun` 落库口径或审计字段？当前仅在 `TargetUserAgent` 层面定义。
- `channel_audience_profile` 的 `canonicalObjectKey` 格式是否统一为渠道对象库已注册的 `canonicalObjectKey`（如 `douyin:account:...`）？当前契约按字符串处理，未做强格式校验。

## Contract Notes

- 新 `sourceType` 不改变 `SimulatedMarketInput` 整体结构，运行链路（`runDeterministicSimulatedMarket`、`runLlmSimulatedMarket`）已支持任意 `targetAgentSet`，无需重写算法。
- 缺画像字段仍由 `collectInputQualityFlags()` 标记 `missing_target_agent_profile`，未为新类型添加特殊豁免。
- 未新增 taxonomy tagId，未把 subagent 描述为真实用户/真实反馈/AB test，保留 Derived Result 红线。

## Whether Controller Review Is Needed

建议 controller review。本任务属于 `simulated-market-subagents-v1` 批次顺序 1，是后续 backend / frontend 任务的输入依赖，且 worktree 存在 pre-existing diff，需要 controller 确认契约冻结范围与前后任务衔接。
