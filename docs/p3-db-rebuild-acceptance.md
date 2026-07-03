# P3 DB Rebuild Acceptance

## 目的

记录 `X-P3-DB-8` 的 SQLite 重构总体验收、`ws_demo` 受控 rebuild、快照信息、验证结果和未重放数据范围。

## 执行口径

- 执行时间：2026-07-03 23:38（Asia/Shanghai）
- 执行方式：通过 Admin API `POST /api/v0/admin/database/rebuild`
- workspace：`ws_demo`
- confirmText：`RESET ws_demo`
- 重放口径：选 A，不重放 `data/demo`，不重放 `data/p1/douyin-bi`
- 红线执行情况：未手工删除主库文件，未绕过 `db_admin_audit`

## 快照

- 快照路径：`data/workspaces/ws_demo/db.sqlite.snapshot.1783093107898`
- 快照大小：11M
- 快照 SHA-256：`e644be67c3c4d310406664f42216de36b9abaf885c1eb689c0f7eb73864a71c3`
- rebuild 后主库路径：`data/workspaces/ws_demo/db.sqlite`
- rebuild 后主库大小：472K
- rebuild 后主库 SHA-256：`b1c7a4b074d88a891479d2b5a6c37bfe78ef7f39431fdd81533611426e02fe2f`

## Dry Run 影响范围

- target：`ws_demo`
- targetType：`workspace`
- affectedRows：5707
- affectedTables：22 张业务 / 数据表
- user_authorized：包含 `douyin_*` 用户授权数据
- protected system tables：将同时销毁 2503 行，涉及 `workspace`、`audit_event`、`idempotency_key`、`schema_migration`、`db_admin_audit`、`data_import_job`

## 执行结果

Admin API 返回成功：

- `snapshot`：ok
- `delete_db_file`：ok
- `apply_migrations`：ok，`1 applied, 0 failed`
- `init_workspace`：ok

重建后结构：

- tables：28
- views：10
- `schema_migration`：1 行
- `db_admin_audit`：1 行
- `data_import_job`：0 行
- `workspace`：1 行
- business rows：0

关键表行数：

- `sku`：0
- `douyin_product`：0
- `batch`：0
- `data_import_job`：0
- `db_admin_audit`：1
- `workspace`：1

`db_admin_audit` 已记录 `rebuild / workspace / ws_demo / success`，before snapshot 包含清除前 5707 行影响范围，after snapshot 包含快照路径。

## 验证结果

通过：

- `apps/server npm run typecheck`
- `apps/server npm run schema:check`
- `apps/server npm run smoke:admin-database`
- `apps/web npm run lint`
- `apps/web npm run build`
- `apps/web npm run smoke`
- `apps/web VITE_USE_MOCK=false npx playwright test e2e/data-management.spec.ts --project=chromium`

已知不适用：

- `apps/server npm run smoke:admin-dangerous` 中 3 个断言失败，原因是该 smoke 仍假设 `ws_demo` 存在 `v1_20260703` 的 `douyin_*` 数据；本次按用户确认选择 A，不重放任何数据，因此该断言与空库验收目标冲突。该脚本中的临时 workspace rebuild、drop view、import 后 delete-version 闭环仍通过。

## 未重放数据

本次不重放任何数据包。以下数据已从新主库移除，仅保留在快照中：

- `data/demo` 可重放的 demo 数据
- `data/p1/douyin-bi` 的 `v1_20260703` user_authorized 数据
- 本地临时验收版本 `v2_20260704_xp1f6`
- 历史 demo / smoke / e2e / 临时导入记录
- 旧 `audit_event`、`task`、`idempotency_key`、`data_import_job`、`db_admin_audit` 运行时历史

## 注意事项

- 当前 `ws_demo` 是空业务库，仅保留最新 schema、workspace 初始化行和本次 rebuild audit。
- 依赖历史商品、渠道、抖音 BI 或 demo 数据的业务 smoke / 页面流程需要先按后续任务重新导入数据。
- 如需恢复旧状态，应基于快照文件执行明确的恢复流程，不应直接覆盖当前主库。
