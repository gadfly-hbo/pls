# M-P1-F3 Account Fit Diagnostics

目的：把用户授权 BI 数据中的号货匹配度、维度差异和优化建议转换为 PLS 可解释诊断，供 A/V 域通过 PLS 对象消费，而不是直接展示 legacy dashboard 静态分数。

## 使用方式

入口保持为 `apps/model/src/account-fit.ts` 的 `diagnoseAccountFit(input)`。

输入来源：

- `productProfileTags` / `accountProfileTags`：PLS `tagId` 体系内的商品与账号画像标签。
- `productTopTags` / `accountBenchmarkTopTags`：A 域可从 SQLite latest/query 投影传入的 TOP1 标签，需携带 `sourceField`。
- `externalDimensionDiagnostics`：BI 中尚未映射进 PLS taxonomy 的维度，例如八大消费群体、人生阶段等，必须携带 approved `sourceField`。
- `adjustmentAdviceHints`：用户授权 BI 优化清单，可作为结构化 advice hint 输入，必须保留 tagId 或 `evidence.sourceField`。
- `legacyFitScore`：只作为 `diagnostic_reference_only` 参考，不参与替代正式 `fitScore`。

输出口径：

- `fitScore`：仍由 rule baseline 按 PLS mapped dimensions 计算；正式公式未冻结前不得包装成正式算法分。
- `fitConfidence`：由标签置信度、样本量、profile coverage 共同折减。
- `dimensionDiagnostics`：完整维度诊断列表，包含 `matched`、`partial`、`mismatch`、`unmapped`。
- `matchedDimensions` / `mismatchedDimensions`：兼容 P1-E2/A/V 既有读取路径，从 `dimensionDiagnostics` 投影而来。
- `positiveDrivers` / `negativeDrivers`：只引用可追溯 `tagId`。
- `adjustmentAdvice`：优先采用结构化 BI hint；缺失时由 mismatch diagnostics 生成，证据必须包含 `tagId` 或 approved `sourceField`。
- `risks`：把 algorithm pending、legacy reference、低置信、缺失维度、external unmapped 等风险结构化输出。
- `qualityFlags`：算法公式未冻结时始终包含 `algorithm_pending_user_formula`。

## 示例

```ts
diagnoseAccountFit({
  skuId: "109326100003",
  accountChannelId: "douyin_account_semir_official_flagship_baseline",
  productProfileTags,
  accountProfileTags,
  legacyFitScore: {
    score: 0.9796,
    source: "legacy_dashboard",
    usage: "diagnostic_reference_only",
  },
  externalDimensionDiagnostics: [
    {
      sourceField: "comparison_dimensions.八大消费群体",
      productTopLabel: "精致妈妈",
      accountTopLabel: "新锐白领",
      gapScore: 3.63,
    },
  ],
});
```

## 注意事项

- `legacyFitScore` 只能作为参考输入；输出会增加 `legacy_fit_score_reference_only`，不会移除 `algorithm_pending_user_formula`。
- external 维度没有 X-approved `tagId` 时不能伪造成画像标签，只能以 `sourceField` 追溯并标记 `unmapped_external_dimension`。
- 用户正式冻结号货匹配公式后，只替换 `diagnoseAccountFit` 内部评分、置信度和 advice 排序逻辑，外部 input/output interface 保持稳定。
- 当前 contract test 覆盖 matched、partial mismatch、high priority adjustment、low confidence、unmapped external dimension。
