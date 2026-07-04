# PLS Master Data Schema Design

## 目的

本文是 X 总控对 PLS 核心主数据与导入事实表的设计草案，用于后续 A / D / M / V 拆任务、设计 migration、调整 API 和迁移旧表。

本轮只冻结数据模型口径，不修改 SQLite schema，不执行 migration，不清理现有库表。

## 结论

PLS 后续业务源数据底座采用 **3 张主数据表 + 5 张事实表**：

| 层级 | 表 | 定位 |
|---|---|---|
| 主数据 | `product_master` | 商品、SPU、SKU、款色码等商品主档 |
| 主数据 | `profile_tag_master` | 统一画像标签主档 |
| 主数据 | `channel_entity_master` | 店铺、账号、直播间、门店、城市等渠道实体主档 |
| 事实表 | `product_sales_fact` | 商品聚合销售表现 |
| 事实表 | `product_profile_fact` | 商品人群画像观测 |
| 事实表 | `channel_profile_fact` | 渠道人群画像观测 |
| 事实表 | `channel_sales_fact` | 渠道聚合销售表现 |
| 事实表 | `product_channel_sales_fact` | 商品在渠道上的聚合销售表现 |

前 3 张表定义长期稳定对象，后 5 张表承接业务系统导出的聚合数据。`product_channel_sales_fact` 是新增建议项；如果缺少它，系统只能知道商品总体表现和渠道总体表现，无法验证“某商品在某渠道是否卖得好”，人货匹配和回测会缺关键证据。

这 8 张表不能替代运行时、派生产物和系统审计表。`prediction`、`match_result`、`new_product_prediction`、`decision_record`、`action_record`、`feedback_record`、`strategy_review`、`task`、`audit_event`、`data_import_job`、`db_admin_audit` 等仍需保留或按后续任务重构。

## 使用方式

- D 域以本文设计字段映射模板和导入数据包格式。
- A 域以本文设计 SQLite migration、import adapter、latest view 和兼容 API。
- M 域以本文确认商品画像、渠道画像、商品渠道销售表现的训练和回测输入。
- V 域以本文确认数据管理、商品人群、渠道人群和人货匹配页面的数据来源。
- X 总控后续以本文判断旧表保留、替换、迁移或废弃。

## 设计原则

| 原则 | 说明 |
|---|---|
| 主数据与事实分离 | 主数据回答“对象是谁”，事实表回答“某时间窗口观察到了什么”。 |
| 聚合数据优先 | 当前导入数据来自业务系统导出后的聚合表，不以订单明细、会员明细作为默认输入。 |
| 保留时间窗口 | 所有事实表必须有 `time_window_start`、`time_window_end` 或标准化 `time_window`。 |
| 保留版本 | 所有导入表必须有 `source_id`、`source_batch_id`、`data_version`、`source_type`。 |
| 保留质量 | 所有导入表必须有 `sample_size`、`quality_flags`、`raw_business_fields` 或等价字段。 |
| 通用对象优先 | 抖音、天猫、线下门店等来源进入通用主数据和事实表，来源特有字段进 `raw_business_fields`。 |
| 派生产物不回写源表 | 预测、匹配、建议、反馈复盘是 derived/runtime 表，不写回主数据或原始事实表。 |

## 新核心表

### `product_master`

定位：商品主档，统一 SKU、SPU、款号、款色码、商品名称、类目、价格带、季节、材质、卖点和图文资产引用。

推荐主键：

```text
product_master_id = workspace_id + product_key + product_variant_key + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `product_master_id` | PLS 商品主数据 ID |
| `workspace_id` | 工作区 |
| `product_key` | 源系统商品业务键，可为 SKU、SPU、款号或组合键 |
| `product_variant_key` | 款色码、尺码、listing 等变体键，可为空 |
| `source_key_policy` | `sku` / `spu` / `style_code` / `listing_id` / `composite_key` / `unknown` |
| `product_name` | 商品名称 |
| `category_lv1` / `category_lv2` / `category_lv3` | 来源或映射后的类目 |
| `brand_name` / `series_name` | 品牌、系列 |
| `list_price` / `sale_price` / `price_band` | 价格相关字段 |
| `season` / `launch_date` / `lifecycle_status` | 季节、上市、生命周期 |
| `selling_points` / `material_fields` / `style_fields` | 卖点、材质、风格等结构字段 |
| `asset_refs` | 图片、视频、详情页、文案资产引用 |
| `mapped_product_tags` | 商品结构字段映射出的画像标签，必须引用 `profile_tag_master.tag_id` |
| `unmapped_product_fields` | 未映射字段及原因 |
| `raw_business_fields` | 未结构化但允许保留的用户授权字段 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` / `upsert_hash` | 质量与幂等 |

