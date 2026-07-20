# notes-backend

## 0. 当前状态

最近更新：2026-07-20（T0044 approved 后执行 WorkPLS 归档移动）

进度：

- T0044 / W09 revision 1 已批准（不是删除任务，WorkPLS 仍未删除）：
  - WorkPLS identity 只读确认：`/Users/huangbo/Dev/Projects/workpls`，Git 仓库，HEAD `d0da4152d239215dbb791b4750c01fe04c4f4de1`，无 remote，dirty state 仅 `M AGENTS.md`（+116 行 AgentOps 治理文本，同内容已在 PLS `AGENTS.md`）。
  - 归档证据 blocker 已闭合：`/tmp/workpls-retirement-t0044/` 已全部重新生成——`workpls-retirement.bundle`（sha256 `58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a`，`git bundle verify` 通过、含完整历史）+ `agents-md-uncommitted.patch`（sha256 `b366b5a5…`，125 行）；WorkPLS HEAD/dirty 未变，重生成 sha256 与首版一致；`ls -la` 确认文件当前在磁盘。教训：`/tmp` 会被系统清理，删除动作前必须确认归档物仍存在或重新生成（runbook §1 时效说明）。
  - validation 命令 blocker 已闭合：handoff/audit 中六个 backend contract 命令全部改为可复制的 `cd apps/server && npm run ...` 形式，并显式说明这些脚本只在 `apps/server/package.json`（根目录运行 `Missing script`）；`guard:worktree`/`git diff` 标注 PLS 根目录。
  - Disposition：58 项全部有结论——migrated 24 / intentionally_deferred 6 / retained_reference 14 / obsolete 14 / unknown/blocker 0；六项延期（Dimension Evidence 管线、quality policy 数值、AI explanation、Flywheel 升级、fixture 导入、AgentHarness 配置 UI）均有恢复入口，其中 fixture 导入经只读核实为"仓内无数据对象"。
  - PLS 集成复验全部 exit 0（可复现完整命令）：`cd apps/server &&` typecheck、migration-runner 16/16、schema 30/30、algorithm 15/15、source 70/70、application 113/113、HTTP 32/32；`cd apps/web &&` build / lint 0-0；根目录 guard:worktree、git diff --check、protected paths clean。
  - 删除 gate：`ready_for_delete: yes` 已被总控 review 接受；这不等于已授权删除。前提是 bundle+patch 复制到持久位置并复核 sha256，流程见 `docs/workpls-retirement-runbook.md`。
- 产出文档：`docs/workpls-retirement-audit.md`、`docs/workpls-retirement-disposition.md`、`docs/workpls-retirement-runbook.md`；批次清单 W09 状态更新为 `completed`。
- 用户随后选择归档暂停而非删除：
  - `/tmp/workpls-retirement-t0044/` 中 T0044 审计点 bundle + patch 已复制到 `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/`，sha256 复核一致。
  - `/Users/huangbo/Dev/Projects/workpls` 已移动到 `/Users/huangbo/Dev/Archive/workpls`。
  - 移动后复核发现归档项目当前 HEAD 为 `0e0bd4829ba27bed5e8a7b872cf36ff6d3ff14a3`（`wpls-20260720-05`），工作树干净；已补充当前状态 bundle `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/workpls-archive-current.bundle`，sha256 `6428005e9d223dfcdb628b9459704fe1cf4be334ad4304c5f316869bebbc667b`，`git bundle verify` 通过。

下一步：

- `portrait-comparison-v1` W01-W09 已全部 approved/completed。
- WorkPLS 当前在 `/Users/huangbo/Dev/Archive/workpls` 暂停归档；若未来要彻底删除 Archive 中的 WorkPLS，必须由用户/总控另行明确授权。

阻塞：

- 当前无后端阻塞。

开放问题：

- Playwright E2E 未在 T0044 复跑（依赖 T0042/T0043 approved 记录 + 本次 web build/lint）；如需更强删除前保证，总控可要求补跑。
- WorkPLS 仓外是否另有历史数据不在本任务视野；D5 结论仅限仓内只读核实。

