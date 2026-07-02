# X-P1-E0 Douyin Account Fit Contract

最近更新：2026-07-03

## 目的

冻结抖音号货匹配迁入 PLS 的接缝层契约，让 D/M/A/V 后续任务按同一组对象和数据准入口径开工。

本契约参考本地静态 dashboard：

- `/Users/huangbo/Downloads/douyin_report_dashboard`

2026-07-03 口径修订：PLS 是业务 BI 系统；凡用户确认允许导入的抖音 BI 系统数据，均可作为产品功能、开发输入、fixture、API、CSV、audit 和前端展示数据直接使用。agent 不再额外判断或拦截个人敏感、用户级、订单/会员行级或 DMP 成员包字段。

## 使用方式

- D 域按本文的字段边界输出账号画像、商品宽表、款账号对比、优化清单等 BI 数据资产；保留业务 BI 原始字段和值。
- M 域按本文的 adapter interface 实现号货匹配诊断 adapter；真实号货匹配度算法由用户后续提供。
- A 域按本文对象承接存储、读取、审计和权限，不在 X 总控冻结前落 DB schema。
- V 域按本文展示账号画像基准、款账号对比、优化清单和用户授权的业务 BI 字段。

## 建模口径

账号作为 PLS 的一种 `ChannelProfile` 扩展建模，不另建平行的“账号画像体系”。

| 外部对象 | PLS channel 建模 | `channelType` | 说明 |
|---|---|---|---|
| Douyin account | `douyin_account` | `short_video` | 内容账号，默认短视频触点 |
| Douyin shop | `douyin_shop` | `shelf_ecommerce` | 店铺或商品橱窗承接 |
| Douyin live account | `douyin_live_account` | `live_stream` | 直播间转化触点 |
| Douyin short video account | `douyin_short_video_account` | `short_video` | 短视频种草触点 |

约束：

- `channelId` 可使用真实业务 ID、系统生成 ID 或 mock ID。
- `platformType = "content_ecommerce"`。
- 真实账号名、店铺名、商品名等用户授权业务字段可展示。
- 一个真实账号同时有直播和短视频经营时，可拆成多个 `ChannelProfile`，共享 `accountGroupId`，但各自保留独立 `channelType` 和指标。

## 共享对象草案

### AccountProfile

`AccountProfile` 是 `ChannelProfile` 的 P1 扩展。它承载账号画像、账号基准和用户授权的业务字段；是否派生成聚合画像由模型或视图需要决定。

```ts
type DouyinAccountKind =
  | "douyin_account"
  | "douyin_shop"
  | "douyin_live_account"
  | "douyin_short_video_account";

interface AccountProfile {
  channelId: string;
  accountGroupId?: string;
  accountKind: DouyinAccountKind;
  platformType: "content_ecommerce";
  channelType: "short_video" | "live_stream" | "shelf_ecommerce";
  displayNamePolicy: "user_authorized" | "mock";
  displayName?: string;
  timeWindow: string;
  sampleSize: number;
  source: string;
  sourceType: "mock" | "user_authorized" | "sanitized_aggregate" | "manual_mapping";
  generatedAt: string;
  tags: ProfileTagScore[];
  benchmarkTopTags: AccountBenchmarkTopTag[];
  performance: AccountPerformanceIndex;
  unmappedFields: UnmappedAccountField[];
  qualityFlags: string[];
  admissionReportId?: string;
}
```

```ts
interface AccountBenchmarkTopTag {
  dimension: "demo" | "style" | "price" | "occasion" | "intent" | "channel" | "external";
  tagId?: string;
  sourceField: string;
  sourceLabel?: string;
  score: number;
  confidence: number;
}
```

```ts
interface AccountPerformanceIndex {
  salesVolumeIndex?: number;
  revenueIndex?: number;
  conversionIndex?: number;
  contentInteractionIndex?: number;
  rankBucket?: "top" | "high" | "mid" | "low" | "unknown";
}
```

### ProductAccountFitDiagnostic

`ProductAccountFitDiagnostic` 是“款账号匹配诊断”的稳定输出。它复用 PLS 的 `MatchResult` 语义：分数、置信度、positive / negative drivers、recommendation、risks 和 quality flags。

