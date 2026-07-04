# P3 DB Management Operational Plan

## 目的

本文冻结 `X-P3-DB-MGMT-0` 的产品实现口径：把数据管理模块从只读工作台升级为受控 SQLite 数据库运维工作台。

本轮目标不是做通用数据库客户端，而是让总控用户能在 PLS 内通过受控流程管理后端 SQLite：

- 查看 workspace 数据库状态。
- 重放或导入受支持的数据包。
- 管理数据版本。
- 查看库表、schema、样例和 migration。
- 执行受控清理、删除、重建和 migration 操作。
- 通过 `db_admin_audit` 追踪所有 admin 写操作。

当前基础状态：

- `X-P3-DB-0` 至 `X-P3-DB-8` 已完成并保持 done。
- `ws_demo` 已通过 Admin API 受控 rebuild。
- 当前 `ws_demo` 是空业务库，仅保留最新 schema、workspace 初始化行和本次 rebuild audit。
- 后续如需业务演示或 smoke 数据，必须通过受控导入路径重放数据包，不得手工覆盖 SQLite 文件。

## 使用方式

- `docs/wiki.html` 是任务派发真源。
- 本文是 `A-P3-DB-MGMT-1`、`V-P3-DB-MGMT-2`、`A-P3-DB-MGMT-3` 和 `X-P3-DB-MGMT-4` 的产品口径。
- A 域按本文补齐 Admin API contract、dry run response、导入重放和 smoke。
- V 域按本文实现数据管理前端可操作化，不直接访问 SQLite 文件。
- X 总控按本文验收是否满足受控运维闭环。

## 产品边界

数据管理模块一级功能冻结为：

| 功能 | 用户目标 | 第一版范围 |
|---|---|---|
| 总览 | 判断当前库是否可用 | workspace、db 状态、schema version、表数、view 数、业务行数、最近导入、最近危险操作 |
| 库表管理 | 查看和维护表 / view | 列表、schema、sample、行数、系统表标记、清空表、删除表 |
| 导入管理 | 从受支持数据包重放业务数据 | `data/demo`、`data/p1/douyin-bi`、新品预测输入模板的 dry run、正式导入、quality report |
| 版本管理 | 管理 `dataVersion` 生命周期 | 版本列表、latest 标记、行数、删除版本 dry run / execute |
| Schema 管理 | 管理 migration 状态 | schema check、migration 列表、apply pending migrations |
| 危险操作 | 执行高风险维护 | truncate、drop、delete version、apply migrations、rebuild workspace |
| 操作日志 | 追踪 admin 写操作 | `db_admin_audit` 列表、筛选、before / after 摘要、错误原因 |

非目标：

- 不做通用 SQL console。
- 不允许前端直接访问 SQLite 文件。
- 不做单元格级在线编辑。
- 不支持用户上传任意 CSV 并自由映射字段；任意导入需后续单独设计。
- 不自动重放 `user_authorized` 数据，除非用户当次确认。
- 不把旧 `P3-DB` done 任务重新发布为 todo。

## 操作分级

| 级别 | 操作 | 要求 |
|---|---|---|
| 只读 | overview、tables、schema、sample、migrations、versions、audit 查询 | 可直接读取，sample 默认限 50 行 |
| 安全写入 | dry run、schema check | 不写业务表；如写入任务日志需明确标记 `dryRun` |
| 中风险清理 | truncate table、delete dataVersion | dry run、confirmText、admin token、Idempotency-Key、audit |
| 高风险重建 | drop table、apply migrations、rebuild workspace | dry run、快照或明确跳过、confirmText、admin token、Idempotency-Key、audit |

所有写操作统一流程：

```text
用户选择操作
-> 后端 dry run
-> 前端展示影响范围、warnings、requiredConfirmText
-> 用户输入 confirmText 和 admin token
-> 前端携带 Idempotency-Key 提交正式执行
-> 后端重新计算或校验影响范围
-> 后端执行并写 db_admin_audit
-> 前端刷新总览、库表、版本和操作日志
```

写操作不得只依赖前端判断。最终影响范围、权限、确认文本、workspace 隔离和白名单均由后端校验。

## API 边界

Admin Database API 继续使用：

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

写接口 headers：

```text
X-PLS-Workspace: ws_demo
X-PLS-Admin-Token: <admin-token>
Idempotency-Key: <stable-operation-key>
```

危险操作 body 至少包含：

```json
{
  "dryRun": false,
  "confirmText": "RESET ws_demo"
}
```

Dry run response 标准字段：

```json
{
  "operation": "rebuild",
  "targetType": "workspace",
  "targetName": "ws_demo",
  "affectedTables": ["sku"],
  "affectedRows": 0,
  "sourceType": "system_runtime",
  "dataVersion": null,
  "containsUserAuthorized": false,
  "containsSystemHistory": true,
  "warnings": [],
  "requiredConfirmText": "RESET ws_demo"
}
```

正式执行 response 标准字段：

