# PLS 模型方案 v0.1

> 归属：M 模型预测
> 状态：P0 草案
> 最近更新：2026-07-01

## 1. 目的

本文定义 P0 阶段两条能力的最小可信实现：

1. **新品商品画像预测**：输入一个新 SKU 的商品 DNA，输出 Top 3 人群包、标签分布、置信度、关键驱动标签。
2. **商品 × 渠道匹配**：输入商品预测画像和一批渠道画像，输出匹配度分数、排序和可解释原因。

P0 原则：

- 可解释优先，不追求复杂模型。
- 输入输出结构完全对齐 `docs/profile-taxonomy-v0.md` 和 `docs/data-spec.md`，不自造标签口径。
- 所有预测结果保留置信度、drivers、来源，便于回测和纠偏。
- 冷启动场景样本稀疏，方案必须有规则兜底路径。

依赖文档：

- `docs/profile-taxonomy-v0.md`：标签坐标系 v0.1、`ProfileTagScore`、Segment 结构。
- `docs/data-spec.md`：训练宽表、`ProductDNA` 字段、渠道画像字段。
- `docs/data-safety-policy.md`：数据红线。

## 2. 商品 DNA 特征集合

商品 DNA 是训练输入的可解释特征。P0 直接复用 `data-spec.md §4.3 ProductDNA` 字段，叠加派生特征。

### 2.1 原始 DNA 字段（来自宽表）

| 组 | 字段 | 类型 | 处理 |
|---|---|---|---|
| 类目 | `categoryLv1`、`categoryLv2`、`season` | enum | One-hot |
| 结构 | `fitType`、`sleeveType`、`lengthType`、`patternType` | enum | One-hot；`unknown` 单独一维 |
| 材质 | `fabricType`、`colorFamily` | enum | One-hot |
| 定价 | `priceBand`、`launchType`、`promotionIntensity` | enum | One-hot；`priceBand` 额外映射为序数 `{value:0, mid:1, premium:2}` |
| 关键词 | `styleKeywords`、`titleTokens` | string[] | Multi-hot（受控词表）+ 语义映射见 §2.3 |
| 图像 | `imageFeatureSummary` | object | P0 只取布尔/枚举字段做 one-hot；不接入向量特征 |

### 2.2 派生特征

| 特征 | 定义 | 用途 |
|---|---|---|
| `productTagVector` | 由 `mappedProductTags` 构成的 tagId→score 稀疏向量 | 主特征，也用于相似 SKU 检索 |
| `styleKeywordEmbedding` | P0 退化为 `styleKeywords` 的 multi-hot | 保留字段名，占位未来升级 |
| `dnaHash` | 类目+结构+材质+定价关键字段的稳定短哈希 | 去重、命中缓存、审计 |
| `keywordCount` | `styleKeywords` 数量 | 特征丰富度弱信号 |
| `unknownFieldCount` | 结构/材质字段中 `unknown` 数 | 数据质量弱信号 |

### 2.3 关键词到标签的映射

P0 使用规则表，源自 `data-spec.md §6.3` 与附录 B：

- `styleKeywords` 命中受控词 → `style.*` / `occasion.*` 标签，`confidence = 0.6`。
- `priceBand` → `price.*` 标签，`confidence = 0.9`。
- `launchType = new_arrival` → `intent.try_new`、`price.new_arrival_sensitive`，`confidence = 0.7`。
- `season` 与结构字段命中 → `occasion.seasonal`。

映射结果统一写入 `mappedProductTags`（由 D 域预计算或 M 域重算），作为预测模型主特征之一。

### 2.4 特征红线

- 不使用真实价格、真实定价策略、真实成本、真实投流预算。
- 不使用原始图片、原始标题、SKU 明细成交记录。
- 未在受控词表内的自由文本进入 `unmappedTags`，不进入特征矩阵。

## 3. 预测模型

### 3.1 P0 Baseline：Per-tag 多标签回归 + kNN + 规则三级兜底

**主路径：多标签独立回归**

- 训练标签：`buyerProfileTags` 中每一个 `tagId` 的 `score`（0-1）。
- 训练样本：宽表行满足 `isTrainable = true` 且约束（见 `data-spec.md §9`）。
- 每个 `tagId` 训练一个独立回归模型。
- 首选 LightGBM（tabular 适配、可解释、SHAP 提供 drivers）；样本极稀疏或依赖未接入时退化为岭回归。
- 样本权重：`normalize(sampleSize) × profileCoverageRate × (1 − lowConfidenceTagCount / 标签数)`。