替代现有表：`sku`、`douyin_product` 中的商品主档部分。

### `profile_tag_master`

定位：统一画像标签主档，替代当前只从 `docs/profile-taxonomy-v0.md` 解析 tagId 的方式。文档仍可作为说明，SQLite 表成为业务运行时的标签白名单和展示字典。

推荐主键：

```text
tag_id
```

关键字段：

| 字段 | 说明 |
|---|---|
| `tag_id` | 全局唯一标签 ID，例如 `demo.female` |
| `tag_namespace` | `demo` / `style` / `price` / `occasion` / `intent` / `channel` 等 |
| `tag_dimension` | 业务维度，如 gender、style、price_band |
| `tag_label` | 展示名称 |
| `tag_description` | 标签说明 |
| `parent_tag_id` | 父标签，可为空 |
| `status` | `active` / `deprecated` / `draft` |
| `allowed_entity_types` | 可用于 product、channel、prediction、match 等范围 |
| `version` | 标签体系版本 |
| `source` | 标签来源 |
| `created_at` / `updated_at` | 时间戳 |

替代现有能力：`docs/profile-taxonomy-v0.md` 的运行时白名单能力。文档可以保留为说明和人工评审入口。

### `channel_entity_master`

定位：渠道实体主档。统一店铺、账号、直播间、内容账号、省市商圈、门店。平台是属性，不是唯一分析主轴。

推荐主键：

```text
channel_entity_master_id = workspace_id + entity_type + source_entity_key + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `channel_entity_master_id` | PLS 渠道实体 ID |
| `workspace_id` | 工作区 |
| `entity_type` | `platform` / `shop` / `account` / `livestream_room` / `content_account` / `province` / `city` / `trade_area` / `store` |
| `source_entity_key` | 来源系统实体键 |
| `display_name` | 展示名 |
| `platform_type` / `platform_name` | 平台类型和平台名 |
| `parent_entity_id` / `entity_path` | 层级关系 |
| `shop_id` / `account_id` / `store_id` | 来源系统 ID |
| `account_kind` / `content_format` / `store_format` | 业务分类 |
| `geo_fields` | 国家、省、市、区、商圈、门店位置等 |
| `raw_business_fields` | 来源特有字段 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` / `upsert_hash` | 质量与幂等 |

替代现有表：`channel_entity`、`channel_profile` 的实体属性部分、`douyin_account`。

### `product_sales_fact`

定位：商品粒度的聚合销售表现。

推荐粒度：

```text
workspace_id + product_master_id + time_window + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `product_sales_fact_id` | 事实行 ID |
| `product_master_id` | 商品主数据 ID |
| `time_window` | 业务时间窗口 |
| `sales_amount` / `sales_qty` / `gmv` | 销售金额、件数、GMV，字段按来源保留 |
| `traffic_count` / `conversion_rate` | 流量和转化指标 |
| `refund_rate` / `return_rate` | 退款、退货指标 |
| `rank_metrics` / `index_metrics` | 排名、指数化指标 |
| `sample_size` | 样本量 |
| `raw_metrics` | 其他来源指标 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` | 质量标记 |

替代现有表：`douyin_product.performance_metrics` / `performance_index` 的商品总体表现部分。

### `product_profile_fact`

定位：商品人群画像观测，记录某商品在某时间窗口的实际消费人群标签分布。

推荐粒度：

```text
workspace_id + product_master_id + tag_id + time_window + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `product_profile_fact_id` | 事实行 ID |
| `product_master_id` | 商品主数据 ID |
| `tag_id` | 画像标签 ID |
| `score` / `share_ratio` / `share_percent` | 标签强度、占比或比例 |
| `confidence` | 置信度 |
| `sample_size` | 样本量 |
| `profile_stage` | buyer、visitor、exposed、converted 等来源阶段 |
| `time_window` | 时间窗口 |
| `mapping_rule_id` | 映射规则 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` | 质量标记 |

替代现有表：`douyin_product.profile_distribution`、`mapped_profile_tags`，以及 `wide_table_row.full_row` 中的商品画像部分。

### `channel_profile_fact`

定位：渠道实体人群画像观测，记录店铺、账号、门店等实体在某时间窗口的人群标签分布。

推荐粒度：

```text
workspace_id + channel_entity_master_id + tag_id + time_window + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `channel_profile_fact_id` | 事实行 ID |
| `channel_entity_master_id` | 渠道实体 ID |
| `tag_id` | 画像标签 ID |
| `score` / `share_ratio` / `share_percent` | 标签强度、占比或比例 |
| `confidence` | 置信度 |
| `sample_size` | 样本量 |
| `benchmark_type` / `benchmark_delta` | 标杆或平均值差异，可为空 |
| `time_window` | 时间窗口 |
| `mapping_rule_id` | 映射规则 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` | 质量标记 |

