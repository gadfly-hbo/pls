# PLS 工具模块方案

## 目的

工具模块用于处理用户本地画像数据和业务明细导出数据，把三方平台文件、SQL 导出明细和历史业务表加工为 PLS 可消费的标准数据包、聚合表和模型输入。

它不是临时脚本集合，而是 PLS 的正式本地数据加工工作台：

- 第一类工具：从生意参谋、天猫、小红书、抖音等三方平台下载的画像 HTML、CSV、XLSX、Markdown 或 JSON 中提取人群画像、指标板、字段字典和质量报告。
- 第二类工具：把业务 SQL 库导出的订单明细、商品明细、渠道明细加工为商品聚合表、渠道聚合表和 `skuId + channelId + timeWindow` 宽表。
- 所有工具执行都必须保留来源、时间窗口、样本量、字段映射、质量标记和导入审计。

## 定位

工具模块和现有模块的关系：

| 模块 | 职责 |
|---|---|
| 工具模块 | 本地提取、清洗、映射、聚合、生成标准数据包 |
| 数据管理模块 | 数据包 dry run、导入、版本、质量、审计、危险操作 |
| 业务工作台 | 消费 `sku`、`channel_profile`、`wide_table_row`、后续 `product_master`、`channel_entity` |
| 模型模块 | 消费标准画像、商品聚合、渠道聚合和宽表，不直接读取本地原始文件 |

关键原则：

1. 原始本地文件不发送给 LLM。
2. 后端只执行注册表中的本地工具，不能执行任意 shell 或任意 SQL。
3. 工具先生成可验证数据包，再通过受控 import 写入 workspace。
4. 写入数据库前必须经过 dry run、影响范围、质量报告、confirmText、Idempotency-Key 和 audit。
5. 当前 `ws_demo` 可能为空或已有 smoke/demo 数据，工具 smoke 必须优先使用临时 workspace。

## 模块设计

### 1. Tool Registry

`Tool Registry` 是工具模块的外部 interface。调用方只需要知道工具 ID、输入、参数、输出和风险等级，不需要知道底层 Python、Node 或二进制实现。

建议 `ToolDefinition` 字段：

| 字段 | 说明 |
|---|---|
| `toolId` | 稳定 ID，例如 `extract-sycm-member` |
| `name` | 展示名称 |
| `category` | `profile_extract` / `business_aggregate` / `format_convert` |
| `version` | 工具版本 |
| `riskLevel` | `L1` 只读提取、`L2` 本地加工、`L3` 可触发导入 |
| `inputFormats` | 支持的扩展名或目录形态 |
| `outputFormats` | 产物类型，例如 Markdown、JSONL、CSV、package |
| `parameterSchema` | 参数 JSON schema 或等价类型声明 |
| `runner` | 注册表内允许执行的本地命令 |
| `packageType` | 可选，生成的数据包类型 |

### 2. Local Runner

`Local Runner` 执行已注册工具并生成运行记录。

建议运行目录：

```text
data/local/tool-runs/<runId>/
  run_manifest.json
  quality_report.json
  artifacts/
```

`ToolRun` 状态：

```text
queued -> running -> succeeded | failed
```

每次运行必须记录：

- `runId`
- `toolId`
- `workspaceId`
- `inputPath`
- `outputDir`
- `parameters`
- `status`
- `startedAt`
- `finishedAt`
- `artifacts`
- `warnings`
- `errors`

### 3. Package Builder

`Package Builder` 把工具输出转成 PLS 标准数据包。工具运行成功不等于可入库，必须先通过包校验。

第一期支持两类包：

| Package Type | 来源 | 目标 |
|---|---|---|
| `profile-extract` | 三方平台画像文件 | `channel_profile` 或后续 `channel_entity` 画像版本 |
| `business-aggregate` | 订单、商品、渠道明细导出 | `sku`、`channel_profile`、`wide_table_row`，后续 `product_master`、`channel_entity` |

### 4. Import Adapter

`Import Adapter` 接入现有 `apps/server/src/lib/import-packages.ts` 和 Admin Import API。

要求：

1. `dry-run` 只读数据包，返回影响表、行数、版本、质量报告和错误。
2. `execute` 写入目标表、`batch`、`data_import_job`、`db_admin_audit`。
3. 正式导入必须要求 `X-PLS-Admin-Token`、`Idempotency-Key` 和后端校验 `confirmText`。
4. `confirmText` 建议为 `IMPORT TOOL RUN <runId>` 或 `IMPORT <packageType>`。

### 5. Tools Workbench UI

新增一级模块“工具”。

页面结构：

- 左侧工具目录：画像提取、明细聚合、格式转换、最近运行。
- 主区执行配置：工具说明、输入路径、参数、输出目录、dry run、开始执行。
- 结果区：状态、质量报告、产物列表、Markdown/表格/JSON 预览、导入 dry run、确认导入。

前端体验约束：

