# PLS 画像标签体系 v0.1

> 归属：X 总控  
> 状态：P0 冻结草案  
> 最近更新：2026-07-01

## 1. 目的

本文定义 P0 阶段 D/M/A/V 共同使用的画像标签坐标系，避免数据、模型、API 和前端各自创造标签口径。

P0 决策：

- 首个 demo 场景固定为服装新品冷启动。
- P0 渠道先覆盖电商、内容电商和抖音类流量渠道；线下门店作为 P1 扩展。
- 标签体系先冻结 6 个维度、36 个核心标签，保留后续扩展到多层级 taxonomy 的空间。
- 所有 DMP、商品预测和渠道画像都必须映射到本文的 `tagId` 后再跨域流转。

## 2. 使用方式

### 2.1 标签标识

每个标签使用稳定的 `tagId`：

```text
<dimension>.<tag>
```

示例：

- `demo.age_25_34`
- `style.minimal`
- `price.mid`
- `intent.gift`
- `channel.short_video`

标签分数统一使用 `0-1` 小数表达。跨域对象中的画像字段必须使用如下最小结构：

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

字段约束：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `tagId` | 是 | 必须来自本文标签表 |
| `score` | 是 | 标签强度或占比，范围 `0-1` |
| `confidence` | 是 | 映射、预测或统计置信度，范围 `0-1` |
| `source` | 是 | 数据来源或生成方式 |
| `sampleSize` | 条件必填 | 聚合画像建议提供，预测结果可为空 |
| `timeWindow` | 条件必填 | 聚合画像建议提供，预测结果可为空 |

### 2.2 跨域使用规则

| 域 | 使用规则 |
|---|---|
| D 数据画像 | 所有 DMP 字段、历史 SKU 真实画像和渠道画像必须映射成 `tagId + score + confidence` |
| M 模型预测 | 预测输出 Top 标签、人群包和匹配原因只能引用本文 `tagId` |
| A 应用后端 | API 和存储对象不得暴露自造标签字段；未知标签进入 `unmappedTags` |
| V 前端决策 | 展示层可以使用中文名和分组，但数据层必须保留 `tagId` |

## 3. P0 标签表

### 3.1 人群基础 `demo`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `demo.age_18_24` | 18-24 岁 | 学生、新职场、年轻潮流消费 |
| `demo.age_25_34` | 25-34 岁 | 主力职场、品质升级消费 |
| `demo.age_35_44` | 35-44 岁 | 成熟家庭、稳定复购消费 |
| `demo.age_45_plus` | 45 岁以上 | 成熟客群、舒适与信任偏好 |
| `demo.female` | 女性倾向 | 女性购买或使用倾向更高 |
| `demo.male` | 男性倾向 | 男性购买或使用倾向更高 |
| `demo.city_high_tier` | 高线城市 | 一二线、新一线或高消费力城市 |
| `demo.city_lower_tier` | 下沉市场 | 三线及以下或价格敏感区域 |

### 3.2 风格偏好 `style`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `style.minimal` | 简约通勤 | 低装饰、干净版型、日常职场 |
| `style.trendy` | 潮流个性 | 设计感、流行元素、社交表达 |
| `style.sweet` | 甜美少女 | 柔和、可爱、年轻女性化 |
| `style.elegant` | 优雅轻熟 | 精致、成熟、质感表达 |
| `style.sporty` | 运动休闲 | 舒适、机能、户外或运动场景 |
| `style.street` | 街头中性 | 宽松、中性、街头文化 |
| `style.luxury` | 高级质感 | 面料、剪裁、品牌感驱动 |
| `style.basic` | 基础百搭 | 低风险、易搭配、常青款 |

### 3.3 价格与价值 `price`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `price.value` | 高性价比 | 对折扣、到手价、组合优惠敏感 |
| `price.mid` | 中端主流 | 接受主流价格，重视平衡 |
| `price.premium` | 高客单 | 接受更高价格，重视品质和品牌 |
| `price.promo_sensitive` | 促销敏感 | 大促、券、满减驱动明显 |
| `price.new_arrival_sensitive` | 上新敏感 | 愿意为新品、首发、限量提前购买 |