**兜底路径 1：相似 SKU 检索**

- 对新品 DNA 计算 `productTagVector`，在训练宽表中检索 Top-N 相似 SKU（余弦相似度，N=20）。
- 用相似 SKU 的 `buyerProfileTags` 按相似度加权平均，得到 kNN 预测。
- 当主路径某标签置信度低于阈值（见 §3.4）或该标签训练样本 < 30 时，用 kNN 结果替代。

**兜底路径 2：纯规则**

- 训练样本 < 10 或模型未启用时，直接用 §2.3 商品→标签映射作为预测输出，`confidence = 映射置信度 × 0.8`。

三条路径以固定优先级串行：模型 → kNN → 规则。落地时按可用样本量在训练阶段决定路径开关。

说明：P0 采用 per-tag 独立训练，参数简单、结果可解释；未来如需多任务共享结构（chain classifier、shared trunk），必须先完成回测对比后再切换。

### 3.2 从标签预测到 Top 3 人群包

`buyerProfileTags` 是连续标签分布，Top 3 人群包由以下 P0 简化流程生成：

1. **模板匹配**：维护一批 P0 冻结的 segment 模板（初始表见附录 A），每个模板定义主导标签集合 `templateTags` 和 `templateWeight`。
2. **匹配打分**：`segmentScore = Σ (predicted.score[tag] × templateWeight[tag])`。
3. **人群包组装**：取分数最高的 3 个模板作为 Top 3；`tags` 用预测分布命中模板 tagId 的前 8 项填充；`drivers` 取对 `segmentScore` 贡献前 3 的 tagId。
4. **confidence**：`min(模型对 driver 标签的平均 confidence, 0.95)`；命中规则兜底时 `confidence ≤ 0.6`。

说明：P0 用固定模板 + 分布重合分数，不上真正的聚类。P1 拿到更多样本后可评估切换到 GMM / HDBSCAN，届时必须保持 `segmentId` 语义向下兼容。

### 3.3 预测输出 JSON Schema

预测接口统一输出以下结构，字段对齐 `profile-taxonomy-v0.md §4` 与 `data-spec.md §3.1`。

```json
{
  "predictionId": "pred_20260701_0001",
  "skuId": "mock_sku_101",
  "generatedAt": "2026-07-01T02:15:00Z",
  "modelVersion": "m-p0-baseline-0.1",
  "modelPath": "gbdt",
  "input": {
    "dnaHash": "d5f2a1",
    "categoryLv1": "apparel",
    "categoryLv2": "dress",
    "season": "spring_summer",
    "priceBand": "mid",
    "styleKeywords": ["minimal", "commute"]
  },
  "predictedProfileTags": [
    {
      "tagId": "demo.age_25_34",
      "score": 0.79,
      "confidence": 0.72,
      "source": "m-p0-baseline-0.1",
      "sampleSize": null,
      "timeWindow": null
    },
    {
      "tagId": "style.minimal",
      "score": 0.74,
      "confidence": 0.70,
      "source": "m-p0-baseline-0.1",
      "sampleSize": null,
      "timeWindow": null
    }
  ],
  "topSegments": [
    {
      "segmentId": "seg_work_minimal_25_34",
      "name": "25-34 岁简约通勤女性",
      "rank": 1,
      "confidence": 0.68,
      "tags": [
        { "tagId": "demo.age_25_34", "score": 0.79 },
        { "tagId": "demo.female", "score": 0.74 },
        { "tagId": "style.minimal", "score": 0.74 },
        { "tagId": "occasion.work", "score": 0.69 },
        { "tagId": "price.mid", "score": 0.61 }
      ],
      "drivers": ["style.minimal", "occasion.work", "price.mid"]
    }
  ],
  "qualityFlags": [],
  "unmappedInputTokens": []
}
```

字段约束：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `predictionId` | 是 | P0-B 持久化 ID 由 A 域落库时生成；M 域 draft 可返回临时 ID 或留空 |
| `skuId` | 是 | 脱敏或 mock SKU ID |
| `generatedAt` | 是 | ISO 8601 时间戳 |
| `modelVersion` | 是 | 语义化版本，用于回测对齐 |
| `modelPath` | 是 | `gbdt` / `knn` / `rule`，声明本次结果的兜底层级 |
| `input` | 是 | 用于审计和缓存命中，含 `dnaHash` |
| `predictedProfileTags` | 是 | `ProfileTagScore[]`；预测结果 `sampleSize`、`timeWindow` 允许为 null |
| `topSegments` | 是 | 长度 ≤ 3，`rank` 从 1 起 |
| `qualityFlags` | 是 | 例如 `low_training_sample`、`fallback_rule_only` |
| `unmappedInputTokens` | 是 | 未映射的输入关键词，用于 D 域词表回流 |