1. 不做营销页，首屏必须是可操作工具工作台。
2. 长路径、长文件名、长错误信息必须可换行或受控滚动。
3. 390px、768px、1024px、1440px 下按钮、表格和结果区不能重叠。
4. 对 L2/L3 工具明确展示风险等级、输入输出路径和是否会写入 workspace。

## 数据包契约

### profile-extract

建议目录：

```text
profile_extract_package/
  run_manifest.json
  source_manifest.json
  extracted_profiles.jsonl
  aggregate_profile.csv
  aggregate_profile.jsonl
  field_dictionary.csv
  unmapped_fields.csv
  quality_report.json
  report.md
```

核心对象：

```ts
interface ProfileTagScore {
  tagId: string;
  score: number;
  sourceField: string;
  sourceValue: string;
  confidence: number;
  mappingRuleId: string;
}

interface AggregateProfile {
  profileId: string;
  platform: string;
  source: string;
  timeWindow: string;
  sampleSize: number | null;
  tags: ProfileTagScore[];
  unmappedFields: Array<Record<string, unknown>>;
  qualityFlags: string[];
}
```

落库方向：

- 第一阶段可写入 `channel_profile`。
- 后续可写入 `channel_entity` 关联画像版本。
- `tagId` 必须来自 `docs/profile-taxonomy-v0.md`；不能映射的字段进入 `unmapped_fields.csv`。

### business-aggregate

建议目录：

```text
business_aggregate_package/
  run_manifest.json
  source_manifest.json
  product_master.jsonl
  channel_entity.jsonl
  product_aggregate.jsonl
  channel_aggregate.jsonl
  sku_channel_wide_table.jsonl
  field_mapping.csv
  unmapped_fields.csv
  quality_report.json
  report.md
```

核心粒度：

| 对象 | 推荐粒度 | 用途 |
|---|---|---|
| `product_aggregate` | `productId/skuId + timeWindow + dataVersion` | 商品表现、购买画像、商品人群预测 |
| `channel_aggregate` | `channelId + timeWindow + dataVersion` | 渠道人群、渠道表现、人货匹配 |
| `sku_channel_wide_table` | `skuId + channelId + timeWindow` | 训练宽表、回测、匹配解释 |

第一期可先写入现有 `sku`、`channel_profile`、`wide_table_row`；后续再补物理 `product_master` 和更完整的 `channel_entity` adapter。

## API 草案

工具模块建议使用独立前缀：

```text
GET  /api/v0/tools
GET  /api/v0/tools/:toolId

POST /api/v0/tools/runs/dry-run
POST /api/v0/tools/runs
GET  /api/v0/tools/runs
GET  /api/v0/tools/runs/:runId
GET  /api/v0/tools/runs/:runId/artifacts
GET  /api/v0/tools/runs/:runId/artifacts/:artifactId

POST /api/v0/tools/runs/:runId/import-dry-run
POST /api/v0/tools/runs/:runId/import
```

实现前必须按真实路由、schema 和数据源约束更新此 contract，不允许前端凭旧 mock 直接推导后端形态。

## 任务拆分

第一期按 7 张卡推进：

| 任务 | Owner | 目标 |
|---|---|---|
| `X-P4-TOOLS-0` | X | 方案冻结、任务拆卡、文档真源 |
| `A-P4-TOOLS-1` | A | 工具注册表、本地 runner、运行记录 API |
| `D-P4-TOOLS-2` | D | `profile-extract` 包格式、样例工具和 validator |
| `D-P4-TOOLS-3` | D | `business-aggregate` 包格式、字段映射和 validator |
| `A-P4-TOOLS-4` | A | 两类工具包接入 Admin import / data management |
| `V-P4-TOOLS-5` | V | 工具工作台前端 |
| `X-P4-TOOLS-6` | X | 总体验收、临时 workspace smoke、notes/wiki 回流 |

## 验收标准

第一期完成后必须满足：

1. `docs/wiki.html` 有完整任务卡，`docs/tools-module-design.md` 是方案真源。
2. UI 中能看到工具列表，并可运行至少一个本地提取工具。
3. 工具输出包含 manifest、quality report、结构化 JSONL/CSV 和 Markdown 报告。
4. 可以对工具输出包执行 import dry run。
5. 可以在临时 workspace 中确认导入，并在数据管理模块看到 batch、dataVersion、quality report。
6. 不依赖 `ws_demo` 预置业务数据。
7. 后端 typecheck、相关 smoke、前端 lint/build/smoke 或 Playwright 验证通过。

## 注意事项

- 用户提供或确认导入的数据按项目准入口径默认放行；脱敏、聚合、抽样只在用户明确要求或产品建模确实需要时执行。
- 工具模块不得引入任意 SQL console 或任意命令执行能力。
- 对业务 SQL 导出明细，第一期优先处理离线文件，不直接连接生产库。
- 所有真实导入 smoke 优先使用 `ws_tools_<timestamp>` 这类临时 workspace。
- 如果新增 `product_master` 或扩展 `channel_entity` 物理表，必须由 X 总控冻结 schema 后再实现。
