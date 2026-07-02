# PLS 数据安全与共享契约 v0.1

> 归属：X 总控  
> 状态：P0 冻结草案  
> 最近更新：2026-07-01

## 1. 目的

本文定义 P0 阶段原始数据、聚合数据、衍生产物和 LLM 可读内容的边界，并给 D/M/A/V 统一输入输出约束。

硬原则：

- 原始订单、会员、客户、浏览、加购、支付明细不得进入 LLM。
- 平台 DMP 原始导出不得进入 LLM；只能由本地工具处理成聚合标签分布。
- P0 demo 数据优先使用脱敏 mock 数据；如使用用户提供数据，必须先本地脱敏、聚合和抽样。
- 所有跨域画像结果必须保留 `source`、`confidence`、`generatedAt`，真实聚合数据还必须保留 `sampleSize` 和 `timeWindow`。

## 2. 数据分级

| 等级 | 数据类型 | LLM 可读 | 处理规则 |
|---|---|---|---|
| S0 | 原始订单、会员、客户、浏览、加购、支付明细 | 禁止 | 仅本地工具统计，不能复制进 prompt、notes 或文档样例 |
| S1 | 平台 DMP 原始画像导出、ID 包、人群包成员 | 禁止 | 仅本地映射为聚合标签分布，丢弃用户级标识 |
| S2 | 商品基础信息、商品图文、渠道聚合画像 | 受控允许 | 未上市商品、IP、价格策略按商业机密处理 |
| S3 | 聚合标签分布、字段说明、数据质量报告 | 允许 | 需保留来源、时间窗口、样本量和生成方式 |
| S4 | 预测画像、匹配结果、demo 报告 | 允许 | 需标注置信度、边界和不可用场景 |

## 3. 进入 LLM 的准入规则

### 3.1 允许进入

- `docs/profile-taxonomy-v0.md` 中定义的标签说明。
- 脱敏后的字段字典、枚举值说明和聚合比例。
- 商品公开属性或 mock 商品属性。
- 渠道级聚合画像，例如某渠道在 `style.minimal` 上的比例。
- 预测结果、匹配分数、置信度、解释标签和风险提示。

### 3.2 禁止进入

- 任意用户级、订单级、会员级、设备级、账号级记录。
- 手机号、姓名、地址、订单号、会员 ID、平台 open id、广告 ID、设备 ID。
- 平台导出的完整 DMP 明细或人群包原始成员。
- 未脱敏的真实商品企划、成本、投流预算、首单量和未发布价格策略。

### 3.3 需要脱敏或聚合后进入

| 输入 | 进入前处理 |
|---|---|
| 历史 SKU 销售明细 | 按 SKU、时间窗口、渠道聚合，只保留销量、GMV 指数、价格区间、转化率等统计值 |
| DMP 标签导出 | 本地映射成 `tagId + score + confidence + sampleSize + timeWindow` |
| 渠道画像 | 聚合到渠道级，不保留单用户行为 |
| 商品图文 | 去除内部成本、未发布价格策略、供应商敏感信息 |

## 4. 本地处理流程

P0 数据必须按以下顺序处理：

1. `raw_input`：原始文件只允许本地工具读取。
2. `sanitize`：删除或哈希直接标识符，过滤敏感商业字段。
3. `aggregate`：按 SKU、渠道、时间窗口聚合，生成统计字段。
4. `map_tags`：映射到 `docs/profile-taxonomy-v0.md` 的 `tagId`。
5. `quality_check`：输出缺失率、样本量、异常值和映射覆盖率。
6. `share_contract`：仅将 S3/S4 结果交给 M/A/V 或 LLM。

任何跳过 `sanitize` 或 `aggregate` 的数据不得跨域流转。

## 5. 共享对象约束

### 5.1 `ProfileTagScore`

所有画像标签分布使用统一结构：

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

约束：

- `tagId` 必须来自 `docs/profile-taxonomy-v0.md`。
- `score` 和 `confidence` 范围为 `0-1`。
- 真实聚合数据必须提供 `sampleSize` 和 `timeWindow`。
- 预测数据如果没有样本量，必须通过 `source` 表明是模型或规则输出。

### 5.2 `ProductInput`

新品输入只允许包含商品级信息：

```json
{
  "skuId": "mock_sku_001",
  "category": "dress",
  "title": "Mock minimal commute dress",
  "attributes": {
    "season": "spring_summer",
    "priceBand": "mid",
    "styleKeywords": ["minimal", "commute"]
  },
  "assets": [
    {
      "type": "image",
      "source": "mock_asset",
      "description": "front view product image"
    }
  ]
}
```

