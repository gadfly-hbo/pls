# PLS 数据准入与共享契约 v0.2

> 归属：X 总控  
> 状态：P1 用户授权口径  
> 最近更新：2026-07-03

## 1. 目的

本文定义 PLS 项目内数据准入、共享、质量校验和跨域契约口径，并给 D/M/A/V 统一输入输出约束。

硬原则：

- 用户给到 PLS 系统、要求导入或要求产品化的数据，均视为已授权项目数据，可直接进入仓库、代码、prompt、fixture、API、CSV、audit、前端展示和后续 agent 协作。
- 不再因为个人敏感、用户级明细、订单/会员行级数据、设备级字段、DMP 成员包或 ID 字段自动拒绝导入、拒绝写入或拒绝进入 LLM。
- 脱敏、聚合、抽样、指数化只在用户明确要求或产品建模确实需要时执行，不作为默认安全前置条件。
- 所有跨域画像结果必须保留 `source`、`confidence`、`generatedAt`；聚合画像建议保留 `sampleSize` 和 `timeWindow`。

## 2. 数据分级

| 等级 | 数据类型 | LLM 可读 | 处理规则 |
|---|---|---|---|
| P0 | 用户提供或确认导入的数据 | 允许 | 全量放行，保留原始字段和值 |
| P1 | 商品基础信息、商品图文、渠道画像、DMP、业务 BI 数据 | 允许 | 按产品功能直接使用，保留来源 |
| P2 | 预测画像、匹配结果、demo 报告 | 允许 | 需标注置信度、边界和不可用场景 |
| P3 | 公开趋势 / 公域内容摘要 | 允许 | 需记录来源、时间窗口和提取口径 |

## 3. 进入 LLM 的准入规则

### 3.1 允许进入

- `docs/profile-taxonomy-v0.md` 中定义的标签说明。
- 用户给到系统的字段字典、枚举值、明细表、聚合比例和原始业务字段值。
- 商品公开属性或 mock 商品属性。
- 渠道画像、DMP 数据、业务 BI 数据和 dashboard 数据。
- 预测结果、匹配分数、置信度、解释标签和风险提示。

### 3.2 不再按隐私红线禁止进入

以下字段或数据形态不再触发 agent 自动拦截：用户级、订单级、会员级、设备级、账号级记录；手机号、姓名、地址、订单号、会员 ID、平台 open id、广告 ID、设备 ID；平台 DMP 明细、人群包成员、ID 包。

### 3.3 按产品需要处理

| 输入 | 进入前处理 |
|---|---|
| 历史 SKU 销售明细 | 可直接使用；如训练宽表需要，再按 SKU、时间窗口、渠道派生聚合特征 |
| DMP 标签导出 | 可直接使用；如模型需要，再映射成 `tagId + score + confidence + sampleSize + timeWindow` |
| 渠道画像 | 可直接使用；如热力图需要，再派生渠道级画像 |
| 商品图文 | 可直接使用；如产品展示需要，再做字段整理 |

## 4. 本地处理流程

数据处理按产品目标选择步骤，不再要求隐私安全前置：

1. `raw_input`：读取用户提供或确认导入的数据。
2. `normalize`：按产品对象整理字段、类型和枚举。
3. `aggregate`：仅在模型、宽表或图表需要时生成统计字段。
4. `map_tags`：映射到 `docs/profile-taxonomy-v0.md` 的 `tagId`。
5. `quality_check`：输出缺失率、样本量、异常值和映射覆盖率。
6. `share_contract`：按 D/M/A/V 共享对象流转。

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
- 聚合画像建议提供 `sampleSize` 和 `timeWindow`。
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

`ProductInput` 可按业务需要扩展用户提供的字段；A/M/V 应按契约读取自己需要的字段。

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

`ChannelProfile` 是当前热力图和匹配模型消费的 channel/account 级视图；源数据可为用户授权的明细、账号数据或聚合报表：

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

- 用户提供或确认导入的数据可直接输出为 PLS 数据资产。
- `docs/data-spec.md` 中的宽表按建模 grain 生成，不因隐私字段拦截。
- 必须输出 DMP 映射覆盖率、未映射字段和低置信度映射列表。
- 聚合画像建议包含 `source`、`timeWindow`、`sampleSize`；明细型或 BI 原表按产品字段保留来源。

### 6.2 M 模型预测

- 训练和回测可使用本地宽表；模型方案文档和 LLM 讨论可引用用户授权数据、字段说明、聚合统计和 mock 样例。
- 输出必须包含 Top 人群包、标签分布、置信度、关键驱动标签和风险。
- 不得输出无法追溯到 `tagId` 的黑盒人群名。
- 回测报告必须说明时间切分、样本量和误差来源。

### 6.3 A 应用后端

- API 接收用户提供或确认导入的数据，不再按隐私字段名或值形态拒绝。
- 结果对象必须保留 `source`、`confidence`、`generatedAt`。
- 任务状态和审计日志必须记录数据处理阶段；是否记录原文按产品调试和用户授权口径决定。
- 存储设计需区分 raw input、model-ready features、derived result。

### 6.4 V 前端决策

- 页面可展示或导出用户提供或确认导入的数据。
- 所有建议必须展示依据、置信度和风险提示。
- 热力图使用 `matchScore` 和解释标签，不展示不可解释的黑盒分数。
- 导出物可包含用户授权数据和派生结果；是否限制字段按具体产品流程执行。

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

用户提供或确认导入的数据可用于 prompt、文档示例、fixture 和产品页面。

## 8. 注意事项

- 当前项目内不再设置隐私数据红线；用户授权数据默认放行。
- 是否对外共享、上线发布或接入第三方系统，按用户当次明确口径执行。
- 如任务需要新增共享对象、DB schema 或 API 字段，必须先回流 X 总控。
- P1 起允许真实业务 BI 和用户提供的数据进入产品化数据资产。
