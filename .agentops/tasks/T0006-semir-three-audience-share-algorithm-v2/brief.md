---
id: "T0006"
slug: "semir-three-audience-share-algorithm-v2"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "3b3baee267cf0ccf3eb8987b6245e3f7f8cfa245"
batch: "semir-three-audience-v2"
sequence: "2"
depends_on: 
  - "T0005"
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/three-audience-share.ts"
  - "apps/model/src/three-audience-share-contract-test.ts"
  - "apps/model/package.json"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run jd-three-audience-calibration-contract-test"
  - "cd apps/model && npm run three-audience-share-contract-test"
---

## 目标

在京东十大靶群矩阵校准任务 approved 后，依据更新后的 `docs/model-three-audience-share-contract.md`，在 `apps/model` 实现对象无关的森马七渠道三大人群占比算法 `estimateSemirThreeAudienceShares`，并提供完整 contract test。

## 前置依赖

- 必须等待京东校准任务 approved。
- 以依赖任务更新后的京东矩阵和 algorithmVersion 为准，不得重新使用 v2.0.2 partial-coverage 京东矩阵。
- 产品边界：`docs/prd-three-audience-share-algorithm.md`。
- 冻结契约：`docs/model-three-audience-share-contract.md`。
- 天猫样例：`/Users/huangbo/Downloads/14天猫官旗人货匹配分析/clean_data/单品人群画像/1019275938176_人群画像.md`。

## 允许范围

- 新增 `apps/model/src/three-audience-share.ts`。
- 新增 `apps/model/src/three-audience-share-contract-test.ts`。
- 修改 `apps/model/package.json`，仅新增统一算法 contract test script；保留依赖任务新增的校准 script。
- 更新 `docs/notes-model.md`，记录实现、验证和已知边界。

禁止修改未列入 allowed paths 的文件。如实现需要改变冻结契约，停止并在 handoff 中提出。

## 非目标

- 不定义或修改渠道、店铺、账号画像结构。
- 不修改 `AudienceProfile`、data template、fixture、DB schema、migration 或导入逻辑。
- 不修改 `apps/server/**` 或 `apps/web/**`。
- 不持久化计算结果或专家先验。
- 不实现趋势、行为强度、动态 `±npp` 或完整置信度模型。
- 不从非份额层信号推断 A/B/C。
- 不安装依赖，不 commit，不 push。

## 实现约束

1. TypeScript 强类型，禁止 `any`，错误处理显式。
2. 算法只接受冻结 contract 的对象无关输入。
3. channel/system 严格匹配，不做跨渠道 fallback。
4. 非京东渠道默认对已覆盖贡献归一化；coverage=0 返回不可计算。
5. 京东使用依赖任务冻结的完整十行矩阵，合法十大输入下 coverage=1。
6. 只有调用方显式提供合法 `expertPrior` 时才软回填存在 uncovered 的渠道；不得内置默认 prior。
7. 不得提前舍入；未映射标签保留在诊断输出。
8. 仅实现来源文档或冻结契约明确给出的别名/合并规则。

## 测试要求

contract test 至少覆盖：

1. 七类渠道各一个矩阵单元测试，明确标注非真实业务样本。
2. 天猫确认样例：coverage=0.9005，默认结果约 A=0.4699389228、B=0.2407495836、C=0.2893114936。
3. 京东完整十行矩阵、coverage=1，并复用或交叉验证校准任务的 contract cases。
4. 拼多多与视频号合并。
5. 默认归一化与显式 prior 软回填。
6. 空覆盖、未知体系、channel/system 不匹配、重复标签、share 越界、总和超过 1、非法 prior。
7. 未映射标签、qualityFlags 和结果合计误差。

不得捏造业务基准、对象 ID、渠道样本或专家先验。

## 验证

在 `apps/model` 目录运行：

```bash
npm run typecheck
npm run jd-three-audience-calibration-contract-test
npm run three-audience-share-contract-test
```

## Handoff 格式

必须包含：`What Changed`、`Files Changed`、`Validation`、`Risks`、`Open Questions`。

## Worker 流程

OpenCode 仅在依赖任务 approved 后显式运行 `/agentops-task-next` 领取；完成后写 `handoff.md` 并运行 `/agentops-task-handoff`。若 controller 返回 `changes_requested`，同一 worker 再次运行 `/agentops-task-next` 恢复本任务。

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：semir-three-audience-v2
- 顺序：2
- 依赖：T0005
- 只有依赖任务全部 approved 后才可领取。
