# A-P7-INGEST-2: Data Ingestion CSV 导入已有表后端

## 1. 目标

实现 P7 第一期 CSV 导入后端：接收用户上传 CSV，对目标 SQLite 业务表做 dry-run 校验，校验通过后通过 confirmText 正式导入，并写入 `data_import_job` 与 `db_admin_audit`。

## 2. 范围

- `POST /api/v0/admin/data-ingestion/csv/dry-run`：multipart 上传 CSV，选择目标表，返回 `OperationImpact` + `qualityReport` + `stagedFileId`。
- `POST /api/v0/admin/data-ingestion/csv/import`：JSON body `{ stagedFileId, targetTable, confirmText }`，正式导入。
- CSV 解析、header 归一化、必填/类型/主键重复校验。
- 写 `data_import_job`、`db_admin_audit`，可选写 `batch`。
- Smoke 测试脚本（隔离临时 workspace）。

## 3. 非目标

- CSV 首次建表、XLSX、业务数据库/API 直连、自动 taxonomy 映射。
- 不修改 `apps/web`、`apps/model`、`data/workspaces/ws_demo`。
- 不安装新依赖（CSV 解析手写）。

## 4. 设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 暂存目录 | `data/local/csv-staging/<workspaceId>/<stagedFileId>/` | 与 `data/local/tool-runs/` 同构，避免重启丢失 |
| 执行引用 | JSON `{ stagedFileId, targetTable, confirmText }` | 让 execute 走 `application/json`，复用现有 `idempotencyMiddleware`；multipart upload 不走幂等 |
| CSV 解析 | 手写轻量 parser | 无新依赖；覆盖引号内逗号、转义引号、CRLF/LF |
| 目标表白名单 | `sku`, `channel_profile`, `wide_table_row`, `batch`, `prediction`, `match_result` | 与 D-P7-INGEST-1 契约一致 |
| 写入策略 | `INSERT OR REPLACE` 按目标表主键 upsert | 与现有 import-packages 行为一致，支持重复导入修正 |
| 确认文本 | `IMPORT CSV <tableName>` | 契约 §9 要求 |
| 类型推断 | 基于 `PRAGMA table_info` + 每表列类型覆盖配置（JSON/BOOLEAN/DATETIME） | SQLite 声明类型是 TEXT/INTEGER，需显式标记语义类型 |
| 空值/多余列 | 默认 relaxed 忽略多余列；strict 模式可选阻塞 | 契约 §4.4 建议 |

## 5. 关键文件改动

### 新建

- `apps/server/src/lib/csv-ingestion.ts`：CSV 解析、字段校验、dry-run、execute、持久化 staged file。
- `apps/server/src/routes/admin-data-ingestion.ts`：`/admin/data-ingestion/csv/*` 路由。
- `apps/server/scripts/smoke-csv-ingestion.mjs`：CSV 导入 smoke 测试。
- `data/local/csv-staging/`：运行时暂存目录（`.gitignore` 已覆盖 `data/local/`）。

### 修改

- `apps/server/src/index.ts`：挂载 `adminDataIngestion` 路由到 `/api/v0/admin/data-ingestion`。
- `apps/server/src/lib/dangerous-ops.ts`：`OperationImpact.targetType` 增加 `"csv"`（或 `"csv_upload"`）以支持 CSV 响应；最小影响扩展。
- `docs/p3-db-mgmt-api-contract.md`：新增 `/admin/data-ingestion/csv/dry-run` 与 `/admin/data-ingestion/csv/import` 契约。
- `docs/notes-app.md`：同步 A-P7-INGEST-2 状态。

## 6. 实现细节

### 6.1 CSV 解析函数

```ts
// apps/server/src/lib/csv-ingestion.ts
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv;
```

- 支持 `"` 包裹字段、 `""` 转义 `"` 、字段内逗号/换行。
- 所有 header 经 `normalizeHeader()` 处理：trim、小写、空格/`-`/`.` → `_`、连续 `_` 压缩。
- 重复 header 触发 `header_normalization_collision`。

### 6.2 目标表元数据读取

```ts
interface ColumnMeta {
  name: string;
  type: string; // SQLite declared type
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean; // from PRAGMA table_info pk + index_list
  semanticType: "text" | "integer" | "real" | "numeric" | "boolean" | "json" | "datetime";
}

function getTargetColumns(db: DatabaseSync, tableName: string): ColumnMeta[];
function getPrimaryKeyColumns(db: DatabaseSync, tableName: string): string[];
```

- 必填列 = `NOT NULL` 且 `DEFAULT` 为 null 的列；`workspace_id` 视为上下文字段，CSV 可缺省但提供不一致时 warning。
- 主键列通过 `PRAGMA index_list` 找 `origin = 'pk'` 或 `unique = 1` + `PRAGMA index_info` 推导；无合适索引时回退到 `PRAGMA table_info` 中 `pk > 0` 的列。

### 6.3 类型转换

```ts
type ConversionResult = { ok: true; value: string | number | null } | { ok: false; error: string };

function convertValue(raw: string, col: ColumnMeta): ConversionResult;
```

| semanticType | 可接受值 | 失败 |
|---|---|---|
| text | 任意字符串 | — |
| integer | 整数，true/false | 非整数文本 |
| real | 浮点数 | 非数字 |
| numeric | 整数或浮点数 | 非数字 |
| boolean | 0/1/true/false/yes/no | 其他 |
| json | `JSON.parse` 通过 | 解析失败 |
| datetime | ISO 8601 或 `YYYY-MM-DD HH:MM:SS` | 非日期格式 |

空单元格（trim 后 `""`）对 `NOT NULL` 列触发 `required_field_empty` 或 `type_conversion_failed`；对 nullable 列转为 `null`。

