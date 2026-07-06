# notes-data

## 0. 当前状态

最近更新：2026-07-06（D-P6-CHANNEL-1 渠道画像对象库导入模板总控审核通过）

进度：

- D-P6-CHANNEL-1 已完成并经总控审核通过：新增 `data/templates/channel-profile-object-library/`，冻结渠道画像 2.0 对象库基础模板、高级对象包、字段字典、质量报告、失败样例和 validator。
- D-P6 样例包均标记为 `mock_sample`，只作为 contract 示例；未新增 taxonomy tagId，未连接生产平台或 SQL，未导入主 workspace，未实现 DB schema / API / UI。
- 基础模板覆盖 `platform`、`trade_area`、`store`、`account`、`marketing_event`、`business_scenario`；高级包覆盖对象、父子层级、活动/场景绑定、`AudienceProfile`、`ProductFitProfile` 和质量报告。
- 当前 `ws_demo` 仍为空业务库；依赖历史 SKU、渠道、抖音 BI 或 demo 数据的旧业务 smoke / 页面流程需要先通过受控导入重放数据。

下一步：

- 建议执行 `/cdi-wrapup` 将 D-P6-CHANNEL-1 回流给 X 总控，确认 wiki 状态、changelog 和后续 A/M/V 任务衔接。
- A 域后续需要实现 `channel-profile-object-library` import adapter：dry-run 质量检查、confirm import、workspace 隔离、admin token、Idempotency-Key、confirmText、audit，以及 ChannelEntity / MarketingEvent / BusinessScenario / Binding / AudienceProfile / ProductFitProfile 的持久化或 staging contract。
- M/V 后续消费时必须先读取 `docs/channel-profile-2.0-plan.md` 和本模板 README，活动 / 场景只能绑定或调权，不能当作渠道实体或独立渠道分数。
- 如需演示或业务 smoke，需要先通过数据管理模块或 Admin API 重新导入数据；当前 `ws_demo` 是空业务库。

阻塞：

- 当前没有数据域实现阻塞。
- D-P6 落库、latest view、对象库 API、统一导入入口仍由 A/X 后续任务决定；D 域本轮只冻结包契约。

开放问题：

- D-P6 的物理 schema、API 路由、latest view、import adapter、对象轻量编辑和真实 workspace smoke 仍需 X/A 拍板与实现。
- 重复对象第一期只做 `possible_duplicate` 风险提示和人工状态，不自动合并；后续治理工作流是否做仍未决定。
- 三方平台 HTML/CSV/XLSX 画像解析器、业务 SQL 导出解析器尚未实现；当前 D-P6 sample package 仍为 `mock_sample`。
- P5 单品画像进入真实小样本规则校准仍缺至少 5 款真实有效商品画像样本。

验证：

- D-P6-CHANNEL-1 收尾复验（2026-07-06）：`node data/templates/channel-profile-object-library/scripts/validate-channel-profile-object-library-package.mjs data/templates/channel-profile-object-library/sample_package` 通过，`ok: true`，`failures: []`。
- 本轮未运行 server/web typecheck、build 或 smoke，因为未改应用代码、DB schema、API 路由或前端代码。

---

## 数据域原则

- 用户授权数据默认全量放行；先结构化、映射、质量校验，再进入模型、API 和前端。
- 宽表必须保留来源、时间窗口、平台、样本量。
- 所有标签映射都要可追溯，不能只留黑盒结果。
- P0 主监督标签使用 `buyerProfileTags`；浏览和加购画像有聚合数据就保留，不作为训练宽表准入硬门槛。
- 真实金额、销量、排名、互动等业务字段可按产品需要保留；如建模需要再派生 index、band 或 rankBucket。

## D-P0-1 沉淀

- 宽表主粒度定为 `skuId + channelId + timeWindow`；全渠道汇总可额外使用 `channelId = "all_channels"`。
- DMP、用户列表、设备列表、订单列表或人群包成员若由用户确认导入 PLS，默认放行；是否聚合取决于产品对象和模型需求。
- 所有真实聚合画像必须保留 `source`、`timeWindow`、`sampleSize`，并映射到 `docs/profile-taxonomy-v0.md` 的 `tagId`。
- 低置信度或无法解释的 DMP 字段进入 `unmappedTags`，不得强行映射。
- 当前最大风险是缺少平台 DMP 字段样例和历史 SKU 字段样例，后续接入样例后需要补充具体 mapping rule。