替代现有表：`channel_profile.tags`、`douyin_account_benchmark_tag`、`channel_entity.profile_tags` / `benchmark_tags`。

### `channel_sales_fact`

定位：渠道实体粒度的聚合销售表现。

推荐粒度：

```text
workspace_id + channel_entity_master_id + time_window + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `channel_sales_fact_id` | 事实行 ID |
| `channel_entity_master_id` | 渠道实体 ID |
| `time_window` | 时间窗口 |
| `sales_amount` / `sales_qty` / `gmv` | 销售表现 |
| `traffic_count` / `conversion_rate` | 流量和转化 |
| `content_metrics` | 内容、直播、互动等指标 |
| `rank_metrics` / `index_metrics` | 排名、指数化指标 |
| `sample_size` | 样本量 |
| `raw_metrics` | 其他来源指标 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` | 质量标记 |

替代现有表：`channel_profile.traffic_index` / `conversion_index`、`douyin_summary_metric` 中可归属到渠道的指标。

### `product_channel_sales_fact`

定位：商品在渠道上的聚合销售表现，是人货匹配回测和经营飞轮验证的关键事实表。

推荐粒度：

```text
workspace_id + product_master_id + channel_entity_master_id + time_window + data_version
```

关键字段：

| 字段 | 说明 |
|---|---|
| `product_channel_sales_fact_id` | 事实行 ID |
| `product_master_id` | 商品主数据 ID |
| `channel_entity_master_id` | 渠道实体 ID |
| `time_window` | 时间窗口 |
| `sales_amount` / `sales_qty` / `gmv` | 某商品在某渠道的销售表现 |
| `traffic_count` / `conversion_rate` | 某商品在某渠道的流量与转化 |
| `rank_in_channel` | 商品在渠道内排名 |
| `rank_in_product` | 渠道在商品分布中的排名 |
| `fit_outcome_label` | 可选，匹配结果事后验证标签 |
| `sample_size` | 样本量 |
| `raw_metrics` | 其他来源指标 |
| `source_id` / `source_batch_id` / `data_version` / `source_type` | 来源与版本 |
| `quality_flags` | 质量标记 |

替代现有表：`wide_table_row` 的商品渠道销售部分、`douyin_product_account_fit.sales_rank` / `sales_volume` 中可视为事实观测的部分。

## 旧表去向

### 建议替换或废弃

| 当前表 | 去向 | 说明 |
|---|---|---|
| `sku` | 替换为 `product_master` | 当前混合 demo、smoke SKU，不适合作长期商品主档 |
| `channel_profile` | 拆入 `channel_entity_master`、`channel_profile_fact`、`channel_sales_fact` | 当前同时承载实体、画像、表现指标 |
| `channel_entity` | 替换为 `channel_entity_master` | 当前是投影表，后续主数据表应成为实体主档 |
| `wide_table_row` | 替换为 join view 或训练视图 | 不作为源表保存，改由事实表生成 |
| `douyin_account` | 迁入 `channel_entity_master` | 抖音账号变成通用渠道实体 |
| `douyin_account_benchmark_tag` | 迁入 `channel_profile_fact` | benchmark 字段保留为 fact 扩展 |
| `douyin_product` | 迁入 `product_master`、`product_sales_fact`、`product_profile_fact` | 商品属性、表现、画像拆开 |
| `douyin_summary_metric` | 迁入 `channel_sales_fact` 或数据包 summary view | 需按 metric 归属判断 |

### 建议降级为派生产物或过渡兼容

| 当前表 | 去向 | 说明 |
|---|---|---|
| `douyin_product_account_fit` | 不作为源事实表长期保留 | 历史 fit 结果可迁入 `match_result` 或作为 legacy derived input |
| `douyin_comparison_dimension` | 迁入 `match_result` 解释层或独立 match explanation 表 | 属于匹配解释，不是主数据 |
| `douyin_adjustment_advice` | 迁入经营飞轮建议 / action draft | 属于建议派生产物 |
| `douyin_account_report` | 保留为来源报告附件或 report artifact | 不进入 3+5 核心源表 |
| `*_latest` views | 按新表重建 | latest 是查询投影，不是源数据 |

### 必须保留或另行重构

| 当前表 | 原因 |
|---|---|
| `workspace` | 工作区边界 |
| `data_source` | 数据源注册 |
| `batch` / `data_import_job` | 导入批次和任务 |
| `schema_migration` | schema 迁移 |
| `audit_event` / `db_admin_audit` | 业务审计和数据库维护审计 |
| `idempotency_key` | 写接口幂等缓存 |
| `task` | 异步任务运行时 |
| `prediction` / `new_product_prediction` | 模型预测结果 |
| `match_result` / `match_result_latest` | 人货匹配结果 |
| `decision_record` / `action_record` / `feedback_record` / `strategy_review` | 经营飞轮闭环 |