### 3.4 场景与需求 `occasion`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `occasion.work` | 通勤职场 | 上班、会议、商务休闲 |
| `occasion.daily` | 日常出街 | 通用生活场景 |
| `occasion.party` | 聚会社交 | 约会、聚会、内容拍摄 |
| `occasion.travel` | 旅行度假 | 出游、拍照、轻户外 |
| `occasion.home` | 居家舒适 | 家居、轻松、舒适优先 |
| `occasion.seasonal` | 季节功能 | 防晒、保暖、换季、节令需求 |

### 3.5 购买意图 `intent`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `intent.self_use` | 自用 | 为自己购买 |
| `intent.gift` | 送礼 | 礼赠、节日、关系表达 |
| `intent.outfit_match` | 搭配补全 | 为搭配已有单品或套装购买 |
| `intent.repeat_purchase` | 复购替换 | 基础款、常穿款、消耗性替换 |
| `intent.try_new` | 尝鲜种草 | 被内容、达人、趋势驱动试买 |

### 3.6 渠道触点 `channel`

| `tagId` | 中文名 | P0 含义 |
|---|---|---|
| `channel.shelf_ecommerce` | 货架电商 | 淘系、京东等搜索/店铺/货架转化 |
| `channel.short_video` | 短视频种草 | 抖音、快手、小红书视频内容触达 |
| `channel.live_stream` | 直播转化 | 直播间讲解、限时机制转化 |
| `channel.private_domain` | 私域复购 | 社群、企微、会员、短信等复购触点 |

## 4. 人群包表达

P0 的人群包不是新的标签体系，而是一组标签分布。每个预测结果最多输出 Top 3 人群包。

```json
{
  "segmentId": "seg_work_minimal_25_34",
  "name": "25-34 岁简约通勤女性",
  "rank": 1,
  "confidence": 0.68,
  "tags": [
    { "tagId": "demo.age_25_34", "score": 0.82 },
    { "tagId": "demo.female", "score": 0.76 },
    { "tagId": "style.minimal", "score": 0.74 },
    { "tagId": "occasion.work", "score": 0.69 },
    { "tagId": "price.mid", "score": 0.61 }
  ],
  "drivers": ["style.minimal", "occasion.work", "price.mid"]
}
```

规则：

- `segmentId` 可以由 M 域生成，但必须能还原到本文标签。
- `drivers` 只能引用对预测或匹配贡献最大的 `tagId`。
- 前端可展示人群包名称，但决策和回测必须使用标签分布。

## 5. DMP 映射原则

DMP 字段可按用户授权直接进入 PLS。若字段要进入画像标签体系，必须映射到内部 `tagId`；聚合只在标签分布、模型训练或图表需要时执行。

| 输入类型 | 映射方式 | 置信度建议 |
|---|---|---|
| 明确等价字段 | 直接映射，例如年龄段到 `demo.age_25_34` | `0.85-1.00` |
| 近似语义字段 | 人工规则映射，例如“小资白领”到 `occasion.work`、`price.mid` | `0.55-0.80` |
| 多标签混合字段 | 拆分到多个 `tagId`，按规则分配权重 | `0.40-0.70` |
| 无法解释字段 | 放入 `unmappedTags`，不得强行映射 | `0` |

标签映射示例：

| DMP 聚合字段 | 示例值 | 内部映射 |
|---|---|---|
| `age_band` | `25-34` | `demo.age_25_34` |
| `gender_index` | `female_high` | `demo.female` |
| `style_preference` | `commute_basic` | `style.minimal`, `style.basic`, `occasion.work` |
| `content_touchpoint` | `douyin_live` | `channel.live_stream`, `channel.short_video` |

## 6. 注意事项

- 手机号、姓名、地址、订单号、账号 ID 或用户级明细可作为用户授权业务数据进入 PLS；但不要在未定义标签时把这些原始值直接提升为 `tagId`。
- 不可解释的 DMP 黑盒字段不得直接作为画像标签驱动模型，必须保留映射说明和置信度；无法映射时进入 `unmappedTags` 或作为业务字段展示。
- 新增标签必须由 X 总控批准，并补充 `tagId`、中文名、含义、映射规则和展示口径。
- P0 不细分线下门店、区域商圈、会员等级和品牌私域生命周期；这些作为 P1 候选扩展。
