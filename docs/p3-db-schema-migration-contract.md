# P3 SQLite Schema Migration Contract

> 本文件冻结 PLS P3 schema 分层、系统表定义、migration 文件组织和 schema 校验方式。所有后续 P3-DB 卡以此为真源。

---

## 一、Schema 分层

当前 25 张表 + 10 个视图按功能域分为 7 层：

| 层 | DDL 常量 | 表 | 视图 |
|---|---|---|---|
| **core** | `SCHEMA_DDL`（workspace/sku/channel_profile/wide_table_row/batch/idempotency_key 部分） | `workspace`, `sku`, `channel_profile`, `wide_table_row`, `batch`, `idempotency_key` | — |
| **import** | `SCHEMA_DDL`（douyin_account 部分）+ `DOUYIN_BI_DDL` + `DOUYIN_BI_DDL_PART2` + `DOUYIN_BI_DDL_PART3` + `DATA_MANAGEMENT_DDL` + `CHANNEL_ENTITY_DDL` | `douyin_account`, `douyin_account_benchmark_tag`, `douyin_account_report`, `douyin_product`, `douyin_product_account_fit`, `douyin_comparison_dimension`, `douyin_adjustment_advice`, `douyin_summary_metric`, `data_source`, `channel_entity` | `douyin_account_latest`, `douyin_account_benchmark_tag_latest`, `douyin_account_report_latest`, `douyin_product_latest`, `douyin_product_account_fit_latest`, `douyin_comparison_dimension_latest`, `douyin_adjustment_advice_latest`, `douyin_summary_metric_latest`, `channel_entity_latest` |
| **prediction** | `SCHEMA_DDL`（prediction 部分）+ `NEW_PRODUCT_DDL` | `prediction`, `new_product_prediction` | — |
| **match** | `SCHEMA_DDL`（match_result 部分） | `match_result` | `match_result_latest` |
| **task** | `SCHEMA_DDL`（task 部分） | `task` | — |
| **audit** | `SCHEMA_DDL`（audit_event 部分） | `audit_event` | — |
| **admin** | `ADMIN_DDL`（P3 新增）+ `SCHEMA_DDL`（flywheel 部分） | `schema_migration`, `db_admin_audit`, `data_import_job`, `decision_record`, `action_record`, `feedback_record`, `strategy_review` | — |

分层原则：
- 同一张表不跨层；workspace 始终是第一列。
- 新增表按功能域归入对应层；不确定时归 admin。
- 视图跟随其底层表所在层。

---

## 二、系统表 DDL

### schema_migration

追踪 schema 版本和迁移执行状态。

```sql
CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'applied',
  error TEXT,
  execution_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_migration_status ON schema_migration(status);
```

字段说明：
- `version`：递增整数版本号，全局唯一，决定执行顺序。
- `name`：迁移可读名称，如 `V001_create_admin_tables`。
- `checksum`：迁移文件内容的 SHA-256 前 16 位 hex，用于检测文件是否被修改。
- `applied_at`：执行完成时间（ISO 8601）。
- `status`：`applied` | `failed` | `rolled_back`。
- `error`：失败时的错误信息。
- `execution_ms`：执行耗时毫秒数。

### db_admin_audit

记录所有 admin 数据库维护操作。

```sql
CREATE TABLE IF NOT EXISTS db_admin_audit (
  audit_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  operation TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_name TEXT NOT NULL,
  before_snapshot TEXT NOT NULL DEFAULT '{}',
  after_snapshot TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_workspace ON db_admin_audit(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_operation ON db_admin_audit(workspace_id, operation);
```

字段说明：
- `audit_id`：`adm_` + `Date.now()` + 随机后缀。
- `operation`：`truncate_table` / `drop_table` / `delete_version` / `rebuild` / `import` / `schema_check` 等。
- `target_type`：`table` / `view` / `version` / `workspace` / `migration`。
- `before_snapshot` / `after_snapshot`：JSON，记录操作前后的表行数、版本信息等摘要。

### data_import_job

记录导入任务、dry run 和质量报告。

```sql
CREATE TABLE IF NOT EXISTS data_import_job (
  job_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  import_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_type TEXT,
  data_version TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  dry_run INTEGER NOT NULL DEFAULT 0,
  input_manifest TEXT NOT NULL DEFAULT '{}',
  quality_report TEXT NOT NULL DEFAULT '{}',
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_import_job_workspace ON data_import_job(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_job_status ON data_import_job(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_import_job_version ON data_import_job(workspace_id, data_version);
```