### 6.4 Quality Report

```ts
interface QualityReport {
  rowCount: number;
  validRows: number;
  errorRows: number;
  missingColumns: string[];
  extraColumns: string[];
  typeErrors: number;
  sampleErrors: ErrorItem[];
  warnings: WarningItem[];
  blockingErrors: number;
  requiredConfirmText: string;
}
```

- `sampleErrors` 最多 20 条。
- `warnings` 包含：多余列、CSV `workspace_id` 与请求头不一致等。
- `blockingErrors` 计数为所有阻塞错误的总和。

### 6.5 Staging

```ts
interface StagedCsvMeta {
  stagedFileId: string;
  originalName: string;
  targetTable: string;
  uploadedAt: string;
  fileHash: string; // SHA-256 of file content
  qualityReportHash?: string; // hash of dry-run quality report
}

function stageCsv(workspaceId: string, file: File, targetTable: string): StagedCsvMeta;
function readStagedCsv(workspaceId: string, stagedFileId: string): { meta: StagedCsvMeta; content: string };
```

- 目录结构：`data/local/csv-staging/<workspaceId>/<stagedFileId>/csv.csv` + `meta.json`。
- execute 时重新读取 staged file 并重新跑校验，确保文件未被替换；如校验失败返回 400。

### 6.6 Dry-run 流程

1. 解析 multipart body，读取 `file` 和 `targetTable`（可选 `mode`）。
2. 检查目标表是否在白名单，否则 `unsupported_target_table`。
3. 解析 CSV；检查 header 重复、空 CSV、必填列缺失。
4. 类型转换、主键重复检测。
5. 生成 `qualityReport` 和 `OperationImpact`。
6. 暂存文件到 `data/local/csv-staging/`。
7. 返回 `{ ...impact, qualityReport, stagedFileId }`。

### 6.7 Execute 流程

1. 路由层：`admin.post("/csv/import", adminTokenRequired(), idempotencyMiddleware(), handler)`。
2. 校验 `Idempotency-Key` 存在；`readJson(c)` 读取 body。
3. 校验 `stagedFileId`、`targetTable`、`confirmText` 存在；`confirmText === "IMPORT CSV ${targetTable}"`。
4. 打开 workspace DB，读取 staged file 和 metadata。
5. 重新执行 dry-run；如果存在 blocking errors 返回 400。
6. 插入 `data_import_job`（queued → running → succeeded）。
7. 执行 `BEGIN` 事务；对目标表执行 `INSERT OR REPLACE`。
8. 如果目标表包含 `source`/`source_type`/`batch_id`/`data_version` 等字段，由 CSV 提供或注入默认值。
9. 插入 `batch` 记录（可选，如果目标表适合 batch 注册）。
10. 写入 `db_admin_audit`。
11. `COMMIT`；返回 `{ operation, status, auditId, jobId, beforeSnapshot, afterSnapshot, warnings }`。
12. `storeIdempotent(c, response, jobId)`。

### 6.8 错误处理

- 400 invalid_input：参数缺失、confirmText 错误、dry-run blocking errors。
- 401 unauthorized：无 token 或 admin token 错误。
- 404 not_found：stagedFileId 不存在或目标表不存在（unsupported 优先用 400）。
- 409 conflict：Idempotency-Key 已用于不同 payload。
- 500 internal_error：未知异常。

## 7. 类型契约

扩展 `apps/server/src/lib/dangerous-ops.ts`：

```ts
export interface OperationImpact {
  operation: string;
  targetType: "table" | "view" | "version" | "workspace" | "package" | "migration" | "csv";
  // ...
}
```

CSV dry-run 响应示例：

```json
{
  "code": "ok",
  "requestId": "req_xxx",
  "generatedAt": "2026-07-06T13:00:00Z",
  "data": {
    "operation": "import",
    "targetType": "csv",
    "targetName": "sku",
    "affectedTables": ["sku"],
    "affectedRows": 3,
    "sourceType": "user_authorized",
    "dataVersion": null,
    "containsUserAuthorized": true,
    "containsSystemHistory": false,
    "warnings": ["CSV column '备注' will be ignored"],
    "requiredConfirmText": "IMPORT CSV sku",
    "qualityReport": { ... }
  }
}
```

## 8. 验证

- `npm run typecheck`（仅 server 类型）。
- 启动后端后运行 `node apps/server/scripts/smoke-csv-ingestion.mjs`（自动创建临时 workspace）。
- Smoke 覆盖：
  - dry-run 成功并返回 stagedFileId
  - 缺失必填列返回 400
  - 类型错误返回 400
  - 不支持目标表返回 400
  - 错误 confirmText 返回 400
  - 正确导入返回 200 并写入 `data_import_job` / `db_admin_audit`
  - 幂等重放返回相同 `jobId`
  - workspace 隔离（wsA 的 staged file 在 wsB 不可见）

## 9. 风险与未决项

- 手写 CSV parser 不处理极端嵌套引号/多行字段；符合 P7 第一期样本范围即可。
- JSON/BOOLEAN/DATETIME 类型依赖每表覆盖配置；新增语义类型列需同步更新配置。
- `batch` 表是否写入以及 `entity_counts` 字段结构需与 D 域确认。
- 是否支持 `strict` 模式阻塞多余列；默认 relaxed 实现即可满足契约，strict 可留待后续。
- 是否需要新增 `data_source` 注册表项为 `csv_upload` 源；如需要，在 execute 中写入 `data_source` 表。

## 10. 任务完成后更新

- `docs/wiki.html` A-P7-INGEST-2 任务卡 status = done（由总控 Agent 执行）。
- `docs/notes-app.md` §0 当前状态同步。
- 返回 handoff：改了什么、验证了什么、剩余风险、是否需总控拍板。
