# notes-backend

## 0. 当前状态

最近更新：2026-07-12（T0035 复验 ws-demo fixture 写隔离后端防线）

进度：

- 新增 `apps/server/scripts/lib/workspace-guard.mjs`：共享 ws_demo 写保护 helper，提供 `guardWriteWorkspace` 和 `makeTempWorkspace`。
- 对直接写 DB 的脚本增加 fail-fast guard：`import-douyin-bi.mjs`、`seed-data-sources.mjs`、`sync-channel-entities.mjs`。
- 对写型 smoke 增加 guard：
  - `smoke-admin-import.mjs` 在 `imported` 模式下拒绝 `ws_demo`。
  - `smoke-admin-dangerous.mjs` 启动时拒绝 `ws_demo`（破坏性操作始终只发生在临时 workspace）。
  - `smoke-p2-api.mjs` 启动时拒绝 `ws_demo`（会写入 predictions / decisions / actions / feedback）。
  - `smoke-channel-object-library.mjs` 在 `imported` 模式下拒绝 `ws_demo`。
- wrapper 脚本 `smoke-admin-empty`、`smoke-admin-imported`、`smoke-admin-summary`、`smoke-tools-import` 已经默认使用临时 workspace，未改行为。
- 更新 `apps/server/scripts/README-admin-smoke.md`：新增“安全红线”章节，说明 `PLS_ALLOW_WS_DEMO_WRITE` override 口径。
- 未改生产 API 语义；隔离仅在脚本层生效。
- T0035 复验通过：启动本地 API server 后运行 `apps/server npm run smoke:channel-object-library`，脚本使用临时 workspace `ws_col_1783861748037`，22/22 checks passed；未写入 `ws_demo`。

下一步：

- 前端 Playwright 隔离已由 T0033 完成；DB diff guard 工具已由 T0034 完成；验收汇总已由 T0035 完成。
- 后续新增后端写型脚本（smoke、import、admin、seed、sync）必须复用 `workspace-guard.mjs`。
- 考虑在 CI / pre-commit 中加入 `git diff --name-only -- data/workspaces/ws_demo/db.sqlite` 检查。

阻塞：

- 当前无后端阻塞。

开放问题：

- 是否需要把 ws_demo 写保护下沉到 API 层？当前任务按“不改变生产 API 语义”未处理，后续如需要可由 controller 拍板。
- `seed.ts`（apps/server/scripts/seed.ts）仍硬编码写入 `ws_demo`，但它不在本次允许改动范围（allowed_paths 只包含 .mjs），且属于一次性 fixture 初始化脚本；是否加 guard 待 controller 决定。

验证：

- T0032 验证命令：`cd apps/server && npm run typecheck`、`npm run smoke:channel-object-library`、`git diff --check`、`git diff --name-only -- data/workspaces/ws_demo/db.sqlite`。
- _guard 行为验证：尝试 `PLS_WORKSPACE=ws_demo node apps/server/scripts/import-douyin-bi.mjs` 应在打开 DB 前失败并输出可操作错误。
- T0035 复验命令：`cd apps/server && npm run smoke:channel-object-library`，结果 `RESULT: {"name":"channel-object-library","mode":"dry-run","workspace":"ws_col_1783861748037","passed":22,"failed":0,"ok":true}`。

---

## 后端工程原则

- 后端写型脚本、smoke、admin wrapper 必须默认保护 `ws_demo`  fixture。
- 任何直接写 SQLite 的脚本（import、seed、sync）在写 `ws_demo` 前必须 fail-fast。
- 任何通过 API 写入的 smoke 在目标 workspace 为 `ws_demo` 时必须 fail-fast。
- 临时 workspace 命名建议：`ws_<purpose>_<timestamp>`。
- Controller-only override 变量：`PLS_ALLOW_WS_DEMO_WRITE=1`；普通开发/测试不得使用。
- 不要依赖人工记忆保护 fixture；所有保护必须是脚本级或工具级。

## A-P3-DB-MGMT-3 沉淀

- Admin database smoke wrapper 默认创建独立 workspace：`smoke-admin-empty`、`smoke-admin-imported`、`smoke-admin-summary`。
- 独立脚本 `smoke-admin-import` 在 `imported` 模式下、`smoke-admin-dangerous` 启动时拒绝 `ws_demo`。
- 危险操作 confirmText 必须先校验，再执行目标存在性查询（如当前 handler 顺序有偏差，需由 API 层单独修复）。
- JSON summary runner 需要子脚本输出 `RESULT: {...}` 行供解析汇总。

## A-P1-F2 沉淀

- `import-douyin-bi.mjs` 不再默认写 `ws_demo`；必须显式指定 workspace 或 controller override。
- 临时 workspace 导入前需通过 Admin API `POST /admin/database/rebuild` 初始化完整 schema。

## A-P2-1 沉淀

- `seed-data-sources.mjs` 是写操作，同样受 ws_demo guard 保护。
- `sync-channel-entities.mjs` 是写操作，同样受 ws_demo guard 保护。
