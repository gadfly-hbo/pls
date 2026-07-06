# M-P6-CHANNEL-2 渠道画像 2.0 人货匹配契约

> 持有：M 模型预测  
> 状态：P6 第一期契约冻结  
> 最近更新：2026-07-06

## 1. 目的

把渠道画像 2.0 的 `ProductFitProfile` 与活动/场景上下文纳入人货匹配算法，输出第一期可解释契约，供 A/V 实现渠道实体匹配与排序。

依赖：

- `docs/channel-profile-2.0-plan.md`
- `docs/model-plan.md`
- `docs/model-p2-5-product-channel-fit-contract.md`
- `docs/model-p2-8-new-product-prediction-contract.md`

## 2. 入口

`apps/model/src/channel-entity-fit.ts` 的 `explainChannelEntityFit(input)`。

## 3. 输入

```ts
interface ChannelEntityFitInput {
  productProfile: ProductProfileForChannelEntityFit;
  channelProfile: ChannelEntityProfileV2;
  marketingEvent?: MarketingEvent;
  businessScenario?: BusinessScenario;
}
```

- `productProfile.predictedProfileTags`：商品预测画像标签，必须来自 `docs/profile-taxonomy-v0.md`。
- `productProfile.productDNA`：商品基础 DNA，用于 `productFit` 字段匹配。
- `channelProfile.audienceProfile`：渠道人群画像。
- `channelProfile.productFitProfile`：渠道商品适配画像，可选。
- `marketingEvent` / `businessScenario`：活动/场景上下文，只用于权重调节。

## 4. 输出

```ts
interface ChannelEntityFit {
  skuId: string;
  channelId: string;
  channelType: string;
  audienceFit: number;
  productFit: number | null;
  baseScore: number;
  contextWeightAdjustments: ContextWeightAdjustment[];
  contextAdjustedScore: number;
  confidence: number;
  recommendation: "priority_launch" | "test_launch" | "observe" | "avoid";
  audienceDrivers: ChannelEntityFitDriver[];
  productFitDrivers: ChannelEntityFitDriver[];
  contextDrivers: ChannelEntityFitDriver[];
  riskFlags: ChannelEntityFitRiskFlag[];
  qualityFlags: string[];
}
```

## 5. 公式与权重

### 5.1 audienceFit

商品预测画像与渠道人群画像的维度加权 Jaccard：

```text
audienceFit = Σ_t min(productScore_t, audienceScore_t) * w_dim(t)
              / Σ_t max(productScore_t, audienceScore_t) * w_dim(t)
```

默认维度权重：

| 维度 | 权重 |
|---|---:|---|
| `demo` | 0.20 |
| `style` | 0.25 |
| `price` | 0.20 |
| `occasion` | 0.15 |
| `intent` | 0.10 |
| `channel` | 0.10 |

### 5.2 productFit

商品 DNA / 标签 × 渠道 `ProductFitProfile` 的字段匹配：

| 字段 | 说明 | 字段权重 |
|---|---|---:|
| `fitCategories` | 商品 categoryLv1/Lv2 命中 | 0.20 |
| `fitPriceBands` | 商品 priceBand 或 price.* 标签命中 | 0.20 |
| `fitStyles` | 商品 style.* 标签命中 | 0.25 |
| `fitOccasions` | 商品 occasion.* 标签命中 | 0.20 |
| `fitLaunchTypes` | 商品 launchType 或对应 intent/price 标签命中 | 0.15 |

`productFit` 为各命字段得分的加权平均。若渠道缺少 `ProductFitProfile`，`productFit = null`。

### 5.3 baseScore

```text
baseScore = 0.7 * audienceFit + 0.3 * productFit
```

缺少 `ProductFitProfile` 时：

```text
baseScore = audienceFit
qualityFlags += ["missing_product_fit_profile"]
riskFlags += ["missing_product_fit_profile"]
```

### 5.4 活动/场景权重调节

活动/场景只调节 `baseScore` 的权重乘数，不生成独立 `eventScore` 或 `scenarioScore`：

```text
contextAdjustedScore = baseScore * clamp(combinedAdjustment, 0.9, 1.3)
combinedAdjustment = Π activeRuleMultiplier
```

规则示例：

