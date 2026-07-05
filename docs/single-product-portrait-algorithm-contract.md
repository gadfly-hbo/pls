# Single Product Portrait Mapping Algorithm Contract

目的：冻结 PLS 模型算法专题中“单品商品属性 -> 单品人群画像”的第一期口径，把用户提供的抖音单款商品信息表与单款商品人群画像真源转化为可实现、可验证、可回滚的模型 baseline contract。

## 1. 背景与数据真源

本专题输入来自用户确认的本地文件：

| 文件 | 角色 | 读取结论 |
|---|---|---|
| `/Users/huangbo/Downloads/单款信息表.xlsx` | 商品属性输入 X | 103 款商品，25 个字段，核心字段包括 `款号`、`性别修正`、`品类`、`心智产品`、`IP/联名`、`特殊功能/材质`、`记忆点`、`版型`、`面料`、`FAB`、`25Q3产品销额`、`26Q3产品规划销额` |
| `/Users/huangbo/Downloads/10A326100109画像数据（单款商品人群画像）.csv` | 真实画像目标 Y | 25 个画像维度，约 2984 条可解析标签行，字段为 `标签类型`、`标签`、`10A326100109-占比`、`10A326100109-tgi` |
| `/Users/huangbo/Downloads/单品画像映射引擎-实现逻辑梳理.docx` | 参考方案 | 可作为规则引擎思路参考，不作为已验证实现 |
| `/Users/huangbo/Downloads/单品画像映射引擎-代码实现.docx` | 参考方案 | 可作为模块拆分参考，不作为当前仓库已存在源码或结果 |

数据准入口径：以上文件为用户给到 PLS 并要求用于产品化的项目数据，默认允许进入算法文档、后续代码、fixture、API、CSV、audit 和前端展示。仍需保留字段来源、样本量、时间窗口、质量标记和算法限制。

## 2. 总控结论

当前只有 `10A326100109` 一款商品具备真实单品画像 Y，不能训练或验证具备泛化能力的监督模型。第一期必须定义为：

- `single_product_portrait_rule_baseline`：规则驱动 + 单锚点校准的可解释 baseline。
- 不是已训练模型，不得在 UI、API、报告或 changelog 中表述为“训练完成”或“泛化预测已验证”。
- Kimi 两份文档中的风格词典、面料映射、规则权重和 21 组预测规则可作为候选规则来源，但进入 PLS 前必须逐条编码、测试和标注来源。
- 真实画像 CSV 是输出形态和校准锚点，不代表所有新品都应复制 `10A326100109` 分布。

第一期目标是让用户可以输入新品商品属性，得到一份与平台回流画像同构的预测画像表，并清楚看到每个维度的规则证据、置信度和不可用边界。

## 3. 与既有 PLS 模型 contract 的关系

现有 `docs/model-p2-8-new-product-prediction-contract.md` 定义的是 PLS 内部 `PredictedProductProfile`，要求输出 `ProfileTagScore[]` 且 tagId 来自 `docs/profile-taxonomy-v0.md`。

本专题新增的是平台回流画像形态：

```ts
interface PlatformPortraitRow {
  labelType: string;
  label: string;
  share: number | null;
  tgi: number | null;
  source: "single_product_portrait_rule_baseline";
  confidence: number;
  evidence: PortraitEvidence[];
  qualityFlags: string[];
}
```

二者关系：

1. 平台画像输出保留原始 `标签类型 / 标签 / 占比 / TGI` 口径，不强行塞入现有 taxonomy。
2. 只有被显式映射到 `profile-taxonomy-v0.md` 的标签，才能 bridge 为 `PredictedProductProfile.predictedProfileTags`。
3. 未映射的平台标签必须进入 `unmappedPlatformLabels` 或 `explanationSources`，不能伪造成 PLS tagId。
4. 后续 A/V 消费时应同时展示平台画像表和 PLS bridge 状态，避免误以为全量平台标签都已进入 PLS taxonomy。

## 4. 输入 contract

第一期输入来自 `单款信息表.xlsx` 的单行商品属性。

