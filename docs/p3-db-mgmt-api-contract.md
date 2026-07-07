# P3-DB-MGMT Admin Database API Contract

> 本文是 `A-P3-DB-MGMT-1` 的 API contract，覆盖 `/api/v0/admin/database/*` 的写接口语义、统一响应、headers、confirmText 和错误码。只读接口的字段和行为保持 `A-P3-DB-3` 不变。

## 通用约定

### Base URL

```text
/api/v0/admin/database
```

### 请求头

所有接口均要求：

```text
Authorization: Bearer <token>
X-PLS-Workspace: ws_demo
```

写接口额外要求：

```text
X-PLS-Admin-Token: pls-admin-token
Idempotency-Key: <stable-operation-key>   # 8-128 字符，仅允许 [A-Za-z0-9._~+/=-]
Content-Type: application/json
```

### 统一响应结构

成功：

```json
{
  "code": "ok",
  "requestId": "req_xxx",
  "generatedAt": "2026-07-04T00:00:00Z",
  "data": { ... }
}
```

错误：

```json
{
  "code": "invalid_input | unauthorized | not_found | conflict | ...",
  "requestId": "req_xxx",
  "generatedAt": "2026-07-04T00:00:00Z",
  "error": { "message": "...", "field": "..." }
}
```

### 统一 Dry Run 响应

```json
{
  "operation": "truncate | drop | delete_version | apply_migrations | rebuild | import",
  "targetType": "table | view | version | workspace | package | migration | csv_upload",
  "targetName": "decision_record | v1_20260703 | ws_demo | demo | ...",
  "affectedTables": ["sku", "channel_profile"],
  "affectedRows": 42,
  "sourceType": "mock | user_authorized | system_runtime",
  "dataVersion": "v1_20260703",
  "containsUserAuthorized": true,
  "containsSystemHistory": true,
  "warnings": ["contains user_authorized douyin_* data"],
  "requiredConfirmText": "TRUNCATE decision_record"
}
```

### 统一正式执行响应

```json
{
  "operation": "truncate | drop | delete_version | apply_migrations | rebuild | import",
  "status": "success",
  "auditId": "audit_xxx",
  "beforeSnapshot": { ... },
  "afterSnapshot": { ... },
  "warnings": []
}
```

## 错误码

| HTTP | code | 触发条件 |
|---|---|---|
| 400 | `invalid_input` | 缺少字段、confirmText 错误、参数非法 |
| 401 | `unauthorized` | 缺少或错误 `Authorization` / `X-PLS-Admin-Token` |
| 404 | `not_found` | 表、版本或 workspace 不存在 |
| 409 | `conflict` | 系统表/受保护对象不可执行；或 Idempotency-Key 冲突 |
| 422 | `dry_run_required` | 正式执行前影响范围不可确认（保留码，当前主要通过 confirmText 拦截） |

## 只读接口（保持原行为）

```text
GET /admin/database/overview
GET /admin/database/tables
GET /admin/database/tables/:name/schema
GET /admin/database/tables/:name/sample?limit=50
GET /admin/database/migrations
GET /admin/database/import-jobs
GET /admin/database/versions
GET /admin/database/audit-events
```

## 写接口详情

### 1. 导入数据包

#### Dry Run

```text
POST /api/v0/admin/database/import-jobs/dry-run
```

Body：

```json
{ "packageType": "demo" }
```

支持：`demo`、`douyin-bi`。

响应：统一 dry run 结构，额外包含 `qualityReport`。

#### 正式导入

```text
POST /api/v0/admin/database/import-jobs
```

Headers：必须包含 `X-PLS-Admin-Token` 和 `Idempotency-Key`。

Body：

```json
{ "packageType": "demo", "confirmText": "IMPORT demo" }
```

Confirm Text：`IMPORT ${packageType}`，例如 `IMPORT demo`。缺失或错误的 `confirmText` 返回 400。

响应：统一正式执行结构。

`beforeSnapshot` 示例：

```json
{ "tableRowCounts": { "sku": 0, "channel_profile": 0 }, "totalRows": 0 }
```

`afterSnapshot` 示例：

```json
{
  "tableRowCounts": { "sku": 12, "channel_profile": 4 },
  "totalRows": 16,
  "dataVersion": null
}
```

### 2. CSV 导入已有业务表

