# M-P2-5 Product Channel Fit Contract

目的：冻结 P2 解释型人货匹配输出 contract，让 A/V 可以实现解释面板，并为用户后续提供正式 fit formula 留出替换点。

## 使用方式

入口：`apps/model/src/product-channel-fit.ts` 的 `explainProductChannelFit(input)`。

输入对象：

- `productProfile`：来自 D-P2-2 的 `ProductProfile` 或 M 预测输出投影，至少包含 `skuId`、`predictedProfileTags`、`qualityFlags`，可选 `sampleSize`。
- `channelProfile`：来自 D-P2-2 的 entity-first `ChannelProfile` 投影，至少包含 `channelId`、`channelType`、`tags`、`sampleSize`、`qualityFlags`。
- `legacyFitScore`：可选，仅允许 `{ source: "legacy_dashboard", usage: "diagnostic_reference_only" }`，不能作为正式产品算法结论。
- `unmappedSourceFields`：可选，用于承接尚未进入 taxonomy 的用户授权字段，必须保留 `sourceField` 和原因。

输出对象：

```ts
interface ProductChannelFit {
  skuId: string;
  channelId: string;
  channelType: string;
  modelVersion: string;
  contractVersion: string;
  source: "product_channel_fit_contract_baseline";
  sourceType: "derived";
  fitScore: number;
  confidence: number;
  recommendation: "priority_launch" | "test_launch" | "observe" | "avoid";
  explanation: FitExplanation;
  riskFlags: ProductChannelRiskFlag[];
  qualityFlags: string[];
  legacyFitScore?: LegacyFitScoreReference;
}
```

```ts
interface FitExplanation {
  matchedTags: FitTagEvidence[];
  conflictTags: FitTagEvidence[];
  missingTags: FitTagEvidence[];
  lowConfidenceTags: FitTagEvidence[];
  summary: string;
}
```

`FitTagEvidence` 必须至少可追溯到 `tagId` 或 `sourceField`。`matchedTags`、`conflictTags`、`missingTags`、`lowConfidenceTags` 是前端解释面板的稳定输入，不需要前端重新推导匹配解释。

## 置信度

当前 `confidence` 是 contract baseline 口径：

- 从 matched tag 的 tag-level confidence 取均值。
- 低置信标签按数量折减。
- `productProfile.sampleSize` 和 `channelProfile.sampleSize` 低于 500 时折减。

这不是正式 fit formula。正式公式冻结前，输出必须保留：

- `riskFlags: ["algorithm_pending_user_formula", ...]`
- `qualityFlags: ["algorithm_pending_user_formula", ...]`

## 不可用边界

- 没有 `tagId` 且没有 `sourceField` 的解释项不可输出。
- unmapped 字段不能伪造成 taxonomy tag，只能进入 `missingTags` 并标记 `unmapped_source_fields`。
- `legacyFitScore` 只能作为诊断参考；不得用它覆盖 `fitScore`、`recommendation` 或 `confidence`。
- 样本不足时必须输出 `insufficient_product_sample` 或 `insufficient_channel_sample`，推荐结果降级为 `observe`。
- 用户尚未提供正式算法权重或公式时，不得声明当前 `fitScore` 是正式产品算法结论。

## 替换点

用户/X 冻结正式 fit formula 后，只替换 `explainProductChannelFit` 内部的：

- `baselineFitScore`
- `fitConfidence`
- `recommendation`

外部 `ProductChannelFitInput`、`ProductChannelFit`、`FitExplanation` 字段保持稳定。正式替换必须补充时间切分回测，至少记录训练窗口、验证窗口、样本量、Top tag 命中、解释命中率、推荐分层效果和不可用样本比例。

## Contract 场景

`npm run contract-test` 覆盖：

- `matched`：共享标签可解释，输出 `priority_launch`。
- `mismatch`：输出 `conflictTags` 与 `missingTags`。
- `low_confidence`：输出 `lowConfidenceTags` 与 `low_confidence_tags`。
- `unmapped`：保留 approved `sourceField`，输出 `unmapped_source_fields`。
- `insufficient_sample`：输出样本不足风险，推荐降级为 `observe`。
