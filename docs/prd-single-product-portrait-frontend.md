# PLS 单品画像预测前端落地 PRD

## 目的

把 Q2 73 款真实商品监督画像模型落到现有 PLS 前端工作台，让业务用户可以在“新品预测工作台”内完成单款和批量单品画像预测，查看 6 个核心画像维度、证据、风险说明，并下载结果或错误报告。

本 PRD 冻结第一期产品边界、API contract、批量文件规则、错误码、前端信息架构和 AgentOps 任务拆分口径。

## 背景

当前模型侧已有基于 `版型 / 面料 / FAB` 三字段的 Q2 73 样本监督画像模型，输出覆盖：

- `预测性别`
- `预测年龄段`
- `预测消费能力`
- `城市等级`
- `八大消费群体`
- `预测人生阶段`

模型已完成 LOO 验证和 Q1 95 款批量预测 CLI 验证。第一期前端落地目标不是声明泛化能力，而是让业务用户可用、可理解、可纠错地消费该模型。

## 范围

### 第一期开工范围

1. 在现有“新品预测工作台”内增加 `单品画像预测` 二级区域，不新增一级导航。
2. 支持 `单款预测`。
3. 支持 `批量预测`，文件类型包含 `.xlsx` 和 `.csv`。
4. 批量预测采用 preview -> execute 两步：
   - preview 校验文件、表头、行级字段、版型、长度、重复款号和额外列。
   - execute 重新上传同一文件，重新解析校验，并只对有效行执行预测。
5. 支持下载：
   - 成功预测结果 CSV。
   - 错误报告 CSV。
   - 完整 JSON。
6. 前端展示模型风险说明、模型版本、样本量、训练或生成时间、LOO 指标和支持版型。
7. `VITE_USE_MOCK=true` 与 `VITE_USE_MOCK=false` 都要可运行，Mock 与真实 API shape 同构。

### 非目标

1. 不写入 `prediction` 表。
2. 不触发人货匹配。
3. 不进入经营飞轮。
4. 不做后台异步任务、轮询、取消任务或服务端 artifact。
5. 不做浏览器端 CSV/XLSX 解析。
6. 不做拖拽上传、多文件队列或上传进度条。
7. 不做失败行在线编辑。
8. 不自动纠正版型、FAB、面料或款号。
9. 不在 API 请求中接受任意本地 `modelPath`。

## 信息架构

现有一级导航保持不变，落点仍在“新品预测工作台”。

页面内新增：

1. `单品画像预测`
2. 二级模式：
   - `单款预测`
   - `批量预测`

建议组件拆分：

- `SinglePortraitForm`
- `SinglePortraitBatchUpload`
- `SinglePortraitResult`
- `SinglePortraitBatchResults`
- `SinglePortraitModelInfo`

`Dashboard.tsx` 只负责组合，不承载全部预测和展示逻辑。

模块状态与现有 `currentSku / prediction / setPrediction` 隔离。单款和批量结果只保留在 `单品画像预测` 模块内部，不自动覆盖旧新品预测链路状态。

## 用户流程

### 单款预测

1. 用户进入 `单品画像预测`。
2. 前端加载 metadata。
3. 用户填写：
   - `款号`
   - `版型`
   - `面料`
   - `FAB`
4. 用户点击 `预测单款画像`。
5. 前端展示 `单款画像结果`：
   - 6 个维度 top3 和 share。
   - evidence。
   - risk flags。
   - 模型说明。

单款表单提供 `填入示例` 按钮。示例只填表，不写库、不触发后续链路，且必须使用 metadata 中存在的 `fitType`。

### 批量预测

1. 用户下载 CSV 模板或按同样表头准备 `.xlsx`。
2. 用户选择 `.xlsx` 或 `.csv` 文件。
3. 用户点击 `校验批量文件`。
4. 前端调用 preview API，展示：
   - 总行数。
   - 有效行数。
   - 失败行数。
   - warning 数量。
   - 文件级错误。
   - 行级错误。
   - 额外列。
5. 如果没有文件级错误且有效行数大于 0：
   - 全部有效时按钮文案为 `执行批量预测`。
   - 部分失败时按钮文案为 `预测有效行`。
6. execute 重新上传同一文件，后端重新解析校验，只对有效行预测。
7. 页面展示 `批量画像结果`：
   - 默认列表摘要。
   - 点击或展开单个 SKU 后复用单款结果组件展示完整详情。
8. 用户可下载预测结果 CSV、错误报告 CSV、完整 JSON。

批量结果保留在当前页面 state 中。切换 `单款预测 / 批量预测` 不丢失；重新上传并执行会覆盖上一批；提供 `清空结果` 按钮；刷新页面后不保留。

## 输入规则

### 必需字段

`.xlsx` 与 `.csv` 都严格识别以下四列表头：

