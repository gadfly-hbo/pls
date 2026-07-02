# PLS 数据规格 v0.1

> 归属：D 数据画像  
> 状态：P0 草案  
> 最近更新：2026-07-03

## 1. 目的

本文定义 P0 阶段训练数据的核心结构，让任一历史 SKU 可以表示为：

```text
SKU_ID + 商品DNA + 真实画像标签分布 + 销售表现
```

2026-07-03 口径修订：PLS 是业务 BI 系统。用户给到 PLS、要求导入或要求产品化的数据默认放行，可保留原始字段和值。本文只定义训练宽表、画像标签、渠道画像等模型/报表对象的结构要求；脱敏、聚合、抽样和指数化仅在模型、图表或用户明确要求时执行，不作为隐私准入门禁。

依赖文档：

- `docs/profile-taxonomy-v0.md`
- `docs/data-safety-policy.md`

## 2. 数据边界

### 2.1 可进入本规格的数据

| 数据 | 粒度 | 要求 |
|---|---|---|
| 商品基础信息 | SKU 级或用户提供粒度 | 保留业务字段和值；按模型需要派生商品 DNA |
| 历史销售表现 | 明细或 SKU + channel + timeWindow | 可直接使用；训练宽表需要时再派生销量、GMV、价格、转化、退货等统计特征 |
| DMP 画像 | 原始导出、明细或聚合 | 可直接使用；画像标签视图需要时再映射为 `ProfileTagScore` |
| 渠道画像 | 账号、渠道、用户或时间窗口粒度 | 可直接使用；热力图需要时再派生 channel/account 级画像 |
| 数据质量报告 | batch 级 | 输出缺失率、覆盖率、异常统计和未映射字段 |

### 2.2 不再作为隐私准入门禁的数据

用户级、订单级、会员级、设备级、账号级记录，手机号、姓名、地址、订单号、会员 ID、平台 open id、广告 ID、设备 ID，平台 DMP 原始导出、人群包成员、ID 包，以及真实商品企划、成本、投流预算、首单量和价格策略，均不再触发 agent 自动拦截。是否进入某个模型对象，只由产品功能、字段契约和用户当次授权决定。

## 3. 通用对象

### 3.1 `ProfileTagScore`

所有画像标签分布必须使用统一结构，`tagId` 必须来自 `docs/profile-taxonomy-v0.md`。