### 3.4 置信度与兜底阈值

| 参数 | P0 值 | 说明 |
|---|---|---|
| `tagConfidenceMin` | 0.50 | 主路径某标签 confidence 低于此值时用 kNN 替代 |
| `perTagMinSamples` | 30 | 主路径每个标签所需最少训练样本 |
| `knnMinSamples` | 10 | kNN 检索池所需最少宽表行 |
| `knnK` | 20 | kNN 检索的近邻数 |
| `segmentConfidenceCap` | 0.95 | 人群包 confidence 上限 |
| `ruleFallbackConfidenceCap` | 0.60 | 规则兜底时 confidence 上限 |
| `topSegmentCount` | 3 | Top 人群包数量 |

## 4. 商品 × 渠道匹配

### 4.1 匹配公式

商品预测画像 `P` 和渠道画像 `C`（均为 `ProfileTagScore[]`）先展开为覆盖同一 tagId 全集的稀疏向量，缺失值补 0。

**Tag 层重合度**（加权 Jaccard）：

```
overlap(P, C) = Σ_t min(P.score[t], C.score[t]) × dimensionWeight[dim(t)]
             / Σ_t max(P.score[t], C.score[t]) × dimensionWeight[dim(t)]
```

- 采用 min/max 避免高分标签互相抬升。
- `dimensionWeight` 是维度级权重，P0 值见 §4.3。
- 结果范围 `0-1`。

**Segment 层加权**：

```
segmentMatch(seg, C) = Σ_t (seg.tag.score[t] × C.score[t]) × dimensionWeight[dim(t)]
                    / Σ_t (seg.tag.score[t]) × dimensionWeight[dim(t)]
```

**综合匹配度**：

```
matchScore = 0.6 × overlap(P, C) + 0.4 × max_over_topSegments segmentMatch(seg, C)
```

**置信度**：

```
matchConfidence = mean(driver.confidence 前 3) × min(1, sampleSize_channel / 500)
```

### 4.2 匹配原因（drivers）

对每个候选渠道，输出：

- `positiveDrivers`：`min(P.score[t], C.score[t]) × dimensionWeight[dim(t)]` 贡献前 3 的 tagId。
- `negativeDrivers`：`|P.score[t] − C.score[t]| × dimensionWeight[dim(t)]` 贡献前 3 且 `C.score[t] < 0.2` 的 tagId，用于解释不匹配。
- `channelTypeAlignment`：如渠道 `channelType` 与商品预测中 `channel.*` 标签一致，加 5% 加成并写入 drivers。

### 4.3 维度权重（P0 冻结）

| 维度 | 权重 | 理由 |
|---|---:|---|
| `demo` | 0.20 | 人群基础属性 |
| `style` | 0.25 | 服装 demo 的核心区分度 |
| `price` | 0.20 | 定价带影响匹配显著 |
| `occasion` | 0.15 | 场景相关 |
| `intent` | 0.10 | 意图相关 |
| `channel` | 0.10 | 渠道对齐加成，防止双重计权 |

权重加起来 = 1。P0 冻结，P1 调整需回流总控。

### 4.4 匹配输出 JSON Schema

```json
{
  "matchId": "match_20260701_0001",
  "predictionId": "pred_20260701_0001",
  "skuId": "mock_sku_101",
  "generatedAt": "2026-07-01T02:20:00Z",
  "modelVersion": "m-p0-baseline-0.1",
  "channelMatches": [
    {
      "channelId": "mock_douyin_live_001",
      "channelType": "live_stream",
      "matchScore": 0.71,
      "matchConfidence": 0.66,
      "rank": 1,
      "overlap": 0.68,
      "bestSegmentId": "seg_work_minimal_25_34",
      "bestSegmentMatch": 0.75,
      "positiveDrivers": [
        { "tagId": "style.minimal", "productScore": 0.74, "channelScore": 0.70 },
        { "tagId": "demo.age_25_34", "productScore": 0.79, "channelScore": 0.68 },
        { "tagId": "channel.live_stream", "productScore": 0.61, "channelScore": 0.91 }
      ],
      "negativeDrivers": [
        { "tagId": "price.premium", "productScore": 0.12, "channelScore": 0.05 }
      ],
      "qualityFlags": []
    }
  ]
}
```

