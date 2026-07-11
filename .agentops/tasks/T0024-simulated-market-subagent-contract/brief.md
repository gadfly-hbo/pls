---
id: "T0024"
slug: "simulated-market-subagent-contract"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "e037f60e13d5695469944063761dfe3785e839da"
batch: "simulated-market-subagents-v1"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/simulated-market.ts"
  - "apps/model/src/simulated-market-contract-test.ts"
  - "docs/prd-simulated-market.md"
  - "docs/api-contract.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run simulated-market-contract-test"
  - "git diff --check"
---

## Objective

为“模拟市场 subagent 管理”迭代冻结模型/共享类型契约，使后续后端和前端可以安全表达“持久化 subagent”和“由渠道画像生成的 subagent”，并继续复用现有 `SimulatedMarketInput.targetAgentSet` 运行模拟。

本任务只做模型层/共享契约的小范围扩展，不实现 DB、API、UI。

## Context

- 用户确认要在模拟市场新增二级 tab `subagent 管理`，支持新增子 agent，用于模拟市场预测，增加新的人群。
- 用户明确参考 pi-xanthil 控制台的 `subagents 管理`，但 PLS 只借鉴管理与画像联动思路，不依赖 pi-xanthil runtime。
- 当前模拟市场契约在 `apps/model/src/simulated-market.ts`：
  - `TargetAgentSourceType = "three_audience_segment" | "manual_persona"`
  - `validateSimulatedMarketInput()` 只允许这两类。
- 现有运行链路已经支持任意 `targetAgentSet`，所以本轮重点是扩展 source provenance，而不是重写模拟算法。
- 旧 PRD `docs/prd-simulated-market.md` 一期“不做长期 persona 库管理”；本任务是用户确认后的二期扩展，必须继续保留 Derived Result、不自动执行经营动作、不新增 taxonomy tag 的红线。

## Deliverables

- 扩展 `TargetAgentSourceType`，至少支持：
  - `saved_subagent`：用户在 PLS 中手动新增并持久化的 subagent。
  - `channel_audience_profile`：由 PLS 渠道画像对象 / `AudienceProfile` 派生的 subagent。
- 扩展 `TargetUserAgent.sourceRef`，允许保存必要 lineage，例如：
  - `subagentId`
  - `canonicalObjectKey`
  - `profileId`
  - `dataVersion`
  - `profileVersion`
  - 现有 `segmentCode` / `segmentName` 不得破坏。
- 更新 `validateSimulatedMarketInput()`：
  - 继续拒绝未知 `sourceType`。
  - 继续要求每个 agent 必须有 `agentId` 和 `name`。
  - 不要求新类型必须有完整画像字段，但缺画像仍应由现有质量标记路径处理。
- 更新模拟市场契约测试，覆盖新 `sourceType` 可通过验证并参与 deterministic fallback run。
- 如需更新文档，只能更新模拟市场相关契约片段，不扩展到无关模型文档。

## Non-goals

- 不新增 DB schema、migration、server route 或 API。
- 不实现 subagent CRUD。
- 不读取或修改渠道对象库导入逻辑。
- 不修改 LLM provider、pi-agent 调用方式、prompt 主体语义或 fallback 算法评分逻辑，除非为了让新 sourceType 进入现有 prompt lineage。
- 不新增 taxonomy tagId，不把 subagent 描述为真实用户、真实反馈或 AB test。
- 不安装依赖，不提交，不推送。

## Allowed Scope

- `apps/model/src/simulated-market.ts`
- `apps/model/src/simulated-market-contract-test.ts`
- `docs/prd-simulated-market.md`
- `docs/api-contract.md`

不要修改本任务 allowed scope 以外文件。当前 worktree 已有未提交改动，worker 必须先读 `git status --short` 和相关 diff，避免覆盖他人改动。

## Validation Required

- `cd apps/model && npm run typecheck`
- `cd apps/model && npm run simulated-market-contract-test`
- `git diff --check`

如实际 `package.json` 中 script 名称不同，先读取 `apps/model/package.json`，使用真实存在的最小等价命令，并在 handoff 说明。

## Handoff Format

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Notes
- Whether Controller Review Is Needed

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-subagents-v1
- 顺序：1
- 依赖：无