- `款号`
- `版型`
- `面料`
- `FAB`

缺少任一列为文件级错误。额外列允许存在，忽略并给文件级 warning。

### 文件规则

- 支持 `.xlsx` 和 `.csv`。
- `.xlsx` 只读取第一个 sheet。
- 第一行为表头。
- 第一条数据行的 `rowNumber = 2`。
- 最大文件大小：`2 MB`。
- 最大数据行数：`100`。
- CSV 需要去除 BOM。

### 字段规则

- 所有字段只做前后 `trim`，不做语义清洗。
- `款号` 必填，最长 `100` 字符。
- `版型` 必填，必须在 metadata `fitTypes` 中。
- `面料` 必填，最长 `500` 字符。
- `FAB` 必填，最长 `2000` 字符。
- 空 `版型` 不自动填 `X型`。
- 未知版型为行级错误 `unknown_fit_type`，不进入预测。
- 重复 `款号` 不阻塞，逐行预测，并给 warning `duplicate_sku_id_in_file`。
- 同一结果和下载中使用 `rowNumber + skuId` 标识，避免重复款号混淆。

## API Contract

### Metadata

```http
GET /api/v0/single-product-portrait/metadata
Authorization: Bearer pls-p0-demo-token
X-PLS-Workspace: ws_demo
```

模型可用时：

```json
{
  "code": "ok",
  "data": {
    "modelAvailable": true,
    "fitTypes": ["X型"],
    "requiredColumns": ["款号", "版型", "面料", "FAB"],
    "maxBatchRows": 100,
    "maxFileBytes": 2097152,
    "modelVersion": "single-product-portrait-supervised-q2-73",
    "trainedAt": null,
    "sampleCount": 73,
    "riskFlags": [
      "baseline_not_trained_model",
      "small_sample_supervised_model",
      "no_temporal_validation"
    ],
    "metricsSummary": []
  }
}
```

模型不可用时 metadata 仍返回 200：

```json
{
  "code": "ok",
  "data": {
    "modelAvailable": false,
    "requiredColumns": ["款号", "版型", "面料", "FAB"],
    "maxBatchRows": 100,
    "maxFileBytes": 2097152,
    "error": {
      "code": "model_not_available",
      "message": "模型文件未生成，请先训练模型"
    }
  }
}
```

默认模型路径：

- `data/local/single-product-portrait-q2-73sample/model.json`

允许服务端用环境变量覆盖：

- `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`

API 请求不得传任意本地模型路径。

### 单款预测

```http
POST /api/v0/single-product-portrait/predict
Authorization: Bearer pls-p0-demo-token
X-PLS-Workspace: ws_demo
Content-Type: application/json

{
  "skuId": "NEW_SKU_001",
  "fitType": "修身型",
  "fabric": "全棉",
  "fab": "修身显瘦通勤T恤，舒适亲肤"
}
```

成功响应：

```json
{
  "code": "ok",
  "data": {
    "prediction": {}
  }
}
```

`prediction` 为完整 `SingleProductPortraitPrediction`。

失败响应的错误对象：

```json
{
  "code": "bad_request",
  "error": {
    "code": "unknown_fit_type",
    "message": "版型不在当前模型支持列表中",
    "field": "fitType",
    "rawValue": "修身"
  }
}
```

### 批量 preview

```http
POST /api/v0/single-product-portrait/predict/batch/preview
Authorization: Bearer pls-p0-demo-token
X-PLS-Workspace: ws_demo
Content-Type: multipart/form-data

file: <xlsx-or-csv>
```

响应：

```json
{
  "code": "ok",
  "data": {
    "totalRows": 95,
    "validRows": 92,
    "invalidRows": 3,
    "fileErrors": [],
    "rowErrors": [],
    "warnings": [],
    "extraColumns": [],
    "requiredColumns": ["款号", "版型", "面料", "FAB"]
  }
}
```

### 批量 execute

```http
POST /api/v0/single-product-portrait/predict/batch
Authorization: Bearer pls-p0-demo-token
X-PLS-Workspace: ws_demo
Content-Type: multipart/form-data

file: <xlsx-or-csv>
```

响应：

```json
{
  "code": "ok",
  "data": {
    "totalRows": 95,
    "successCount": 92,
    "failureCount": 3,
    "warningCount": 1,
    "results": [],
    "rowErrors": [],
    "warnings": [],
    "metadata": {}
  }
}
```

文件能解析且表头有效，但所有数据行失败时，仍返回 `code: "ok"`，`successCount: 0`，并返回完整错误报告。文件级错误才阻止结果生成。

### Header 口径

单款和批量都带：

- `Authorization: Bearer pls-p0-demo-token`
- `X-PLS-Workspace: ws_demo`

不需要：

- `X-PLS-Admin-Token`
- `Idempotency-Key`

原因：第一期不写库、不执行 admin 操作、不产生持久副作用。