字段约束：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `matchId` | 是 | P0-B 持久化 ID 由 A 域落库时生成；M 域 draft 可返回临时 ID 或留空 |
| `predictionId` | 是 | 对应预测记录 |
| `channelMatches` | 是 | 按 `matchScore` 降序 |
| `overlap` / `bestSegmentMatch` | 是 | 保留分量，便于前端可视化 |
| `positiveDrivers` / `negativeDrivers` | 是 | 每个至多 3 条，`tagId` 必须存在于标签体系 |
| `qualityFlags` | 是 | 例如 `low_channel_sample`、`no_common_tags` |

## 5. 回测与评估

### 5.1 数据切分

- **时间切分**：按宽表 `timeWindow` 截止日期，训练集 = 早于 cutoff，测试集 = cutoff 之后。禁止随机切分。
- **热启动子集**：`sampleSize >= 300` 且 `profileCoverageRate >= 0.85` 的宽表行；评估上限。
- **冷启动子集**：cutoff 后首次出现的 SKU；评估真实冷启动效果。

### 5.2 预测评估指标

| 指标 | 定义 | P0 目标 |
|---|---|---|
| `topKTagHit@5` | 预测 Top 5 tagId 与真实 Top 5 tagId 交集 / 5 | ≥ 0.55（热）/ ≥ 0.35（冷） |
| `topKTagHit@10` | Top 10 tagId 命中率 | ≥ 0.60（热）/ ≥ 0.40（冷） |
| `jsDivergence` | 预测分布与真实分布的 Jensen-Shannon 散度 | ≤ 0.35 |
| `driverPrecision` | 预测 drivers ⊆ 真实 Top 5 tagId 的比例 | ≥ 0.60 |
| `segmentTop1Hit` | 预测 Top 1 segment 与真实分布主导 segment 一致 | ≥ 0.45（热启动） |
| `calibrationMAE` | 预测 confidence 与实际命中率的 MAE | ≤ 0.15 |

指标只对 `tagConfidenceMin` 以上的标签统计，避免噪声主导评估。

### 5.3 匹配评估指标

P0 真实匹配 label 由销售表现派生：某商品在某渠道的宽表行如果 `sellThroughRate ≥ 0.6` 且 `returnRate ≤ 0.12`，视为正向匹配。

| 指标 | 定义 | P0 目标 |
|---|---|---|
| `matchNDCG@3` | 匹配打分对正向匹配的 nDCG@3 | ≥ 0.55 |
| `matchRecall@3` | 正向渠道进入 Top 3 的比例 | ≥ 0.60 |
| `matchPrecision@3` | Top 3 中正向渠道比例 | ≥ 0.45 |
| `driverCoverage` | `positiveDrivers` 中 tagId ⊆ 商品 Top 5 tagId ∩ 渠道 Top 10 tagId 的比例 | ≥ 0.70 |

### 5.4 回测输出

每次回测输出结构化报告：

```json
{
  "reportId": "backtest_20260701_0001",
  "modelVersion": "m-p0-baseline-0.1",
  "cutoff": "2026-06-01",
  "trainSize": 1200,
  "testSize": 180,
  "coldStartSize": 42,
  "predictionMetrics": {
    "topKTagHit@5_warm": 0.58,
    "topKTagHit@5_cold": 0.36,
    "jsDivergence": 0.31,
    "driverPrecision": 0.63,
    "segmentTop1Hit_warm": 0.47,
    "calibrationMAE": 0.12
  },
  "matchMetrics": {
    "matchNDCG@3": 0.57,
    "matchRecall@3": 0.61,
    "matchPrecision@3": 0.46,
    "driverCoverage": 0.72
  },
  "errorAnalysis": {
    "worstTagIds": ["intent.gift", "occasion.travel"],
    "unmappedTokenTopN": []
  },
  "notInScope": ["fashion.streetwear beyond controlled vocabulary"]
}
```

### 5.5 回测硬约束

- 一次回测必须完整跑完预测 + 匹配两条链路。
- 回测数据禁止包含真实客户明细，只用宽表脱敏聚合。
- 目标未达标的模型不得进入 A 域接口封装，走规则兜底并在 `qualityFlags` 中声明 `model_below_threshold`。

## 6. 反馈与纠偏