## D-P0-B1 沉淀

- demo 数据目录固定为 `data/demo/`。
- 已产出 3 个 SKU、4 个渠道、12 个 SKU × channel 宽表组合。
- 已提供 `dmp_aggregate.csv` 与 `dmp_aggregate.jsonl` 两种导入样例。
- 已提供 `batch_quality_report.json` 和 `expected_scenarios.md`，覆盖 `priority_launch`、`test_launch`、`observe`、`avoid` 四类场景。
- 既有 demo 数据仍为 mock aggregate；新接入数据按用户授权口径直接使用。

## D-P0-C4 沉淀

- 真实样例 raw staging 可继续使用本地路径 `data/local/raw_staging/<batchId>/` 作为导入暂存；是否进入 docs、API 响应或 LLM 上下文按用户授权和产品需要决定。
- 模板目录为 `data/templates/real-sample-ingestion/`，包含 aggregate profile、unmapped fields、mapping rules、quality report、redline scan report 和校验脚本。
- 聚合输出必须先通过 `node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs <aggregateOutputDir>`，再进入 M/A/V 消费链路。
- redline scan 配置已改为隐私红线关闭；模板中的 scan report 仅作为历史兼容和质量摘要，不再拦截字段名或值形态。

## D-P1-A1 / D-P1-A2 沉淀

- D-P1-A1 已按 no-input preflight 归档；真实样例试跑改由 D-P1-A5 承接。
- D-P1-A2 当前输出为 `data/p1/multi-timewindow-demo/`，来源是 `data/demo/wide_table.jsonl` 的 mock aggregate 机械扩展。
- D-P1-A2 宽表覆盖 3 个闭合连续窗口：`2026-03-01/2026-03-31`、`2026-04-01/2026-04-30`、`2026-05-01/2026-05-31`。
- D-P1-A2 校验命令：`node data/scripts/validate-p1-multi-timewindow-demo.mjs data/p1/multi-timewindow-demo`。
- 真实样例到位后，需要重新执行 D-P1-A1，再基于真实聚合结果重做 D-P1-A2；当前 mock cutoff smoke 数据不能替代正式 P1 样本。

## D-P1-E1 沉淀

- 模板目录固定为 `data/templates/douyin-account-product-mapping/`。
- 字段梳理覆盖 `product_basic`、`product_performance`、`account_profile`、`fit_comparison`、`adjustment_advice` 五类 source area。
- mapping rules 覆盖年龄、性别、消费能力、人生阶段、城市等级、兴趣行为、触点偏好等主要维度，所有 `mappedTagId` 必须来自 `docs/profile-taxonomy-v0.md`。
- 销售额、销量、活跃度、legacy fit score 可保留原始业务字段和值；如模型需要可额外派生 index、rate、band 或 rank bucket。
- 设备信息、八大消费群体和不可解释平台兴趣字段默认不映射，进入 `unmapped_fields.template.csv` 并保留 reason。
- 校验命令：`node data/templates/douyin-account-product-mapping/scripts/validate-douyin-mapping-template.mjs`。

## D-P1-F1 沉淀