## 错误码

第一期冻结以下稳定 code。前端按 `code` 映射中文文案，不靠英文 message 判断。

文件级错误：

- `model_not_available`
- `unsupported_file_type`
- `file_too_large`
- `file_parse_failed`
- `missing_required_columns`
- `empty_file`
- `row_limit_exceeded`

行级错误：

- `required_field_empty`
- `unknown_fit_type`
- `field_too_long`

Warning：

- `duplicate_sku_id_in_file`
- `extra_columns_ignored`

错误对象基础结构：

```ts
interface PortraitInputIssue {
  code: string;
  message: string;
  field?: "skuId" | "fitType" | "fabric" | "fab" | "file";
  rawValue?: string;
  rowNumber?: number;
  skuId?: string;
}
```

批量错误报告 CSV 字段：

```text
rowNumber,skuId,field,code,message,rawValue
```

## 结果展示

### 单款结果

展示三块：

1. `画像概览`
   - 6 个维度卡片。
   - 每个维度展示 top3 label 与 share 进度条。
   - UI 百分比保留 1 位小数，例如 `34.7%`。
2. `证据与驱动`
   - 来源字段：`版型` / `面料` / `FAB`。
   - 命中特征或关键词，例如 `fabric_cotton`、`style_commute`。
   - 中文 reason。
   - 不展示 Ridge 系数、矩阵或标准化参数。
3. `模型风险说明`
   - 常驻展示 `baseline_not_trained_model`、`small_sample_supervised_model`、`no_temporal_validation`。
   - 展示 73 样本 LOO 指标。
   - 明确说明：当前模型只完成小样本 LOO 验证，不承诺新品上线后的泛化表现。

如果某个 label 缺少 evidence，显示“暂无明确驱动证据”，不能空白。

### 批量结果

默认展示摘要表：

- `款号`
- 预测状态
- Top 性别
- Top 年龄
- Top 消费能力
- Top 城市等级
- Top 消费群体
- Top 人生阶段
- 风险摘要

点击行或 `查看详情` 后复用单款 `SinglePortraitResult`，展示完整 6 维 top3、evidence 和 risk flags。

城市等级、八大消费群体需要展示低稳定性提示，因为当前 LOO top1 约为 30-40%。

## 下载格式

### 预测结果 CSV

只包含成功预测结果。采用长表结构：

```text
rowNumber,skuId,dimension,rank,label,share,confidence,sourceFields,evidenceKeywords,riskFlags
```

CSV 下载保留后端原始 `share` 数值，不做 UI 展示层四舍五入。

### 错误报告 CSV

只包含失败行和 warning：

```text
rowNumber,skuId,field,code,message,rawValue
```

### 完整 JSON

包含：

- `metadata`
- `results`
- `rowErrors`
- `warnings`
- 完整 `SingleProductPortraitPrediction`

## 模型说明指标

metadata 的 `metricsSummary` 应提供 6 个维度的 LOO top1/top3 指标。前端不硬编码指标。

当前参考指标：

| 维度 | top1 命中率 | top3 命中率 |
|---|---:|---:|
| 预测性别 | 87.7% | 100.0% |
| 预测人生阶段 | 80.8% | 100.0% |
| 预测年龄段 | 68.5% | 80.4% |
| 预测消费能力 | 63.0% | 100.0% |
| 城市等级 | 39.7% | 77.6% |
| 八大消费群体 | 31.5% | 81.3% |

这些指标只能作为模型边界说明，不得表述为线上泛化承诺。

## 实现决策

1. 后端采用专用业务路由 `/api/v0/single-product-portrait/*`，不复用 Tools run/artifact 模式。
2. 后端服务端加载 `model.json`，不通过 CLI 子进程预测。
3. `apps/server` 允许新增 `xlsx` 依赖，版本与 `apps/model` 保持一致：`^0.18.5`。
4. multipart 解析优先使用 Hono `c.req.parseBody()`，不新增 `multer`、`busboy` 等依赖，除非实现验证证明 Hono 能力不足。
5. A 域可以跨包 import `apps/model/src/single-product-portrait-supervised.ts`，延续当前 monorepo 内部源码引用方式。
6. M 域提供稳定的 metadata 与单条 clean input 预测服务；A 域负责 API、multipart、CSV/XLSX 解析和输入校验；V 域只消费 API。
7. preview 与 execute 使用同一套后端解析校验函数。
8. preview 不生成 stagedFileId；execute 重新上传并重新解析文件。
9. 单款和批量共用同一后端核心预测函数。
10. 单款结果组件和批量展开详情复用同一前端展示组件。

## 验收标准

