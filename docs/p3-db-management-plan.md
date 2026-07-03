# P3 SQLite 重构与数据管理产品方案

## 目的

本文冻结 PLS P3 SQLite 重构与前端数据管理模块的产品边界、任务优先级、执行依赖和验收标准，作为 `X-P3-DB-0` 的总控产物。

本轮目标不是立即改库或清库，而是先冻结后续执行口径：

> 数据管理模块是面向 SQLite 工作区数据库的运维工作台，覆盖库表状态、schema migration、导入版本、质量检查、操作日志和受控危险操作。

当前明确待办：

> TODO：SQLite 数据库重构完成后，清除现有 `ws_demo` 库表与历史 demo / smoke / e2e / 临时导入数据，并基于新 schema 重新初始化。

## 使用方式

- `docs/wiki.html` 是任务派发真源；本文是 P3-DB 任务组的产品和执行口径。
- D 域执行 `D-P3-DB-1` 时，按本文的数据分类和影响清单要求盘点现有库。
- A 域执行 `A-P3-DB-2` 至 `A-P3-DB-4`、`A-P3-DB-6` 时，按本文冻结的 admin API、系统表和危险操作约束设计。
- V 域执行 `V-P3-DB-5`、`V-P3-DB-7` 时，按本文冻结的页面结构和交互约束实现。
- X 总控执行 `X-P3-DB-8` 时，以本文的清库前置条件和验收标准为准。

## 当前背景

当前后台主库为：

```text
data/workspaces/ws_demo/db.sqlite
```

当前 `ws_demo` 主库混合存在：

- `mock` demo 数据。
- `smoke` / `e2e` 测试残留数据。
- P1 / P2 临时验收数据。
- `user_authorized` 抖音 BI 数据。
- runtime 任务、审计、幂等缓存、预测和匹配历史。

重构完成前，不应把当前主库视为干净生产状态。重构完成后，应通过受控 rebuild 流程清除旧库表并重新初始化。

## 产品边界

P3 数据管理模块一级结构冻结为：

| Tab | 定位 | P0 / P1 范围 |
|---|---|---|
| 总览 | 当前 workspace 与 SQLite 状态总览 | 数据库状态、schema version、表数、行数、最近导入、数据来源分布 |
| 库表 | table / view 生命周期查看入口 | 表清单、行数、所属域、schema、样例、是否可清空 / 删除 |
| 导入 | 数据包导入任务入口 | dry run、正式导入、导入任务状态、质量报告 |
| 版本 | 数据版本管理 | source、source_type、data_version、行数、latest / 历史版本 |
| Schema | migration 与结构校验 | migration 列表、pending / applied / failed、checksum、schema drift |
| 操作日志 | admin 操作审计 | db_admin_audit 查询、操作前后摘要、失败原因 |
| 危险操作 | 清空、删表、删版本、重建 | dry run、影响范围、确认文本、执行结果 |

非目标：

- 不做通用 SQL console。
- 不允许前端直接操作 SQLite 文件。
- 不做单元格级在线编辑。
- 不把数据管理页面做成业务 BI 分析页。
- 不在 schema 重构前继续扩展旧库表作为长期资产。
- 不在 `X-P3-DB-0` 阶段清库、删表或修改 SQLite schema。

## 操作分级

| 级别 | 操作 | 约束 |
|---|---|---|
| 只读 | overview、tables、schema、sample、migrations、versions、audit 查询 | 默认允许 admin 读取，sample 限制行数 |
| 安全写入 | dry run、schema check、导入预检 | 不写业务表，可写入临时任务日志需显式说明 |
| 中风险清理 | 清空单表、删除单个 data_version、删除失败导入任务 | 必须 dry run、confirmText、audit |
| 高风险重建 | drop table、rebuild workspace、清除全部库表 | 必须快照、dry run、confirmText、admin token、Idempotency-Key、audit |

所有破坏性操作必须满足：

- 后端校验 `confirmText`，不能只依赖前端。
- 后端计算影响范围，包含表数、行数、数据来源、是否包含 `user_authorized`。
- 写入 `db_admin_audit`。
- 支持 dry run。
- 使用 `Idempotency-Key` 防止重复执行。
- 不跨 workspace 误删。

## 系统表口径

P3 schema 管理至少需要冻结三张系统表。

| 表 | 目的 | 关键字段 |
|---|---|---|
| `schema_migration` | 追踪 schema 版本和迁移状态 | `version`、`name`、`checksum`、`applied_at`、`status`、`error`、`execution_ms` |
| `db_admin_audit` | 记录 admin 数据库维护操作 | `audit_id`、`workspace_id`、`actor`、`operation`、`target_type`、`target_name`、`before_snapshot`、`after_snapshot`、`status`、`error`、`created_at` |
| `data_import_job` | 记录导入任务、dry run 和质量报告 | `job_id`、`workspace_id`、`import_type`、`source`、`source_type`、`data_version`、`status`、`dry_run`、`input_manifest`、`quality_report`、`row_count`、`success_count`、`error_count`、`created_at`、`started_at`、`finished_at`、`error` |

字段最终命名以 `A-P3-DB-2` schema contract 为准，但不得弱化 migration、audit、import job 三类能力。

## Admin API 草案

Admin API 与业务 API 隔离，建议路径前缀：

```text
/api/v0/admin/database/*
```

只读接口：

```text
GET /api/v0/admin/database/overview
GET /api/v0/admin/database/tables
GET /api/v0/admin/database/tables/:name/schema
GET /api/v0/admin/database/tables/:name/sample?limit=50
GET /api/v0/admin/database/migrations
GET /api/v0/admin/database/import-jobs
GET /api/v0/admin/database/versions
GET /api/v0/admin/database/audit-events
```

