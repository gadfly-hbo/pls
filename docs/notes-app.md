# notes-app

## 0. 当前状态

最近更新：2026-07-08（T0002 单品画像预测专用 API 实现并通过 smoke）

进度：

- A-P0-3 / A-P0-B2 / A-P0-C1 已完稿。
- A-P1-B1/B2/B3/B4 / A-P1-E3 / A-P1-F2 已完稿并通过总控复核。
- A-P2-1 已通过总控复核（data_source 注册表 + adapter 模式 + /data-management/*）。
- A-P2-3 已通过总控复核（channel_entity 投影表 + /channels/entities）。
- A-P2-9 已完稿并通过总控复核（新品预测 API + 匹配衔接）。
- A-P2-10 已完稿并通过总控复核（经营飞轮最小闭环 API）。
- **A-P3-DB-2 / 3 / 4 已通过总控复核并 mark done**（admin token 前置于 idempotency replay）。
- **A-P3-DB-6 已 mark done**：受控危险操作 API 与 workspace rebuild 流程经三轮返工后通过。
- **X-P3-DB-8 已 mark done**：用户确认空库重放，ws_demo 通过 Admin API 完成受控 rebuild，未手工 rm 主库。
- **A-P3-DB-MGMT-1 已完成**：Admin Database API 可操作化加固，统一 dry run / 正式执行响应、补齐 after snapshot、导入重放、危险操作 confirmText 和 audit 闭环。
- **A-P3-DB-MGMT-3 已完成并经总控 mark done**：拆分空库 smoke（`smoke:admin-empty`）与导入后 smoke（`smoke:admin-imported`）；dangerous 操作正式执行仅使用临时 workspace；新增 `smoke:admin-summary` 输出 JSON summary；README 明确每条 smoke 对数据库状态的前置假设。
- **X-P3-DB-MGMT-4 已完成**：总控验收确认 Admin Database API、empty/imported/summary smoke、版本管理、危险操作 dry run / confirmText / admin token / Idempotency-Key / audit 闭环通过。
- **A-P4-TOOLS-1 已完成并经总控 mark done**：新增工具注册表、本地 runner、运行记录与 artifact 查询 API；注册一个 L1 样例工具 `sample-profile-extract`；工具输出统一写入 `data/local/tool-runs/<runId>/`；总控修复 run / artifact 查询的 workspace 隔离缺口后，`smoke:tools` 27/27 通过。
- **A-P4-TOOLS-4 已完成并经总控 mark done**：将 `profile-extract` / `business-aggregate` 工具输出包接入 Admin Import / Data Management 闭环；新增 `apps/server/src/lib/import-tool-packages.ts`、扩展 `/tools/runs/:runId/import-dry-run` 与 `/tools/runs/:runId/import`、注册 `profile_extract` / `business_aggregate` 数据源 adapter；dry-run 返回统一 `OperationImpact`，导入复用 admin token / Idempotency-Key / confirmText / audit 全套约束。总控补强 import-dry-run / import 的 workspace 隔离后，`smoke:tools-import` 33/33 通过，`smoke:tools` 回归 27/27 通过。
- **X-P4-TOOLS-6 已完成并经总控 mark done**：工具模块第一期总体验收通过，确认 Tool Registry、Local Runner、artifact 管理、profile-extract / business-aggregate 标准包、Admin Import、Data Management 和 ToolsWorkbench 已形成闭环；临时 workspace `ws_tools_import_1783176743243` 覆盖 import dry-run、confirm import、auditId、batch、dataVersion、qualityReport 和 Data Management 读回。
- **A-P5-PORTRAIT-5 已完成并经总控 mark done**：注册 `single-product-portrait` L1 工具，前端通过 `POST /api/v0/tools/runs` 传 `toolId=single-product-portrait` 与 `skuId/packageId` 触发预测，结果只写 `data/local/tool-runs/<runId>/artifacts/prediction.json` 和 `report.md`。artifact 保留 `sourceFiles`、平台画像、风险、证据和 PLS bridge；run/artifact 查询沿用 tools workspace 隔离。
- **A-P5-PORTRAIT-5 总控修正项已关闭**：`platform_portrait.csv` 按 `skuId + sourceProductKey` 过滤，防止多 SKU 样本包串画像；`prediction.json` 顶层已写入 `sourceFiles`，供 V/A 机器读取来源 lineage。
- **A-P6-CHANNEL-3 已完成并经总控 mark done**：已修复 `missing_parent_reference` 为 blocking、正式 import 前拦截 dry-run blocking errors、对象库列表分页对齐 api-contract.md 通用契约、新增负向 smoke fixture 与 `smoke:channel-object-library` 脚本；`docs/api-contract.md` §10.5 与 `docs/notes-app.md` 已同步。
- **A-P7-INGEST-2 已按 review 返工完成（2026-07-06）**：X 总控 review 指出的 stagedFileId 路径穿越风险、upsert/replace 语义未拍板、strict mode 与 execute 语义不一致、typeErrors 统计口径错误、before/after snapshot 行数不真实等问题已修复：
- **T0002 已完成（2026-07-08）**：实现单品画像预测专用 API `GET /api/v0/single-product-portrait/metadata`、`POST /api/v0/single-product-portrait/predict`、`POST /api/v0/single-product-portrait/predict/batch/preview`、`POST /api/v0/single-product-portrait/predict/batch`；支持 `.xlsx` / `.csv` 批量解析、行级校验与 preview/execute 同构；模型不可用时 metadata 返回 200 + `modelAvailable: false`，predict 返回 `model_not_available`，批量 preview/execute 在 `fileErrors` 中返回 `model_not_available`；`smoke:single-product-portrait` 70/70 通过，`smoke:single-product-portrait-tool` 39/39 回归通过。相关实现见 `apps/server/src/routes/single-product-portrait.ts`、`apps/server/src/lib/single-product-portrait/`、`apps/server/scripts/smoke-single-product-portrait-api.mjs`。`apps/server/package.json` 新增 `xlsx: ^0.18.5` 并保持与 `apps/model` 版本一致；`apps/model/src/single-product-portrait-supervised.ts` 加 `!` 修复 server 端 `noUncheckedIndexedAccess` 跨包类型错误。
  - `apps/server/src/lib/csv-ingestion.ts` 增加 `stagedFileId` 格式校验（`^csv_[0-9]+_[a-z0-9]{6}$`）、路径解析后确认仍在当前 workspace staging 目录内、`staging.json` 读取后校验 `meta.workspaceId`/`meta.stagedFileId`/`meta.targetTable`。
  - 改为 append-only：dry-run 检测目标表主键冲突（`primary_key_conflict`），execute 使用普通 `INSERT` 不再 `INSERT OR REPLACE`。
  - 从 public API 移除 `mode=strict/relaxed` 参数，第一期仅保留 relaxed。
  - `typeErrors` 仅统计 `rule === "type_conversion_failed"`。
  - `beforeSnapshot` / `afterSnapshot` 改为目标表真实行数（`COUNT(*) WHERE workspace_id = ?`），并写入 `db_admin_audit`。
  - `apps/server/scripts/smoke-csv-ingestion.mjs` 新增路径穿越、URL 编码路径穿越、staging 文件篡改、`staging.json` workspaceId/targetTable 篡改、append-only 重复导入阻塞用例。
  - `docs/p3-db-mgmt-api-contract.md` 与 `docs/p7-csv-ingestion-data-contract.md` 已同步 append-only、strict 移除、snapshot 真实行数等语义。
  - 全部验证通过：typecheck、schema:check、`smoke:csv-ingestion` 46/46、`smoke:admin-summary`、`smoke:tools`、`smoke:channel-object-library` 均无回归。`docs/wiki.html` A-P7-INGEST-2 任务卡已 mark done。
- 应用侧数据准入按项目级放行口径；taxonomy gate 未变。

关键决策（A-P3-DB-6 三轮返工）：

- **Round 1 — 4 个核心修复**：
  1. delete-version 按 `data_version` 遍历 8 张 `douyin_*` 表 + batch 表 LIKE 模式匹配，不再按 batch_id。
  2. drop 操作先 `isTable/isView` 判断再发 `DROP TABLE`/`DROP VIEW`（避免 SQLite 报错）。
  3. rebuild dry-run 把 PROTECTED_TABLES 行数也纳入影响范围，warnings 显式提示"will also destroy N rows in protected system tables"。
  4. executeTruncate 的 `sqlite_sequence` DELETE 加 try-catch（autoincrement 表才有此表）。
- **Round 2 — view 类型检测**：executeDrop 先 `isTable()` 再 `isView()` 再 fallback IF EXISTS。
- **Round 3 — 路由层语义修正**：DELETE /versions/:dataVersion 改用 `affectedRows === 0` 判 not-found，不再用 `warnings.length > 0`。warnings 仅描述数据特征（user_authorized / protected），不影响存在性判断。
- **fresh workspace 容错**：dangerous-ops 的 batch 表查询/删除加 `isTable(db, "batch")` 守卫 + try-catch。
- **A-P3-DB-MGMT-3 补充**：delete-version 正式执行时先校验 `confirmText` 再检查 `affectedRows === 0`，避免错误 confirmText 因版本不存在而误返回 404。

下一步：

- A-P6-CHANNEL-3 已通过总控复核；后续 V-P6 接真实 API 时按 `docs/api-contract.md` §10.5 和实际 route/schema 对齐。
- P5-PORTRAIT 后续由 V-P5-PORTRAIT-6 接入 `single-product-portrait` tool artifact；A 侧真实样本包导入需等 D / X 另开任务。

阻塞：

- 无

开放问题：

- 新品预测 match 链路当前查 `channel_profile`（P0 mock 4 行）；V-P2-4 接入后需改为查 `channel_entity`（17 行）。
- 经营飞轮 action/feedback 只存不触发；webhook / 事件驱动待后续 P2 任务。
- `channel_entity` 投影表更新需手动重跑 `sync:channel-entities`；自动触发待 X 拍板。
- `/channels`（P0 mock）和 `/channels/entities`（P2 投影）并存；迁移策略需 X 冻结。
- smoke 测试产生的临时 workspace（`ws_drop_test_*` / `ws_review_delete_version_*` / `ws_smoke_*`）目录未被清理，待手工或后续脚本清理。
- P4 工具 smoke 也会产生临时 workspace 与 `data/local/tool-runs/` staging 目录，清理策略尚未自动化。

验证：

- 重建前（2026-07-03）：199 项 API 冒烟全部通过，无回归。
- A-P3-DB-MGMT-1 验证（2026-07-04，返工后）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run schema:check` 通过（Valid true，0 missing / 0 extra，1 applied / 0 pending / 0 failed）。
  - `apps/server npm run smoke:admin-database` 通过 37/37（空库状态）。
  - `apps/server npm run smoke:admin-import` 通过 52/52（空库 → demo 导入 → douyin-bi 导入；覆盖缺失/错误 confirmText）。
  - `apps/server npm run smoke:admin-dangerous` 通过 55/55（含临时 workspace 真实 drop view / drop table / truncate non-existent / drop non-existent / delete version / rebuild 闭环）。
- A-P3-DB-MGMT-3 验证（2026-07-04）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run schema:check` 通过（Valid true，0 missing / 0 extra，1 applied / 0 pending / 0 failed）。
  - `apps/server npm run smoke:admin-empty` 通过 131/131（database 43 + import 32 + dangerous 56）。
  - `apps/server npm run smoke:admin-imported` 通过 157/157（import 52 + database 49 + dangerous 56）。
  - `apps/server npm run smoke:admin-summary` 通过，输出 JSON summary（allOk: true）。
  - `apps/server/scripts/README-admin-smoke.md` 已新增，说明每条 smoke 的前置假设与 workspace 行为。
- X-P3-DB-MGMT-4 总体验收（2026-07-04）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run schema:check` 通过（`ws_demo` valid，1 applied / 0 pending / 0 failed）。
  - `apps/server npm run smoke:admin-summary` 通过，`allOk: true`。
  - empty suite：database 43/43，import dry-run 32/32，dangerous 56/56。
  - imported suite：import 52/52，database imported 49/49，dangerous 56/56。
- A-P4-TOOLS-1 验证（2026-07-04）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run smoke:tools` 通过 27/27（工具列表、定义、dry-run、执行、运行查询、artifact 列表、JSON/Markdown artifact 读取、非法 toolId 404、路径遍历 400、运行列表、跨 workspace 不能读取 run / artifact）。
  - `apps/server npm run smoke -- --json` 通过 24/24，无回归。
- A-P4-TOOLS-4 验证（2026-07-04，总控复核后）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run smoke:tools-import` 通过 33/33。
  - `apps/server npm run smoke:tools` 通过 27/27。
- X-P4-TOOLS-6 总体验收（2026-07-04）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run smoke:tools` 通过 27/27。
  - `apps/server npm run smoke:tools-import` 通过 33/33；临时 workspace `ws_tools_import_1783176743243` 覆盖临时 workspace 初始化、data_source seed、样例包 staging、profile-extract / business-aggregate dry-run、跨 workspace 拦截、错误 confirmText、无 admin token、正式导入、Data Management 版本 / 质量报告 / batch 查询。
  - `apps/web npm run lint`、`npm run build`、`npm run smoke` 通过。
  - `VITE_USE_MOCK=false npx playwright test e2e/smoke-real.spec.ts -g "Tools Workbench"` 通过。
- A-P5-PORTRAIT-5 总控复核（2026-07-05）：
  - `apps/server npm run typecheck` 通过。
  - `apps/model npm run typecheck` 通过。
  - `apps/model npm run single-product-portrait-contract-test` 通过。
  - `apps/server npm run smoke:single-product-portrait` 通过 39/39，覆盖成功、未知 SKU、异常 CSV、workspace 隔离、缺参、非法 packageId、`sourceFiles` 和多 SKU 过滤。
  - `apps/server npm run smoke:tools` 通过 27/27。
  - 本地 localhost smoke 在沙箱内触发 `fetch EPERM`，升级权限后通过。
- A-P6-CHANNEL-3 返工验证（2026-07-06）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run schema:check` 通过（`ws_demo` valid，2 applied / 0 pending / 0 failed）。
  - `apps/server npm run smoke:channel-object-library` dry-run mode 通过 19/19，覆盖 blocking package dry-run 与正式 import 400 拒绝。
  - `PLS_ADMIN_SMOKE_MODE=imported npm run smoke:channel-object-library` 通过 46/46，使用独立临时 workspace，未清理或重建 `ws_demo`。
  - `apps/server npm run smoke:admin-empty` 全通过 131/131。
  - `apps/server npm run smoke:admin-imported` 全通过 157/157。
- A-P7-INGEST-2 验证（2026-07-06，按 review 返工后）：
  - `apps/server npm run typecheck` 通过。
  - `apps/server npm run schema:check` 通过（`ws_demo` valid，2 applied / 0 pending / 0 failed）。
  - `apps/server npm run smoke:csv-ingestion` 通过 46/46，使用独立临时 workspace，覆盖 dry-run 成功、缺 header、类型错误、不支持表、admin token/Idempotency-Key/confirmText 校验、正式导入、audit/job 读回、workspace 隔离、幂等重放与冲突、stagedFileId 路径穿越（含 URL 编码）、staged 文件篡改、`staging.json` workspaceId/targetTable 篡改、append-only 重复导入主键冲突阻塞。
  - `apps/server npm run smoke:admin-summary` 通过，空库 131/131 + 导入后 157/157，无回归。
  - `apps/server npm run smoke:tools` 通过 27/27，无回归。
  - `apps/server npm run smoke:channel-object-library` 通过 19/19（dry-run），无回归。
- ws_demo 当前状态：A-P6-CHANNEL-3 开发与 smoke 过程中被直接写入了 object-library 测试数据（15 行）。`smoke:admin-empty` / `smoke:admin-imported` 使用独立临时 workspace，不污染 `ws_demo`；是否 rebuild `ws_demo` 需用户确认。

---

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 用户授权进入 PLS 的数据默认放行；应用层不再按隐私字段名或值形态做 safety 拦截。
- taxonomy gate、quality gate 和产品对象契约仍然有效。
- pipeline 每一步要可追溯，便于后续回测和纠偏。
- 抖音 BI 数据（D-P1-F1）作为独立数据资产存 `douyin_*` 表，不合并进主 `channel_profile / sku`；前端只能通过 `/api/v0/bi/douyin/*` 读取。
- 数据管理底座（A-P2-1）是 source-agnostic 的；新数据源通过注册 adapter 接入，不改 `/data-management/*` 路由层。
- 渠道人群实体（A-P2-3）以 `channel_entity` 投影表为 read-optimized 层；V-P2-4 应优先消费 `/channels/entities` 而非 `/channels`（P0 mock）。
- Schema 变更通过 `apps/server/src/db/migrations/` 版本化迁移追踪（A-P3-DB-2）；新表 DDL 同时写入 migration 文件和 schema.ts 常量。`npm run schema:check` 可检测代码定义与库实际结构的一致性。

## A-P0-3 沉淀

- 契约定型见 `## 0` 关键契约点段落。
- V 域调用序列已定型两套（新品画像工作台 5 步、渠道匹配热力图 4 步）。

## A-P3-DB-MGMT-3 沉淀

- **Smoke wrapper 模板**：把数据库管理 smoke 切成 `empty` / `imported` 两套独立临时 workspace 后，复制成本极低；后续只要在 wrapper 内追加新的子脚本和模式字段即可。跨产品 / 跨任务都可以复用此模式（见 `AGENTS.md` §2.x）。
- **危险操作 confirmText 前置校验**：所有"先查后写"的危险操作路由都必须把 `confirmText` 校验放在打开 DB / 计算影响之前。否则对"目标不存在 / 空库 / 未经导入的数据集"的错误 confirmText 会被短路成 404 / 200 success，绕过用户明确确认的强制语义。该规则已写入 `AGENTS.md` §2.x-4。
- **ESM .mjs 文件易掉坑**：用 `edit` 多次插入 `let passed = 0;` / `function printResult() {}` 时，必须注意 `Replace all` 默认替换所有同名标识符；本次曾因重复声明 `function printResult` 触发 SyntaxError。落地：在 edit 前先 `grep -n` 整个文件确认无同名标识符，再做精准 patch。
- **JSON summary runner 子脚本末尾必须输出 `RESULT: {...}`**：wrapper 通过正则 `RESULT:\s*(\{[^\n]+\})` 抓取并汇总；任何不带该行的子脚本都会被 wrapper 标记为 "no result line"。

- 数据准入门禁当前口径：
  - safety 接口保留但默认 pass；不再因 `phone` / `name` / `address` / `orderId` / `memberId` / `openId` / `adId` / `deviceId` 或手机号/邮箱/身份证形态拒绝。
  - taxonomy 门禁：`tagId` 必须在标签体系白名单；未命中且有 `mappingRuleId` 进 `unmappedTags`；否则 `taxonomy_violation`。
  - quality 门禁：`sampleSize < 100` 与 `profileCoverageRate < 0.7` 只告警不拦截，落 `qualityReport`。
- 存储 6 张主表（`pipeline-design.md §6.2`）：`workspace` / `sku` / `channel_profile` / `wide_table_row` / `batch` / `prediction` / `match_result` / `task` / `audit_event`。索引：`(workspaceId, createdAt DESC)`、`(workspaceId, skuId)`、`(workspaceId, taskType, status)`、`(taskId)`、`(predictionId)`。
- 审计事件默认记录处理阶段和摘要；是否记录原文按用户授权口径和产品调试需求决定。

## 风险与踩坑记录

- **超长中文 + JSON 混排 payload 触发 write/edit 工具层 JSON parser `Unterminated string`**。多次可复现，主要发生在 write 单次载荷 > 10KB 且含大量 JSON schema + 中文表格混排时。变通方案：先 Write < 200 行骨架，再 Edit 分段追加，每段控制在 < 2000 字符。本 session 全程沿用该策略，两份文档均无残缺。
- **文件读 offset 越界不代表内容缺失**：本 session 收尾 turn 曾用 `Read(offset=150)` 读 88 行文件收到 out-of-range，一度误判 `pipeline-design.md` 只有骨架。实际是完整 349 行 v0.1。教训：越界 error 时先 `Read` 无 offset 拿完整文件，或用 `wc -l` 等价手段（此环境 bash 不可用则改用 Grep 数章节数）确认真实长度，再做状态判断。
- **上游冻结锚定策略生效**：M-P0-2 已 done，A 域契约直接锚定 `model-plan.md §3.3 / §4.4` 字段，不再需要反向对齐。这一模式适用于所有下游域：优先直接引用上游冻结 schema，不预留占位。
- **`recommendation` 阈值表规则顺序**：按表格自上而下执行，`avoid` 优先级最高；`dimension` 从 `tagId` 前缀推导。已在 `api-contract.md §3.4` 明文写入，覆盖需回流 X。
- **本地 `3100` 端口可能已有残留 server 进程**：收尾 smoke 如遇 `EADDRINUSE`，通常代表前一轮本地实例仍在运行；可直接复用已启动实例验证接口，不影响 API 结果判读，但若要复现实验需先清理端口占用。
- **SQLite NOT NULL DEFAULT 只在列不出现在 INSERT 时生效**：显式传 NULL 违反约束，即使列有 DEFAULT。INSERT 必须只列有值的列，或显式传非 NULL 值。A-P1-E3 的 INSERT 调试中踩过此坑。
- **Node.js `tsx` 不热加载已 kill 的进程**：`kill -9` 后 `nohup npm start` 可能仍加载旧代码缓存。确认方式：在关键路径加 `console.log` 检查新逻辑是否执行。
- **跨包 typecheck 引用 model 源码需在 tsconfig 纳入**：`apps/server/tsconfig.json` 需包含 `../model/src/account-fit.js`，否则 `diagnoseAccountFit` 的类型推断断裂。
- **node:sqlite `db.transaction()` 不可用**：Node.js `node:sqlite` 模块不提供 `db.transaction()` 方法（与 better-sqlite3 不同）。变通方案：手动 `BEGIN` / `COMMIT` / `ROLLBACK` + try-catch。import-douyin-bi.mjs 首版因调用 `db.transaction()` 报 `TypeError`，改为手动事务后通过。
- **SQLite INSERT 列数 vs VALUES `?` 占位符计数**：手动计数极易出错（尤其含 `datetime('now')` 硬编码时）。变通方案：用脚本验证 `?` 数量 = 列数 - 硬编码列数；或用对象化 INSERT 辅助函数避免手动对齐。sync-channel-entities.mjs 和 channel_entity DDL 反复踩此坑。
- **Hono 路由注册顺序决定匹配优先级**：`api.route("/channels/entities", ...)` 必须在 `api.route("/channels", ...)` 之前注册，否则 `/:channelId` 会错误匹配 `entities` 路径。教训：通用路由（含 `:param`）始终放在具体路由之后注册。
- **data_source INSERT OR IGNORE 不更新已有行**：种子脚本用 `INSERT OR IGNORE` 注册 source 时，已存在的 stub 行不会被更新为 active。改为 `INSERT OR REPLACE` 后正确覆盖。注意：REPLACE 会重置 created_at；如需保留原时间戳，应改用 `UPDATE ... SET`。
- **路由层错误用 warnings 判 not-found**：A-P3-DB-6 第二轮返工暴露。`impactDeleteVersion` 对真实业务版本返回 `warnings: ["contains user_authorized douyin_* data"]`，路由曾用 `warnings.length > 0` 直接 404，导致 dry-run 找到 692 行但正式删除返回 404。教训：impact 报告中 warnings 是数据特征描述，存在性必须用 `affectedRows === 0` 或独立的 `notFound` 标记判断。
- **工具模块运行目录、workspace 与 DB 隔离**：A-P4-TOOLS-1 把工具运行输出限定在 `data/local/tool-runs/<runId>/`，只写文件系统，不写入业务表；失败运行仍保留 `run_manifest.json` + `quality_report.json` + errors。总控复核时补强 run / artifact 查询的 `workspaceId` 校验，避免跨 workspace 读取运行记录或产物。
- **Hono 子路由含参与具体路由顺序同样重要**：`tools.get("/:toolId")` 若放在 `tools.get("/runs")` 之前，`/runs` 会被 `/:toolId` 吃掉。教训：子路由内同样遵循“具体路由在前，通用参数路由在后”。
- **artifact 路径遍历防御在路由层之外也需做**：虽然 Hono 对未编码的 `../` 路径直接 404，但编码后的 `%2F..` 会进入 handler，因此 `isSafeArtifactId` 必须显式拒绝 `..` / `//` / 绝对路径。
- **受控样本包 adapter 必须按绑定键过滤**：`single-product-portrait` 工具消费 `product_attributes.jsonl` + `platform_portrait.csv` 时，不能把所有画像行作为 anchor 丢给当前 SKU。必须按 `skuId + sourceProductKey` 过滤，否则多 SKU 样本包会串画像。`loadPackageAnchor` 应接受 filter 参数，无匹配画像行时显式失败。
- **artifact 机器可读产物必须保留来源 lineage**：`prediction.json` 不仅要有人工可读的 `report.md`，顶层也要写 `sourceFiles` 数组，让下游 V/A 读取时不丢失数据来源和版本信息。
- **跨包引用 model 源码会触发 server 的 `noUncheckedIndexedAccess`**：`apps/server/tsconfig.json` 纳入 `../model/src/single-product-portrait.ts` 后，model 文件内 `const [a, b] = fields` 这种解构会被推断为 `string | undefined`。修复只能是 model 侧加 `fields[0]!` 或默认值，因为 server 的 strict 配置比 model 更严格。契约测试和 smoke 回归可验证行为无变化。
- **工具 dry-run 的 plannedArtifacts 应来自工具定义**：`sample-profile-extract` 的 `outputFormats` 推导出的 `aggregate_profile.json` 不适用于新工具。为 `single-product-portrait` 注册 `plannedArtifacts: ["artifacts/prediction.json", "artifacts/report.md"]` 后，`planDryRun` 改为优先使用定义字段，避免 dry-run 与实际产物不一致。

## A-P7-INGEST-2 沉淀

- **CSV 上传暂存与 dry-run 解耦**：dry-run 接收 multipart 文件并落盘到 `data/local/csv-staging/<workspace>/<stagedFileId>/`，返回 `stagedFileId`；正式 import 用 JSON 提交 `stagedFileId`，可复用现有 `idempotencyMiddleware`（JSON body）。`staging.json` 保存 `contentHash`，execute 时拒绝被修改过的 staged file。
- **目标表双重校验**：`CSV_PROTECTED_TABLES`（系统表）+ `CSV_ALLOWED_TABLES`（业务表白名单）+ `PRAGMA table_info` 存在性检查。三层任一失败都按 `unsupported_target_table` 处理。
- **NOT NULL DEFAULT 列的 INSERT 策略**：CSV 提供的列按值插入；未提供的列不进入 INSERT column list，让 SQLite 使用 DEFAULT。这样避免显式传 NULL 触发 NOT NULL 约束失败。
- **workspace_id 作为上下文注入**：CSV 可省略 `workspace_id`；若提供但与请求头不一致，仅 warning 并以请求头为准。INSERT 时统一写入 `workspaceId`。
- **类型推断 = PRAGMA 声明类型 + 表级 override**：JSON / BOOLEAN / DATETIME 等在 SQLite 中多为 TEXT/INTEGER，需通过 `COLUMN_TYPE_OVERRIDES` 显式标记。后续 schema 新增 JSON 列时，应同步更新该配置。
- **主键缺失归入 `missingColumns`**：D 契约把 `primary_key_missing` 与 `missing_required_column` 分为两个 rule，但 `missingColumns` 字段汇总所有 header 中缺失的必填/主键列，便于 V 域展示。
- **CSV 解析手写**：当前无 csv-parse 依赖，parser 处理引号、逗号、CRLF/LF。复杂 RFC 4180 场景（如引号内换行）后续可考虑引入 `csv-parse`。
- **Staging 文件生命周期**：当前成功导入后不清除 staged file，长期运行会累积。临时 workspace 运行结束可整体清理；生产环境需后续加 retention。
- **stagedFileId 必须强校验**：限制格式 `^csv_[0-9]+_[a-z0-9]{6}$`，resolve 后确认路径仍在当前 workspace 的 staging 目录下，读取 `staging.json` 后再次校验 `meta.workspaceId`/`meta.stagedFileId`/`meta.targetTable`。任何一项失败都视为 staged file 不存在，返回 400 而非 500。
- **CSV 导入仅 append**：第一期不支持 upsert。dry-run 阶段查询目标表，已有主键冲突时生成 `primary_key_conflict` blocking error；execute 使用普通 `INSERT`，二次导入同一批数据会被 dry-run 拦截。这避免了 REPLACE 语义下的业务数据被静默覆盖。
- **typeErrors 只统计类型转换失败**：`typeErrors` 字段仅对 `rule === "type_conversion_failed"` 累加，header 缺失、主键缺失、主键冲突等 blocking errors 不再混入该计数。
- **正式导入响应 snapshot 用真实行数**：`beforeSnapshot` / `afterSnapshot` 通过 `COUNT(*) WHERE workspace_id = ?` 读取目标表实际行数，并同步写入 `db_admin_audit`，不再固定为 0。