```ts
interface SingleProductPortraitInput {
  product: {
    skuId: string;
    gender: string;
    brand: string;
    productName?: string;
    category: string;
    year?: number;
    season?: string;
    productLifecycle?: string;
    mentalProduct?: string;
    ipCollaboration?: string;
    specialFunctionOrMaterial?: string;
    memoryPoint?: string;
    subCategory?: string;
    groupTag?: string;
    fitType?: string;
    fabric?: string;
    fab?: string;
    specification?: string;
    collarType?: string;
    length?: string;
    productNote?: string;
    historicalSales25Q3?: number | null;
    plannedSales26Q3?: number | null;
  };
  options?: {
    outputTopNPerDimension?: number;
    includeLongTailDimensions?: boolean;
    bridgeToPlsTaxonomy?: boolean;
  };
}
```

字段纪律：

- `skuId`、`gender`、`category` 是最低可用字段。
- `FAB`、`面料`、`版型`、`IP/联名`、`特殊功能/材质` 是主要规则证据来源。
- `25Q3产品销额`、`26Q3产品规划销额` 可作为业务重要性和优先级信号，第一期不直接推导人群偏好，避免把规划销售额误当消费者画像。
- 缺失字段必须进入 `qualityFlags`，不得补造商品属性。

## 5. 输出 contract

```ts
interface SingleProductPortraitPrediction {
  skuId: string;
  generatedAt: string;
  modelVersion: "single-product-portrait-rule-baseline-0.1";
  modelPath: "rule_baseline";
  sourceType: "derived";
  anchorSkuId: "10A326100109";
  inputCoverage: {
    requiredFieldCoverage: number;
    optionalSignalCoverage: number;
    usedFields: string[];
    missingFields: string[];
  };
  platformPortraitRows: PlatformPortraitRow[];
  dimensionSummaries: Array<{
    labelType: string;
    topLabels: Array<{ label: string; share: number | null; tgi: number | null; confidence: number }>;
    qualityFlags: string[];
  }>;
  plsBridge?: {
    predictedProfileTags: ProfileTagScore[];
    unmappedPlatformLabels: Array<{ labelType: string; label: string; reason: string }>;
    bridgeCoverageRate: number;
  };
  riskFlags: Array<
    | "single_anchor_only"
    | "baseline_not_trained_model"
    | "low_input_coverage"
    | "platform_label_unmapped"
    | "csv_source_row_anomaly"
    | "manual_rule_weight"
  >;
  explanationSources: PortraitEvidence[];
}
```

输出要求：

- `platformPortraitRows` 的 `labelType` 与 `label` 必须保留平台原始口径。
- `share` 用 0-1 小数表达；CSV 导出层再格式化为百分比。
- `tgi` 无法估算时为 `null`，不能用 0 替代。
- 第一版必须固定输出 `single_anchor_only`、`baseline_not_trained_model`、`manual_rule_weight`。
- 若使用当前 CSV 真源，必须记录 `csv_source_row_anomaly`，因为源文件有 1 行 6 字段异常。

## 6. 第一版算法路径

第一期采用 5 层串行处理。

### 6.1 Source Parser

- 读取商品属性 XLSX，保留原字段名。
- 读取画像 CSV，按 UTF-8 解析。
- 对 4 字段正常行进入画像锚点。
- 对异常行写入 quality report；本次发现异常行：
  - `电商品类成交偏好,服饰配件皮带帽子围巾-防晒护具,0%,-,7.35%,671.6658532250065`

异常行处理口径：第一期不自动拆分成两行，先标记为 `csv_source_row_anomaly` 并从校准锚点中排除，等待用户或平台导出规则确认。

### 6.2 Feature Extractor

提取以下信号：

| 信号 | 来源字段 | 示例 |
|---|---|---|
| 基础属性 | `性别修正`、`品类`、`年份`、`季节` | 女 / 长袖T恤 / 2025 / Q3 |
| 版型信号 | `版型` | 修身型、宽松型、宽松阔腿 |
| 面料信号 | `面料`、`FAB` | 莱赛尔、森柔、三防、牛仔、羊毛 |
| 风格语义 | `FAB`、`记忆点`、`商品名称` | 显瘦、通勤、复古、设计感、工装 |
| 功能/IP | `特殊功能/材质`、`IP/联名`、`心智产品` | SMARTECH、中国航天、森柔牛仔 |
| 业务优先级 | `26Q3产品规划销额`、`25Q3产品销额` | 仅用于排序和抽样优先级 |

### 6.3 Rule Engine

规则类型：

