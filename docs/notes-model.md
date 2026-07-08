# notes-model

## 0. 当前状态

最近更新：2026-07-08（Q2 监督画像模型 server import 契约冻结）

进度：

- 新增 `apps/model/src/q2-portrait-data-prep.ts`：读取 `/Users/huangbo/Downloads/Q2有画像款.xlsx` 与 `/Users/huangbo/Downloads/单款画像/*.csv`，对齐生成标准样本包到 `data/local/single-product-portrait-q2-73sample/`，73 个样本全部匹配。
- 新增 `apps/model/src/single-product-portrait-supervised.ts`：基于 `版型 / 面料 / FAB` 三字段训练分维度 Ridge 回归模型；特征工程包括版型 one-hot、面料/FAB 关键词字典（面料成分、风格、功能、场景）。
- 第一轮目标维度已覆盖：`预测性别`、`预测年龄段`、`预测消费能力`、`城市等级`、`八大消费群体`、`预测人生阶段`。
- 缺失版型按约定填为 `X型`；closed dimension 在 top-N 切片后重新归一化，保证剩余标签 share 和为 1。
- 新增 LOO 验证框架：73 折 leave-one-out，输出 `top1OverlapMean`、`top3OverlapMean`、`closedDimensionMassErrorMean`、per-dimension 指标。
- 修改 `apps/model/src/single-product-portrait.ts`：放宽 `PlatformPortraitRow.source` 和 `SingleProductPortraitPrediction.modelVersion/modelPath` 类型；新增风险标记 `small_sample_supervised_model`、`no_temporal_validation`。
- 新增 CLI 命令与 npm scripts：`single-product-portrait-train`、`single-product-portrait-eval`、`single-product-portrait-predict-supervised`、`single-product-portrait-predict-batch`。
- 新增批量预测入口：读取含 `款号 / 版型 / 面料 / FAB` 的 Excel，输出每款的 6 维度画像。
- 新增测试：`single-product-portrait-supervised-contract-test.ts`、`single-product-portrait-supervised-smoke.ts`。
- 冻结 server import 契约：A 域可从 `apps/model/src/single-product-portrait-supervised.ts` 导入 `buildSingleProductPortraitModelMetadata()`、`predictSingleProductPortraitFromCleanInput()`、`SingleProductPortraitModelUnavailableError`、`CleanSingleProductPortraitInput`、`SingleProductPortraitModelMetadata`。
- `model.json` 默认路径由模型模块解析到 `data/local/single-product-portrait-q2-73sample/model.json`，服务端可用 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` 覆盖；metadata 对缺失/不可读模型返回 `modelAvailable: false` + `model_not_available`，预测函数抛 `SingleProductPortraitModelUnavailableError` 供 A 域映射。
- metadata 字段来源：`fitTypes` 来自训练样本写入的模型对象，`sampleCount/trainedAt/modelVersion` 来自模型文件，`requiredColumns/maxBatchRows/maxFileBytes/riskFlags` 来自模型模块常量，`metricsSummary` 来自当前 Q2 73 样本 LOO 验证摘要。

本次验证：

- `apps/model npm run typecheck` 通过。
- `npm run single-product-portrait-supervised-contract-test` 通过，`ok: true` / `failures: []`。
- `npm run single-product-portrait-supervised-smoke` 通过，LOO 指标与预测输出结构符合预期。
- `npm run single-product-portrait-train` 通过，生成 `data/local/single-product-portrait-q2-73sample/model.json`。
- `npm run single-product-portrait-eval` 通过，当前 LOO top1 overlap：性别 87.7%、人生阶段 80.8%、年龄段 68.5%、消费能力 63.0%、城市等级 39.7%、消费群体 31.5%。
- 回归验证：`npm run contract-test`、`npm run single-product-portrait-contract-test`、`npm run single-product-portrait-calibration-contract-test`、`npm run validate-tags`、`npm run account-fit-contract-test` 均通过。
- Q1 新品批量预测验证：`npm run single-product-portrait-predict-batch -- --input /Users/huangbo/Downloads/Q1商品信息.xlsx --output /tmp/q1_portrait_predictions.json --topN 3` 成功输出 95 款预测结果。

阻塞/开放：

- 当前为 73 样本 LOO 验证，没有时间切分 holdout，不声明泛化能力。
- 平台大盘 TGI 基准仍缺失，所有 `tgi` 输出为 `null`。
- 高基数维度（城市等级、八大消费群体）在 73 样本下仍不稳定，需要更多样本或引入 hierarchy / regularization 调优。
- 面料/FAB 关键词字典为最小集合，后续需根据业务反馈扩展。

### 上一轮状态（M-P5-PORTRAIT-7）

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

## M-P6-CHANNEL-2 收尾记录

- 决策：`audienceFit` 采用维度加权 Jaccard，`productFit` 采用商品 DNA / 标签与渠道 `ProductFitProfile` 字段匹配的加权平均。
- 决策：第一期固定 `baseScore = 0.7 * audienceFit + 0.3 * productFit`；缺少 `ProductFitProfile` 时降级为 `audienceFit` 并输出 `missing_product_fit_profile`。
- 决策：活动/场景只作为 `baseScore` 的权重乘数调节，不生成独立 `eventScore` / `scenarioScore`；`contextAdjustedScore = baseScore * clamp(combinedAdjustment, 0.9, 1.3)`。
- 决策：`contextDrivers` 只解释生效规则对排序的影响，未命中商品信号的规则标记 `active: false` 但不影响分数。
- 踩坑：若把活动/场景权重直接加到维度权重里重新计算 `audienceFit`，会在渠道缺少该维度时反而降低分数；因此改为在 `baseScore` 上乘以乘数，只对商品-场景对齐部分加权。
- 风险：当前活动/场景规则映射为最小集合，传统节日、平台大促、新品首发、会员复购等规则需用户 / X 总控确认后固化；未确认的规则不应直接用于生产排序。

## Q2 真实样本监督画像模型收尾记录

- 决策：采用方案 A（分维度可解释 Ridge 回归），只用 `版型 / 面料 / FAB` 三字段，缺失版型填 `X型`。
- 决策：第一轮目标维度限定为 `预测性别`、`预测年龄段`、`预测消费能力`、`城市等级`、`八大消费群体`、`预测人生阶段`。
- 决策：保留 `baseline_not_trained_model` 风险标记，因为缺少时间切分验证；同时增加 `small_sample_supervised_model` 和 `no_temporal_validation`。
- 决策：closed dimension 在 top-N 输出后重新归一化，避免切片导致 share 和小于 1。
- 决策：批量预测入口只认 `款号 / 版型 / 面料 / FAB` 四列，缺失版型自动填 `X型`，不依赖其他字段。
- 踩坑：`predictDimension` 先全局归一化再切片，contract test 发现 `预测年龄段`、`城市等级`、`八大消费群体` 的 closed share 和不等于 1；修复后在 `predictSupervisedPortrait` 中对 closed dimension 切片结果二次归一化。
- 踩坑：测试文件类型错误（`assert` 接收 `string | undefined`、`fmtPct` 接收 `number | null`）导致 `typecheck` 失败；修复后 `typecheck` 通过。
- 踩坑：LOO aggregate `massError` 最初误把所有 closed dimension 加总到一个维度上，导致 per-dimension mass error 失真；修复为只累加当前维度的 predicted rows。
- 风险：73 样本 LOO 不能替代时间切分 holdout，不能向业务宣称为最终泛化精度。
- 风险：城市等级、八大消费群体高基数维度 top1 仅 39.7% / 31.5%，样本量增加或引入 hierarchy 后才可能稳定。
- 风险：面料/FAB 关键词字典为最小集合，某些特殊面料或风格词可能未命中，导致特征稀疏。

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
