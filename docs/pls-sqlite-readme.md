# PLS SQLite 库表 README

## 目的

本文档说明 PLS 本地 SQLite 工作区数据库的表、视图和字段含义，供数据管理、联调、导入排错和前端查看使用。

生成依据：

- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/V001_create_admin_tables.ts`

注意：SQLite 原生不支持 `COMMENT ON TABLE/COLUMN`。本文档是中文说明文档，不会写入数据库 schema。

## 使用方式

- 在数据管理模块的 `README` tab 中查看本文档。
- 涉及真实表结构时，以代码中的 DDL 和 Admin API `GET /api/v0/admin/database/tables/:name/schema` 为准。
- 表内 JSON 字段统一以 `TEXT` 存储，业务含义见字段中文说明。

示例：

```sql
SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name;
SELECT sql FROM sqlite_master WHERE name = 'douyin_account';
```

## 注意事项

- 不要把本文档当作 schema migration；改字段、加表、删表仍需走总控确认。
- `*_latest` 视图是按业务键取最新快照的只读投影，不是独立写入表。
- `workspace_id` 是多工作区隔离字段，绝大多数业务表都必须带上。
- `source_batch_id`、`data_version`、`generated_at` 用于导入批次、版本和时间追溯。
- `raw`、`quality_flags`、`upsert_hash`、`source_type` 等字段用于保留原始数据、质量标记、幂等写入和来源分类。

## 表结构

### Core 基础域

#### `workspace` 工作区

用途：记录本地工作区。

主键：`workspace_id`

字段：`workspace_id`（工作区 ID）、`name`（工作区名称）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `sku` 商品主数据

用途：记录 SKU/SPU、类目、季节、标题、商品属性、素材和映射标签。

主键：`sku_id`

索引：`idx_sku_workspace(workspace_id, created_at DESC)`

字段：`sku_id`（SKU ID）、`workspace_id`（工作区 ID）、`spu_id`（SPU ID）、`category_lv1`（一级类目）、`category_lv2`（二级类目）、`season`（季节）、`title`（商品标题）、`attributes`（商品属性 JSON）、`assets`（商品素材 JSON 数组）、`mapped_product_tags`（映射后的商品标签 JSON 数组）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `channel_profile` 渠道画像

用途：记录渠道、账号、店铺或流量入口的画像标签和表现指数。

主键：`channel_id`

索引：`idx_channel_workspace(workspace_id, created_at DESC)`

字段：`channel_id`（渠道 ID）、`workspace_id`（工作区 ID）、`batch_id`（导入/生成批次 ID）、`channel_name`（渠道名称）、`channel_type`（渠道类型）、`platform_type`（平台类型）、`time_window`（统计时间窗口）、`sample_size`（样本量）、`source`（来源）、`source_type`（来源类型）、`tags`（渠道画像标签 JSON 数组）、`traffic_index`（流量指数）、`conversion_index`（转化指数）、`quality_flags`（质量标记 JSON 数组）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `wide_table_row` 历史训练宽表行

用途：保存 SKU 与渠道在某时间窗口下的训练/分析宽表原始行。

主键：`sku_id + channel_id + time_window`

索引：`idx_wide_table_workspace(workspace_id)`

字段：`sku_id`（SKU ID）、`channel_id`（渠道 ID）、`time_window`（统计时间窗口）、`workspace_id`（工作区 ID）、`batch_id`（批次 ID）、`full_row`（完整宽表行 JSON）、`created_at`（创建时间）。

#### `batch` 批次

用途：记录导入、预测或同步批次的来源、行数、实体数量和质量报告。

主键：`batch_id`

索引：`idx_batch_workspace(workspace_id, created_at DESC)`

字段：`batch_id`（批次 ID）、`workspace_id`（工作区 ID）、`batch_type`（批次类型）、`source`（来源）、`source_type`（来源类型）、`time_window`（统计时间窗口）、`row_count`（行数）、`entity_counts`（实体数量 JSON）、`quality_report`（质量报告 JSON）、`created_at`（创建时间）、`created_by`（创建人）。

#### `prediction` P0 预测结果

用途：保存商品画像预测结果、Top 人群包、质量标记和未映射输入。

主键：`prediction_id`

索引：`idx_prediction_workspace(workspace_id, created_at DESC)`、`idx_prediction_sku(workspace_id, sku_id)`

字段：`prediction_id`（预测 ID）、`workspace_id`（工作区 ID）、`sku_id`（SKU ID）、`task_id`（任务 ID）、`model_version`（模型版本）、`model_path`（模型路径/算法路径）、`source`（来源）、`source_type`（来源类型）、`generated_at`（生成时间）、`input_snapshot`（输入快照 JSON）、`predicted_profile_tags`（预测画像标签 JSON 数组）、`top_segments`（Top 人群包 JSON 数组）、`quality_flags`（质量标记 JSON 数组）、`unmapped_input_tokens`（未映射输入 token JSON 数组）、`created_at`（创建时间）。

#### `match_result` 人货匹配结果

用途：保存 SKU 与渠道/账号的匹配分、推荐结论、正负驱动、风险和 P1 账号商品诊断字段。

主键：`match_id`

索引：`idx_match_workspace(workspace_id, created_at DESC)`、`idx_match_prediction(prediction_id)`、`idx_match_sku_channel(workspace_id, sku_id, channel_id)`、`idx_match_latest_lookup(workspace_id, sku_id, channel_id, generated_at DESC)`

字段：`match_id`（匹配 ID）、`workspace_id`（工作区 ID）、`task_id`（任务 ID）、`prediction_id`（预测 ID）、`sku_id`（SKU ID）、`channel_id`（渠道 ID）、`channel_type`（渠道类型）、`model_version`（模型版本）、`source`（来源）、`source_type`（来源类型）、`generated_at`（生成时间）、`match_score`（匹配分）、`match_confidence`（匹配置信度）、`rank`（排序名次）、`overlap`（人群重合度）、`best_segment_id`（最佳人群包 ID）、`best_segment_match`（最佳人群包匹配分）、`positive_drivers`（正向驱动 JSON 数组）、`negative_drivers`（负向驱动 JSON 数组）、`recommendation`（推荐动作）、`risks`（风险 JSON 数组）、`quality_flags`（质量标记 JSON 数组）、`fit_score`（账号商品契合分）、`fit_confidence`（契合置信度）、`mismatched_dimensions`（不匹配维度 JSON 数组）、`adjustment_advice`（调整建议 JSON 数组）、`created_at`（创建时间）。

#### `task` 异步任务

用途：记录预测、匹配、导入等后台任务状态。

主键：`task_id`

索引：`idx_task_workspace(workspace_id, task_type, status)`、`idx_task_status(workspace_id, status, created_at DESC)`

字段：`task_id`（任务 ID）、`workspace_id`（工作区 ID）、`task_type`（任务类型）、`status`（任务状态）、`resource_id`（关联资源 ID）、`model_version`（模型版本）、`input`（任务输入 JSON）、`attempts`（尝试次数）、`error`（错误信息）、`created_at`（创建时间）、`started_at`（开始时间）、`finished_at`（完成时间）、`updated_at`（更新时间）。

#### `audit_event` 业务审计事件

用途：记录业务状态流转、任务事件和 safety gate 信息。

主键：`audit_id`

索引：`idx_audit_workspace(workspace_id, occurred_at DESC)`、`idx_audit_task(task_id)`、`idx_audit_resource(resource_type, resource_id)`

字段：`audit_id`（审计 ID）、`workspace_id`（工作区 ID）、`occurred_at`（发生时间）、`actor`（操作者）、`request_id`（请求 ID）、`task_id`（任务 ID）、`resource_type`（资源类型）、`resource_id`（资源 ID）、`event`（事件名）、`from_status`（变更前状态）、`to_status`（变更后状态）、`reason_code`（原因码）、`attempt`（尝试次数）、`meta`（扩展信息 JSON）、`safety_stage`（安全检查阶段）。

#### `idempotency_key` 幂等缓存

用途：保存写接口幂等键、请求 hash 和响应体，防止重复提交。

主键：`workspace_id + method + path + key`

索引：`idx_idem_expires(expires_at)`

字段：`workspace_id`（工作区 ID）、`method`（HTTP 方法）、`path`（请求路径）、`key`（幂等键）、`request_hash`（请求体 hash）、`response_body`（响应体 JSON）、`resource_id`（关联资源 ID）、`status_code`（响应状态码）、`created_at`（创建时间）、`expires_at`（过期时间）。

### Douyin BI 域

#### `douyin_account` 抖音账号

用途：保存抖音账号基础信息及是否具备报告、基准标签等标记。

主键：`workspace_id + channel_id + source_batch_id + data_version`

索引：`idx_douyin_account_ws(workspace_id, generated_at DESC)`、`idx_douyin_account_group(workspace_id, account_group_id)`

字段：`workspace_id`（工作区 ID）、`channel_id`（账号/渠道 ID）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`account_group_id`（账号组 ID）、`account_name`（账号名称）、`account_kind`（账号类型）、`platform_type`（平台类型）、`channel_type`（渠道类型）、`display_name_policy`（展示名策略）、`display_name`（展示名称）、`is_baseline`（是否基准账号）、`has_report`（是否有报告）、`has_benchmark_tags`（是否有基准标签）、`source`（来源）、`source_type`（来源类型）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_account_benchmark_tag` 抖音账号基准标签

