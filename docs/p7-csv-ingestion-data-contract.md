# P7 CSV 导入数据契约

> Owner: D 数据画像域  
> Task: D-P7-INGEST-1  
> Status: P7 第一期草案  
> Last updated: 2026-07-06

## 1. 目的

本文冻结 P7 第一期「CSV 导入已有 SQLite 表」的字段校验口径、错误分类与 dry-run 质量报告结构，作为 A 域实现 parser / API 与 V 域实现 CSV 导入工作台的共同契约。

本文只定义数据侧规则，不写后端路由、不写 DB schema、不改前端代码。

## 2. 范围与非目标

### 2.1 范围

- CSV 上传到已有 SQLite 业务表的 dry-run 校验规则。
- CSV header 与目标表字段的匹配规则。
- 类型转换规则与不可转换值处理。
- Dry-run 质量报告字段与 blocking error 列表。
- 用户授权 CSV 数据的 lineage 要求。
- 第一期目标表白名单建议。

### 2.2 非目标

- 不实现 CSV 首次建表（第二期）。
- 不实现 XLSX / Excel 导入。
- 不实现业务数据库或业务 API 直连（第三期）。
- 不新增 `tagId`，不做自动 taxonomy 映射。
- 不替代现有数据包导入（demo、douyin-bi、profile-extract 等）。
- 不写 SQLite 写入代码、import adapter 或 UI 组件。

## 3. 目标表白名单（建议）

第一期建议仅开放结构简单、主键明确、无复杂 JSON 聚合语义的业务主表。最终白名单需 X 总控拍板。

### 3.1 建议开放表

| 表名 | 主键 | 是否建议第一期开放 | 理由 |
|---|---|---|---|
| `sku` | `sku_id` | 是 | 商品主数据，字段简单 |
| `channel_profile` | `channel_id` | 是 | 渠道画像主数据 |
| `wide_table_row` | `sku_id` + `channel_id` + `time_window` | 是 | 训练宽表行 |
| `batch` | `batch_id` | 是 | 批次注册，CSV 可用于登记批量导入元数据 |
| `prediction` | `prediction_id` | 是 | 预测结果，但通常由工具生成，人工导入场景有限 |
| `match_result` | `match_id` | 是 | 匹配结果，人工导入场景有限 |

### 3.2 建议暂不开放表

| 表名 | 理由 |
|---|---|
| `channel_entity` | 投影表，应由 sync 脚本从 source-of-truth 表生成，不建议人工 CSV 直导 |
| `new_product_prediction` | 衍生产物，通常由工具生成 |
| `decision_record` / `action_record` / `feedback_record` / `strategy_review` | 运营飞轮运行时表，导入场景未明确 |
| `douyin_*` | 复合主键 + 大量业务字段 + `raw` JSON，由 `douyin-bi` 专用 adapter 管理 |
| `channel_object` / `channel_object_binding` / `audience_profile` / `product_fit_profile` | 对象库复杂对象，由 `channel-profile-object-library` adapter 管理 |

### 3.3 禁止开放表

以下表属于系统运行或安全审计，不允许通过 CSV 导入：

- `workspace`
- `schema_migration`
- `db_admin_audit`
- `idempotency_key`
- `data_import_job`
- `audit_event`
- `task`

## 4. 字段匹配规则

### 4.1 Header 归一化

CSV 第一行为 header。后端对 header 做以下归一化后再与目标表字段名比较：

1. 去除首尾空白。
2. 全转小写。
3. 空格、连字符 `-`、点 `.` 统一替换为下划线 `_`。
4. 连续下划线压缩为单一下划线。
5. 示例：`SKU ID`、`sku-id`、`sku_id` 都映射到 `sku_id`。

若归一化后 header 出现重复，触发 blocking error `header_normalization_collision`。

### 4.2 目标字段来源

目标表字段名以 SQLite `PRAGMA table_info(<table>)` 返回的 `name` 为准。后端不应使用代码中硬编码的字段列表，避免 schema 变更后契约漂移。

### 4.3 必填字段

- 目标表 `NOT NULL` 且没有 `DEFAULT` 的列，必须在 CSV header 中存在对应列，且对应单元格非空。
- 目标表 `NOT NULL` 但有 `DEFAULT` 的列（如 `created_at`），CSV 可缺省；后端使用默认值注入。
- `workspace_id` 视为上下文字段：CSV 可不提供；若提供但与请求头 `X-PLS-Workspace` 不一致，记为 warning，写入时以请求上下文为准。

### 4.4 多余列

- CSV 中存在但目标表没有的列，默认记为 warning，写入时忽略。
- 第一期不暴露 `strict` 模式；`extra_columns_in_strict_mode` 规则保留，但当前 API 不会触发。

### 4.5 大小写与特殊字符

- CSV header 允许大小写混写；归一化后比较。
- 目标表字段名中出现 SQLite 保留字或特殊字符的情况，本契约不单独处理；后端按实际字段名匹配。

## 5. 类型校验规则

### 5.1 SQLite 类型到 CSV 的映射