> 数据校验契约见 `docs/p7-csv-ingestion-data-contract.md`。本接口只支持导入已存在的 SQLite 业务表，不支持 CSV 首次建表、XLSX 或外部数据源直连。

#### 目标表白名单

第一期允许：`sku`、`channel_profile`、`wide_table_row`、`batch`、`prediction`、`match_result`。

禁止：`workspace`、`schema_migration`、`db_admin_audit`、`idempotency_key`、`data_import_job`、`audit_event`、`task`。

#### Dry Run

```text
POST /api/v0/admin/data-ingestion/csv/dry-run
```

Headers：普通鉴权 + workspace。

Content-Type：`multipart/form-data`。

Body fields：

- `file`：CSV 文件（必需）
- `targetTable`：目标表名（必需）

响应：统一 dry run 结构，`targetType` 为 `csv_upload`，额外包含 `stagedFileId` 和 `qualityReport`。

`qualityReport` 字段：`rowCount`、`validRows`、`errorRows`、`missingColumns`、`extraColumns`、`typeErrors`、`sampleErrors`、`warnings`、`blockingErrors`、`requiredConfirmText`。

#### 正式导入

```text
POST /api/v0/admin/data-ingestion/csv/import
```

Headers：必须包含 `X-PLS-Admin-Token` 和 `Idempotency-Key`。

Body：

```json
{
  "stagedFileId": "csv_1783347565569_a1b2c3",
  "targetTable": "sku",
  "confirmText": "IMPORT CSV sku"
}
```

Confirm Text：`IMPORT CSV ${tableName}`。缺失或错误返回 400。

约束：

- 正式执行会在服务端重新跑 dry-run；存在 blocking errors 时返回 400，不得写入。
- 使用与 dry-run 同一 `stagedFileId`；staged file 被修改、删除或 meta 与请求 workspace 不一致时返回 400。
- CSV 导入为 append-only：目标表已有主键冲突时 dry-run 返回 `primary_key_conflict` blocking error，正式执行不会覆盖已有数据。
- 写入目标表后同时写 `data_import_job`、`batch` 和 `db_admin_audit`。
- `beforeSnapshot` / `afterSnapshot` 使用目标表实际行数（`COUNT(*) WHERE workspace_id = ?`）。

响应：统一正式执行结构。

### 3. 清空表

```text
POST /api/v0/admin/database/tables/:name/truncate
```

Dry Run Body：

```json
{ "dryRun": true }
```

正式执行 Body：

```json
{ "confirmText": "TRUNCATE decision_record" }
```

Confirm Text：`TRUNCATE ${tableName}`。

禁止清空的表：`schema_migration`、`db_admin_audit`（正式执行返回 409）。目标表不存在时正式执行返回 404。

### 4. 删除表/视图

```text
DELETE /api/v0/admin/database/tables/:name
```

Dry Run Body：

```json
{ "dryRun": true }
```

正式执行 Body：

```json
{ "confirmText": "DROP decision_record" }
```

Confirm Text：`DROP ${tableName}`。

禁止删除的表：`schema_migration`、`db_admin_audit`（正式执行返回 409）。非代码定义的表/视图也返回 409。目标表/视图不存在时正式执行返回 404。

### 5. 删除数据版本

```text
DELETE /api/v0/admin/database/versions/:dataVersion
```

Dry Run Body：

```json
{ "dryRun": true }
```

正式执行 Body：

```json
{ "confirmText": "DELETE VERSION v1_20260703" }
```

Confirm Text：`DELETE VERSION ${dataVersion}`。

如果 `confirmText` 缺失或错误，返回 400（优先于 `dataVersion` 不存在检查）。
如果 `dataVersion` 不存在（`affectedRows === 0`），正式执行返回 404。

### 6. 应用 Migration

```text
POST /api/v0/admin/database/migrations/apply
```

Dry Run Body：

```json
{ "dryRun": true }
```

正式执行 Body：

```json
{ "confirmText": "APPLY MIGRATIONS" }
```

Confirm Text：`APPLY MIGRATIONS`。

### 7. 重建 Workspace

```text
POST /api/v0/admin/database/rebuild
```

Dry Run Body：

```json
{ "dryRun": true }
```

正式执行 Body：

```json
{ "confirmText": "RESET ws_demo", "skipSnapshot": true }
```

Confirm Text：`RESET ${workspaceId}`，例如 `RESET ws_demo`。