## 能否支撑现有产品

### 可以支撑

新 3+5 模型可以支撑以下产品主路径：

| 模块 | 支撑方式 |
|---|---|
| 数据管理 | 通过 source、batch、version、quality 字段追踪导入 |
| 商品人群 | `product_master` + `product_profile_fact` + `product_sales_fact` |
| 渠道人群 | `channel_entity_master` + `channel_profile_fact` + `channel_sales_fact` |
| 人货匹配输入 | `product_profile_fact` + `channel_profile_fact` |
| 人货匹配回测 | `product_channel_sales_fact` |
| 新品预测输入 | `product_master` |
| 经营飞轮反馈 | `product_channel_sales_fact` 可作为反馈事实来源之一 |

### 不能单独支撑

新 3+5 模型不能替代以下能力：

| 能力 | 仍需表 |
|---|---|
| 模型预测历史 | `prediction`、`new_product_prediction` |
| 匹配结果和解释 | `match_result` 或后续 match explanation 表 |
| 决策、行动、反馈、复盘流程 | flywheel runtime tables |
| 导入任务状态和数据库审计 | `data_import_job`、`db_admin_audit` |
| 异步任务和幂等 | `task`、`idempotency_key` |

## 迁移策略

### 阶段一：新增通用表

新增 3+5 表，不立即删除旧表。导入 adapter 同时写入新通用表，旧 API 继续读旧表或兼容 view。

验收：

- 空库 migration 通过。
- 导入 demo / douyin-bi 后，新表有可查询数据。
- 旧页面不回退。

### 阶段二：建立兼容 view

用新表生成兼容投影：

| 兼容 view | 来源 |
|---|---|
| `sku_compat` | `product_master` |
| `channel_profile_compat` | `channel_entity_master` + `channel_profile_fact` + `channel_sales_fact` |
| `wide_table_row_compat` | `product_master` + profile facts + sales facts |
| `channel_entity_latest` | `channel_entity_master` |

验收：

- `/products`、`/channels`、`/matches`、`/channel-entities` 可逐步切到 compat view。
- M 域 contract test 可从新 view 或新 API 输入运行。

### 阶段三：迁移 API 主路径

前后端主路径改读新表或新 view。抖音专用 API 不再承担产品主流程，可保留为 legacy inspection。

验收：

- 商品人群、渠道人群、人货匹配、新品预测、经营飞轮主流程都不依赖 `douyin_*` 源表。
- 历史 dataVersion 查询仍可用。

### 阶段四：清理旧表

在 X 总控验收后，旧表才能通过受控 Admin API 清理。不得手工删除 SQLite 文件或绕过 audit。

清理候选：

- `sku`
- `channel_profile`
- `channel_entity`
- `wide_table_row`
- `douyin_account`
- `douyin_account_benchmark_tag`
- `douyin_product`
- `douyin_summary_metric`
- 后续确认不再需要的 `douyin_*` derived tables

## 示例

商品销售数据导入：

```text
业务系统导出商品销售聚合表
-> data_import_job 记录导入
-> product_master upsert 商品主档
-> product_sales_fact 写入商品销售表现
-> 如有渠道字段，同时写入 product_channel_sales_fact
```

商品人群画像导入：

```text
业务系统导出商品画像聚合表
-> 校验 tag_id 是否存在于 profile_tag_master
-> product_profile_fact 写入每个 product + tag + timeWindow 的观测
-> 未映射字段进入 unmapped 或 quality report
```

渠道人群画像导入：

```text
业务系统导出店铺 / 账号画像聚合表
-> channel_entity_master upsert 渠道实体
-> channel_profile_fact 写入每个 channel entity + tag + timeWindow 的观测
```

人货匹配训练视图：

```text
product_master
+ product_profile_fact
+ channel_entity_master
+ channel_profile_fact
+ product_channel_sales_fact
-> product_channel_training_view
```

## 注意事项

- `product_channel_sales_fact` 是本设计中最容易被低估的表，但它决定人货匹配能否被业务事实验证。
- `profile_tag_master` 不等于模型 segment 模板；segment 是模型层派生概念，tag 是数据层标准概念。
- 抖音字段不应继续作为长期 schema 主轴；抖音只是一个 source，通用表才是产品主路径。
- 旧表清理必须另开任务，并经过 dry run、快照、confirmText、admin token、Idempotency-Key 和 `db_admin_audit`。
- 本文不冻结具体 SQL DDL；字段名、类型、索引和约束需在 A 域 migration 任务中进一步细化并回流 X 总控复核。
