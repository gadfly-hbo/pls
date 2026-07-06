# 渠道画像 2.0 产品规划

> 持有：X 总控  
> 状态：P6 总控契约冻结  
> 最近更新：2026-07-06

## 1. 目的

渠道画像 2.0 将当前单一 `channel/account` 画像视图升级为可长期维护的对象库，用于支持更细粒度的人货匹配分析。

第一期核心问题：

1. 这个渠道实体的人群是谁。
2. 这个渠道实体适合卖什么商品。

第一期不覆盖流量画像、转化画像和运营约束，但数据对象允许预留扩展槽。

本文件是 D/M/A/V 后续 P6 渠道画像任务的共同契约。涉及数据模板、匹配公式、API/schema 或 UI 展示边界时，以本文冻结口径为准；如需突破，必须回流 X 总控评审。

## 2. 对象体系

渠道画像对象库包含 6 类对象：

| 模块 | 对象类型 | 是否长期维护 | 说明 |
|---|---|---:|---|
| 平台 | `ChannelEntity` | 是 | 仅线上平台，例如天猫、抖音、京东、视频号 |
| 商圈 | `ChannelEntity` | 是 | 线下商业体周围 3-5 公里，例如万达、龙湖天街、知名步行街 |
| 店铺 | `ChannelEntity` | 是 | 产品导航统一叫店铺，内部区分线上店铺和线下门店 |
| 账号 | `ChannelEntity` | 是 | 内容电商、直播或视频账号，例如抖音账号、视频号账号 |
| 活动 | `MarketingEvent` | 是 | 平台大促、传统假日、品牌造节 |
| 场景 | `BusinessScenario` | 是 | 新品首发、会员复购等业务场景 |

### 2.1 层级关系

线上层级冻结为：

```text
平台
  -> 线上店铺
      -> 账号
```

线下层级冻结为：

```text
商圈
  -> 线下门店
```

活动和场景可绑定任意渠道实体，但不改变实体归属层级。

第一期不单独建 `livestream_room` 或 `content_account` 实体类型。直播、短视频、图文等能力放入账号字段，例如 `contentFormats`。

兼容口径：既有 P2 文档和存量投影中出现的 `livestream_room`、`content_account` 不立即删除，也不要求迁移历史数据；P6 新增对象库、导入模板、API 和 UI 的第一期主路径必须收敛到 `account`，并通过 `contentFormats` / `accountKind` 保留来源差异。

### 2.2 关键字段规则

商圈：

```text
defaultRadiusKm = 3
configurableRadiusKm = 1-5
recommendedMaxRadiusKm = 5
radiusSource = default | user_config | imported_source
```

超过建议半径时不默认拒绝，但必须标记 `radius_above_recommended_max`。

店铺：

```text
storeType = online_shop | offline_store
online_shop parent = Platform
offline_store parent = TradeArea
```

账号：

```text
platformId = required
parentStoreId = optional
bindingStatus = unbound | bound_to_store | bound_to_brand
contentFormats = live | short_video | video | graphic | mixed
```

活动：

```text
eventType = platform_promotion | traditional_holiday | brand_event
customTags = string[]
```

场景：

```text
scenarioType =
  new_product_launch
  member_repurchase
  inventory_clearance
  hero_product_boost
  regional_test
  daily_replenishment
displayName = string
description = optional string
```

## 3. 画像范围

第一期只展示并参与匹配两组画像。

### 3.1 AudienceProfile

人群画像用于描述渠道实体的人群结构。

建议字段组：

- demographics：性别、年龄、城市等级、消费力。
- interestPreferences：兴趣、风格、品类偏好。
- membershipSignals：会员特征，可为空。
- source、sampleSize、timeWindow、confidence、qualityFlags。

### 3.2 ProductFitProfile

商品适配用于描述渠道实体适合承接的商品类型。

建议字段组：

- fitCategories：适合品类。
- fitPriceBands：适合价格带。
- fitStyles：适合风格。
- fitOccasions：适合场景。
- fitLaunchTypes：适合上新类型。
- evidence、confidence、qualityFlags。