`skipSnapshot` 为可选布尔值；生产环境建议不传，默认会创建 `.snapshot.${timestamp}` 备份。

## 8. CSV 数据导入（Data Ingestion）

CSV 导入与现有数据包导入（`/admin/database/import-jobs`）并行存在，不替代 demo / douyin-bi / channel-profile-object-library 数据包路径。第一期只支持导入已有 SQLite 表，不支持 CSV 自动建表、XLSX、业务数据库或业务 API 直连。

### 8.1 目标表白名单

允许导入：

- `sku`
- `channel_profile`
- `wide_table_row`
- `batch`
- `prediction`
- `match_result`

禁止导入：

- `workspace`
- `schema_migration`
- `db_admin_audit`
- `idempotency_key`
- `data_import_job`
- `audit_event`
- `task`

### 8.2 CSV Dry Run

```text
POST /api/v0/admin/data-ingestion/csv/dry-run
Content-Type: multipart/form-data
```

Body fields：

- `file`：CSV 文件（必需）
- `targetTable`：目标表名（必需）

响应字段在统一 Dry Run 响应基础上增加：

- `stagedFileId`：稳定 staged 引用，供后续 import 使用。
- `qualityReport`：按 `docs/p7-csv-ingestion-data-contract.md` 结构返回。

示例响应：

```json
{
  "operation": "import",
  "targetType": "csv_upload",
  "targetName": "sku",
  "affectedTables": ["sku"],
  "affectedRows": 3,
  "sourceType": "user_authorized",
  "dataVersion": null,
  "containsUserAuthorized": true,
  "containsSystemHistory": false,
  "warnings": [],
  "requiredConfirmText": "IMPORT CSV sku",
  "stagedFileId": "csv_1783350000000_abc123",
  "qualityReport": { ... }
}
```

### 8.3 CSV 正式导入

```text
POST /api/v0/admin/data-ingestion/csv/import
Content-Type: application/json
X-PLS-Admin-Token: pls-admin-token
Idempotency-Key: <key>
```

Body：

```json
{
  "stagedFileId": "csv_1783350000000_abc123",
  "targetTable": "sku",
  "confirmText": "IMPORT CSV sku"
}
```

正式执行前服务端会重新跑 dry-run；若 staged file 不存在、已被修改、stagedFileId 格式非法或存在 blocking errors，返回 400。导入为 append-only：CSV 行主键与目标表已有行冲突时 dry-run 报 `primary_key_conflict` 阻塞，正式执行不得覆盖或 upsert。执行成功后写入 `data_import_job`、`db_admin_audit`、`batch` 和 `audit_event`。

`beforeSnapshot` / `afterSnapshot` 为目标表真实行数（`COUNT(*) WHERE workspace_id = ?`），不是本次插入行数。

示例响应：

```json
{
  "operation": "import",
  "status": "success",
  "auditId": "audit_xxx",
  "jobId": "imp_xxx",
  "beforeSnapshot": { "tableRowCounts": { "sku": 5 }, "totalRows": 5 },
  "afterSnapshot": { "tableRowCounts": { "sku": 8 }, "totalRows": 8 },
  "warnings": []
}
```

### 8.4 错误码

- 400：`targetTable` 缺失、目标表不支持、`stagedFileId` 格式非法或路径穿越、staged file 不存在或已修改、`confirmText` 错误、dry-run 存在 blocking errors（含目标表主键冲突）。
- 401：缺少 `Authorization` 或 `X-PLS-Admin-Token`。
- 409：`Idempotency-Key` 已被用于不同 payload。

## 审计与幂等

- 所有写操作均写入 `db_admin_audit`。
- 所有正式执行接口均要求 `Idempotency-Key`；同一 key 不同 payload 返回 409。
- admin token 检查在幂等 replay 之前，未认证的 replay 请求返回 401 而不是缓存结果。

## 安全红线

- 不提供任意 SQL 执行接口。
- 前端不直接传递 SQLite 文件路径或 SQL 语句。
- 不自动重放 `user_authorized` 数据；必须通过受控导入接口显式执行。
- Workspace 隔离、confirmText、Idempotency-Key 和 audit 不可绕过。

## 变更记录

- 2026-07-04：A-P3-DB-MGMT-1 统一 dry run / 正式执行响应、补齐 after snapshot、确认空库导入重放 smoke。
