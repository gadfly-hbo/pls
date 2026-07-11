---
id: "T0011"
slug: "three-audience-rounding-tolerance"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "three-audience-rounding-tolerance"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/three-audience-share.ts"
  - "apps/model/src/three-audience-share-contract-test.ts"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run three-audience-share-contract-test"
---

## Objective

将森马三大人群所有渠道的输入总 share 四舍五入容差统一调整为 `1e-4 + 1e-12`（约 `100.01%`），并暴露前端可复用的只读 `threeAudienceInputTotalTolerance(channel)` 入口，避免前端维护独立阈值。

以 `docs/model-three-audience-share-contract.md` 的最新统一容差口径为准。

## Required behavior

1. 所有七渠道输入总 share 在 `1 + 1e-4 + 1e-12` 内均有效，超过时仍抛 `share_total_exceeds_one`。
2. 总和大于 1 但在容差内时，保持既有“先归一化、再映射”的语义，输出不得出现负 uncovered 或 share。
3. 新增导出的容差入口必须返回与算法验证、归一化使用的同一数值；不得在前端复制常量。
4. 保留算法版本、矩阵、prior、coverage 与错误代码语义。
5. contract test 覆盖非京东 `100.01%` 有 prior 的有效归一化、略超 `100.01%` 的显式失败，以及容差入口与估算入口一致性。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不改前端、Server、DB、依赖、矩阵或标签识别。
- 不提交、push、安装依赖或执行破坏性清理。
- Do not commit, push, install dependencies, or run destructive cleanup.

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：three-audience-rounding-tolerance
- 顺序：1
- 依赖：无