1. 性别 + 品类基础分布。
2. 版型 -> 年龄、场景、风格需求。
3. 面料 -> 消费力、价值观、舒适/功能偏好。
4. FAB 风格语义 -> 兴趣、消费群体、品类偏好。
5. IP/联名/特殊功能 -> 科技、运动、户外、潮流等兴趣信号。
6. 锚点校准 -> 参考 `10A326100109` 的标签维度结构与分布形态。

规则必须输出 evidence：

```ts
interface PortraitEvidence {
  sourceField: string;
  sourceValue: string;
  ruleId: string;
  targetLabelType: string;
  targetLabel: string;
  effect: "increase" | "decrease" | "set_prior";
  weight: number;
  rationale: string;
}
```

### 6.4 Calibration

校准分三类：

- 结构校准：输出维度集合参考 `10A326100109` 真实画像的 25 个 `标签类型`。
- 分布校准：同一维度内 share 归一化；性别、年龄、消费能力、城市等级等封闭维度总和应接近 1。
- TGI 校准：没有平台大盘基准时，不反推真实大盘；可用锚点 TGI 作为相似方向参考，但输出必须标记为估算或 `null`。

不得把 `10A326100109` 的所有 Top 标签直接复制给无关新品。复制锚点只允许作为默认 prior，必须被商品属性规则修正。

### 6.5 PLS Bridge

Bridge 只做白名单映射：

- 平台 `预测性别` 可映射到 PLS `demo.*` 性别标签，前提是 tagId 已存在。
- 平台年龄、城市等级、消费能力等维度需先确认 taxonomy 对应关系。
- 电商品类偏好、品牌偏好、城市、兴趣长尾第一期默认不全量映射。

Bridge 覆盖率必须输出，低覆盖不是错误，但必须可见。

## 7. 验证标准

M-P5-PORTRAIT-1 实现时至少验证：

1. Source parser 能读取 103 款商品和画像锚点，并报告 1 行 CSV 异常。
2. 对 `10A326100109` 若商品属性存在，能生成画像并与真实锚点做 backtest 对比。
3. 若 `10A326100109` 不在商品表中，必须输出 `anchor_product_attributes_missing`，不得伪造属性。
4. 对至少 5 款不同品类商品生成画像，输出应体现性别、品类、版型、面料、IP/功能差异。
5. 同一商品重复运行输出稳定。
6. 所有规则输出 evidence，且 evidence 可追溯到输入字段。
7. 输出包含 `baseline_not_trained_model` 和 `single_anchor_only` 风险。
8. 不新增 taxonomy tagId，不改 DB schema，不导入主 workspace。

建议指标：

- `dimensionCoverageRate`：输出维度数 / 锚点维度数。
- `closedDimensionMassError`：封闭维度 share 总和与 1 的偏差。
- `anchorTopLabelOverlap@K`：锚点商品预测与真实画像 Top K 标签重合。
- `evidenceCoverageRate`：有 evidence 的输出行占比。
- `bridgeCoverageRate`：可映射到 PLS taxonomy 的平台标签占比。

## 8. 后续升级门槛

| 阶段 | 数据条件 | 允许方法 |
|---|---|---|
| 当前 | 1 款有真实画像 | 规则 baseline + 单锚点校准 |
| 小样本 | 5-20 款有真实画像 | 规则权重人工校准 + 留一验证 |
| 半监督 | 20-50 款有真实画像 | 规则特征 + 简单多任务模型 smoke |
| 监督模型 | 50+ 款有真实画像，且有时间窗口 | 多任务模型、时间切分 backtest、分层质量评估 |

只有达到监督模型阶段，才能移除 `baseline_not_trained_model`。只有完成时间切分验证，才能声明泛化能力。

## 9. M-P5-PORTRAIT-1 任务边界

下一张 M 域实现卡应完成：

- 新增 `apps/model/src/single-product-portrait.ts` 或同等模块。
- 实现 source parser、feature extractor、rule engine、calibration 和 export。
- 新增 contract test / smoke，使用用户提供的本地文件或先落地受控 fixture。
- 输出命令行入口或脚本，支持按 `skuId` 和批量生成。
- 文档记录运行命令、输出样例、异常行和风险。

非目标：

- 不训练神经网络。
- 不新增 DB schema。
- 不修改 Admin Import。
- 不把平台长尾标签强行映射为 PLS taxonomy。
- 不声明正式算法效果。