```ts
interface ProductAccountFitDiagnostic {
  diagnosticId: string;
  workspaceId: string;
  skuId: string;
  accountChannelId: string;
  predictionId?: string;
  modelVersion: string;
  adapterVersion: string;
  source: string;
  sourceType: "derived";
  generatedAt: string;
  fitScore: number;
  fitConfidence: number;
  recommendation: "priority_launch" | "test_launch" | "observe" | "avoid";
  positiveDrivers: MatchDriver[];
  negativeDrivers: MatchDriver[];
  dimensionDiagnostics: AccountFitDimensionDiagnostic[];
  adjustmentAdvice: AdjustmentAdvice[];
  risks: string[];
  qualityFlags: string[];
  legacyFitScore?: LegacyFitScoreReference;
}
```

```ts
interface AccountFitDimensionDiagnostic {
  dimension: "demo" | "style" | "price" | "occasion" | "intent" | "channel" | "external";
  productTopTagId?: string;
  accountTopTagId?: string;
  status: "matched" | "mismatch" | "partial" | "unmapped";
  gapScore: number;
  confidence: number;
  reasonCode:
    | "same_top_tag"
    | "nearby_tag"
    | "top_tag_gap"
    | "missing_product_tag"
    | "missing_account_tag"
    | "unmapped_external_dimension";
}
```

```ts
interface LegacyFitScoreReference {
  score: number;
  source: "legacy_dashboard";
  usage: "diagnostic_reference_only";
}
```

### AdjustmentAdvice

`AdjustmentAdvice` 是 V 域“优化调整清单”的唯一输入。它可以引用用户授权的业务字段；用于模型解释时应保留 evidence 和来源。

```ts
interface AdjustmentAdvice {
  adviceId: string;
  priority: "high" | "medium" | "low";
  dimension: "demo" | "style" | "price" | "occasion" | "intent" | "channel" | "external";
  currentProductTagId?: string;
  targetAccountTagId?: string;
  actionType:
    | "copy_adjustment"
    | "content_angle_adjustment"
    | "pricing_position_review"
    | "account_selection_review"
    | "mapping_review";
  direction: string;
  rationale: string;
  expectedImpactIndex?: number;
  evidence: {
    productScore?: number;
    accountScore?: number;
    gapScore?: number;
    sourceField?: string;
  };
}
```

## Adapter Interface

M 域先实现 interface 和 contract test，真实算法由用户后续提供。

```ts
interface AccountFitAdapterInput {
  productProfile: ProductProfile;
  accountProfile: AccountProfile;
  productAccountContext?: {
    skuId: string;
    categoryLv1?: string;
    categoryLv2?: string;
    priceBand?: string;
    performance?: ProductPerformanceIndex;
  };
  options?: {
    includeLegacyFitScore?: boolean;
    algorithmVersion?: string;
  };
}

interface AccountFitAdapter {
  diagnose(input: AccountFitAdapterInput): ProductAccountFitDiagnostic;
}
```

Adapter 约束：

- 输入可使用 PLS 内部对象、用户授权业务数据或模型派生特征。
- 输出 drivers 必须引用 `tagId`，不能引用 dashboard 原始字段值。
- 算法未提供前，M 域只能输出可解释 baseline 或 `qualityFlags: ["algorithm_pending_user_formula"]`。
- `legacyFitScore` 只可作为诊断参考，不可替代 `fitScore` 的正式模型口径。

## Dashboard 字段映射边界

本地结构检查确认字段类别、行数和可复刻范围；用户授权的真实业务字段和值可进入 PLS。观察到的字段类别包括：商品基础信息、销售表现、人群画像、设备信息、活跃度、兴趣行为、综合分析、账号画像基准、款账号 TOP1 对比、优化调整清单。

