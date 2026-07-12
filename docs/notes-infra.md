# notes-infra

## 0. 当前状态

最近更新：2026-07-12（T0035 完成 ws_demo fixture isolation 批次验收）

进度：

- T0034 已完成：新增 `scripts/check-worktree-guard.mjs`，在根 `package.json` 暴露 `npm run guard:worktree`，用于在 handoff / controller review 前自动拦截 `ws_demo/db.sqlite`、`apps/web/playwright-report/index.html`、`apps/web/test-results/` 等生成产物进入 diff。
- T0035 已完成 `ws-demo-fixture-isolation` 批次验收：后端写型脚本隔离、前端 Playwright 产物隔离、统一 diff guard 三条防线均有验证证据；本轮验收后 `data/workspaces/ws_demo/db.sqlite` 与 `apps/web/playwright-report/index.html` 均未进入 diff。
- P7 CSV 导入已有 SQLite 表第一期完成；A/V 已经总控复核通过并 mark done。
- `docs/prd-csv-and-business-source-ingestion.md` 已作为 P7 总控 PRD；第一期冻结为 CSV 上传到已有 SQLite 表，后续 CSV 建表、XLSX、业务数据库 / API 直连均不进入第一期。
- `D-P7-INGEST-1` 已完成并 mark done：新增 `docs/p7-csv-ingestion-data-contract.md` 与 `data/templates/csv-ingestion/` 示例，冻结字段匹配、类型校验、quality report、blocking errors、append-only 和 lineage 口径。
- `A-P7-INGEST-2` 已完成并 mark done：后端新增 CSV dry-run / import 接缝，支持 staged file、字段/类型/必填/主键校验、append-only、Import Job、audit、batch 和隔离 smoke。
- `V-P7-INGEST-3` 已完成并 mark done：数据管理工作台支持 CSV 导入路径、业务连接占位、数据包重放保留；前端 adapter、mock 和 E2E 已对齐真实 `qualityReport` 契约。
- 本 session `/learn` 已将 P7 返工沉淀写入 `AGENTS.md`：受控写入 / 导入必须在沙盘推演中明确 staged reference、overwrite/upsert 语义、白名单、真实 snapshot 和 audit/import job；UI 依赖后端字段类型时必须补 `VITE_USE_MOCK=false` contract shape 测试。

本次收尾验证：

- `npm run guard:worktree` 通过（当前工作树无禁止的生成产物）。
- T0035 验收通过：`npm run guard:worktree`；`apps/server npm run smoke:channel-object-library`（临时 workspace `ws_col_1783861748037`，22/22 OK）；`apps/web npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`（10 passed / 1 skipped）；`git diff --check`；受保护路径 diff 检查无输出。
- A-P7 回流验证已通过：`apps/server npm run typecheck`、`schema:check`、`smoke:csv-ingestion` 46/46、`smoke:admin-summary`、`smoke:tools`、`smoke:channel-object-library`。
- V-P7 回流验证已通过：`apps/web npm run lint`、`build`、`smoke`，以及 `VITE_USE_MOCK=false npx playwright test e2e/data-management.spec.ts -g "CSV Ingestion Contract"`。
- 总控本轮额外做了文档 / 契约定点复核，确认 `docs/wiki.html` 中 `D-P7-INGEST-1`、`A-P7-INGEST-2`、`V-P7-INGEST-3` 均为 `done`。
- 本收尾未重新运行全量 server/web smoke；原因是本轮总控最后只改 `AGENTS.md` 与 `docs/notes-infra.md`，并已做定点结构读取。

下一步：

- P7 第二期如要做 CSV 首次建表，必须另开 X/D/A/V 任务：schema preview、用户确认、建表白名单、audit 和 rollback 口径先由 X 冻结。
- P7 第三期业务数据库 / 业务 API 直连仍未开工；后续只能只读连接，不能写回业务库。
- 若继续推进当前第一期，可从真实 UI 使用 `V-P7-INGEST-3` 路径验证 CSV dry-run 和正式导入；正式写入 smoke 仍需使用独立临时 workspace，避免污染 `ws_demo`。
- 需要后续任务补 staged CSV 文件 retention / cleanup 策略；当前成功导入后不会自动清理 staged file。
- 后续如要进一步降低 fixture 污染风险，建议评估将 tracked SQLite fixture 改为可重建生成物：仓库保留 schema/migration/demo package，验证前由 wrapper 创建临时 workspace，而不是长期跟踪运行态 `ws_demo/db.sqlite`。

阻塞：

- 当前 P7 第一期无总控阻塞。

开放问题：

- 目标表白名单后续是否扩展仍需 X 拍板；当前第一期保持 `sku`、`channel_profile`、`wide_table_row`、`batch`、`prediction`、`match_result`。
- staged CSV 文件保留多久、是否需要 UI 暴露清理入口，尚未拍板。

---

## 工作树 diff guard（T0034）