用途：保存账号在画像维度上的标签分布、Top1 标记和 taxonomy 映射。

主键：`workspace_id + channel_id + dimension + option_label + source_batch_id + data_version`

索引：`idx_douyin_bench_channel(workspace_id, channel_id)`

字段：`workspace_id`（工作区 ID）、`channel_id`（账号/渠道 ID）、`dimension`（画像维度）、`option_label`（标签选项）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`account_name`（账号名称）、`dimension_taxonomy`（维度 taxonomy）、`share_percent`（占比百分数）、`share_ratio`（占比小数）、`top1_flag`（是否 Top1）、`decision_method`（判定方法）、`business_interpretation`（业务解释）、`mapped_tag_id`（映射标签 ID）、`mapping_confidence`（映射置信度）、`sample_size`（样本量）、`order_index`（排序序号）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_account_report` 抖音账号报告

用途：保存账号报告摘要、原始 HTML 元数据和来源信息。

主键：`workspace_id + channel_id + report_kind + source_batch_id + data_version`

索引：`idx_douyin_report_channel(workspace_id, channel_id)`

字段：`workspace_id`（工作区 ID）、`channel_id`（账号/渠道 ID）、`report_kind`（报告类型）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`report_id`（报告 ID）、`account_name`（账号名称）、`account_kind`（账号类型）、`channel_type`（渠道类型）、`compare_period`（对比周期）、`plain_text_excerpt`（文本摘要）、`plain_text_char_count`（文本字符数）、`raw_html_bytes`（原始 HTML 字节数）、`raw_html_hash`（原始 HTML hash）、`raw_html_available`（是否有原始 HTML）、`source`（来源）、`source_type`（来源类型）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_product` 抖音商品