SQLite 使用类型亲和性。本契约按 `PRAGMA table_info` 返回的 `type` 与 `notnull` 做校验。

| SQLite 声明类型 | 校验目标 | 可接受 CSV 值示例 | 不可接受示例 |
|---|---|---|---|
| `TEXT` | 字符串 | `abc`, `2026-07-06` | — |
| `INTEGER` | 整数 | `42`, `-3`, `0`, `true`/`false` | `12.5`, `N/A`, 空值（NOT NULL 时） |
| `REAL` | 浮点数 | `0.72`, `-1.5`, `1e3` | `high`, 空值（NOT NULL 时） |
| `NUMERIC` | 数值 | `42`, `0.72` | `N/A` |
| `JSON`（实际存储为 `TEXT`，由契约标记） | 可解析 JSON | `{}`, `[]`, `["a"]` | `{invalid`, `N/A` |
| `DATETIME`（实际存储为 `TEXT`，由契约标记） | 日期时间 | `2026-07-06T12:00:00Z`, `2026-07-06 12:00:00` | `yesterday`, 空值（NOT NULL 时） |
| `BOOLEAN`（实际存储为 `INTEGER`） | 0/1 | `0`, `1`, `false`, `true`, `no`, `yes` | `maybe`, 空值（NOT NULL 时） |

说明：

- 本契约建议将存储 JSON 的 `TEXT` 列在目标表字段字典或 adapter 配置中显式标记为 `JSON` 类型，便于校验。
- 布尔列同理标记为 `BOOLEAN`；未标记的 `INTEGER` 列只接受纯整数。
- `DATETIME` 列接受 ISO 8601 或 `YYYY-MM-DD HH:MM:SS`；导入时后端可原样保存为 TEXT。

### 5.2 空值处理

- 空单元格（`""`）对 `NOT NULL` 列为 `required_field_empty` 或 `type_conversion_failed`，属于 blocking error。
- 空单元格对 nullable 列为有效 `NULL`。
- 仅包含空白字符的单元格视为空值。

### 5.3 JSON 列额外规则

- 必须能被 `JSON.parse` 解析。
- 若列默认值是 `{}`，则要求解析结果为 `object`；若是 `[]`，则要求为 `array`。
- 解析失败记为 `type_conversion_failed`。

### 5.4 不可转换值

任何不满足上述规则的单元格，产生一条 `typeErrors` 记录，并在 `sampleErrors` 中展示原始行号、列名、原始值与期望类型。

## 6. Dry-run 质量报告结构

### 6.1 顶层字段