- 命令：`npm run guard:worktree`（根目录）。
- 脚本：`scripts/check-worktree-guard.mjs`。
- 默认禁止出现在 diff 中的生成产物：
  - `data/workspaces/ws_demo/db.sqlite`
  - `apps/web/playwright-report/index.html`
  - `apps/web/test-results/`
- 检查来源：合并 `git diff --name-only`、`git diff --cached --name-only`、`git ls-files --others --exclude-standard`。
- 失败时输出受污染路径和恢复建议；controller 可设置 `PLS_ALLOW_DIRTY_WORKTREE=1` 跳过。
- 自定义模式：通过 `PLS_WORKTREE_GUARD_FORBIDDEN=path1:path2/` 覆盖默认列表。
- 所有 backend / frontend / data 域 handoff 前必须先运行该 guard；controller review 时也可以直接运行验证。

## ws_demo fixture isolation 批次验收（T0035）

- 验收范围：T0032 后端写型隔离、T0033 前端 Playwright 产物与 workspace 隔离、T0034 统一工作树 diff guard。
- 后端防线：`smoke-channel-object-library` 默认创建临时 workspace，T0035 复验使用 `ws_col_1783861748037`，22/22 checks passed；首次无 server 运行时失败为 `ECONNREFUSED`，启动本地 server 后通过。
- 前端防线：渠道对象库 Playwright smoke 复验 10 passed / 1 skipped；HTML report 与 test output 默认导向系统临时目录，未写入 tracked `apps/web/playwright-report/index.html`。
- 工作树防线：`npm run guard:worktree` 初始和收尾均通过；`git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` 无输出。
- 剩余风险：`apps/server/scripts/seed.ts` 仍是未纳入本批次的 `ws_demo` 写入口；`PLS_ALLOW_WS_DEMO_WRITE=1` 与 `PLS_ALLOW_DIRTY_WORKTREE=1` 是 controller-only override，普通 worker 不应使用；tracked SQLite fixture 仍可能被非脚本路径或手动操作污染。
- 架构建议：中长期把 `ws_demo/db.sqlite` 从长期跟踪的运行态文件转为由 migration + demo/import package 重建的生成物，并在 CI / Task Bus handoff 中强制运行 `npm run guard:worktree`。

---

## 长效决策

- P0 先做“服装新品冷启动画像预测 + 渠道匹配”闭环。
- P0 画像标签先冻结 6 个维度、36 个核心标签，后续通过总控审批扩展。
- P0 渠道先覆盖电商、内容电商和抖音类流量渠道；线下门店作为 P1 扩展。
- P0 demo 数据仍保留 mock 口径；用户真实数据按最新项目规则可直接进入开发协作。
- P0-B demo 数据目录固定为 `data/demo/`；本地运行数据目录固定为 `data/workspaces/ws_demo/`。
- P0-B 预测和匹配同步超时统一为 30s，超时返回 `202 accepted` + `Task`；候选渠道数 > 50 强制异步。
- P0-B 持久化 ID 由 A 域落库时生成最终 `predictionId` / `matchId`，M adapter 不直接写库。
- P0 存储选型采用 SQLite + 本地文件系统；Postgres + 对象存储作为 P1 迁移目标。
- P0 前端采用低保真 MVP 工作台，不做营销落地页；浏览器端 CSV 导出按 PLS 数据对象边界执行。
- 用户确认导入 PLS 的真实客户/订单/会员/DMP/BI 数据可进入 LLM、fixture、API、CSV、audit 和前端展示。
- `docs/wiki.html` 是任务派发与版本历史真源。
- P0-C 是 P1 前的发布 gate，不新增商业扩展功能；必修 gate 为 A/M adapter、heatmap 去重、数据准入模板和真实数据模板。
- P0-C A 域去重口径采用 latest-result overwrite；如需同时保留完整历史与 latest 视图，需另行总控拍板。

## A-P5-PORTRAIT-5 / Tools Artifact 沉淀

- 决策：`single-product-portrait` 只通过 tools runner 生成 derived artifacts，不写主业务 portrait 表；业务表落库需要另开任务设计 schema、幂等、audit 和回滚。
- 决策：工具参数只接受受控 `packageId` 与 `skuId`，后端映射到 `data/templates/single-product-portrait-<packageId>/sample_package/`；不得开放任意本地路径输入。
- 踩坑：artifact read route 返回原始文件 body，例如 `prediction.json` 是 JSON 文件本体，不是 `{ code, data }` wrapper。前端 mock / Playwright route 必须与真实 artifact body 同构。
- 踩坑：多 SKU 样本包必须用 `skuId + sourceProductKey` 同时过滤 `platform_portrait.csv`，只按 `skuId` 或完全不滤都会造成画像标签泄漏。
- 风险：`data/local/tool-runs/` 会随 smoke 和本地调试累积 artifact；当前没有 retention / cleanup 策略。
- 风险：tool-run 与 artifact 均依赖 workspace 隔离；后续新增 import / preview / cleanup API 时必须保留跨 workspace 不可见约束。
