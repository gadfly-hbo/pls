# notes-model

## 0. 当前状态

最近更新：2026-07-05（M-P5-PORTRAIT-7 规则权重校准框架总控验收通过）

进度：

- `docs/wiki.html` 当前 M-P5-PORTRAIT-7 为 `status: done`，changelog `v0.62` 为 current。
- 已完成 M-P5-PORTRAIT-7：新增 `apps/model/src/single-product-portrait-weights.ts` 和 `apps/model/src/single-product-portrait-calibration.ts`，将单品画像 rule baseline 的性别、年龄、消费能力、城市等级、消费群体、人生阶段、兴趣映射、IP/功能、fit->age、锚点弱先验等标量权重配置化。
- `single-product-portrait.ts` 已支持通过 `SingleProductPortraitInput.options.weights` 注入权重，默认权重保持原 baseline 行为；未生效的 `malePrior` 已移除，fit->age 规则通过 `fitToAgeRules` 配置。
- 校准框架消费 D-P5-PORTRAIT-3 标准样本包：`source_manifest.json`、`product_attributes.jsonl`、`platform_portrait.csv`、`quality_report.json`，通过 `skuId + sourceProductKey` join 商品属性和平台画像。
- 留一验证框架已实现：每折排除 held-out 样本，用其余样本构造 aggregate anchor，再预测 held-out 样本并计算指标；contract test 显式验证 held-out key 不进入 anchor source keys。
- 输出指标：`anchorTopLabelOverlap@3`、`dimensionCoverageRate`、`closedDimensionMassError`、`evidenceCoverageRate`、`bridgeCoverageRate`。
- 样本不足保护已落地：有效样本 < 5 时返回 `status: "not_enough_labeled_samples"`，不生成 `folds` / `aggregateMetrics`；mock sample 显式带 `mock_sample_only` 风险标记。
- 新增合成 5 样本 fixture：`data/demo/single-product-portrait-calibration-synthetic-5sample/`，仅用于框架结构验证，不作为真实校准证据。
- 新增 npm scripts：`single-product-portrait-calibrate`、`single-product-portrait-calibration-contract-test`、`single-product-portrait-calibration-smoke`。

本次收尾验证：

- `apps/model npm run typecheck` 通过。
- `apps/model npm run single-product-portrait-calibration-contract-test` 通过，输出 `ok: true` / `failures: []`。
- `apps/model npm run single-product-portrait-calibration-smoke` 通过；mock 包返回 `not_enough_labeled_samples`，synthetic 5-fold 输出 `anchorTopLabelOverlap@3 = 74.3%`、`dimensionCoverageRate = 100.0%`、`closedDimensionMassError = 0.0033`、`evidenceCoverageRate = 100.0%`、`bridgeCoverageRate = 54.6%`。
- 本轮复核前还验证过：`contract-test`、`single-product-portrait-contract-test`、`validate-tags`、`account-fit-contract-test` 均通过。

下一步：

- P5-PORTRAIT 真实小样本校准仍需至少 5 款带真实平台画像的商品样本，并按 `data/templates/single-product-portrait-sample/` 标准样本包进入。
- 平台大盘 TGI 基准仍缺失；没有基准时 `tgi = null` 只能展示为暂无基准，不得当作 0。
- 规则权重、版型/面料/FAB 映射细节和任何自动调权策略仍需用户 / X 总控拍板后固化。
- 当前框架只做 LOO 评估和人工可注入权重验证，不声明已训练模型、自动调权结果或泛化精度。

阻塞：

- M-P5-PORTRAIT-7 无实现阻塞。
- P5-PORTRAIT 真实校准阻塞于真实样本数量和平台大盘 TGI 基准。

开放问题：

- synthetic fixture 仅证明框架结构可跑，不能作为真实业务校准证据。
- 后续若进入 grid-search / 自动调权，必须新增独立任务卡和防过拟合验证口径，不能复用本卡结论宣称权重已校准。

---

## 模型域原则

- 首版优先可解释，不追求复杂模型。
- 预测输出必须包含置信度和关键驱动标签。
- 回测必须采用时间切分，避免随机切分导致未来信息泄漏。
- 新品真实 DMP 回流后，预测误差必须能进入纠偏样本。
- `mappedProductTags` 由 D 域预计算，M 域校验和缺失回填。
- Segment 模板、关键词受控词表和匹配维度权重变更必须回流 X 总控。

## M-P5-PORTRAIT-7 收尾记录

- 决策：M-P5-PORTRAIT-7 只建立规则权重配置和 LOO 评估框架，不做自动调权搜索，不训练神经网络，不宣称真实校准精度。
- 决策：`malePrior` 不作为独立配置保留；性别先验只暴露 `femalePrior`、`neutralPrior` 和 evidence weight，男款女性占比由 `1 - femalePrior` 得出，避免无效配置字段。
- 决策：fit->age 规则纳入 `fitToAgeRules`，包括修身/紧身 -> `24-30`、宽松/阔腿 -> `20-23`，`score` 与 `evidenceWeight` 均可注入。
- 踩坑：仅检查 `anchorSkuId` 常量不能证明 LOO 没有使用自身样本；contract test 已改为通过 `getAnchorSourceKeys(samples, heldOut.skuId)` 显式断言 held-out `skuId + sourceProductKey` 不进入 aggregate anchor。
- 踩坑：权重配置字段必须有可观测测试，否则容易出现“字段存在但不生效”；contract test 已加入放大 `fitToAgeRules.score` 后 `24-30` share 增加的断言。
- 风险：synthetic 5-sample fixture 只用于验证框架结构和 contract，不是业务校准证据；真实权重拍板仍需至少 5 款真实画像商品和用户 / X 总控确认。

## M-P0-C3 收尾记录

- 词表决策：`midi` / `dress` 不回流画像词表，分别由 `lengthType` / `categoryLv2` 结构字段承载。
- 时间切分准备：正式回测必须等待 D 域提供多 `timeWindow` 宽表；当前单窗口 demo 只能保留 `demo_only_leave_one_sku_out`。
- Adapter 接缝：A 域可用 `npm run contract-test` 校验 M 输出字段，但持久化 ID、workspace、recommendation、risks 仍由 A 域补齐。
- 风险：若后续 `titleTokens` 中结构 token 持续污染 `unmappedInputTokens`，应由 D 域在 token 生成阶段过滤或显式输出 `structuralTokens`。

## M-P2-8 沉淀

- 新品预测输入边界遵守 D-P2-7：只使用上新前可得的 `ProductMaster` 字段、`mappedProductTags`、`similarProducts`、图文摘要、lineage 和 quality，不要求 post-launch buyer profile、销售标签或渠道反馈。
- `PredictedProductProfile.skuId` 是可空字段；`resolvedProductKey` 只反映真实输入中的 `productVariantId`、`productId` 或 `sourceProductKey`。缺失身份时返回 `null` 并保留 `missing_required_identity`，不得生成 `unresolved_*` 等占位 ID。
- `toProductChannelFitProfile()` 在缺少可追溯商品身份时显式抛错，禁止不可追溯新品预测结果进入人货匹配链路。
- `similarHistoricalProducts` 只保留真实输入中存在的相似商品身份字段；如果相似商品只有 profile tags 和来源，没有 ID 字段，则不补造 `productId` / `skuId` / `sourceProductKey`。
- `npm run contract-test` 覆盖 `insufficient_input` 和 `similar_missing_identity` 两个红线场景，防止后续回归到 fake ID。