1. metadata API 可返回 `modelAvailable`、`fitTypes`、`requiredColumns`、`maxBatchRows`、`maxFileBytes`、模型版本、风险标记和指标。
2. 模型不可用时 metadata 返回 200 + `modelAvailable: false`，预测 API 返回 `model_not_available`。
3. 单款预测成功返回 6 个维度画像，每个维度 top3 展示正确，evidence 可追溯。
4. 单款空字段、未知版型、超长字段返回稳定错误码。
5. 批量 preview 支持 `.xlsx` 和 `.csv`，只读 `.xlsx` 第一个 sheet。
6. 批量 preview 能识别缺表头、空文件、超 100 行、超 2 MB、未知版型、字段超长、重复款号和额外列。
7. 批量 execute 只预测有效行，失败行不进入预测。
8. 批量 0 有效行但无文件级错误时返回 `successCount: 0` 和完整错误报告。
9. 前端支持下载预测结果 CSV、错误报告 CSV 和完整 JSON。
10. 风险标记、模型版本、模型指标和支持版型在前端可见。
11. `VITE_USE_MOCK=true` 前端可独立运行，Mock 与真实 API shape 同构。
12. `VITE_USE_MOCK=false` Playwright 覆盖 metadata、单款预测和批量 preview/execute，且断言真实请求被命中。
13. 后端 smoke / contract test 覆盖 `.xlsx` 与 `.csv` 解析。

## AgentOps 任务拆分建议

### M-PORTRAIT-FE-1：模型 metadata 与预测服务契约

- domain: `algorithm`
- assignee: `opencode`
- 目标：在现有 Q2 监督模型文件内冻结 server 可消费的 metadata 和 clean input prediction service。
- 允许范围：
  - `apps/model/src/single-product-portrait-supervised.ts`
  - `apps/model/src/single-product-portrait-supervised-contract-test.ts`
  - `apps/model/src/single-product-portrait-supervised-smoke.ts`
  - `apps/model/src/cli.ts`
  - `apps/model/README.md`
  - `docs/notes-model.md`
- 非目标：
  - 不重写 Ridge 算法。
  - 不重训样本。
  - 不改 Q2 数据源。
  - 不改现有预测指标口径。
- 验证：
  - `apps/model npm run typecheck`
  - `npm run single-product-portrait-supervised-contract-test`
  - `npm run single-product-portrait-supervised-smoke`

### A-PORTRAIT-FE-2：单品画像预测 API

- domain: `backend`
- assignee: `mimo`
- depends_on: `M-PORTRAIT-FE-1`
- 目标：实现 metadata、单款预测、批量 preview、批量 execute API。
- 允许范围：
  - `apps/server/src/routes/`
  - `apps/server/src/lib/`
  - `apps/server/src/index.ts`
  - `apps/server/package.json`
  - `apps/server/package-lock.json`
  - `apps/server/scripts/`
  - `apps/server/tsconfig.json`
  - `docs/notes-app.md`
- 非目标：
  - 不写 `prediction` 表。
  - 不新增 admin 写操作。
  - 不复用 Tools artifact 路由。
- 验证：
  - `apps/server npm run typecheck`
  - `apps/server npm run smoke:single-product-portrait`
  - 新增或扩展 API smoke 覆盖 `.xlsx`、`.csv`、metadata、model missing、文件级错误、行级错误和 warning。

### V-PORTRAIT-FE-3：Dashboard 单品画像预测 UI

- domain: `frontend`
- assignee: `kilo`
- depends_on: `A-PORTRAIT-FE-2`
- 目标：在 Dashboard 接入单款和批量预测 UI、mock、下载、风险说明和真实 API E2E。
- 允许范围：
  - `apps/web/src/pages/Dashboard.tsx`
  - `apps/web/src/components/`
  - `apps/web/src/services/api.ts`
  - `apps/web/src/types/index.ts`
  - `apps/web/e2e/`
  - `apps/web/src/index.css`
  - `docs/notes-viz.md`
- 非目标：
  - 不新增一级导航。
  - 不浏览器端解析 CSV/XLSX。
  - 不触发匹配或经营飞轮。
- 验证：
  - `apps/web npm run lint`
  - `apps/web npm run build`
  - `apps/web npm run smoke`
  - `VITE_USE_MOCK=false npx playwright test` 定向覆盖 metadata、单款预测、批量 preview/execute 和风险标记。

## 注意事项

1. 当前 worktree 已存在模型侧未提交改动。任务执行时不得回滚或重置这些文件。
2. 批量上传是模型预测输入，不复用 P7 CSV 导入已有 SQLite 表的写入语义。
3. 前后端 Mock 必须与真实 API 同构，尤其是 metadata、错误码、`rowNumber` 和 batch response shape。
4. 真实 API E2E 必须显式使用 `VITE_USE_MOCK=false`，并断言请求被 `page.route` 或真实后端命中，避免本地 Mock 短路。
5. 页面文案面向业务用户；算法术语如 Ridge、LOO 只出现在模型说明或风险说明区。