- 数据包目录固定为 `data/p1/douyin-bi/`，8 个 JSONL 数据对象 + 2 个 CSV（`field_dictionary.csv`、`unmapped_fields.csv`）+ 3 个 JSON manifest（`quality_report.json`、`source_manifest.json`、`sqlite_import_manifest.json`）+ README。
- 数据源为用户授权 dashboard 快照：`/Users/huangbo/Downloads/douyin_report_dashboard/data.js`；快照 `sha256`、`bytes`、`mappingTemplate` 指向记录在 `source_manifest.json`。
- 行数：`accounts=13`、`account_benchmark_tags=26`、`account_reports=12`、`products=73`、`product_account_fits=73`、`comparison_dimensions=365`、`adjustment_advice=105`、`summary_metrics=25`，合计 692 行。`summary_metrics` 已过滤 dashboard `insightsSheet4` 中 `metricName=null` 的 4 条分节留白行。
- 每条记录都带 `sourceBatchId`、`dataVersion`、`generatedAt`、`timeWindow`、`upsertKey`；`upsertKey.hash` 为 `SHA1(fields.join(",") + "::" + row values.join("|"))` 前 16 位，行级唯一，可支撑 A-P1-F2 幂等 upsert。
- upsert key 设计与 manifest 同步：`accounts` 用 `channelId+sourceBatchId+dataVersion`；`products` 用 `skuId+sourceBatchId+dataVersion`；`product_account_fits` 用 `skuId+accountChannelId+sourceBatchId+dataVersion`；`comparison_dimensions` 用 `fitId+dimension+sourceBatchId+dataVersion`；`adjustment_advice` 用 `skuId+accountChannelId+dimension+orderIndex+sourceBatchId+dataVersion`；`summary_metrics` 用 `metricName+orderIndex+sourceBatchId+dataVersion`（business key 也是 `metricName+orderIndex`）。
- 页面级模块与 PLS 数据对象一一对应：商品人群罗盘=`products`，账号画像基准=`accounts`+`account_benchmark_tags`+`account_reports`，款账号对比=`product_account_fits`+`comparison_dimensions`，优化清单=`adjustment_advice`+`summary_metrics`。
- 只有基线账号（`森马官方旗舰店(基准)`, `channelId = douyin_account_semir_official_flagship_baseline`）当前带 benchmark tags；其余 12 个抖音账号来自 `multiAccountInsightsRawHTML`，作为独立 `ChannelProfile` 落地并附月度报告纯文本摘要。
- `legacyFitScore` 保留但标记 `usage = diagnostic_reference_only`；`product_account_fits` 与 `adjustment_advice` 携带 `qualityFlags: ["algorithm_pending_user_formula"]`，等待 M-P1-F3 正式号货匹配度算法。
- 非 taxonomy 维度（八大消费群体、预测人生阶段、兴趣行为长尾、设备信息、地域城市等）写入 `unmapped_fields.csv` 或 `products.unmappedProfileFields`，不强行映射为 PLS `tagId`。
- 生成脚本 `data/scripts/generate-p1-douyin-bi.mjs`：可传 `--source`、`--batchId`、`--dataVersion`、`--generatedAt`、`--timeWindow`；输出汇总 JSON 到 stdout。
- 校验脚本 `data/scripts/validate-p1-douyin-bi.mjs`：结构、meta、`upsertKey.hash` 行级唯一性、manifest 声明的 `businessKey / upsertKey` 组合值唯一性、引用完整性、tagId 白名单、manifest ↔ 数据对象计数、`tables.file` 存在性；非零错误退出。
- 校验命令：`node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi`。

## D-P2-2 沉淀

- 产出文档固定为 `docs/p2-2-product-channel-schema.md`，总控验收报告为 `docs/p2-2-product-channel-schema-acceptance.md`。
- `ProductMaster` 推荐粒度：`workspaceId + productId + productVariantId + dataVersion`；字段组覆盖身份、类目、价格/季节、卖点、材质、风格、场景、图文资产、相似商品、原始业务字段、lineage 和 upsert key。
- `ChannelEntity` 推荐粒度：`workspaceId + entityType + sourceEntityKey + dataVersion`；`entityType` 覆盖 `platform`、`shop`、`account`、`livestream_room`、`content_account`、`province`、`city`、`trade_area`、`store`，支持线上店铺/账号和线下省市商圈门店。
- `FieldMapping` 模板字段覆盖 `sourceObject/sourceField/sourceValuePattern -> targetObject/targetField`、`mappingRule`、`mappedTagId`、`confidence`、`requiredFor`、`unmappedReason`、`recommendedHandling`、owner、version。
- `DataQualityReport` 模板覆盖对象行数、字段覆盖率、mapping 覆盖率、平均置信度、blocking issues、warnings、quality flags 和 `admissionPolicy=user_authorized_full_passthrough`。
- 输入边界：`ProductProfile` 使用历史/在售商品真实画像和表现；`PredictedProductProfile` 只用上新前可得的 `ProductMaster` 字段、相似商品和图文特征；`ChannelProfile` 以 `ChannelEntity` 为主键，平台只作为维度。
- taxonomy 边界：不新增 `tagId`；所有 `ProfileTagScore.tagId` 必须来自 `docs/profile-taxonomy-v0.md`，不能映射的源字段进入 `unmappedProductFields` 或 `unmappedProfileFields`。
- 留给 X 的评审点：`ProductMaster` / `ChannelEntity` 是否成为物理 SQLite 顶层表，线下区域层级是否需要统一地理字典，`priceBand` / `seasonBand` / `platformType` 是否全局冻结。
- 校验方式：本轮执行文档结构与显式 `tagId` 引用检查，确认 ProductMaster / ChannelEntity / FieldMapping / DataQualityReport 四段存在，且显式 tag 引用均在 taxonomy 内。