写入与危险操作接口：

```text
POST /api/v0/admin/database/import-jobs/dry-run
POST /api/v0/admin/database/import-jobs
POST /api/v0/admin/database/tables/:name/truncate
DELETE /api/v0/admin/database/tables/:name
DELETE /api/v0/admin/database/versions/:dataVersion
POST /api/v0/admin/database/migrations/apply
POST /api/v0/admin/database/rebuild
```

写入接口要求：

- `X-PLS-Workspace`。
- admin token。
- `Idempotency-Key`。
- `confirmText`，危险操作必填。
- dry run 优先，正式执行必须携带 dry run 结果摘要或服务端重新计算影响范围。

## 前端体验口径

数据管理页面必须是工作台，不是说明页。

第一屏应优先展示：

- 当前 workspace。
- 数据库状态。
- schema / migration 状态。
- 表数量、view 数量、总行数。
- 数据来源分布：mock / smoke / e2e / temporary / user_authorized / runtime。
- 最近导入和最近危险操作。

库表页要求：

- 长表名、长字段名、JSON 样例必须可换行或横向滚动，不得重叠。
- 系统表、业务表、view 要有清晰区分。
- 清空 / 删除按钮必须按后端能力和白名单显示。

危险操作页要求：

- 默认不展开为主入口。
- 高风险操作必须先显示 dry run 影响范围。
- 必须要求用户输入确认文本，例如 `RESET ws_demo`。
- 如果影响 `user_authorized` 数据，必须显式提示。
- 操作完成后刷新总览、库表、版本和操作日志。

## 任务优先级

| 优先级 | 任务 | 目的 | 依赖 |
|---|---|---|---|
| P0 | `X-P3-DB-0` | 冻结产品方案、任务优先级和清库 TODO | 无 |
| P0 | `D-P3-DB-1` | 盘点现有库和清库影响 | `X-P3-DB-0` |
| P0 | `A-P3-DB-2` | 新 schema、migration 和系统表 | `D-P3-DB-1` |
| P0 | `A-P3-DB-3` | 只读 Admin API | `A-P3-DB-2` |
| P1 | `A-P3-DB-4` | 导入、版本、质量检查 Admin API | `A-P3-DB-3` |
| P1 | `V-P3-DB-5` | 前端只读数据管理工作台 | `A-P3-DB-3` |
| P2 | `A-P3-DB-6` | 受控危险操作 API 与重建流程 | `A-P3-DB-3`、`A-P3-DB-4` |
| P2 | `V-P3-DB-7` | 危险操作前端与操作日志闭环 | `A-P3-DB-6` |
| P3 | `X-P3-DB-8` | 总体验收与现有库表清除执行 | 前序全部完成 |

## 示例流程

查看当前库状态：

```text
打开 数据管理 -> 总览
后端读取 /api/v0/admin/database/overview
页面展示 workspace、schema version、表数、总行数、来源分布和最近操作
```

导入数据包：

```text
选择 导入 -> data/p1/douyin-bi
执行 dry run
查看影响表、行数、data_version、quality_report
确认后正式导入
导入结果写入 data_import_job 和 db_admin_audit
```

重建 `ws_demo`：

```text
进入 危险操作 -> 重建 workspace
执行 dry run
查看影响表、行数、是否包含 user_authorized、是否包含 audit / task / import history
创建快照
输入 RESET ws_demo
后端 rebuild：drop views -> drop tables -> apply migrations -> 初始化 workspace
刷新总览并写入 db_admin_audit
```

## 清库重建前置条件

执行 `X-P3-DB-8` 前必须满足：

- `D-P3-DB-1` 已输出当前库清单和影响范围。
- `A-P3-DB-2` 已完成新 schema 和 migration contract。
- `A-P3-DB-6` 已在临时 workspace 验证 rebuild 成功。
- `V-P3-DB-7` 已能展示 dry run、确认文本、执行结果和操作日志。
- 已创建当前 `ws_demo` 快照，或用户明确确认跳过快照。
- 已明确是否重放 demo 数据包和 `user_authorized` 数据包。

禁止事项：

- 不通过手工删除 SQLite 文件绕过 admin audit。
- 不在未完成 dry run 和快照前清库。
- 不自动重放 `user_authorized` 数据，除非用户当次确认。

## 验收标准

`X-P3-DB-0` 验收：

- `docs/wiki.html` 中 P3-DB 任务卡完整发布。
- 本文可作为 A/D/V/X 后续执行真源。
- 清库重建待办被明确记录为重构完成后的验收项，而不是立即执行项。

P3-DB 总体验收：

- 新 schema 可在空库初始化。
- 现有库可被只读盘点并识别来源分布。
- 数据管理页面能查看总览、库表、schema、样例、导入版本、migration 和操作日志。
- 导入支持 dry run、质量报告和任务状态。
- truncate、drop、delete version、rebuild 均有 dry run、confirmText 和 audit。
- `ws_demo` 清库重建通过受控 API 完成，并留下审计记录。
- typecheck、build、API smoke、前端 smoke 通过。

## 注意事项

- 用户授权数据默认可进入 PLS，但数据库维护操作必须如实提示影响范围。
- `douyin_*` 当前包含 `user_authorized` 业务 BI 数据，不能与 mock / smoke 数据混为一类。
- 当前 `ws_demo` 不是干净生产库；后续清库是重构完成后的必要步骤。
- schema、API 路径、共享类型和危险操作白名单都属于接缝层，必须由 X 总控复核。