用途：保存抖音商品属性、表现指标、画像分布和映射画像标签。

主键：`workspace_id + sku_id + source_batch_id + data_version`

索引：`idx_douyin_product_ws(workspace_id, generated_at DESC)`

字段：`workspace_id`（工作区 ID）、`sku_id`（SKU ID）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`product_name`（商品名称）、`product_attributes`（商品属性 JSON）、`performance_metrics`（表现指标 JSON）、`performance_index`（表现指数 JSON）、`profile_distribution`（画像分布 JSON）、`mapped_profile_tags`（映射画像标签 JSON 数组）、`unmapped_profile_fields`（未映射画像字段 JSON 数组）、`source`（来源）、`source_type`（来源类型）、`quality_flags`（质量标记 JSON 数组）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_product_account_fit` 抖音商品账号契合

用途：保存商品与账号的历史契合分、销售表现和不匹配概览。

主键：`workspace_id + sku_id + account_channel_id + source_batch_id + data_version`

索引：`idx_douyin_fit_sku(workspace_id, sku_id)`、`idx_douyin_fit_account(workspace_id, account_channel_id)`、`idx_douyin_fit_fitid(workspace_id, fit_id)`

字段：`workspace_id`（工作区 ID）、`fit_id`（契合诊断 ID）、`sku_id`（SKU ID）、`account_channel_id`（账号渠道 ID）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`product_name`（商品名称）、`account_name`（账号名称）、`legacy_fit_score`（历史契合分）、`legacy_fit_score_usage`（契合分使用说明）、`mismatch_dimension_count`（不匹配维度数）、`heavy_adjustment_tag_list`（重点调整标签列表）、`sales_rank`（销售排名）、`sales_volume`（销量）、`source`（来源）、`source_type`（来源类型）、`quality_flags`（质量标记 JSON 数组）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_comparison_dimension` 抖音款账号维度对比

