# notes-model

## 0. 当前状态

最近更新：2026-07-04（同步 P3-DB 完成状态，无 model 实现改动）

进度：

- 本次 session 仅执行 model 域开场 SOP 与收尾复验，未改动 model 实现、contract、schema、API 或任务卡。
- 收尾复验：`npm run typecheck` 通过；`npm run contract-test` 首次受沙箱限制无法创建 `tsx` IPC pipe，提权复跑通过，输出 `ok: true` 且 `failures: []`。
- P3-DB（SQLite 重构与数据管理模块）已由 X/D/A/V 域完成并总控验收：`docs/wiki.html` 中 X-P3-DB-0 至 X-P3-DB-8 全部标记 done，`ws_demo` 已按新 schema 重建为空库并保留快照。本域在 P3 无新增 model 任务。
- 已完成 M-P1-A3 cutoff 时间切分回测实现：`npm run backtest:cutoff` / `npm run backtest:panel` 默认读取 `data/p1/multi-timewindow-demo/wide_table.jsonl`，训练早于 cutoff 的窗口并验证 cutoff 窗口。
- cutoff smoke 指标：`topKTagHit@5 = 0.8`，`segmentTop1Hit = 0.667`，`driverPrecision = 0.556`，`matchNDCG@3 = 0.754`；报告见 `docs/model-p1-a3-cutoff-backtest.md` 与 `docs/model-p1-d1-backtest-panel.md`。
- 已完成 M-P1-D1 指标面板：输出样本量、时间窗口、训练/验证切分、核心指标、`qualityFlags`，并按 `categoryLv2`、`channelType`、`sampleSizeBucket` 分层。
- 已完成 M-P1-D2 segment template 校准报告：当前 mock + 低 SKU 样本不足以支撑调权，保持 6 个 X-approved P0 segment template 权重不变。
- 已完成 M-P1-D3 token 治理：结构 token（如 `midi`、`dress`、`chiffon`、`wool`）不进入 `unmappedInputTokens` 且不映射为画像 tag；`premium` 进入 D/X review queue。
- 已完成 M-P1-D4 prediction feedback 样本回流设计草案，对齐 A 域 `/predictions/{predictionId}/feedback` 预留接口，不涉及 schema/API 落地。
- 已完成 M-P1-E2 号货匹配度算法 adapter：`apps/model/src/account-fit.ts` 定义稳定 `AccountFitAdapterInput` / `AccountFitDiagnostic`，rule baseline 输出 `fitScore`、`fitConfidence`、matched/mismatched dimensions、positive/negative drivers、`adjustmentAdvice` 和 `qualityFlags`。
- M-P1-E2 contract test 覆盖 matched、partial_mismatch、high_priority_adjustment、low_confidence 四类场景；当前 adapter 固定输出 `algorithm_pending_user_formula`，不得包装成正式号货匹配算法。
- 已完成 M-P1-F3 号货诊断指标产品化：`AccountFitDiagnostic` 兼容旧 matched/mismatched 字段并新增 `dimensionDiagnostics`、`risks`、`legacyFitScore`，支持 BI `externalDimensionDiagnostics`、`adjustmentAdviceHints` 和 approved `sourceField` 追溯。
- M-P1-F3 contract test 覆盖 matched、partial_mismatch、high_priority_adjustment、low_confidence、unmapped_external_dimension；`legacyFitScore` 固定为 `diagnostic_reference_only`，输出仍保留 `algorithm_pending_user_formula`。
- 已完成 M-P2-5 解释型人货匹配 contract：新增 `apps/model/src/product-channel-fit.ts`，冻结 `ProductChannelFit` / `FitExplanation`，输出 `matchedTags`、`conflictTags`、`missingTags`、`lowConfidenceTags`、`recommendation`、`riskFlags`、`confidence`。
- M-P2-5 已接入 `npm run contract-test`，覆盖 matched、mismatch、low_confidence、unmapped、insufficient_sample；文档见 `docs/model-p2-5-product-channel-fit-contract.md`。
- 已完成 M-P2-8 新品人群预测 baseline contract：新增 `apps/model/src/new-product-prediction.ts`，冻结 `PredictedProductProfile`，输出预测标签、置信度、相似历史商品、解释来源、风险和不可用边界。
- M-P2-8 已接入 `npm run contract-test`，覆盖 baseline_with_similar_sku、insufficient_input、no_similar_sample、low_confidence、similar_missing_identity、tag_unmapped；文档见 `docs/model-p2-8-new-product-prediction-contract.md`。
- M-P2-8 红线修复已完成：缺少商品身份时 `PredictedProductProfile.skuId` 与 `resolvedProductKey.value` 返回 `null`，相似商品缺少真实引用时不生成占位 ID，无商品身份时禁止桥接 `ProductChannelFit`。