禁止在 `ProductInput` 中出现客户、会员、订单或投放账户级字段。

### 5.3 `ProductProfile`

模型预测输出必须包含：

```json
{
  "skuId": "mock_sku_001",
  "generatedAt": "2026-07-01T00:00:00Z",
  "source": "p0_baseline",
  "tags": [
    {
      "tagId": "style.minimal",
      "score": 0.72,
      "confidence": 0.64,
      "source": "p0_baseline"
    }
  ],
  "segments": [],
  "drivers": ["style.minimal", "occasion.work"],
  "risks": ["low_sample_similarity"]
}
```

### 5.4 `ChannelProfile`

渠道画像必须是渠道级聚合：

```json
{
  "channelId": "mock_douyin_live_001",
  "channelType": "live_stream",
  "timeWindow": "2026-05-01/2026-06-30",
  "sampleSize": 5000,
  "source": "mock_channel_aggregate",
  "tags": [
    {
      "tagId": "channel.live_stream",
      "score": 0.91,
      "confidence": 0.9,
      "source": "mock_channel_aggregate",
      "sampleSize": 5000,
      "timeWindow": "2026-05-01/2026-06-30"
    }
  ]
}
```

### 5.5 `MatchResult`

匹配结果必须可解释：

```json
{
  "skuId": "mock_sku_001",
  "channelId": "mock_douyin_live_001",
  "matchScore": 0.78,
  "confidence": 0.66,
  "generatedAt": "2026-07-01T00:00:00Z",
  "drivers": ["style.minimal", "intent.try_new", "channel.live_stream"],
  "gaps": ["price.promo_sensitive"],
  "recommendation": "test_launch",
  "risks": ["channel_price_sensitivity_gap"]
}
```

`recommendation` 的 P0 枚举：

| 值 | 含义 |
|---|---|
| `priority_launch` | 优先分发或重点投流 |
| `test_launch` | 小流量测试 |
| `observe` | 暂缓放量，继续观察 |
| `avoid` | 不建议投放或分货 |

## 6. D/M/A/V 约束

### 6.1 D 数据画像

- 不输出 S0/S1 原始行级数据。
- `docs/data-spec.md` 中的宽表只能使用聚合字段和脱敏 mock 示例。
- 必须输出 DMP 映射覆盖率、未映射字段和低置信度映射列表。
- 真实聚合数据必须包含 `source`、`timeWindow`、`sampleSize`。

### 6.2 M 模型预测

- 训练和回测可使用本地宽表，但模型方案文档和 LLM 讨论只能引用字段说明、聚合统计和 mock 样例。
- 输出必须包含 Top 人群包、标签分布、置信度、关键驱动标签和风险。
- 不得输出无法追溯到 `tagId` 的黑盒人群名。
- 回测报告必须说明时间切分、样本量和误差来源。

### 6.3 A 应用后端

- API 不接收 S0/S1 原始明细。
- 结果对象必须保留 `source`、`confidence`、`generatedAt`。
- 任务状态和审计日志必须记录数据处理阶段，但不得记录敏感原文。
- 存储设计需区分 raw local staging、sanitized aggregate、derived result。

### 6.4 V 前端决策

- 页面不得展示或导出用户级明细。
- 所有建议必须展示依据、置信度和风险提示。
- 热力图使用 `matchScore` 和解释标签，不展示不可解释的黑盒分数。
- 导出物只能包含 S3/S4 内容。

## 7. 示例

允许用于 prompt 或文档的示例：

```json
{
  "skuId": "mock_sku_001",
  "category": "dress",
  "profileTags": [
    { "tagId": "demo.age_25_34", "score": 0.81, "confidence": 0.7, "source": "mock" },
    { "tagId": "style.minimal", "score": 0.74, "confidence": 0.66, "source": "mock" }
  ]
}
```

禁止用于 prompt 或文档的示例：

```json
{
  "buyerName": "real_name",
  "phone": "redacted_phone",
  "address": "real_address",
  "orderId": "real_order_id",
  "memberId": "real_member_id"
}
```

## 8. 注意事项

- 任何真实数据样例进入文档前必须确认不含直接标识符和可逆 ID。
- 数据安全争议默认按更高敏感级别处理。
- 如任务需要新增共享对象、DB schema 或 API 字段，必须先回流 X 总控。
- P0 暂不接真实平台 API；先定义导入格式、mock 数据和本地处理约束。
