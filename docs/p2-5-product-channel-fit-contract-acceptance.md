# M-P2-5 解释型人货匹配 Contract 验收报告

## 目的

复核 M-P2-5 是否冻结 P2 解释型人货匹配输出 contract，为正式 fit formula 替换和 V-P2-6 前端解释面板打底。

## 结论

结论：通过。

M-P2-5 已新增 `ProductChannelFit` / `FitExplanation` contract 和 `explainProductChannelFit()`，输出 `matchedTags`、`conflictTags`、`missingTags`、`lowConfidenceTags`、`recommendation`、`riskFlags`、`confidence`，并把 `legacyFitScore` 限定为 `diagnostic_reference_only` 诊断参考。

## 验收要点

- `ProductChannelFitInput` 以 `productProfile` 和 entity-first `channelProfile` 为输入边界，保留 `legacyFitScore` 与 `unmappedSourceFields`。
- `FitExplanation` 将匹配、冲突、缺失、低置信标签拆成稳定字段，前端可直接据此实现解释面板。
- 解释项必须可追溯到 `tagId` 或 `sourceField`，unmapped 字段不伪造成 taxonomy tag。
- 正式 fit formula 未提供前，输出固定保留 `algorithm_pending_user_formula`，当前 `fitScore` 仅为 contract baseline。
- 正式算法替换点限定在 `explainProductChannelFit()` 内部评分、置信度和推荐逻辑，外部 input/output contract 保持稳定。

## 使用方式

A/V 后续任务可从 `apps/model/src/product-channel-fit.ts` 引入 `explainProductChannelFit(input)`，以 `ProductChannelFit.explanation` 渲染解释面板，以 `riskFlags` 和 `qualityFlags` 展示算法未冻结、低置信、unmapped、样本不足等风险。

## 示例

- matched：共享标签进入 `matchedTags`，高分高置信可输出 `priority_launch`。
- mismatch：商品侧独有标签进入 `conflictTags`，渠道侧独有标签进入 `missingTags`。
- unmapped：保留用户授权源字段的 `sourceField`，进入 `missingTags` 并标记 `unmapped_source_fields`。
- insufficient sample：输出样本不足风险，推荐结果降级为 `observe`。

## 验证

- `apps/model npm run typecheck` 通过。
- `apps/model npm run contract-test` 通过，结果 `ok: true`，覆盖 `matched`、`mismatch`、`low_confidence`、`unmapped`、`insufficient_sample`。
- `contract-test` 在默认沙箱下因 `tsx` 创建系统临时目录 IPC pipe 失败，按权限规则非沙箱复跑后通过。

## 注意事项

- 用户尚未提供正式 fit formula，当前 `fitScore`、`confidence`、`recommendation` 不得包装成正式产品算法结论。
- `legacyFitScore` 只能作为诊断参考，不参与覆盖 `fitScore`、`confidence` 或 `recommendation`。
- 正式公式冻结时必须补充时间切分回测，并记录训练窗口、验证窗口、样本量、Top tag 命中、解释命中率、推荐分层效果和不可用样本比例。