```json
{
  "tagId": "style.minimal",
  "score": 0.72,
  "confidence": 0.64,
  "source": "mock_dmp_aggregate",
  "sampleSize": 1200,
  "timeWindow": "2026-05-01/2026-06-30"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `tagId` | string | 是 | 内部画像标签 ID |
| `score` | number | 是 | 标签强度或占比，范围 `0-1` |
| `confidence` | number | 是 | 映射或统计置信度，范围 `0-1` |
| `source` | string | 是 | 数据来源、导入批次或生成方式 |
| `sampleSize` | number | 条件必填 | 聚合画像或统计画像建议提供；明细、mock 或预测数据可为空 |
| `timeWindow` | string | 条件必填 | 聚合画像或统计画像建议提供，格式为 `YYYY-MM-DD/YYYY-MM-DD` |

### 3.2 `DataLineage`

跨域使用的数据对象必须能追溯来源。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `source` | string | 是 | 例如 `mock_sales_aggregate`、`tmall_dmp_aggregate` |
| `sourceType` | enum | 是 | `mock`、`user_authorized`、`sanitized_aggregate`、`manual_mapping`、`derived` |
| `batchId` | string | 是 | 导入或生成批次 ID，可使用业务批次名 |
| `timeWindow` | string | 条件必填 | 数据统计窗口；明细型导入可为空 |
| `sampleSize` | number | 条件必填 | 聚合样本量，例如订单数、买家数或曝光样本数；明细型导入可为空 |
| `generatedAt` | string | 是 | ISO 8601 时间戳 |

## 4. 历史 SKU 训练宽表

### 4.1 表定位

训练宽表是 M 域训练和回测的主输入。P0 推荐一行代表一个历史 SKU 在一个渠道、一个时间窗口内的表现；如源数据是用户授权明细，D 域可先按该 grain 派生训练特征。

```text
grain = skuId + channelId + timeWindow
```

如某 SKU 跨多个渠道销售，应拆成多行；如需要全渠道汇总，可额外生成 `channelId = "all_channels"` 的聚合行。

### 4.2 字段分组

| 分组 | 目的 |
|---|---|
| Identity | 定义 SKU、渠道、时间窗口和数据来源 |
| ProductDNA | 描述商品可解释特征 |
| ProfileLabels | 表示真实画像标签分布 |
| SalesPerformance | 表示聚合销售表现 |
| Quality | 表示样本可信度和可用状态 |

### 4.3 字段定义

**Identity**

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `skuId` | string | 是 | `mock_sku_001` | SKU ID，可为真实业务 ID 或 mock ID |
| `spuId` | string | 否 | `mock_spu_001` | SPU ID，可为真实业务 ID 或 mock ID |
| `channelId` | string | 是 | `mock_tmall_store` | 渠道或账号 ID，可为真实业务 ID 或 mock ID |
| `channelType` | enum | 是 | `shelf_ecommerce` | 见 7.2 |
| `categoryLv1` | string | 是 | `apparel` | 一级类目 |
| `categoryLv2` | string | 是 | `dress` | 二级类目 |
| `season` | enum | 是 | `spring_summer` | 商品季节 |
| `timeWindow` | string | 是 | `2026-05-01/2026-06-30` | 聚合统计窗口 |
| `source` | string | 是 | `mock_sales_aggregate` | 数据来源 |
| `sourceType` | enum | 是 | `mock` | 见 `DataLineage.sourceType` |
| `batchId` | string | 是 | `batch_mock_20260701` | 批次 ID |
| `generatedAt` | string | 是 | `2026-07-01T00:00:00Z` | 宽表生成时间 |

**ProductDNA**

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `titleTokens` | string[] | 否 | `["minimal", "commute"]` | 商品标题关键词 |
| `styleKeywords` | string[] | 是 | `["minimal", "commute"]` | 商品风格关键词 |
| `colorFamily` | enum | 是 | `neutral` | 主色系 |
| `fitType` | enum | 否 | `regular` | 版型 |
| `fabricType` | enum | 否 | `cotton_blend` | 面料大类 |
| `patternType` | enum | 否 | `solid` | 图案大类 |
| `sleeveType` | enum | 否 | `short_sleeve` | 袖型或结构特征 |
| `lengthType` | enum | 否 | `midi` | 长度特征 |
| `priceBand` | enum | 是 | `mid` | 价格带；真实定价可在 BI 视图或业务字段中保留 |
| `launchType` | enum | 否 | `new_arrival` | 上新类型 |
| `imageFeatureSummary` | object | 否 | `{ "hasModel": true }` | 商品图特征摘要；原图可按产品功能另行存储或展示 |
| `mappedProductTags` | `ProfileTagScore[]` | 是 | `[]` | 从商品 DNA 映射出的内部标签；D 域预计算，M 域校验和缺失回填 |

**ProfileLabels**

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `buyerProfileTags` | `ProfileTagScore[]` | 是 | `[]` | 成交人群画像标签分布 |
| `viewerProfileTags` | `ProfileTagScore[]` | 否 | `[]` | 浏览或曝光人群画像标签分布 |
| `cartProfileTags` | `ProfileTagScore[]` | 否 | `[]` | 加购或收藏人群画像标签分布 |
| `labelSource` | string | 是 | `mock_dmp_aggregate` | 标签来源 |
| `labelSampleSize` | number | 是 | `1200` | 画像样本量 |
| `labelTimeWindow` | string | 是 | `2026-05-01/2026-06-30` | 标签统计窗口 |
| `unmappedTags` | object[] | 是 | `[]` | 未映射 DMP 字段摘要，可保留业务字段和值 |

总控决策：P0 默认以 `buyerProfileTags` 作为训练标签主目标，不强制要求三层画像齐备。若上游已提供 `viewerProfileTags` 或 `cartProfileTags`，应保留用于后续分层建模和误差分析；若缺失，不阻塞 P0 训练宽表。

**SalesPerformance**

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `salesUnits` | number | 是 | `860` | 聚合销量 |
| `gmvIndex` | number | 是 | `0.76` | GMV 指数，范围 `0-1`；真实金额可作为业务 BI 字段保留 |
| `avgSellingPriceBand` | enum | 否 | `mid` | 成交均价区间，使用 `value`、`mid`、`premium`；真实均价可作为业务 BI 字段保留 |
| `conversionRate` | number | 否 | `0.034` | 支付转化率，范围 `0-1` |
| `returnRate` | number | 否 | `0.08` | 退货率，范围 `0-1` |
| `sellThroughRate` | number | 否 | `0.62` | 售罄率，范围 `0-1` |
| `promotionIntensity` | enum | 否 | `low` | `none`、`low`、`medium`、`high` |
| `trafficIndex` | number | 否 | `0.71` | 流量指数，范围 `0-1` |

**Quality**

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `sampleSize` | number | 是 | `1200` | 该宽表行的聚合样本量 |
| `profileCoverageRate` | number | 是 | `0.92` | 可映射画像标签覆盖率，范围 `0-1` |
| `missingFieldRate` | number | 是 | `0.04` | 关键字段缺失率，范围 `0-1` |
| `lowConfidenceTagCount` | number | 是 | `2` | `confidence < 0.55` 的标签数 |
| `isTrainable` | boolean | 是 | `true` | 是否可进入训练集 |
| `qualityFlags` | string[] | 是 | `[]` | 例如 `low_sample_size`、`low_mapping_coverage` |

### 4.4 JSONL 示例

以下为 mock 示例，可进入文档和 prompt。

```json
{
  "skuId": "mock_sku_001",
  "spuId": "mock_spu_001",
  "channelId": "mock_tmall_store",
  "channelType": "shelf_ecommerce",
  "categoryLv1": "apparel",
  "categoryLv2": "dress",
  "season": "spring_summer",
  "timeWindow": "2026-05-01/2026-06-30",
  "source": "mock_sales_aggregate",
  "sourceType": "mock",
  "batchId": "batch_mock_20260701",
  "generatedAt": "2026-07-01T00:00:00Z",
  "styleKeywords": ["minimal", "commute"],
  "colorFamily": "neutral",
  "fitType": "regular",
  "fabricType": "cotton_blend",
  "patternType": "solid",
  "priceBand": "mid",
  "launchType": "new_arrival",
  "mappedProductTags": [
    {
      "tagId": "style.minimal",
      "score": 0.78,
      "confidence": 0.72,
      "source": "manual_product_mapping",
      "sampleSize": 1200,
      "timeWindow": "2026-05-01/2026-06-30"
    }
  ],
  "buyerProfileTags": [
    {
      "tagId": "demo.age_25_34",
      "score": 0.81,
      "confidence": 0.86,
      "source": "mock_dmp_aggregate",
      "sampleSize": 1200,
      "timeWindow": "2026-05-01/2026-06-30"
    },
    {
      "tagId": "style.minimal",
      "score": 0.74,
      "confidence": 0.7,
      "source": "mock_dmp_aggregate",
      "sampleSize": 1200,
      "timeWindow": "2026-05-01/2026-06-30"
    }
  ],
  "viewerProfileTags": [],
  "cartProfileTags": [],
  "labelSource": "mock_dmp_aggregate",
  "labelSampleSize": 1200,
  "labelTimeWindow": "2026-05-01/2026-06-30",
  "unmappedTags": [],
  "salesUnits": 860,
  "gmvIndex": 0.76,
  "avgSellingPriceBand": "mid",
  "conversionRate": 0.034,
  "returnRate": 0.08,
  "sellThroughRate": 0.62,
  "promotionIntensity": "low",
  "trafficIndex": 0.71,
  "sampleSize": 1200,
  "profileCoverageRate": 0.92,
  "missingFieldRate": 0.04,
  "lowConfidenceTagCount": 0,
  "isTrainable": true,
  "qualityFlags": []
}
```

## 5. DMP 画像导入与标签映射格式

### 5.1 输入原则

DMP 导入文件可使用用户授权的原始导出、明细、人群包或聚合标签分布。若要进入 `ProfileTagScore` 标签视图，需要按下列推荐 grain 映射为标签分布；无法映射的字段进入 `unmappedTags`，不因字段形态被隐私拦截。

推荐粒度：

```text
grain = entityType + entityId + profileStage + tagId + timeWindow
```

其中 `entityType` 可为 `sku` 或 `channel`；`profileStage` 用于区分画像来源阶段。

### 5.2 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `entityType` | enum | 是 | `sku` | `sku`、`channel` |
| `entityId` | string | 是 | `mock_sku_001` | 业务 ID 或 mock ID |
| `profileStage` | enum | 是 | `buyer` | `viewer`、`cart`、`buyer`、`channel_audience` |
| `sourceField` | string | 是 | `age_band` | DMP 字段名 |
| `sourceValue` | string | 是 | `25-34` | 字段值或映射后的枚举值 |
| `mappedTagId` | string | 是 | `demo.age_25_34` | 内部 `tagId` |
| `score` | number | 是 | `0.81` | 标签占比或强度，范围 `0-1` |
| `confidence` | number | 是 | `0.86` | 映射置信度，范围 `0-1` |
| `sampleSize` | number | 条件必填 | `1200` | 聚合标签样本量；明细映射或单条对象可为空 |
| `timeWindow` | string | 是 | `2026-05-01/2026-06-30` | 统计窗口 |
| `source` | string | 是 | `mock_dmp_aggregate` | 来源 |
| `mappingRuleId` | string | 是 | `rule_age_band_v1` | 映射规则 ID |
| `mappingNote` | string | 否 | `direct age band mapping` | 映射说明 |

### 5.3 CSV 示例

```csv
entityType,entityId,profileStage,sourceField,sourceValue,mappedTagId,score,confidence,sampleSize,timeWindow,source,mappingRuleId,mappingNote
sku,mock_sku_001,buyer,age_band,25-34,demo.age_25_34,0.81,0.86,1200,2026-05-01/2026-06-30,mock_dmp_aggregate,rule_age_band_v1,direct age band mapping
sku,mock_sku_001,buyer,style_preference,commute_basic,style.minimal,0.74,0.70,1200,2026-05-01/2026-06-30,mock_dmp_aggregate,rule_style_v1,semantic mapping
```

### 5.4 未映射字段

无法解释或置信度不足的 DMP 字段必须进入 `unmappedTags`，不得强行映射到错误标签。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `entityType` | enum | 是 | `sku`、`channel` |
| `entityId` | string | 是 | 业务 ID 或 mock ID |
| `sourceField` | string | 是 | 原字段名 |
| `sourceValue` | string | 是 | 原字段值或映射枚举值 |
| `sampleSize` | number | 条件必填 | 聚合样本量；明细映射可为空 |
| `timeWindow` | string | 是 | 统计窗口 |
| `reason` | enum | 是 | `unknown_semantics`、`low_confidence`、`not_in_taxonomy` |

## 6. 商品基础属性字典

### 6.1 类目与季节

| 字段 | P0 枚举 |
|---|---|
| `categoryLv1` | `apparel` |
| `categoryLv2` | `dress`、`top`、`bottom`、`outerwear`、`set` |
| `season` | `spring_summer`、`fall_winter`、`all_season` |

### 6.2 商品 DNA 属性

| 字段 | P0 枚举 |
|---|---|
| `colorFamily` | `neutral`、`black_white`、`warm`、`cool`、`bright`、`dark`、`mixed` |
| `fitType` | `slim`、`regular`、`loose`、`oversized` |
| `fabricType` | `cotton`、`cotton_blend`、`knit`、`denim`、`chiffon`、`wool_blend`、`synthetic`、`unknown` |
| `patternType` | `solid`、`stripe`、`check`、`floral`、`graphic`、`texture`、`mixed` |
| `sleeveType` | `sleeveless`、`short_sleeve`、`long_sleeve`、`unknown` |
| `lengthType` | `short`、`regular`、`midi`、`long`、`unknown` |
| `priceBand` | `value`、`mid`、`premium` |
| `launchType` | `new_arrival`、`seasonal_refresh`、`core_basic`、`limited` |
| `promotionIntensity` | `none`、`low`、`medium`、`high` |

### 6.3 商品属性到标签的建议映射

| 商品字段 | 示例值 | 建议标签 | 说明 |
|---|---|---|---|
| `styleKeywords` | `minimal` | `style.minimal` | 直接语义映射 |
| `styleKeywords` | `commute` | `occasion.work` | 场景映射 |
| `styleKeywords` | `street` | `style.street` | 直接语义映射 |
| `styleKeywords` | `sport` | `style.sporty` | 直接语义映射 |
| `priceBand` | `value` | `price.value` | 价格带映射 |
| `priceBand` | `mid` | `price.mid` | 价格带映射 |
| `priceBand` | `premium` | `price.premium` | 价格带映射 |
| `launchType` | `new_arrival` | `price.new_arrival_sensitive`、`intent.try_new` | 新品敏感与尝鲜倾向 |

## 7. 渠道画像字段

### 7.1 渠道画像对象

渠道画像对象是当前热力图和匹配模型消费的 channel/account 级视图；源数据可为用户授权的明细、账号数据或聚合报表。

```json
{
  "channelId": "mock_douyin_live_001",
  "channelName": "Mock Douyin Live",
  "channelType": "live_stream",
  "timeWindow": "2026-05-01/2026-06-30",
  "sampleSize": 5000,
  "source": "mock_channel_aggregate",
  "generatedAt": "2026-07-01T00:00:00Z",
  "tags": [
    {
      "tagId": "channel.live_stream",
      "score": 0.91,
      "confidence": 0.9,
      "source": "mock_channel_aggregate",
      "sampleSize": 5000,
      "timeWindow": "2026-05-01/2026-06-30"
    }
  ],
  "qualityFlags": []
}
```

### 7.2 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---|---|
| `channelId` | string | 是 | `mock_douyin_live_001` | 渠道 ID，可为真实业务 ID 或 mock ID |
| `channelName` | string | 否 | `Mock Douyin Live` | 展示名，可使用用户授权的真实账号/渠道名称 |
| `channelType` | enum | 是 | `live_stream` | `shelf_ecommerce`、`short_video`、`live_stream`、`private_domain` |
| `platformType` | enum | 否 | `content_ecommerce` | `shelf_ecommerce`、`content_ecommerce`、`private_domain` |
| `timeWindow` | string | 是 | `2026-05-01/2026-06-30` | 统计窗口 |
| `sampleSize` | number | 条件必填 | `5000` | 渠道聚合样本量；明细视图可为空 |
| `source` | string | 是 | `mock_channel_aggregate` | 来源 |
| `generatedAt` | string | 是 | `2026-07-01T00:00:00Z` | 生成时间 |
| `tags` | `ProfileTagScore[]` | 是 | `[]` | 渠道画像标签分布 |
| `trafficIndex` | number | 否 | `0.68` | 流量指数，范围 `0-1` |
| `conversionIndex` | number | 否 | `0.54` | 转化指数，范围 `0-1` |
| `qualityFlags` | string[] | 是 | `[]` | 质量标记 |

## 8. 数据质量检查规则

### 8.1 宽表行级规则

| 规则 ID | 检查项 | 失败处理 |
|---|---|---|
| `dq_required_identity` | `skuId`、`channelId`、`timeWindow`、`source`、`sampleSize` 必填 | 标记 `isTrainable = false` |
| `dq_tag_score_range` | 所有 `score` 和 `confidence` 必须在 `0-1` | 标记异常标签并剔除该标签 |
| `dq_tag_taxonomy` | 所有 `tagId` 必须存在于标签体系 | 进入 `unmappedTags` |
| `dq_min_sample_size` | `sampleSize >= 100` | 标记 `low_sample_size` |
| `dq_mapping_coverage` | `profileCoverageRate >= 0.7` | 标记 `low_mapping_coverage` |
| `dq_time_window` | `timeWindow` 必须为闭合日期区间 | 标记 `invalid_time_window` |
| `dq_sales_non_negative` | 销量、GMV 指数、退货率等销售字段不得为负 | 标记 `invalid_sales_metric` |

### 8.2 批次级报告

每个导入批次必须输出以下汇总指标：

| 字段 | 说明 |
|---|---|
| `batchId` | 批次 ID |
| `rowCount` | 宽表行数 |
| `skuCount` | SKU 数 |
| `channelCount` | 渠道数 |
| `trainableRowRate` | 可训练行比例 |
| `avgSampleSize` | 平均样本量 |
| `profileCoverageRate` | 画像标签映射覆盖率 |
| `missingFieldRate` | 关键字段缺失率 |
| `unmappedFieldCount` | 未映射字段数 |
| `lowConfidenceMappingCount` | 低置信度映射数 |
| `qualityFlags` | 批次级质量标记 |

## 9. 与 M 域交接

M 域训练和回测可以直接消费以下内容：

- `ProductDNA` 字段作为特征输入。
- `buyerProfileTags` 作为 P0 主训练标签。
- `viewerProfileTags`、`cartProfileTags` 作为可选辅助标签。
- `SalesPerformance` 字段作为销量表现、转化表现和样本权重参考。
- `Quality` 字段用于训练集过滤、样本加权和误差分析。

P0 暂定训练集过滤建议：

- `isTrainable = true`
- `sampleSize >= 100`
- `profileCoverageRate >= 0.7`
- 至少 3 个有效 `buyerProfileTags`
- `confidence < 0.55` 的标签不作为主监督信号

## 10. 待确认问题

1. 不同平台 DMP 字段样例尚未提供，当前映射规则只定义通用结构。
2. 历史 SKU 商品字段样例尚未提供，当前商品 DNA 字典以服装 demo 场景为准。
