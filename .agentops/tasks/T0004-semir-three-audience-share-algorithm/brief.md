---
id: "T0004"
slug: "semir-three-audience-share-algorithm"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "3b3baee267cf0ccf3eb8987b6245e3f7f8cfa245"
batch: ""
sequence: ""
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/three-audience-share.ts"
  - "apps/model/src/three-audience-share-contract-test.ts"
  - "apps/model/package.json"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run three-audience-share-contract-test"
---

## 目标

依据 `docs/prd-three-audience-share-algorithm.md` 与 `docs/model-three-audience-share-contract.md`，在 `apps/model` 实现对象无关的森马三大人群占比算法 `estimateSemirThreeAudienceShares`，覆盖抖音、天猫、京东、线下、唯品会、视频号、拼多多七类渠道，并提供可复算 contract test。

## 背景依据

- 产品边界：`docs/prd-three-audience-share-algorithm.md`
- 冻结契约：`docs/model-three-audience-share-contract.md`
- 原始映射表：`/Users/huangbo/Downloads/森马品牌三大人群算法v2.0.2/三大人群×全渠道标签映射表_v2.0.2.md`
- 原始方法论：`/Users/huangbo/Downloads/森马品牌三大人群算法v2.0.2/三大人群占比估算方法论_v2.0.2.md`
- 用户确认样例：`/Users/huangbo/Downloads/14天猫官旗人货匹配分析/clean_data/单品人群画像/1019275938176_人群画像.md`

若原始方法论与冻结契约冲突，以 `docs/model-three-audience-share-contract.md` 为准。特别是京东必须使用 v2.0.2 新权重：学生一族 A=0.30/C=0.30，小镇家庭 C=0.50。

## 允许范围

- 新增 `apps/model/src/three-audience-share.ts`。
- 新增 `apps/model/src/three-audience-share-contract-test.ts`。
- 修改 `apps/model/package.json`，仅新增 contract test script。
- 更新 `docs/notes-model.md`，记录实现、验证和已知边界。

禁止修改未列入 allowed paths 的文件。如实现需要改变冻结契约，停止并在 handoff 中提出，不得自行改 contract。

## 非目标

- 不定义或修改渠道、店铺、账号画像结构。
- 不修改 `AudienceProfile`、data template、fixture、DB schema、migration 或导入逻辑。
- 不修改 `apps/server/**` 或新增 API。
- 不修改 `apps/web/**`。
- 不持久化计算结果或专家先验。
- 不实现趋势、行为强度、动态 `±npp` 或完整置信度模型。
- 不从年龄、城市、消费力、兴趣、折扣敏感度等非份额层信号推断 A/B/C。
- 不安装依赖，不 commit，不 push。

## 实现约束

1. TypeScript 强类型，禁止 `any`，错误处理显式。
2. 算法只接受冻结 contract 的对象无关输入，不读取 DB row、UI state 或导入包原始结构。
3. channel/system 必须严格匹配，不做跨渠道 fallback。
4. 默认模式对已覆盖贡献归一化；coverage=0 返回不可计算，不伪造均分。
5. 只有调用方显式提供合法 `expertPrior` 时才软回填 uncovered；不得内置默认 prior。
6. 不得提前舍入；输出保留原始 number。
7. 未映射标签保留在诊断输出，不进入份额公式。
8. 仅实现来源文档明确给出的别名/合并规则，不自行扩展标签词典。

## 测试要求

contract test 至少覆盖：

1. 七类渠道各一个矩阵单元测试，明确标注非真实业务样本。
2. 天猫确认样例：coverage=0.9005，默认结果约 A=0.4699389228、B=0.2407495836、C=0.2893114936。
3. 京东学生一族、小镇家庭新权重和 partial coverage。
4. 拼多多合并与视频号合并。
5. 默认归一化与显式 prior 软回填。
6. 空覆盖、未知体系、channel/system 不匹配、重复标签、share 越界、总和超过 1、非法 prior。
7. 未映射标签保留、qualityFlags 和结果合计误差。

不得捏造业务基准、对象 ID、渠道样本或专家先验。

## 验证

在 `apps/model` 目录运行：

```bash
npm run typecheck
npm run three-audience-share-contract-test
```

两条命令必须通过，并在 handoff 中转述测试数量、关键数值和任何未验证项。

## Handoff 格式

必须包含：

- `What Changed`
- `Files Changed`
- `Validation`
- `Risks`
- `Open Questions`

如实际使用 domain memory 影响了实现或验证，可补充 `Memory Used`；仅在出现可复用且有证据的教训时补充 `Memory Candidates`。

## Worker 流程

1. OpenCode 显式运行 `/agentops-task-next` 领取本任务。
2. 只在 allowed paths 内实现并验证。
3. 写入 `handoff.md`。
4. 显式运行 `/agentops-task-handoff`。
5. 等待 controller 使用 `/agentops-task-review`；若返回 `changes_requested`，同一 OpenCode worker 再次运行 `/agentops-task-next` 恢复本任务，不新建替代任务。

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。