## D-P2-7 沉淀

- 模板目录固定为 `data/templates/new-product-prediction-input/`。
- 产出文件：`new_product_prediction_input.schema.json`、`new_product_prediction_input.template.json`、`field_mapping.template.csv`、`quality_report.template.json`、`README.md`、`scripts/validate-new-product-prediction-template.mjs`。
- 新品预测输入基于 D-P2-2 `ProductMaster`：字段组包括 `identity`、`category`、`priceAndSeason`、`sellingPoints`、`material`、`styleAndScenario`、`assets`、`similarProducts`、`lineage`、`quality`。
- 必填（真实输入时）：商品身份/source key、一级类目或等价映射字段、source lineage（`sourceBatchId`、`dataVersion`、`generatedAt`、`sourceType`）。模板阶段这些字段保持 `null`，不生成假 ID、假枚举或默认业务值。
- 可选但模型可用：价格带、季节、卖点、材质、风格、场景、图文资产、相似 SKU/SPU、`mappedProductTags`、`unmappedProductFields`。
- 后续增强字段：`assets.imageFeatureSummary`、`sellingPoints.copyFeatureSummary`、`similarProducts.similarProducts`；这些字段提升 baseline 质量，但不作为 P2 contract 硬前置。
- 映射边界：只允许映射到 `docs/profile-taxonomy-v0.md` 现有命名空间 `demo/style/price/occasion/intent/channel`；不可映射字段进入 `unmappedProductFields`，不得强行造 `tagId`。
- 质量规则覆盖四类：缺失（`missing_required_identity`、`missing_required_category`、`source_lineage_incomplete` 等）、冲突（`conflicting_product_identity`、`conflicting_price_fields` 等）、不可映射（`unmapped_required_field`、`taxonomy_unmapped_high`、`unapproved_tag_id`）、低置信度（`low_mapping_confidence`、`low_similar_product_confidence`、`low_asset_feature_confidence`）。
- 模板明确 M/A 输入边界：M-P2-8 只能使用上新前可得的 `ProductMaster` 字段、`mappedProductTags`、相似商品和图文摘要；不得要求 post-launch buyer profile、销售标签或渠道反馈，除非显式 backtest。
- 校验命令：`node data/templates/new-product-prediction-input/scripts/validate-new-product-prediction-template.mjs`。

## D-P3-DB-1 沉淀

- 产出文档固定为 `docs/p3-db-current-inventory.md`。
- 当前 `ws_demo` 收尾复核状态：28 tables / 10 views / 80 indexes，base table rows = 5669，latest/view rows = 793。
- 当前库不是干净生产库，混合 mock demo、smoke/e2e、P1/P2/P3 临时验收、`user_authorized` 抖音 BI 和运行时历史。
- `douyin_*` base tables 合计 1384 行：`v1_20260703=692` 为仓库数据包真源，可从 `data/p1/douyin-bi/` 重放；`v2_20260704_xp1f6=692` 是 X-P1-F6 本地临时验收版本，仓库不含完整真源，清库前需快照或重新构造。
- `data/demo/` 可重放核心 demo 数据：3 个 mock SKU、4 个 channel profile、12 行 wide table 和 DMP aggregate 样例；当前 `sku` 表 27 行中只有 3 行属于 demo 真源，其余为 smoke/import 残留。
- `audit_event`、`task`、`idempotency_key`、`decision_record`、`action_record`、`feedback_record`、`strategy_review`、`schema_migration`、`db_admin_audit`、`data_import_job` 属运行时 / 系统历史；清库后不可从数据包自动恢复。
- 本轮只读盘点期间出现并行库变动，新增 P3 system tables：`schema_migration`、`db_admin_audit`、`data_import_job`。D 域未执行写库命令；后续清库验收以收尾复核后的文档状态为准。
- 校验方式：只读 `sqlite_master` 和行数统计；未执行 `DROP`、`DELETE`、`UPDATE`、`INSERT`、`VACUUM`、migration 或任何写入命令。