| 上下文 | 生效条件 | 乘数 | 说明 |
|---|---|---:|---|
| `new_product_launch` | 商品含 `intent.try_new` | 1.25 | 新品首发强化尝鲜意图 |
| `new_product_launch` | 商品含 `price.new_arrival_sensitive` | 1.15 | 新品首发强化上新敏感 |
| `member_repurchase` | 商品含 `intent.repeat_purchase` | 1.25 | 会员复购强化复购意图 |
| `traditional_holiday` | 商品含 `intent.gift` | 1.25 | 传统节日强化送礼意图 |
| `traditional_holiday` | 商品含 `occasion.seasonal` | 1.15 | 传统节日强化季节场景 |
| `platform_promotion` | 商品含 `price.promo_sensitive` / `price.value` | 1.20 | 平台大促强化促销/性价比 |
| `platform_promotion` | 商品含 `intent.repeat_purchase` | 1.10 | 平台大促适度强化复购意图 |

若商品没有对应信号，规则标记为 `active: false`，不影响排序。

## 6. Drivers

### 6.1 audienceDrivers

来源：商品与渠道人群画像的共同标签。每条 driver 说明 tagId、商品 score、渠道 score、维度贡献。

### 6.2 productFitDrivers

来源：商品 DNA / 标签与渠道 `ProductFitProfile` 的字段匹配。每条 driver 说明字段、代表 tagId、匹配得分、字段权重贡献。

### 6.3 contextDrivers

来源：生效的活动/场景规则。每条 driver 说明被调节的维度、代表 tagId、规则乘数、对 `contextAdjustedScore` 的增量贡献，以及原因文案。

## 7. 置信度与推荐

置信度由以下因素折减：

- 匹配标签的最低置信度均值。
- 商品样本量因子：`min(1, productSampleSize / 500)`。
- 渠道样本量因子：`min(1, channelAudienceSampleSize / 500)`。
- `ProductFitProfile.confidence`（若存在）。
- 活动/场景规则生效时 × 0.98。

推荐分层：

| 条件 | 推荐 |
|---|---|
| `contextAdjustedScore >= 0.7` 且 `confidence >= 0.65` | `priority_launch` |
| `contextAdjustedScore >= 0.5` | `test_launch` |
| `contextAdjustedScore >= 0.3` | `observe` |
| 其他 | `avoid` |

样本不足或缺少人群画像时强制降级为 `observe`。

## 8. 风险与质量标记

固定风险：

- `algorithm_pending_user_formula`：第一期公式为 contract baseline，不是已训练模型。
- `missing_product_fit_profile`：渠道缺少商品适配画像。
- `low_product_fit_confidence`：`ProductFitProfile.confidence < 0.6`。
- `low_product_sample` / `low_channel_sample`：样本量低于 500。
- `missing_audience_profile`：渠道人群画像无共同标签。
- `context_adjustment_low_confidence`：存在惩罚型上下文调节（当前预留）。

质量标记同时继承商品/渠道输入的 `qualityFlags`。

## 9. Contract Test 覆盖

`apps/model/src/channel-entity-fit-contract-test.ts` 覆盖：

| 场景 | 验证点 |
|---|---|
| `with_product_fit` | `productFit > 0`、`baseScore = 0.7*audienceFit + 0.3*productFit`、无上下文时 `contextAdjustedScore == baseScore` |
| `missing_product_fit` | `productFit === null`、标记 `missing_product_fit_profile`、`baseScore == audienceFit` |
| `new_product_launch` | 存在生效的 `intent` 调节、`contextAdjustedScore > baseScore`、无 `eventScore`/`scenarioScore` |
| `member_repurchase` | 存在生效的 `intent.repeat_purchase` 调节、`contextAdjustedScore > baseScore` |
| `traditional_holiday` | 存在生效的 `intent.gift` / `occasion.seasonal` 调节 |
| `platform_promotion` | 存在生效的 `price` 调节 |

运行：

```bash
cd apps/model
npm run channel-entity-fit-contract-test
```

## 10. 红线

- 不输出 `eventScore` 或 `scenarioScore`。
- 不将活动/场景包装成独立渠道分数。
- `ProductFitProfile` 缺失时只降级为 `audienceFit`，不伪造商品适配。
- 只使用 `docs/profile-taxonomy-v0.md` 已有 `tagId`。
- 不伪造训练指标或样本量。

## 11. 替换点

用户/X 总控冻结正式 fit formula 后，可替换：

- `computeAudienceFit` 的加权方式。
- `computeProductFit` 的字段匹配逻辑。
- 活动/场景规则映射。
- 推荐阈值。

外部 `ChannelEntityFitInput`、`ChannelEntityFit` 字段保持稳定。
