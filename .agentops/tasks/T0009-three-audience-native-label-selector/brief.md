---
id: "T0009"
slug: "three-audience-native-label-selector"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "three-audience-native-filter"
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

在 `apps/model/src/three-audience-share.ts` 新增只读入口 `isSemirThreeAudienceNativeLabel(channel, label)`，供本地文件接入在校验前判断某标签是否属于所选渠道可计算的原生人群体系。

以 `docs/model-three-audience-share-contract.md` 新增入口和筛选约束为准。此任务修复“整份通用画像文件被误当成原生人群分布，造成重复标签与总和超额”的根因。

## Required behavior

1. 入口接受 `ThreeAudienceChannel` 和原始 `label`，返回 boolean。
2. 必须复用算法内部现有矩阵和 `normalizeLabel` 已冻结别名规则；不得复制第二份矩阵、标签列表或别名表。
3. 对可映射标签返回 true；对兴趣、地域、设备品牌等任意无关标签返回 false。
4. 抖音至少覆盖八大人群和 `Z世代 -> genz`；视频号、拼多多同样必须遵守各自已冻结别名。
5. 不改变 `estimateSemirThreeAudienceShares`、矩阵、容差、coverage、prior、版本或错误语义。
6. contract test 需覆盖每个渠道的一个可识别标签、无关标签、抖音/视频号/拼多多别名。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不解析文件、不处理 row、share 或 UI 状态。
- 不新增 Server API、DB、依赖或前端标签集合。
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

- 批次：three-audience-native-filter
- 顺序：1
- 依赖：无