商品适配来源优先级：

```text
1. user_imported
2. derived_from_performance
3. manual_config
```

多来源同时存在时，用于匹配的 `activeProductFitProfile` 必须唯一。

## 4. 匹配影响

第一期商品适配直接参与商品 × 渠道实体匹配，但权重低于人群画像：

```text
baseScore = 0.7 * audienceFit + 0.3 * productFit
```

如果渠道实体缺少 `ProductFitProfile`：

```text
matchScore = audienceFit
qualityFlags += ["missing_product_fit_profile"]
```

活动和场景参与权重调节，不生成独立分数：

```text
contextAdjustedScore = baseScore * contextWeightAdjustments
```

报告和 UI 必须说明排序受活动或场景权重调节影响。

## 5. 对象库功能范围

第一期支持：

- 对象库列表。
- 对象详情。
- 搜索和筛选。
- 轻量编辑。
- 绑定关系维护。
- 来源、版本、质量标记展示。

第一期不做：

- 批量删除。
- 自动合并。
- 复杂权限。
- 版本回滚。
- 对象治理工作流。
- 可视化建模器。
- 流量画像、转化画像、运营约束展示。

创建规则：

- 活动、场景允许手动新建。
- 平台、商圈、店铺、账号以导入生成优先，允许手动补充基础信息，不鼓励纯手建。
- 纯手建渠道实体必须标记 `manual_entity_without_profile`。

组合渠道包第一期只作为分析视图，不作为长期对象落库。

```text
ChannelAnalysisView
  selectedChannelEntityIds[]
  selectedMarketingEventId?
  selectedBusinessScenarioId?
  skuIds[]
  generatedMatchResults[]
```

## 6. 导入策略

第一期采用统一导入入口，用户选择导入目标类型。

```text
targetObjectType =
  platform
  trade_area
  store
  account
  marketing_event
  business_scenario
```

支持两类模板：

1. 基础模板：单目标类型导入。
2. 高级模板：渠道画像对象包导入。

高级模板可包含：

- 多类对象。
- 父子层级。
- 活动和场景绑定关系。
- 人群画像。
- 商品适配。
- 质量报告。

导入必须走：

```text
dry-run preview -> quality report -> confirm import -> audit
```

跨 sheet 引用缺失时标记 `missing_parent_reference`，不得静默补造父对象。

## 7. 版本与 ID

所有对象和画像记录保留历史版本，第一期 UI 默认只看 latest。

对象必须带：

```text
canonicalObjectKey
objectVersionId
dataVersion
timeWindow
generatedAt
sourceBatchId
```

ID 规则：

```text
canonicalObjectKey = objectType + ":" + sourceStableKey
objectVersionId = workspaceId + ":" + objectType + ":" + sourceStableKey + ":" + dataVersion
```

`sourceStableKey` 生成优先级：

1. 导入文件显式提供。
2. 来源系统 ID 或业务编码。
3. 系统按名称和父级对象生成 slug。

必须记录：

```text
keySource = provided | source_system_id | generated_from_name
```

当 `keySource = generated_from_name` 时，标记 `generated_key_needs_review`。改名不自动改变 canonical key。

## 8. 重复治理

第一期不做自动合并，只做重复风险提示和人工标记。

```text
possible_duplicate
duplicateCandidateKeys[]
manualReviewStatus =
  unreviewed
  confirmed_duplicate
  confirmed_distinct
  needs_more_data
```

导入 confirm 仍只按 `sourceStableKey` 幂等，不因疑似重复而自动合并。

## 9. 第一期开工任务

建议拆分：

1. X-P6-CHANNEL-0：渠道画像 2.0 总控契约冻结。
2. D-P6-CHANNEL-1：对象库导入模板与质量报告。
3. M-P6-CHANNEL-2：匹配算法加入商品适配与活动/场景权重。
4. A-P6-CHANNEL-3：对象库 API、schema、import、latest view。
5. V-P6-CHANNEL-4：对象库列表、详情、轻量编辑、导入入口与分析视图。