---

## 0.1 历史状态（T0041，2026-07-20；已由上方 T0044 状态取代）

进度：

- T0041 revision 3 已批准：`/api/v0/portrait-comparisons` HTTP transport 已注册，覆盖 readiness、production gated create、list、detail、archive/restore。
  - Revision 2 的 scope blocker 已关闭：algorithm config 改为定义在允许范围内的 `apps/server/src/routes/portrait-comparisons.ts`，未再修改 application layer。
  - HTTP contract tests 32/32 通过，使用真实 Hono app/middleware/envelope 与临时 SQLite workspace；正式 create 在 production `not_released` 下受控失败，八张 Comparison 表写入为 0。
  - 回归验证通过：typecheck、application 113/113、source 70/70、algorithm 15/15、schema 30/30、guard:worktree、git diff --check、protected paths clean。
- T0040 revision 36 已完成实施：5 组 reviewer blocker 全部关闭。
  - **B1: Detail exact aggregate validation**：`getComparisonDetail` 现在通过 `validateDetailAggregateConsistency` 做完整聚合校验——algorithm/contract identity trio 精确匹配、assessment dimension_key 集合精确等于 candidate contract、evidence dimension_key 必须在 candidate contract 内（未知/额外 evidence 被拒绝）、evidence↔exclusion-reason 完整对应、FK 指向正确 role/dimension 的 evidence、从 persisted evidence + candidate normalization 重算所有数值（normalized values、raw/normalized delta、similarity、contribution）并用受控 tolerance 比较。Repository `getComparisonRunDetail` 对 participant/source 基数损坏改为 throw ComparisonStateError（不再 masquerade as null）。
  - **B2: Contiguous sequence + archive transition semantics**：explanation attempt sequence 必须从 1 开始严格连续；archive event sequence 必须从 1 开始严格连续；archive 状态转换必须 active→archived→restored 交替。验证完全 run-scoped（不依赖 workspace 全局扫描）。
  - **B3: Validation audit**：input validation、mode validation、graph invariant validation、post-insert validation 四类失败各写入 exactly 1 行 audit_event（resource_type=comparison_run, event=create_validation_failed, reason_code=对应失败类型）。替代了旧的零审计断言。Post-insert 测试通过篡改 persisted 数据触发真实 validator。
  - **B4: Manifest recheck inside Attempt transaction**：automatic 和 explicit 两条路径的 manifest 校验（ensure-once/sequence 复核 + canonical JSON + checksum 重算 + per-record workspace/run ownership）全部移入同一 BEGIN IMMEDIATE 事务。Tampered checksum → controlled failed outcome (invalid_generator_output)。Cross-run/nonexistent record → checksum mismatch detected → controlled failed outcome。
  - **B5: True overlapping two-connection competition tests**：通过 _faultHook("before_transaction"/"before_attempt_transaction"/"before_archive_transaction") seam 实现真实重叠——两个连接都越过事务前检查后才释放竞争窗口。覆盖：create same/different fingerprint、automatic explanation ensure-once、explicit explanation unique contiguous sequences、archive optimistic concurrency conflict。
