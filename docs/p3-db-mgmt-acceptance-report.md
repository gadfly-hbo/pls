# P3 DB Management Acceptance Report

## 目的

本文记录 `X-P3-DB-MGMT-4` 总体验收结论：数据管理模块已从只读工作台升级为受控 SQLite 数据库运维工作台。用户可以在前端通过 Admin API 的受控流程管理后端 SQLite 数据库。

验收范围覆盖：

- 产品方案与边界。
- Admin Database API contract。
- 前端 `DataManagementWorkbench`。
- empty / imported / summary API smoke。
- 前端 Playwright smoke 与真实后端数据管理读验证。

## 验收结论

结论：通过。

当前闭环满足以下要求：

- 空业务库状态可通过 Admin API 和前端数据管理页展示。
- `data/demo` 与 `data/p1/douyin-bi` 可通过受控导入路径重放。
- 导入后可追踪 import job、dataVersion 和 audit event。
- 删除版本、truncate、drop、apply migrations、rebuild 均具备 dry run、影响范围、confirmText、admin token、Idempotency-Key 和 audit 约束。
- 危险操作正式执行不依赖前端信任，后端会重新校验 confirmText、admin token、workspace 和目标对象。
- smoke 中的破坏性正式操作使用隔离临时 workspace；本轮未对 `ws_demo` 执行未确认的破坏性正式操作。

允许进入后续真实数据管理增强。后续增强仍需单独拆卡，不得绕过当前 Admin API、`db_admin_audit`、confirmText 和 Idempotency-Key。

## 验收过程

### 静态复核

已复核：

- `docs/p3-db-mgmt-operational-plan.md`
- `docs/p3-db-mgmt-api-contract.md`
- `apps/server/src/routes/admin-database.ts`
- `apps/server/src/lib/dangerous-ops.ts`
- `apps/server/src/lib/import-packages.ts`
- `apps/server/scripts/README-admin-smoke.md`
- `apps/server/scripts/smoke-admin-empty.mjs`
- `apps/server/scripts/smoke-admin-imported.mjs`
- `apps/server/scripts/smoke-admin-summary.mjs`
- `apps/web/src/pages/DataManagementWorkbench.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/e2e/data-management.spec.ts`

复核结果：

- 产品边界保持冻结：不做 SQL console，不允许前端直接访问 SQLite 文件，不做单元格级在线编辑。
- 写操作统一流程保持冻结：dry run -> 影响范围 -> confirmText -> admin token -> Idempotency-Key -> audit -> 刷新状态。
- `smoke:admin-empty` 和 `smoke:admin-imported` 均使用隔离 workspace，避免污染 `ws_demo`。
- `smoke:admin-summary` 可输出合并 JSON summary，便于总控复核。

### 可运行验证

已执行并通过：

```text
apps/server npm run typecheck
apps/server npm run schema:check
apps/server npm run smoke:admin-summary
apps/web npm run lint
apps/web npm run build
apps/web npm run smoke
VITE_USE_MOCK=false npx playwright test e2e/smoke-real.spec.ts -g "Data Management Workbench - Real Backend Smoke Test"
VITE_USE_MOCK=false npx playwright test e2e/data-management.spec.ts
```

关键结果：

- `schema:check`：`ws_demo` valid，1 applied / 0 pending / 0 failed。
- `smoke:admin-summary`：`allOk: true`。
- empty suite：database 43/43，import dry-run 32/32，dangerous 56/56。
- imported suite：import 52/52，database imported 49/49，dangerous 56/56。
- Playwright 常规 smoke：2 passed / 2 skipped。
- 真实后端数据管理读验证：1 passed。
- 真实后端模式数据管理受控操作链路：1 passed；测试中写操作被拦截，不对 `ws_demo` 执行破坏性正式操作。

### 验收中修复

本轮总体验收发现并修复 3 个问题：

- `apps/web/src/services/api.ts` 缺少 `DbOperationExecuteResult` type import，导致 `npm run build` 失败。
- `apps/web/e2e/data-management.spec.ts` 的 import 路由拦截未覆盖 `/admin/database/import-jobs/dry-run`，导致真实后端模式下测试半真半 mock。
- `apps/web/src/pages/DataManagementWorkbench.tsx` 多个真实数据列表在 id 为空时使用空字符串作为 React key，真实后端模式触发 duplicate key console error；已补充稳定 fallback key。

## 当前数据库状态

本轮总体验收没有手工修改 SQLite 文件，也没有对 `ws_demo` 执行未确认的破坏性正式操作。

当前 `ws_demo` 状态：

- schema valid。
- 1 applied migration，0 pending，0 failed。
- 仍保留 A-P3-DB-MGMT-1 smoke 后导入的 demo + douyin-bi 业务数据。

本轮 API 总验使用的临时 workspace：

- `ws_summary_empty_1783130585372`
- `ws_summary_imported_1783130585372`

这些临时 workspace 由 smoke 自动创建并保留，后续如需清理应另行确认清理策略。

## 剩余风险

- `data/p1/douyin-bi` 和 `data/demo` 已覆盖；任意 CSV 上传、任意字段映射、用户自定义数据包列表仍未纳入当前边界。
- 当前前端可填写 admin token，但未实现更完整的登录态 / 角色权限体系；第一版仍按本地 admin token 口径验收。
- Playwright 的真实后端数据管理写操作仍采用拦截方式避免破坏 `ws_demo`；真实破坏性 execute 由 API smoke 在隔离 workspace 验证。
- 临时 workspace 文件会累积，后续可单独增加受控清理脚本。
- 正式 fit formula、真实新品主数据字段和真实行动反馈字段仍是 P2/P3 之外的产品风险，不影响本次 DB-MGMT 闭环结论。

## 后续口径

允许进入后续真实数据管理增强，建议新增卡组覆盖：

- 后端提供可用数据包列表接口，前端不再写死 `demo` / `douyin-bi`。
- 临时 workspace 清理与保留策略。
- 更细粒度权限和 admin token 获取方式。
- 真实用户授权数据包导入模板与质量报告扩展。

仍然禁止：

- 通用 SQL console。
- 前端直接访问 SQLite 文件。
- 绕过 Admin API 手工改库作为验收手段。
- 绕过 `db_admin_audit`、confirmText、admin token 或 Idempotency-Key。