第一期验收：

- 能维护六类对象库。
- 能导入基础模板和高级对象包。
- 能查看 latest 版本的人群画像与商品适配。
- 能用活动/场景调节匹配排序。
- 能生成商品 × 渠道实体 × 活动/场景的分析视图。
- 不做自动合并、不做完整 CRUD、不做流量/转化/运营约束。

## 10. 下游任务边界

### 10.1 D-P6-CHANNEL-1

必须读取：

- `docs/channel-profile-2.0-plan.md`
- `docs/data-spec.md`
- `docs/p2-2-product-channel-schema.md`
- `docs/tools-module-design.md`

验收口径：

- 基础模板覆盖 6 类对象。
- 高级对象包覆盖对象、层级、绑定、人群画像、商品适配和质量报告。
- 字段必须保留 source、sampleSize、timeWindow、confidence、dataVersion、sourceBatchId。
- 质量报告必须覆盖 `missing_parent_reference`、`generated_key_needs_review`、`manual_entity_without_profile`、`possible_duplicate`。
- 不新增 taxonomy tagId，不自动合并重复对象，不把活动/场景当作渠道实体。

### 10.2 M-P6-CHANNEL-2

必须读取：

- `docs/channel-profile-2.0-plan.md`
- `docs/model-plan.md`
- `docs/model-p2-5-product-channel-fit-contract.md`
- `docs/model-p2-8-new-product-prediction-contract.md`

验收口径：

- 输出 `audienceFit`、`productFit`、`baseScore`、`contextAdjustedScore` 的 contract。
- 固定第一期权重：`0.7 * audienceFit + 0.3 * productFit`。
- 缺少 `ProductFitProfile` 时降级为 `audienceFit`，并输出 `missing_product_fit_profile`。
- 活动/场景只能调节权重和 drivers，不生成独立 `eventScore` 或 `scenarioScore`。
- 至少覆盖有商品适配、缺商品适配、新品首发、会员复购、传统假日、平台大促场景。

### 10.3 A-P6-CHANNEL-3

必须读取：

- `docs/channel-profile-2.0-plan.md`
- `docs/api-contract.md`
- `docs/pipeline-design.md`
- `docs/p3-db-schema-migration-contract.md`
- `docs/tools-module-design.md`
- 真实 `apps/server/src/routes/` 与 schema / import runner

验收口径：

- API/schema 支持 ChannelEntity、MarketingEvent、BusinessScenario、AudienceProfile、ProductFitProfile 和 Binding。
- 支持 canonicalObjectKey、objectVersionId、dataVersion、sourceBatchId、latest view。
- 统一导入入口必须支持基础模板和高级对象包的 dry-run、quality report、confirm import、audit。
- 写操作保持 workspace 隔离、admin token、Idempotency-Key、confirmText、db_admin_audit。
- 不破坏现有 `/channels` 与 `/channels/entities` 兼容路径。
- 会写入 workspace 的 smoke 必须使用独立临时 workspace。

### 10.4 V-P6-CHANNEL-4

必须读取：

- `docs/channel-profile-2.0-plan.md`
- `docs/ui-flow.md`
- `docs/api-contract.md`
- `apps/web/src/services/api.ts`
- 现有渠道 / 工具工作台组件

验收口径：

- 对象库导航覆盖平台、商圈、店铺、账号、活动、场景。
- 列表和详情默认展示 latest，并透出版本、sourceBatchId 和 qualityFlags。
- 详情只默认展示 AudienceProfile 与 ProductFitProfile；流量、转化、运营约束不得暗示已完成。
- 轻量编辑覆盖名称、说明、商圈半径、活动二级标签、场景说明、绑定关系。
- 分析视图可临时选择多个渠道实体 + 活动 + 场景，不把组合渠道包作为长期对象落库。
- Mock 与真实 API 响应必须同构；移动端和窄屏不得出现文本或控件重叠。