## D-P4-TOOLS-2 沉淀

- 模板目录固定为 `data/templates/profile-extract/`。
- 标准包目录结构为 `run_manifest.json`、`source_manifest.json`、`extracted_profiles.jsonl`、`aggregate_profile.csv`、`aggregate_profile.jsonl`、`field_dictionary.csv`、`unmapped_fields.csv`、`quality_report.json`、`report.md`。
- `ProfileTagScore` 必须包含 `tagId`、`score`、`sourceField`、`sourceValue`、`confidence`、`mappingRuleId`；`AggregateProfile` 必须保留 `profileId`、`platform`、`source`、`timeWindow`、`sampleSize`、`tags`、`unmappedFields`、`qualityFlags`。
- `run_manifest.json.importAdapter` 给 A-P4-TOOLS-4 明确 `packageType`、`sourceBatchId`、`dataVersion`、`targetTables`、`confirmText`、`idempotencyScope`；第一阶段目标表为 `channel_profile`，后续可接 `channel_entity`。
- 样例包位于 `data/templates/profile-extract/sample_package/`，只作为 `mock_sample` contract 示例，不代表真实平台画像结论。
- validator 校验必填文件、manifest 计数、`tagId` 白名单、`source/timeWindow/sampleSize`、unmapped fields、CSV/JSONL 行数和 quality report 一致性。
- 校验命令：`node data/templates/profile-extract/scripts/validate-profile-extract-package.mjs data/templates/profile-extract/sample_package`。
- 尚未实现生意参谋、天猫、抖音、小红书、CSV、XLSX、HTML 等具体平台解析器。

## D-P4-TOOLS-3 沉淀

- 模板目录固定为 `data/templates/business-aggregate/`。
- 标准包目录结构为 `run_manifest.json`、`source_manifest.json`、`product_master.jsonl`、`channel_entity.jsonl`、`product_aggregate.jsonl`、`channel_aggregate.jsonl`、`sku_channel_wide_table.jsonl`、`field_mapping.csv`、`unmapped_fields.csv`、`quality_report.json`、`report.md`。
- 冻结聚合粒度：`product_aggregate = productId/skuId + timeWindow + dataVersion`，`channel_aggregate = channelId + timeWindow + dataVersion`，`sku_channel_wide_table = skuId + channelId + timeWindow`。
- 第一阶段可进入现有 `sku`、`channel_profile`、`wide_table_row`、`batch`；`ProductMaster` 和 `ChannelEntity` 完整物理表仍需 X 总控拍板。
- 质量规则覆盖 `missing_primary_key`、`missing_time_window`、`unrecognized_channel`、`unrecognized_product`、`invalid_amount_or_quantity`、`low_profile_mapping_coverage`、`unapproved_tag_id`。
- 样例包位于 `data/templates/business-aggregate/sample_package/`，只作为 `mock_sample` contract 示例，不伪装成真实订单、商品或渠道数据。
- validator 校验必填文件、manifest/quality row counts、引用完整性、upsert key 唯一性、`tagId` 白名单、质量规则完整性。
- 校验命令：`node data/templates/business-aggregate/scripts/validate-business-aggregate-package.mjs data/templates/business-aggregate/sample_package`。
- 尚未实现生产 SQL 连接、离线导出解析器、A 域 import adapter、DB migration 或 UI 工具工作台。

## D-P5-PORTRAIT-3 沉淀

