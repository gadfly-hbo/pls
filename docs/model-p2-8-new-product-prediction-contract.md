# M-P2-8 New Product Prediction Contract

目的：基于 D-P2-7 新品主数据预测输入模板，冻结 `PredictedProductProfile` 输出 contract 和可解释 baseline，让新品画像结果能进入 P2 `ProductChannelFit` 人货匹配链路。

## 使用方式

入口：`apps/model/src/new-product-prediction.ts` 的 `predictNewProductProfile(input)`。

输入只允许来自上新前可得字段：

- `productMaster.identity`：商品主数据身份字段。
- `productMaster.category`：类目字段。
- `productMaster.priceAndSeason`：价格带、季节等可选字段。
- `productMaster.styleAndScenario.mappedProductTags`：D 域映射到现有 taxonomy 的商品标签。
- `productMaster.styleAndScenario.unmappedProductFields`：无法映射的源字段和值，保留 reason。
- `productMaster.similarProducts.similarProducts`：相似历史商品引用，可带 `profileTags`、`similarityScore`、`confidence` 和 `source`。
- `productMaster.lineage` 与 `productMaster.quality`：来源版本、质量标记和覆盖率。

不得要求 post-launch buyer profile、销售标签或渠道反馈，除非任务明确是 backtest。

## 输出对象

```ts
interface PredictedProductProfile {
  skuId: string | null;
  resolvedProductKey: {
    productId?: string;
    productVariantId?: string;
    sourceProductKey?: string;
    value: string | null;
  };
  modelVersion: string;
  contractVersion: string;
  modelPath: "new_product_explainable_baseline";
  source: "new_product_prediction_baseline";
  sourceType: "derived";
  predictedProfileTags: ProfileTagScore[];
  confidence: number;
  topSegments: SegmentDraft[];
  similarHistoricalProducts: Array<{
    productId?: string;
    skuId?: string;
    sourceProductKey?: string;
    similarityScore: number;
    confidence: number;
    source?: string;
  }>;
  explanationSources: NewProductPredictionSource[];
  riskFlags: NewProductPredictionRisk[];
  unavailableReasons: string[];
  qualityFlags: string[];
  lineage: ProductMasterLineage;
}
```

`predictedProfileTags` 必须使用 `docs/profile-taxonomy-v0.md` 中已有 `tagId`。未批准或无法映射的字段不能伪造成 tag，只能进入 `riskFlags` / `unavailableReasons` / `explanationSources`。

缺少商品身份时，`skuId` 与 `resolvedProductKey.value` 必须为 `null`，不得生成占位 SKU、SPU、productId 或 source key。相似历史商品也只保留输入中真实存在的 `productId`、`skuId` 或 `sourceProductKey`；缺失时字段保持省略。

## Baseline 口径

当前 baseline 不是已训练模型：

- 优先使用 `mappedProductTags`。
- 若存在相似历史商品，则按 `similarityScore * confidence` 加权汇总其 `profileTags`。
- 同一 tag 同时来自商品映射和相似商品时，保留更高 score 与 confidence。
- `confidence` 由预测 tag 置信度、字段覆盖率、mapping 覆盖率、相似商品置信度和阻塞问题折减。

输出必须保留：

- `riskFlags: ["baseline_not_trained_model", ...]`
- `qualityFlags: ["baseline_not_trained_model", ...]`

## 进入人货匹配链路

`toProductChannelFitProfile(profile)` 将 `PredictedProductProfile` 投影为 `ProductProfileDraft` 兼容形状，供 `ProductChannelFitInput.productProfile` 消费。

如果 `PredictedProductProfile.skuId` 为 `null`，该函数必须抛出错误，禁止无可追溯商品身份的新品预测结果进入人货匹配链路。

前端可直接展示：

- `predictedProfileTags`
- `confidence`
- `topSegments`
- `similarHistoricalProducts`
- `explanationSources`
- `riskFlags`
- `unavailableReasons`

## 不可用边界

- 缺少商品身份：输出 `missing_required_identity`。
- 缺少类目：输出 `missing_required_category`。
- 来源批次或版本缺失：输出 `source_lineage_incomplete`。
- 没有相似历史商品：输出 `similar_product_reference_missing` 与 `no_similar_sample`，但仍可基于 `mappedProductTags` 给低阶 baseline。
- 无可追溯 taxonomy tag：输出 `insufficient_product_master_fields`，并在 `unavailableReasons` 说明不能生成画像。
- 低 mapping 或相似商品置信度：输出 `low_mapping_confidence` / `low_similar_product_confidence`。
- 存在未映射字段：输出 `tag_unmapped`，不得新增 tagId。

## 替换点

后续真实模型冻结后，只替换 `predictNewProductProfile` 内部的：

- `weightedSimilarProductTags`
- `mergePredictedTags`
- `predictionConfidence`
- `buildBaselineSegments`

外部 `NewProductMasterPredictionInput`、`PredictedProductProfile` 和 `toProductChannelFitProfile` contract 保持稳定。正式替换必须补充时间切分回测，记录训练窗口、验证窗口、样本量、Top tag 命中率、segmentTop1Hit、解释来源命中率、不可用样本比例和质量分层。

## Contract 场景

`npm run contract-test` 覆盖：

- `baseline_with_similar_sku`：商品映射 tag + 相似历史商品 tag 共同生成预测，并能桥接 `ProductChannelFit`。
- `insufficient_input`：缺身份、类目、lineage 时输出风险和不可用原因。
- `no_similar_sample`：无相似样本时仍可用 mapped tags，但输出风险。
- `low_confidence`：低 mapping / similar confidence 进入风险。
- `tag_unmapped`：未批准 tagId 被过滤，未映射源字段进入风险。