- 新品真实 DMP 回流到 D 域后，M 域读取同 `skuId` 的最新 `buyerProfileTags`，与预测记录对齐生成 error case。
- 误差样本进入 `docs/backlog/`（M 域后续建立）纠偏样本集，累计到阈值触发再训练。
- 纠偏更新必须保留旧 `modelVersion` 结果可复现，`modelVersion` 升级为 `m-p0-baseline-0.2`。

## 7. 总控决策与开放问题

已决：

1. `mappedProductTags` 由 D 域基于受控词表和商品属性预计算；M 域负责校验 `tagId` 合法性，并在缺失时按同一规则临时回填，同时输出 `qualityFlags`。
2. §4.3 匹配维度权重作为 P0 v0.1 冻结口径。D/V 可在实现验证中提交调整建议，但不得在 P0 文档任务内另造权重。
3. Segment 模板与关键词受控词表的新增、删除和权重调整均由 X 总控审批；变更必须说明适用类目、影响 tagId、回测影响和展示口径。
4. 图像特征 P0 只使用 `imageFeatureSummary` 的枚举摘要，不接入真实 embedding；如需上多模态需回流总控。

开放：

1. `segmentTemplate` 权重当前手工设定；P1 可在样本量足够后用真实分布聚类校准。
2. `channel.*` 加成在实现阶段需要通过 smoke case 检查，避免与 `channelType` 硬对齐重复计权。

## 附录 A · P0 Segment 模板初始表

以下为 P0 服装 demo 场景的 6 个初始 segment 模板，覆盖典型 Top 3 输出组合。`templateWeight` 用于 §3.2 打分。

| segmentId | name | templateTags (tagId : templateWeight) |
|---|---|---|
| `seg_work_minimal_25_34` | 25-34 岁简约通勤女性 | `demo.age_25_34:0.9`、`demo.female:0.9`、`style.minimal:1.0`、`occasion.work:0.9`、`price.mid:0.7` |
| `seg_trendy_young_18_24` | 18-24 岁潮流个性青年 | `demo.age_18_24:0.9`、`style.trendy:1.0`、`intent.try_new:0.8`、`channel.short_video:0.6` |
| `seg_elegant_35_44_premium` | 35-44 岁优雅轻熟高客单 | `demo.age_35_44:0.9`、`style.elegant:1.0`、`price.premium:0.9`、`intent.gift:0.4` |
| `seg_sporty_daily` | 运动休闲日常客群 | `style.sporty:1.0`、`occasion.daily:0.8`、`price.mid:0.6` |
| `seg_value_promo_lower_tier` | 下沉价值促销客群 | `demo.city_lower_tier:0.9`、`price.value:1.0`、`price.promo_sensitive:0.9`、`intent.repeat_purchase:0.6` |
| `seg_gift_seasonal` | 节令送礼客群 | `intent.gift:1.0`、`occasion.seasonal:0.8`、`price.premium:0.6` |

模板增删由 X 总控审批，添加时必须提供中文名、`templateTags`、`templateWeight` 和 P0 用途说明。

## 附录 B · 关键词受控词表（服装 demo）

只有落在下表内的 `styleKeywords` / `titleTokens` 会进入特征矩阵，其他进入 `unmappedInputTokens`。

| keyword | 映射标签 |
|---|---|
| `minimal` | `style.minimal` |
| `basic` | `style.basic` |
| `commute` | `occasion.work`、`style.minimal` |
| `street` | `style.street` |
| `sport` / `sporty` | `style.sporty` |
| `elegant` | `style.elegant` |
| `sweet` | `style.sweet` |
| `trendy` | `style.trendy` |
| `luxury` | `style.luxury` |
| `party` | `occasion.party` |
| `travel` | `occasion.travel` |
| `home` | `occasion.home` |
| `gift` | `intent.gift` |
| `new_arrival` / `new` | `price.new_arrival_sensitive`、`intent.try_new` |

## 附录 C · 命名与版本约定

- `modelVersion` 使用 `m-p0-baseline-<minor>` 结构；P0 全阶段维护在 `m-p0-baseline-*`。
- `predictionId` / `matchId` 的持久化 ID 由 A 域落库时生成，格式 `<type>_<yyyymmdd>_<seq>`；M 域 adapter 只返回 draft，不能直接写库。
- `segmentId` 命名 `seg_<主标签>_<辅助标签>_<年龄段>`，全部小写，词间 `_` 分隔。
- `modelPath` 值域 `gbdt` / `knn` / `rule`，A 域封装时可作为审计字段透出。