- 模板目录固定为 `data/templates/single-product-portrait-sample/`。
- 标准包目录结构为 `source_manifest.json`、`product_attributes.jsonl`、`platform_portrait.csv`、`field_mapping.csv`、`quality_report.json`、`report.md`。
- `product_attributes.jsonl` 必须保留 `skuId`、`sourceProductKey`、`gender`、`category`、`source`、`sourceType`、`sourceBatchId`、`dataVersion`、`timeWindow`、`qualityFlags`；画像样本必须通过 `skuId + sourceProductKey` 绑定商品属性。
- `platform_portrait.csv` 保留平台回流画像形态：`labelType`、`label`、`share`、`tgi`、`source`、`sourceType`、`sourceBatchId`、`dataVersion`、`timeWindow`、`qualityFlags`；`share` 为 0-1 小数，`tgi` 可留空表示暂无大盘基准，不能用 0 代替。
- `source_manifest.json.allowedLabelTypes` 冻结第一期核心展示维度集合：`预测性别`、`预测年龄段`、`八大消费群体`、`预测消费能力`、`城市等级`、`抖音视频观看兴趣分类`；新增长尾平台维度时必须先声明并在 `report.md` 说明展示处理，不代表新增 PLS taxonomy tagId。
- validator 校验必填文件、商品属性必填、画像 CSV 行结构、标签类型集合、画像行绑定、异常行计数、样本计数、`source/timeWindow` 一致性和 quality report 一致性。
- 校验命令：`node data/templates/single-product-portrait-sample/scripts/validate-single-product-portrait-sample.mjs data/templates/single-product-portrait-sample/sample_package`。
- M-P5-PORTRAIT-7 消费方式：按 `skuId + sourceProductKey` join `product_attributes.jsonl` 与 `platform_portrait.csv`；商品属性作为规则特征，平台画像行作为校准目标，`quality_report.json` 作为门禁元数据。
- 小样本规则校准门槛仍为至少 5 款真实有效商品画像样本；当前 mock sample 只有 1 款 contract 示例，不能计入真实校准能力声明。
- 本卡未新增 taxonomy tagId，未连接生产平台或 SQL，未导入主 workspace，未编造真实画像、商品属性或平台大盘基准。

## D-P6-CHANNEL-1 沉淀

- 模板目录固定为 `data/templates/channel-profile-object-library/`。
- 标准包目录结构为 `run_manifest.json`、`source_manifest.json`、`basic_templates.csv`、`channel_objects.jsonl`、`bindings.jsonl`、`audience_profiles.jsonl`、`product_fit_profiles.jsonl`、`field_dictionary.csv`、`quality_report.json`、`report.md`。
- 基础模板必须覆盖 6 类 `targetObjectType`：`platform`、`trade_area`、`store`、`account`、`marketing_event`、`business_scenario`。
- 高级对象包必须覆盖多类对象、父子层级、活动/场景绑定、人群画像、商品适配和质量报告；活动和场景可以绑定渠道实体，但不是 `ChannelEntity`，不得改变实体层级。
- 对象版本字段必须保留 `sourceStableKey`、`keySource`、`canonicalObjectKey`、`objectVersionId`、`dataVersion`、`sourceBatchId`、`generatedAt`；`canonicalObjectKey = objectType + ":" + sourceStableKey`，`objectVersionId = workspaceId + ":" + objectType + ":" + sourceStableKey + ":" + dataVersion`。
- `AudienceProfile` 与 `ProductFitProfile` 必须保留 `source`、`sampleSize`、`timeWindow`、`confidence`、`qualityFlags`；不得伪造样本量、来源、时间窗口或商品适配结论。
- 重复治理第一期只做提示：`possibleDuplicate`、`duplicateCandidateKeys`、`manualReviewStatus`；不得自动合并疑似重复对象。
- dry-run 质量规则必须覆盖 `missing_parent_reference`、`generated_key_needs_review`、`manual_entity_without_profile`、`possible_duplicate`、`unapproved_tag_id`、`invalid_object_type`、`event_or_scenario_as_channel_entity`、`missing_profile_lineage`。
- 样例包位于 `data/templates/channel-profile-object-library/sample_package/`，只作为 `mock_sample` contract 示例；未新增 taxonomy tagId，未连接生产平台或 SQL，未导入主 workspace。
- validator 校验必填文件、6 类基础模板覆盖、高级包对象覆盖、key 公式、绑定引用、profile lineage、taxonomy 白名单、row count 一致性、质量规则和 3 类失败样例。
- 校验命令：`node data/templates/channel-profile-object-library/scripts/validate-channel-profile-object-library-package.mjs data/templates/channel-profile-object-library/sample_package`。
- A-P6-CHANNEL-3 需要实现 import adapter：dry-run、quality report preview、confirm import、workspace 隔离、admin token、`Idempotency-Key`、`X-PLS-Workspace`、`confirmText = IMPORT CHANNEL OBJECT LIBRARY <sourceBatchId>`、`data_import_job` / `db_admin_audit`。