用途：保存商品和账号在某画像维度上的 Top1 对比、匹配状态和差距分。

主键：`workspace_id + fit_id + dimension + source_batch_id + data_version`

索引：`idx_douyin_cmp_fit(workspace_id, fit_id)`、`idx_douyin_cmp_sku(workspace_id, sku_id)`

字段：`workspace_id`（工作区 ID）、`fit_id`（契合诊断 ID）、`dimension`（对比维度）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`sku_id`（SKU ID）、`account_channel_id`（账号渠道 ID）、`dimension_taxonomy`（维度 taxonomy）、`product_top1_label`（商品 Top1 标签）、`product_top1_share_percent`（商品 Top1 占比）、`account_top1_label`（账号 Top1 标签）、`account_top1_share_percent`（账号 Top1 占比）、`product_top1_tag_id`（商品 Top1 标签 ID）、`account_top1_tag_id`（账号 Top1 标签 ID）、`decision_method`（判定方法）、`is_match_label`（是否匹配标签）、`status`（状态）、`gap_score`（差距分）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_adjustment_advice` 抖音调整建议

用途：保存款账号不匹配维度上的运营优化建议、优先级和证据。

主键：`workspace_id + sku_id + account_channel_id + dimension + order_index + source_batch_id + data_version`

索引：`idx_douyin_adv_sku(workspace_id, sku_id)`、`idx_douyin_adv_account(workspace_id, account_channel_id)`、`idx_douyin_adv_priority(workspace_id, priority)`

字段：`workspace_id`（工作区 ID）、`advice_id`（建议 ID）、`sku_id`（SKU ID）、`account_channel_id`（账号渠道 ID）、`dimension`（建议维度）、`order_index`（排序序号）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`product_name`（商品名称）、`dimension_taxonomy`（维度 taxonomy）、`product_top1_label`（商品 Top1 标签）、`product_top1_share_percent`（商品 Top1 占比）、`account_top1_label`（账号 Top1 标签）、`account_top1_share_percent`（账号 Top1 占比）、`product_top1_tag_id`（商品 Top1 标签 ID）、`account_top1_tag_id`（账号 Top1 标签 ID）、`gap_score`（差距分）、`priority_label`（优先级标签）、`priority`（优先级编码）、`direction`（调整方向）、`action_type`（动作类型）、`legacy_fit_score`（历史契合分）、`evidence`（证据 JSON）、`source`（来源）、`source_type`（来源类型）、`quality_flags`（质量标记 JSON 数组）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

#### `douyin_summary_metric` 抖音汇总指标

用途：保存抖音 BI 数据包级别的汇总指标。

主键：`workspace_id + metric_name + order_index + source_batch_id + data_version`

索引：`idx_douyin_metric_ws(workspace_id, generated_at DESC)`

字段：`workspace_id`（工作区 ID）、`metric_name`（指标名）、`order_index`（排序序号）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`metric_value`（指标值文本）、`metric_value_numeric`（指标值数值）、`source`（来源）、`source_type`（来源类型）、`upsert_hash`（幂等写入 hash）、`raw`（原始行 JSON）、`created_at`（创建时间）。

### Data Management 与渠道实体域

#### `data_source` 数据源注册表

用途：注册逻辑数据源、adapter、schema 前缀和配置。

主键：`source_id`

索引：`idx_data_source_workspace(workspace_id, source_kind)`、`idx_data_source_status(workspace_id, status)`

字段：`source_id`（数据源 ID）、`workspace_id`（工作区 ID）、`source_kind`（数据源类型）、`display_name`（展示名称）、`adapter`（适配器名）、`schema_prefix`（schema/table 前缀）、`status`（状态）、`description`（描述）、`config`（配置 JSON）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `channel_entity` 渠道实体投影

用途：统一店铺、账号、直播间、内容账号、地域、商圈、门店等渠道锚点。

主键：`workspace_id + channel_entity_id + data_version`

索引：`idx_channel_entity_type(workspace_id, entity_type)`、`idx_channel_entity_platform(workspace_id, platform_type)`、`idx_channel_entity_source(workspace_id, source_id)`、`idx_channel_entity_parent(workspace_id, parent_entity_id)`

字段：`workspace_id`（工作区 ID）、`channel_entity_id`（渠道实体 ID）、`entity_type`（实体类型）、`source_entity_key`（来源实体键）、`display_name`（展示名称）、`platform_type`（平台类型）、`platform_name`（平台名称）、`parent_entity_id`（父实体 ID）、`entity_path`（实体路径 JSON 数组）、`entity_status`（实体状态）、`shop_id`（店铺 ID）、`account_id`（账号 ID）、`account_kind`（账号类型）、`content_format`（内容形式 JSON 数组）、`country`（国家）、`province`（省份）、`city`（城市）、`district`（区县）、`trade_area`（商圈）、`mall_name`（商场名称）、`store_id`（门店 ID）、`store_format`（门店形态）、`profile_tags`（画像标签 JSON 数组）、`benchmark_tags`（基准标签 JSON 数组）、`performance_metrics`（表现指标 JSON）、`unmapped_profile_fields`（未映射画像字段 JSON 数组）、`raw_business_fields`（原始业务字段 JSON）、`source_id`（数据源 ID）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`generated_at`（生成时间）、`time_window`（统计时间窗口）、`source_type`（来源类型）、`quality_flags`（质量标记 JSON 数组）、`upsert_key`（幂等键 JSON）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `new_product_prediction` 新品预测

用途：保存新品画像预测输出，独立于 P0/P1 的 `prediction` 表。

主键：`prediction_id`

索引：`idx_npp_workspace(workspace_id, generated_at DESC)`、`idx_npp_sku(workspace_id, sku_id)`、`idx_npp_task(workspace_id, task_id)`

字段：`prediction_id`（预测 ID）、`workspace_id`（工作区 ID）、`task_id`（任务 ID）、`sku_id`（SKU ID）、`resolved_product_key`（解析后的商品键 JSON）、`input_snapshot`（输入快照 JSON）、`model_version`（模型版本）、`contract_version`（契约版本）、`model_path`（模型路径）、`source`（来源）、`source_type`（来源类型）、`predicted_profile_tags`（预测画像标签 JSON 数组）、`confidence`（整体置信度）、`top_segments`（Top 人群包 JSON 数组）、`similar_historical_products`（相似历史商品 JSON 数组）、`explanation_sources`（解释来源 JSON 数组）、`risk_flags`（风险标记 JSON 数组）、`unavailable_reasons`（不可用原因 JSON 数组）、`quality_flags`（质量标记 JSON 数组）、`lineage`（血缘信息 JSON）、`generated_at`（生成时间）、`created_at`（创建时间）。

### 经营飞轮域

#### `decision_record` 决策记录

用途：保存基于匹配结果形成的投放/运营决策。

主键：`decision_id`

索引：`idx_decision_workspace(workspace_id, created_at DESC)`、`idx_decision_sku_channel(workspace_id, sku_id, channel_id)`、`idx_decision_status(workspace_id, status)`

字段：`decision_id`（决策 ID）、`workspace_id`（工作区 ID）、`match_id`（匹配 ID）、`sku_id`（SKU ID）、`channel_id`（渠道 ID）、`recommendation`（推荐结论）、`rationale`（决策理由）、`decision_type`（决策类型）、`status`（状态）、`created_by`（创建人）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `action_record` 动作记录

用途：保存决策拆解后的执行动作。

主键：`action_id`

索引：`idx_action_workspace(workspace_id, created_at DESC)`、`idx_action_decision(workspace_id, decision_id)`

字段：`action_id`（动作 ID）、`workspace_id`（工作区 ID）、`decision_id`（决策 ID）、`action_type`（动作类型）、`action_detail`（动作详情 JSON）、`status`（状态）、`scheduled_at`（计划执行时间）、`executed_at`（实际执行时间）、`created_at`（创建时间）、`updated_at`（更新时间）。

#### `feedback_record` 反馈记录

用途：保存动作执行后的指标反馈。

主键：`feedback_id`

索引：`idx_feedback_workspace(workspace_id, created_at DESC)`、`idx_feedback_decision(workspace_id, decision_id)`

字段：`feedback_id`（反馈 ID）、`workspace_id`（工作区 ID）、`decision_id`（决策 ID）、`action_id`（动作 ID）、`feedback_type`（反馈类型）、`metric_name`（指标名）、`metric_value`（指标值）、`metric_unit`（指标单位）、`time_window`（统计时间窗口）、`source`（来源）、`source_type`（来源类型）、`source_batch_id`（来源批次 ID）、`data_version`（数据版本）、`quality_flags`（质量标记 JSON 数组）、`raw_metrics`（原始指标 JSON）、`created_at`（创建时间）。

#### `strategy_review` 策略复盘

用途：保存对决策和反馈的复盘结论及调整建议。

主键：`review_id`

索引：`idx_review_workspace(workspace_id, created_at DESC)`、`idx_review_decision(workspace_id, decision_id)`

字段：`review_id`（复盘 ID）、`workspace_id`（工作区 ID）、`decision_id`（决策 ID）、`review_status`（复盘状态）、`adjustment_type`（调整类型）、`adjustment_detail`（调整详情 JSON）、`rationale`（复盘理由）、`reviewer`（复盘人）、`reviewed_at`（复盘时间）、`created_at`（创建时间）。

### Admin 系统域

#### `schema_migration` Schema 迁移记录

用途：记录 migration 版本、校验和、状态和执行耗时。

主键：`version`

索引：`idx_migration_status(status)`

字段：`version`（迁移版本）、`name`（迁移名称）、`checksum`（迁移校验和）、`applied_at`（应用时间）、`status`（迁移状态）、`error`（错误信息）、`execution_ms`（执行耗时毫秒）。

#### `db_admin_audit` 数据库管理审计

用途：记录数据管理模块危险操作、目标、前后快照和执行状态。

主键：`audit_id`

索引：`idx_admin_audit_workspace(workspace_id, created_at DESC)`、`idx_admin_audit_operation(workspace_id, operation)`

字段：`audit_id`（审计 ID）、`workspace_id`（工作区 ID）、`actor`（操作者）、`operation`（操作名）、`target_type`（目标类型）、`target_name`（目标名称）、`before_snapshot`（操作前快照 JSON）、`after_snapshot`（操作后快照 JSON）、`status`（执行状态）、`error`（错误信息）、`created_at`（创建时间）。

#### `data_import_job` 数据导入任务

用途：记录导入任务、数据版本、质量报告、成功/失败行数和运行状态。

主键：`job_id`

索引：`idx_import_job_workspace(workspace_id, created_at DESC)`、`idx_import_job_status(workspace_id, status)`、`idx_import_job_version(workspace_id, data_version)`

字段：`job_id`（导入任务 ID）、`workspace_id`（工作区 ID）、`import_type`（导入类型）、`source`（来源）、`source_type`（来源类型）、`data_version`（数据版本）、`status`（任务状态）、`dry_run`（是否预检）、`input_manifest`（输入清单 JSON）、`quality_report`（质量报告 JSON）、`row_count`（总行数）、`success_count`（成功行数）、`error_count`（错误行数）、`created_at`（创建时间）、`started_at`（开始时间）、`finished_at`（完成时间）、`error`（错误信息）。

## 视图

`match_result_latest`：每个 `workspace_id + sku_id + channel_id` 取最新匹配结果。

`douyin_account_latest`：每个 `workspace_id + channel_id` 取最新抖音账号。

`douyin_account_benchmark_tag_latest`：每个账号、维度、标签选项取最新基准标签分布。

`douyin_account_report_latest`：每个账号和报告类型取最新报告。

`douyin_product_latest`：每个 SKU 取最新抖音商品数据。

`douyin_product_account_fit_latest`：每个 SKU 与账号组合取最新契合诊断。

`douyin_comparison_dimension_latest`：每个契合诊断和维度取最新对比结果。

`douyin_adjustment_advice_latest`：每个 SKU、账号、维度和排序位取最新建议。

`douyin_summary_metric_latest`：每个汇总指标和排序位取最新指标。

`channel_entity_latest`：每个渠道实体取最新投影。
