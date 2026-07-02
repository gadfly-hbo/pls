# M-P0-C3 词表回流与时间切分准备

> 归属：M 模型预测  
> 状态：P0-C 准备稿  
> 最近更新：2026-07-02

## 1. 目的

处理 P0-B 验收暴露的两类边界：

1. `unmappedInputTokens` 中的 `midi`、`dress` 是否回流 D 域词表。
2. 当前 demo-only 回测无法做正式时间切分的问题。
3. 为 A adapter 提供最小 contract test 样例。

本文不新增 taxonomy tagId，不调整 Segment 模板，不修改 D/A/V 域实现文件。

## 2. Token 回流口径

### 2.1 判定规则

`unmappedInputTokens` 分三类处理：

| 类型 | 判定 | 处理口径 |
|---|---|---|
| 已有结构化 ProductDNA 字段 | token 等价于 `categoryLv2`、`lengthType`、`fabricType` 等字段值 | 不回流画像词表；继续作为结构化特征使用 |
| 可解释画像语义 | token 能稳定映射到 `style.*`、`occasion.*`、`price.*`、`intent.*` | 提交 D/X 评审，批准后进入受控词表 |
| 商品描述噪声或低频词 | token 无稳定画像含义，或只描述品类/版型细节 | 保留在 `unmappedInputTokens`，不进入特征矩阵 |

### 2.2 P0-B 暴露 token 决策

| token | 来源 | 判定 | 处理 | 理由 |
|---|---|---|---|---|
| `midi` | `titleTokens` | 已有结构化字段 | 忽略，不回流 | `lengthType = midi` 已表达长度；映射到画像 tag 会把商品结构误当人群偏好 |
| `dress` | `titleTokens` | 已有结构化字段 | 忽略，不回流 | `categoryLv2 = dress` 已表达品类；不应新增黑盒人群标签 |

结论：`midi` / `dress` 不回流 D 域词表；P0 继续保留在 `unmappedInputTokens` 供数据质量观察。若后续高频结构词过多，建议 D 域在生成 `titleTokens` 时把已落入 ProductDNA 枚举的 token 标记为 `structuralTokens`，M 域不把它们计入词表缺口。

### 2.3 后续回流准入

一个新 token 同时满足以下条件，才建议回流 D/X：

- 连续两个批次出现，且出现 SKU 数不少于 3。
- 不能由现有 ProductDNA 枚举表达。
- 能映射到现有 taxonomy tagId，且不需要新增标签。
- 在 leave-one-SKU-out 或时间切分回测中能提升 `topKTagHit@5` 或 `driverPrecision`。

## 3. 时间切分回测输入要求

P1 正式时间切分回测必须使用多 `timeWindow` 宽表。M 域最低输入要求如下。

### 3.1 宽表粒度

```text
grain = skuId + channelId + timeWindow
```

每个 `skuId` 至少覆盖 2 个闭合 `timeWindow`，整体数据至少覆盖 3 个连续窗口，才能形成 train/test cutoff。

### 3.2 必填字段

| 字段组 | 字段 | 用途 |
|---|---|---|
| Identity | `skuId`、`spuId`、`channelId`、`channelType`、`timeWindow`、`batchId`、`source`、`generatedAt` | 切分、去重、审计 |
| ProductDNA | `categoryLv1`、`categoryLv2`、`season`、`styleKeywords`、`titleTokens`、`priceBand`、`launchType`、`mappedProductTags` | 特征输入与规则兜底 |
| ProfileLabels | `buyerProfileTags`、`labelSampleSize`、`labelTimeWindow`、`unmappedTags` | 监督标签与误差分析 |
| SalesPerformance | `sellThroughRate`、`returnRate`、`gmvIndex`、`trafficIndex`、`conversionRate` | 匹配 label 与样本权重 |
| Quality | `sampleSize`、`profileCoverageRate`、`missingFieldRate`、`lowConfidenceTagCount`、`isTrainable`、`qualityFlags` | 训练过滤与置信度 |

### 3.3 切分规则

- `timeWindow` 必须是 `YYYY-MM-DD/YYYY-MM-DD`，且同一批次内不可重叠。
- `cutoff` 使用 `timeWindow` 结束日期；训练集结束日期 `< cutoff`，测试集结束日期 `>= cutoff`。
- 禁止随机切分。
- 冷启动 SKU 定义为：训练集中没有出现过该 `skuId`，测试集中首次出现。
- 热启动评估子集：`sampleSize >= 300` 且 `profileCoverageRate >= 0.85`。

### 3.4 最低样本建议

- P1 smoke：不少于 3 个 timeWindow、5 个 SKU、4 个 channel，每个 SKU 至少 2 个 channel。
- P1 可解释回测：不少于 6 个 timeWindow、30 个 SKU、4 个 channel。
- 若不足最低样本，只输出 `demo_only` 或 `insufficient_time_windows`，不得声明正式回测达标。

## 4. A Adapter Contract Test 样例

M 域提供无依赖 contract test：

```bash
cd apps/model
npm run contract-test
```

该命令验证：

- `ProductProfileDraft` 包含 `modelVersion`、`modelPath`、`predictedProfileTags`、`topSegments`、`qualityFlags`、`unmappedInputTokens`。
- `ChannelMatchDraft[]` 包含 `channelId`、`channelType`、`matchScore`、`matchConfidence`、`rank`、`overlap`、`bestSegmentId`、`bestSegmentMatch`、`positiveDrivers`、`negativeDrivers`、`qualityFlags`。
- `matchScore` 和 `matchConfidence` 位于 `0-1`。
- drivers 的 `tagId` 保持 taxonomy-like 格式。
- demo 至少返回 4 个 channel matches。

A 域接入时仍负责覆盖持久化字段：`predictionId`、`matchId`、`workspaceId`、`taskId`、`source`、`sourceType`、`generatedAt`、`recommendation`、`risks`。

## 5. 注意事项

- 本任务不新增 Segment 模板或关键词受控词表。
- `midi` / `dress` 不应被映射为画像 tag，也不应从 ProductDNA 删除。
- 时间切分数据可使用用户授权的业务明细或模型宽表；训练/回测结论必须记录来源、时间窗口和样本边界。
