---
id: "T0005"
slug: "jd-three-audience-matrix-calibration"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "3b3baee267cf0ccf3eb8987b6245e3f7f8cfa245"
batch: "semir-three-audience-v2"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/jd-three-audience-calibration.ts"
  - "apps/model/src/jd-three-audience-calibration-contract-test.ts"
  - "apps/model/package.json"
  - "docs/model-jd-three-audience-calibration.md"
  - "docs/model-three-audience-share-contract.md"
  - "docs/prd-three-audience-share-algorithm.md"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run jd-three-audience-calibration-contract-test"
---

## 目标

校准森马京东十大靶群到 A/B/C 三大人群的映射矩阵，使十大靶群每一行都满足 `A+B+C=1`，从而对合法且合计为 1 的京东十大靶群输入得到 `coverage=1`。输出可复算实现、contract test、四份真实京东数据的 before/after 报告，并把批准候选写入三大人群算法契约，供后续七渠道算法实现直接使用。

## 背景与证据

当前 v2.0.2 京东矩阵存在结构性未拉齐：

- 学生一族权重合计 0.60。
- 小镇中产权重合计 0.40。
- 小镇家庭权重合计 0.50。
- 银发一族、小镇中年权重合计 0。

以下真实 XLSX 的十大靶群原始占比均合计约 1，仅有最多 0.0001 的源数据舍入误差；问题不在原始十大占比，而在映射矩阵：

- `/Users/huangbo/Downloads/35-京东人群画像分析（1-6月）/透视分析_京自营26年1-6月.xlsx`
- `/Users/huangbo/Downloads/35-京东人群画像分析（1-6月）/透视分析_京自营25年.xlsx`
- `/Users/huangbo/Downloads/35-京东人群画像分析（1-6月）/透视分析_京东森马官旗25年.xlsx`
- `/Users/huangbo/Downloads/35-京东人群画像分析（1-6月）/透视分析_森马京东官旗26年1-6月.xlsx`

依据：

- `docs/prd-three-audience-share-algorithm.md`
- `docs/model-three-audience-share-contract.md`（当前京东段是待校准 baseline）
- `/Users/huangbo/Downloads/森马品牌三大人群算法v2.0.2/三大人群×全渠道标签映射表_v2.0.2.md`
- `/Users/huangbo/Downloads/森马品牌三大人群算法v2.0.2/三大人群占比估算方法论_v2.0.2.md`

## 允许范围

- 新增 `apps/model/src/jd-three-audience-calibration.ts`。
- 新增 `apps/model/src/jd-three-audience-calibration-contract-test.ts`。
- 修改 `apps/model/package.json`，仅新增校准 contract test script。
- 新增 `docs/model-jd-three-audience-calibration.md`。
- 修改 `docs/model-three-audience-share-contract.md`，仅更新京东矩阵、京东 coverage 语义和因行为变化需要更新的 algorithmVersion。
- 修改 `docs/prd-three-audience-share-algorithm.md`，仅同步京东校准前置与验收口径。
- 更新 `docs/notes-model.md`，记录决策、验证与风险。

禁止修改未列入 allowed paths 的文件。

## 非目标

- 不实现七渠道统一算法入口；该工作由后续依赖任务完成。
- 不定义渠道、店铺、账号画像结构。
- 不修改 data template、DB、Server 或 Frontend。
- 不实现专家先验、趋势、行为强度、动态误差区间或置信度模型。
- 不把四份 XLSX 当作真实 A/B/C ground truth，不为了贴合某个目标占比反推权重。
- 不安装依赖，不 commit，不 push。

## 校准约束

1. 京东十行矩阵每个权重必须为有限数且位于 `0-1`，每行合计满足 `abs(sum-1)<=1e-9`。
2. 十大靶群输入合计为 1 时，`coverage=1`，A/B/C raw 合计为 1。
3. v2.0.2 已有非零贡献是 baseline，不得无说明删除或反转；新增残余分配必须逐标签给出人群定义、跨渠道相似人群或业务语义依据。
4. 至少比较两个候选矩阵或解释为何只有一个候选可辩护；记录选择与代价。
5. 四份 XLSX 只用于结构验证、before/after、跨年/店型敏感性检查，不用于声称预测准确率。
6. 不使用默认 expert prior，不保留京东 uncovered 池。
7. 如果无法从现有依据得到可辩护的唯一矩阵，不得任意拍权重；在 handoff 中提交候选与阻塞点供 controller 决策。
8. 这是对 v2.0.2 的实质算法变化，algorithmVersion 必须升级，不得继续冒充原始 `semir_three_audience_v2.0.2`。

## 报告要求

`docs/model-jd-three-audience-calibration.md` 必须包含目的、使用方式、样例、注意事项，并至少报告：

- 原始十大靶群四份数据及合计检查。
- v2.0.2 baseline 的 row sum 与 uncovered 来源。
- 候选矩阵、逐标签依据和最终推荐。
- 四份数据的 baseline/new A/B/C、coverage 和 delta。
- 无 ground truth、专家判断与过拟合风险。
- 后续七渠道算法必须消费的冻结接口/常量。

## 验证

在 `apps/model` 目录运行：

```bash
npm run typecheck
npm run jd-three-audience-calibration-contract-test
```

contract test 至少覆盖十行 row sum、四份真实输入合计容差、四份结果 A/B/C 合计、coverage=1、非负性与确定性。

## Handoff 格式

必须包含：`What Changed`、`Files Changed`、`Validation`、`Risks`、`Open Questions`。必须明确最终矩阵是否已达到可供后续任务直接实现的冻结状态。

## Worker 流程

OpenCode 显式运行 `/agentops-task-next` 领取；完成后写 `handoff.md` 并运行 `/agentops-task-handoff`。若 controller 返回 `changes_requested`，同一 worker 再次运行 `/agentops-task-next` 恢复本任务。

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：semir-three-audience-v2
- 顺序：1
- 依赖：无