| Dashboard 字段类别 | PLS 目标 | 映射口径 |
|---|---|---|
| 商品基础信息 | `SKU.attributes` / `ProductDNA` | 保留真实款号、商品名、类目、结构属性；模型需要时派生 ProductDNA |
| 销售表现 | `ProductPerformanceIndex` / `AccountPerformanceIndex` | 可保留销量、销售额、排名；模型需要时再派生指数、分层或 rank bucket |
| 人群画像 | `ProfileTagScore[]` | 年龄、性别、城市等级、消费能力等可映射到既有 `demo.*` / `price.*` |
| 兴趣与行为 | `ProfileTagScore[]` 或 `unmappedFields` | 能解释到 PLS taxonomy 的才映射；其余保留为字段级 unmapped，不扩 taxonomy |
| 触点偏好 / 活跃度 | `channel.*` / `AccountProfile.performance` | 抖音直播、短视频、货架等映射到既有 `channel.*`；平台活跃度只作为指数 |
| 设备信息 | `unmappedFields` | 手机品牌、手机价格默认不进 PLS taxonomy，除非 X 总控新增标签 |
| 八大消费群体 | `external` dimension / `unmappedFields` | 不直接新增 segment；需 D/X 评审是否能还原为既有 tag 组合 |
| 号货匹配度 | `legacyFitScore` | 仅作为 legacy reference；正式 `fitScore` 等用户算法或 M adapter 输出 |
| 款 vs 账号 TOP1 | `dimensionDiagnostics[]` | 转为维度诊断；原始中文列名和值可作为用户授权 BI 字段展示 |
| 优化调整清单 | `AdjustmentAdvice[]` | 转为 advice，可保留真实款号、账号名、销售额和投流金额等用户授权字段 |

## API 语义草案

正式 API 和 DB schema 由 A-P1-E3 落地前再次回流 X 总控。本卡先冻结语义。

| 能力 | 建议路径 | 说明 |
|---|---|---|
| 读取账号 channel | `GET /channels?platformType=content_ecommerce&accountKind=douyin_live_account` | 复用现有 channel 列表语义 |
| 读取账号画像 | `GET /channels/{channelId}` | 返回 `AccountProfile` 投影 |
| 生成账号货诊断 | `POST /account-fits` | 输入 `predictionId` 或 `skuId` + `accountChannelId` |
| 读取诊断结果 | `GET /account-fits?skuId=&accountChannelId=` | 默认 latest，历史保留策略由 A 域设计 |
| 导出诊断报告 | V 域浏览器 CSV 或后端 report endpoint | 可导出用户授权业务字段和派生诊断字段 |

## 展示与导出口径

默认可展示：

- 真实账号名、真实款号、真实商品名。
- 真实销售额、真实投流预算、真实成本、真实 ROI。
- 用户授权的用户级、订单级、会员级、设备级、DMP 成员级数据。
- 原始 dashboard HTML、原始字段值、原始业务文案。
- `skuId` / `accountChannelId`。
- `ProfileTagScore` 聚合标签、比例、置信度、样本量、时间窗口。
- `fitScore`、`fitConfidence`、recommendation、drivers、risks、qualityFlags。
- 原始 performance 字段、指数化或分层后的 performance 字段。

CSV / audit 口径：

- CSV 可导出用户授权业务字段和 `fitScore`、`fitConfidence`、recommendation、driver tagId、risks、qualityFlags、generatedAt 等派生字段。
- audit 可写 `diagnosticId`、`modelVersion`、`adapterVersion`、`sourceType`、`admissionReportId`、处理阶段和必要 payload；是否裁剪按产品调试需要决定。

## 缺口记录

算法缺口：

- 真实“号货匹配度”算法公式尚未由用户提供。
- 旧 dashboard 的 `号货匹配度` 只能作为 legacy reference，不能声明为 PLS 正式模型分。

字段缺口：

- 八大消费群体、设备信息、平台兴趣类字段需要 D/X 逐项确认是否映射、保留为 `external` 诊断，或进入 unmapped。
- 真实款号、账号名、销售额、用户级明细和个人敏感标识在用户授权下均可进入 PLS；算法解释仍需保留来源、版本和适用边界。

实现缺口：

- A 域尚未落 `AccountProfile` / `ProductAccountFitDiagnostic` schema 和 endpoint。
- V 域尚未实现账号画像基准、款账号对比和优化清单视图。
- D 域尚未产出 sourceField/sourceValue 到 tagId 的 mapping template。

## 注意事项

- 本契约不改变 `docs/profile-taxonomy-v0.md`。任何新增 tag 必须回流 X 总控。
- 静态 dashboard 的代码和 BI 数据允许进入 PLS，用于完整复刻业务 BI 视图。
- P1-E 后续检查重点是契约一致性、算法公式状态、数据来源可追溯和 UI/API 可用性，不做隐私红线拦截。