```json
{
  "operation": "rebuild",
  "status": "success",
  "auditId": "audit_xxx",
  "beforeSnapshot": {},
  "afterSnapshot": {},
  "warnings": []
}
```

错误码口径：

- `400 invalid_confirm_text`：确认文本错误。
- `401 admin_token_required`：缺少或错误 admin token。
- `404 target_not_found`：表、版本或 workspace 不存在。
- `409 idempotency_conflict`：同 key 不同 payload。
- `409 protected_target`：系统表或受保护对象不可执行目标操作。
- `422 dry_run_required`：正式执行前置 dry run 不满足或影响范围不可确认。

## 前端体验

数据管理页面必须是工作台，第一屏展示数据库真实状态，不做说明页。

总览：

- 当前 workspace。
- 当前数据库状态。
- schema version 和 migration 状态。
- tables / views / business rows。
- 最近导入任务。
- 最近危险操作。
- 空业务库提示：当前 `ws_demo` 已 rebuild，需通过导入重放业务数据。

库表管理：

- 系统表、业务表、view 有明确标记。
- 长表名、字段名和 JSON 样例必须可换行或横向滚动。
- 清空 / 删除按钮按后端 `truncatable` / `droppable` 显示。
- 受保护表不可展示可执行危险按钮。

导入管理：

- 先选择受支持数据包。
- 先 dry run，再正式导入。
- 展示影响表、行数、版本号、quality report、warnings、errors。
- 正式导入后刷新 versions、tables、overview、audit。

危险操作：

- 不作为默认入口。
- 每次操作必须展示影响范围和 required confirm text。
- 若影响 `user_authorized`、audit、task、import history，必须显式提示。
- 错误确认文本必须被前端和后端共同拦截。
- e2e 中不得对 `ws_demo` 执行未拦截的正式破坏性操作。

## 任务拆分

| 任务 | 归属 | 目标 |
|---|---|---|
| `A-P3-DB-MGMT-1` | A | Admin Database API 可操作化加固，覆盖 dry run 标准化、导入重放、危险操作响应和 audit |
| `V-P3-DB-MGMT-2` | V | 数据管理前端操作化工作台，接入真实写操作 UI |
| `A-P3-DB-MGMT-3` | A | 空库与重放数据 smoke 适配，拆分空库、导入后和临时 workspace dangerous smoke |
| `X-P3-DB-MGMT-4` | X | 总体验收，从空业务库验证导入重放、版本管理、危险操作 dry run 和 audit |

依赖顺序：

```text
X-P3-DB-MGMT-0
-> A-P3-DB-MGMT-1
-> V-P3-DB-MGMT-2 与 A-P3-DB-MGMT-3
-> X-P3-DB-MGMT-4
```

## 示例

从空库重放抖音 BI 数据：

```text
打开 数据管理 -> 导入
选择 data/p1/douyin-bi
执行 dry run
检查 affectedTables、affectedRows、dataVersion、quality report
输入 admin token
正式导入
查看 版本 页出现 dataVersion
查看 操作日志 出现 import success
```

删除指定数据版本：

```text
打开 数据管理 -> 版本
选择 dataVersion
执行 delete version dry run
检查 affectedTables、affectedRows、containsUserAuthorized
输入 requiredConfirmText，例如 DELETE VERSION v1_20260703
正式删除
刷新版本、库表和操作日志
```

重建 workspace：

```text
打开 数据管理 -> 危险操作
选择 rebuild workspace
执行 dry run
检查 system history、user_authorized、affectedRows
确认是否创建快照
输入 RESET ws_demo
正式执行
查看 db_admin_audit 中 rebuild success
```

## 验收标准

`X-P3-DB-MGMT-0` 完成标准：

- 本文存在并可作为后续 A/V/X 任务真源。
- `docs/wiki.html` 已发布 P3-DB-MGMT 任务卡组。
- 旧 P3-DB 卡保持 done，不被重新发布为 todo。
- 方案明确当前 `ws_demo` 是空业务库，后续业务数据需受控导入重放。
- 明确禁止 SQL console、前端直接访问 SQLite 文件、单元格级编辑。
- 明确所有写操作必须经过 Admin API、dry run、confirmText、admin token、Idempotency-Key 和 `db_admin_audit`。

后续总体验收标准：

- API smoke、前端 smoke、Playwright smoke 通过。
- 页面能从空业务库展示当前状态。
- 页面能 dry run 并导入受支持数据包。
- 版本管理、危险操作 dry run、错误确认文本、audit 均可追溯。
- 不执行未确认的 `ws_demo` 正式破坏性操作。

## 注意事项

- 用户授权数据默认可进入 PLS，但数据库维护操作必须如实提示影响范围。
- 当前 `ws_demo` 为空业务库；旧业务数据仅保留在快照或仓库数据包中。
- 如需恢复旧状态，应设计明确恢复流程，不应直接覆盖当前 SQLite 主库。
- schema、API 路径、共享类型、系统表和危险操作白名单属于接缝层，由 X 总控持有。