- Application 层 113/113 contract tests 通过（原有 81 项 + 新增 32 项负向测试）。
- 其他回归全通过：typecheck、algorithm 15/15、schema 30/30、source 70/70、guard:worktree、git diff --check、protected paths clean。
- Production policy 仍 `not_released`——正式 create 受控失败，八张 Comparison 表写入为 0。
- 新增 fault hook seams：`_faultHook("before_graph_validation", {graph})`、`_faultHook("before_transaction")`、`_faultHook("before_archive_transaction")`、`_explanationFaultHook("before_attempt_transaction")`、`_explanationFaultHook("after_rule_generation", {ruleResult})`。
- T0037 已完成（review 第五轮修正后）：新增 `V005_portrait_comparison` migration（8 张规范化表），并接入 `schema.ts`、`migrate.ts`、`schema-check.ts`（`checkSchema(db)` 纯 checker + viewExtra bug 修复）、`dangerous-ops.ts`（PROTECTED_TABLES + rebuild DDL chain）和 `admin-database.ts`（CODE_TABLES + IMMUTABLE_TABLES + classifyTable + 导出 isTruncatable/isDroppable）。8 表 contract test 30/30 通过。
- V005 DDL 约束覆盖（含 round 2-5 修正）：UUID v4 CHECK；三组 identity+version+checksum；cursor 索引 `(ws, created_at, id)`；集合 JSON `json_type='array'`；`evidence_refs_json` 非空数组；`content_json` 成功 outcome `json_type='object'`；数值字段 `typeof='real'` + **finite CHECK**（`value`/`weight`/`raw_delta` 使用 IEEE 754 max double `1.7976931348623157e+308` 作为显式有限边界，**含 `>=`/`<=` 容纳 Number.MAX_VALUE**——`Infinity <= max` = FALSE 拒绝 Infinity，`MAX_VALUE <= max` = TRUE 通过）；UTC 毫秒 ISO 8601 timestamp CHECK；`failed` outcome `error_message` NOT NULL；period 日期数字+月日范围校验。
- `schema-check.ts` 修复 regression：`viewExtra` 计算修正为 `!codeViews.includes(v)`；新增 extra-view 负向回归测试。
- V005 DDL 为单一真源（`COMPARISON_DDL` 常量），`schema.ts` re-export 一致性有独立测试。
- Admin protection：8 表全部在 `PROTECTED_TABLES`（dangerous-ops）、`IMMUTABLE_TABLES`/`isTruncatable`/`isDroppable`（admin-database，已导出供 contract test 直接验证）。`CODE_TABLES`/`classifyTable` 已手动更新但未通过 contract test 直接验证 catalog 层面。
- Contract test 覆盖 30 项：fresh、升级、repeat、checksum、re-export 一致性、migration vs fresh DDL、索引、cursor 索引含 id、checkSchema real authority、extra-view 负向、UUID v4 负向、composite FK 跨 workspace、RESTRICT、UNIQUE（role/idempotency/sequence）、CHECK（非法 mode/checksum/JSON array/timestamp、included/excluded 条件矛盾、outcome conditional fields + error_message NOT NULL、evidence_refs 非空、**Infinity rejection**、**MAX_VALUE acceptance**、**content object vs array**）、Admin PROTECTED_TABLES + IMMUTABLE_TABLES + isTruncatable/isDroppable。

下一步：

- W07 frontend/kilo 可开始：基于 T0041 已批准 HTTP contract 实现 React readiness、history、detail、archive/restore UI；不得伪造正式 Run 可用状态。
- `ws_demo` 需通过 `npm run migrate` 应用 V005 后 schema:check 才能通过（本任务不允许写 ws_demo）。

阻塞：

- 当前无后端阻塞。

开放问题：

- ws_demo 的 `.migration-backups/` 在 V005 真正落地后会产生未跟踪备份文件，需 controller 拍板 gitignore / guard 口径。
- `dangerous-ops.ts` 的 rebuild DDL chain 仍缺 `SIMULATED_MARKET_DDL`（pre-existing gap，不在 T0037 允许范围）；需单独提交 contract change request。
- Admin 的 `CODE_TABLES` 和 `classifyTable` 已手动更新（8 表 + 'comparison' domain）但未通过 contract test 直接验证——`PROTECTED_TABLES`/`IMMUTABLE_TABLES`/`isTruncatable`/`isDroppable` 已有直接导入测试覆盖 truncate/drop 保护语义；如需覆盖 CODE_TABLES/classifyTable 的 catalog 层面需补充真实 route 测试。
- PLS `audience_profile.confidence` 是 NOT NULL，但 `PortraitSnapshot.confidence` 类型允许 null。adapter 使用 `parseConfidence(row.confidence ?? null)` 保持 null-safe。

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