字段说明：
- `status`：`queued` / `running` / `succeeded` / `failed`。
- `dry_run`：1 = 预检模式（不写业务表），0 = 正式导入。
- `input_manifest`：导入请求的 JSON 摘要（数据包路径、目标表等）。
- `quality_report`：导入完成后的质量检查结果。

---

## 三、Migration 文件组织

### 目录结构

```
apps/server/src/db/migrations/
  V001_create_admin_tables.ts
  V002_xxx.ts
  ...
```

### 文件命名

格式：`V{version}_{name}.ts`

- `version`：3 位零填充递增整数（001, 002, ...）。
- `name`：snake_case 描述性名称。

### Migration 文件格式

每个文件导出一个对象：

```typescript
export default {
  version: 1,
  name: "create_admin_tables",
  up(db: DatabaseSync): void {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (...)`);
    db.exec(`CREATE TABLE IF NOT EXISTS db_admin_audit (...)`);
    db.exec(`CREATE TABLE IF NOT EXISTS data_import_job (...)`);
  },
};
```

- `up`：执行迁移（幂等，使用 `CREATE TABLE IF NOT EXISTS`）。
- `down`：可选，回滚迁移。初期不实现。
- `checksum`：由 runner 自动计算文件内容的 SHA-256 前 16 位。

### 版本约定

- V001：创建 3 张系统表本身。
- V002+：后续迁移按 p3-db-management-plan 规划递增。
- 现有 25 张表 + 10 个视图保持原有 DDL 常量不变，不在 migration 中重建。

---

## 四、Workspace 初始化流程

执行 `npm run migrate` 时的流程：

```
1. 确保 data/workspaces/{wsId}/ 目录存在
2. 打开 db.sqlite（WAL + foreign_keys ON）
3. 如果 schema_migration 表不存在 → 执行 bootstrap DDL（仅创建 schema_migration 表）
4. 读取 schema_migration 获取已应用版本列表
5. 扫描 migrations/ 目录，按 version 排序
6. 对每个 pending migration（version > max applied）：
   a. 计算文件 checksum
   b. INSERT schema_migration (version, name, checksum, status='pending')
   c. 执行 up(db)
   d. UPDATE schema_migration SET status='applied', applied_at=datetime('now'), execution_ms=N
   e. 失败时 UPDATE status='failed', error=errorMessage
7. 重新执行所有业务 DDL 常量（幂等，兼容现有模式）
8. 确保 workspace 行存在
9. 关闭连接
```

Bootstrap DDL（仅在 schema_migration 不存在时执行）：

```sql
CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'applied',
  error TEXT,
  execution_ms INTEGER
);
```

---

## 五、Schema 校验函数

### 签名

```typescript
interface SchemaCheckResult {
  valid: boolean;
  missing: string[];   // 代码定义但库中不存在的表
  extra: string[];     // 库中存在但代码未定义的表
  viewMissing: string[];
  viewExtra: string[];
  migrationStatus: {
    total: number;
    applied: number;
    pending: number;
    failed: number;
  };
}

function validateSchema(workspaceId: string): SchemaCheckResult;
```

### 实现逻辑

1. 打开 workspace 数据库（只读）。
2. 查询 `sqlite_master` 获取所有 `type='table'` 和 `type='view'` 的名称。
3. 收集代码中所有 DDL 常量里定义的表名和视图名（通过正则提取 `CREATE TABLE IF NOT EXISTS (\w+)` 和 `CREATE VIEW IF NOT EXISTS (\w+)`）。
4. 对比得出 missing / extra。
5. 查询 `schema_migration` 获取迁移状态。
6. 返回结果。

### CLI 入口

`npm run schema:check` → `tsx src/db/schema-check.ts`，打印格式化结果。

---

## 六、现有 DDL 与 migration 的关系

**过渡策略**：P3 阶段不重构现有 DDL 常量，而是在其之上叠加 migration 基础设施。

- 现有 8 个 DDL 常量（SCHEMA_DDL ~ FLYWHEEL_DDL）保持不变，`migrate.ts` 仍按原顺序幂等执行。
- 新增 `ADMIN_DDL` 常量包含 3 张系统表。
- V001 migration 创建系统表；后续 migration 可能修改业务表结构。
- `migrate.ts` 更新为：先执行 migration-runner，再执行现有 DDL 常量（双重保障）。

最终目标：所有 schema 变更通过 migration 文件追踪，现有 DDL 常量逐步废弃（不在 P3 本轮完成）。