下一步：

- 等待 D-P1-A5 完成真实样例本地脱敏聚合，并由 D 域基于真实聚合结果重做多 `timeWindow` 宽表；拿到 X 总控准入后重新运行 cutoff backtest。
- Segment 权重校准需等待更大真实聚合样本；达到至少 30 个 SKU、6 个连续 `timeWindow` 后再评估是否调权。
- `premium` keyword 是否映射到既有 `price.premium` 需 D/X review，不由 M 域单独决定。
- 等待用户提供正式号货匹配公式；公式接入前，M-P1-E2 输出不得包装成正式算法结论。
- M-P1-F3 已完成产品化 adapter 边界；后续 A-P1-F2 可从 SQLite latest/query 投影传入 BI comparison/advice 对象，V-P1-F5 消费 `dimensionDiagnostics` / `risks` / `adjustmentAdvice`。
- M-P2-5 的正式替换点固定在 `explainProductChannelFit` 内部评分、置信度和推荐逻辑；外部 `ProductChannelFitInput` / `ProductChannelFit` / `FitExplanation` contract 应保持稳定。
- M-P2-8 的正式替换点固定在 `predictNewProductProfile` 内部相似商品加权、tag 合并、置信度和 segment 生成逻辑；外部 `NewProductMasterPredictionInput` / `PredictedProductProfile` / `toProductChannelFitProfile` contract 应保持稳定。
- A-P2-9 消费 M-P2-8 时必须处理 `skuId = null` / `resolvedProductKey.value = null` 的不可用状态，不能自行生成占位 product ID。

阻塞：

- 无实现阻塞。D-P1-A2 mock 多窗口输入已存在，但当前结果只能作为 cutoff smoke，不能声明真实泛化能力。
- 真实样例下游准入当前仍为暂缓；正式泛化回测和正式号货匹配算法都依赖后续输入/公式。

已解决问题：

- P0 baseline 定为 LightGBM per-tag 多标签回归 + kNN 相似检索 + 规则三级兜底（可解释、样本稀疏可退化）。
- 多峰人群输出定为 Top 3 segment（基于固定模板 + 分布重合分数），P1 再切换到真实聚类。
- cutoff 回测必须用早于 cutoff 的训练窗口聚合 channel profile，不能用验证窗口构造匹配参照。
- 号货匹配 adapter 的正式算法替换点固定为 `diagnoseAccountFit` 内部评分逻辑；外部 input/output interface 需保持稳定。

开放问题：

- `segmentTemplate` 权重当前手工设定；M-P1-D2 已判定当前 mock 样本不足以调权，后续需真实聚合样本校准。
- `channel.*` 加成在实现阶段需要通过 smoke case 检查，避免与 `channelType` 硬对齐重复计权。
- P1 mock 多窗口数据已支持 cutoff smoke，但仍不能声明真实泛化能力。
- `midi` / `dress` 等结构 token 已由 M 域过滤出 `unmappedInputTokens`；D 域后续仍建议显式输出 `structuralTokens`。
- M-P1-E2 rule baseline 只用于 contract test；正式 fitScore、recommendation、adjustmentAdvice 需等待用户公式校准。
- M-P1-F3 仍不把 legacy dashboard `号货匹配度` 当作正式 `fitScore`；移除 `algorithm_pending_user_formula` 前必须由用户/X 冻结正式算法公式。
- M-P2-5 当前只冻结解释型输出 contract 和 baseline smoke，不假设用户尚未提供的正式算法权重；`legacyFitScore` 继续只能作为 `diagnostic_reference_only`。
- M-P2-8 当前只冻结新品预测输出 contract 和可解释 baseline；baseline 不是已训练模型，输出必须保留 `baseline_not_trained_model`。
- M-P2-8 的 `similarHistoricalProducts` 只允许透出输入中真实存在的 `productId`、`skuId`、`sourceProductKey`；缺失时字段省略，不能回退到 fake ID。

---

## 模型域原则

- 首版优先可解释，不追求复杂模型。
- 预测输出必须包含置信度和关键驱动标签。
- 回测必须采用时间切分，避免随机切分导致未来信息泄漏。
- 新品真实 DMP 回流后，预测误差必须能进入纠偏样本。
- `mappedProductTags` 由 D 域预计算，M 域校验和缺失回填。
- Segment 模板、关键词受控词表和匹配维度权重变更必须回流 X 总控。

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