```json
{
  "rowCount": 1000,
  "validRows": 995,
  "errorRows": 5,
  "missingColumns": [],
  "extraColumns": ["备注"],
  "typeErrors": 3,
  "sampleErrors": [],
  "warnings": [],
  "blockingErrors": 5,
  "requiredConfirmText": "IMPORT CSV sku"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `rowCount` | integer | CSV 数据行数（不含 header） |
| `validRows` | integer | 无任何 blocking error 的行数 |
| `errorRows` | integer | 至少有一条 blocking error 的行数 |
| `missingColumns` | string[] | 目标表必填但 CSV 缺失的列名 |
| `extraColumns` | string[] | CSV 存在但目标表没有的列名（归一化后） |
| `typeErrors` | integer | 类型转换失败单元格总数 |
| `sampleErrors` | ErrorItem[] | 错误样例， capped 不超过 20 条 |
| `warnings` | WarningItem[] | 非阻塞警告样例 |
| `blockingErrors` | integer | blocking error 总数 |
| `requiredConfirmText` | string | 建议为 `IMPORT CSV <tableName>` |

### 6.2 ErrorItem

```json
{
  "rowNumber": 42,
  "column": "sample_size",
  "rule": "type_conversion_failed",
  "message": "Expected INTEGER, got 'N/A'",
  "rawValue": "N/A"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `rowNumber` | integer | 1-based；header 为第 1 行，第一行数据为第 2 行 |
| `column` | string | 目标表字段名 |
| `rule` | string | 规则 ID |
| `message` | string | 用户可读说明 |
| `rawValue` | string | CSV 中原始值 |

### 6.3 WarningItem

```json
{
  "rowNumber": null,
  "column": "workspace_id",
  "message": "CSV provides workspace_id 'ws_other' which differs from request context 'ws_demo'; will use request context"
}
```

## 7. Blocking Error 列表

| 规则 ID | 触发条件 | 是否阻塞 |
|---|---|---|
| `unsupported_target_table` | 目标表不在白名单 | 是 |
| `header_normalization_collision` | 归一化后 CSV header 重复 | 是 |
| `empty_csv` | CSV 无 header 或 header 后无数据行 | 是 |
| `missing_required_column` | 目标表必填列在 CSV 中缺失 | 是 |
| `required_field_empty` | `NOT NULL` 单元格为空 | 是 |
| `type_conversion_failed` | 单元格值无法转换为目标类型 | 是 |
| `duplicate_primary_key_in_csv` | CSV 内出现重复主键（简单或复合） | 是 |
| `primary_key_conflict` | CSV 主键已存在于目标表（append-only） | 是 |
| `primary_key_missing` | 主键列缺失或主键值为空 | 是 |
| `extra_columns_in_strict_mode` | strict 模式下存在多余列（第一期不暴露） | 否 |

说明：

- `duplicate_primary_key_in_csv` 需根据目标表主键检测。简单主键检测单列重复；复合主键检测组合重复。
- `primary_key_conflict` 表示 append-only 语义下，CSV 行与目标表已有主键冲突；目标表无主键时不检测此项。
- 目标表无主键时，不检测 `duplicate_primary_key_in_csv`。

## 8. 数据准入口径与 Lineage

- 用户授权上传到 PLS 的 CSV 数据默认放行，不设置隐私红线。
- 导入时必须保留以下 lineage 信息，写入 `data_import_job.input_manifest` 与 `batch`（如适用）：
  - `source`：建议 `"csv_upload"`。
  - `sourceType`：建议 `"user_authorized"`。
  - `sourceBatchId`：由后端生成，例如 `"csv_<tableName>_<timestamp>"`；CSV 也可显式提供。
  - `dataVersion`：建议 `"v1_<YYYYMMDD>"` 或从 `sourceBatchId` 派生；CSV 也可显式提供。
  - `generatedAt`：上传或 dry-run 时间，ISO 8601。
- 若目标表本身已有 `source` / `source_type` / `batch_id` / `data_version` 字段，CSV 可以直接提供这些列；缺失时由后端按上述约定注入。
- 若目标表无 lineage 字段（如 `sku`），lineage 仅在 import job 与 batch 层面保留，不伪造表内字段。

## 9. 确认文本与执行安全

- 建议 confirmText 格式：`IMPORT CSV <tableName>`。
- 示例：导入 `sku` 表时，`requiredConfirmText` 为 `IMPORT CSV sku`。
- 正式执行前必须先 dry-run；若 staged file、目标表、header、类型推断或映射在 dry-run 后发生变化，正式执行应拒绝并提示重新 dry-run。
- 写操作必须沿用现有 Admin Database 安全模型：`Authorization: Bearer <token>`、`X-PLS-Admin-Token`、`Idempotency-Key`、`X-PLS-Workspace`、`confirmText`、audit。

## 10. 请求/响应示例（供 A 域参考，非最终 API 契约）

### 10.1 Dry Run 请求示例

```text
POST /api/v0/admin/database/csv/dry-run
Authorization: Bearer <token>
X-PLS-Workspace: ws_demo
X-PLS-Admin-Token: pls-admin-token
Content-Type: multipart/form-data
```

Body：

- `file`: CSV 文件
- `targetTable`: `sku`

### 10.2 Dry Run 响应示例

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
    "qualityReport": {
      "rowCount": 3,
      "validRows": 3,
      "errorRows": 0,
      "missingColumns": [],
      "extraColumns": ["备注"],
      "typeErrors": 0,
      "sampleErrors": [],
      "warnings": [
        {
          "rowNumber": null,
          "column": "备注",
          "message": "Extra CSV column not in target table 'sku'; will be ignored"
        }
      ],
      "blockingErrors": 0
    }
  }
}
```

## 11. Open Decisions（需 X/A 拍板）

| 问题 | 当前建议 | 影响域 |
|---|---|---|
| 目标表白名单是否调整？ | 见第 3 节 | X |
| 多余 CSV 列默认忽略还是 strict 阻塞？ | 仅 relaxed，第一期不暴露 strict 参数 | A/V |
| 第一期是否支持 upsert？ | 仅 append；主键冲突为 blocking error | X/A |
| CSV 编码与换行符？ | 默认 UTF-8，支持 CRLF/LF | A |
| staging 文件保留策略？ | dry-run 后保留 staged file，execute 使用同一 staged reference | A |
| 是否允许 CSV 提供 `workspace_id` 并覆盖请求上下文？ | 不允许覆盖，仅 warning | X/A |
| 目标表字段类型中 JSON/BOOLEAN/DATETIME 如何标记？ | 建议在 adapter 配置或字段字典中显式标记 | A |

## 12. 示例模板

见 `data/templates/csv-ingestion/`：

- `README.md`
- `sample_sku.csv`
- `sample_channel_profile.csv`

## 13. 验证

- 文档结构检查：确认本文档第 1-12 节完整。
- 示例 CSV header 与 `apps/server/src/db/schema.ts` 中对应表字段名一致。
- 后端实现与 smoke 测试已更新，需运行 `typecheck`、`schema:check` 和 `smoke:csv-ingestion`。

## 14. 变更记录

- 2026-07-06：D-P7-INGEST-1 初始草案。
- 2026-07-06（返工）：第一期明确 append-only；`strict` 参数不暴露；新增 `primary_key_conflict` 阻塞规则；`typeErrors` 仅统计类型转换失败；snapshot 使用目标表真实行数。
