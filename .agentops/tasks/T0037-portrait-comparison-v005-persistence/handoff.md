# Handoff: T0037 portrait-comparison-v005-persistence（final revision）

## What Changed

实施已批准的 Portrait Comparison V005 持久化模型（经 review rounds 1-5 修正）：

1. **V005 migration**（`apps/server/src/db/migrations/V005_portrait_comparison.ts`）：8 张规范化表，单一 DDL 真源（`COMPARISON_DDL` 常量），`up()` 执行同一 DDL。所有 CHECK、UNIQUE、composite FK、ON DELETE RESTRICT 均已实现。
2. **Schema 接入**：`schema.ts` re-export `COMPARISON_DDL`；`migrate.ts` Phase 2 DDL chain 新增 `db.exec(COMPARISON_DDL)`；`schema-check.ts` ALL_DDL 新增 `COMPARISON_DDL`。
3. **schema-check.ts 提取纯 checker**：`checkSchema(db: DatabaseSync)` 纯函数，`validateSchema(workspaceId)` 和 contract test 共同调用。修复 `viewExtra` regression（`!dbViews.includes(v)` → `!codeViews.includes(v)`）。
4. **Admin protection**：
   - `dangerous-ops.ts`：8 表加入 `PROTECTED_TABLES`；rebuild DDL chain 新增 `COMPARISON_DDL`。
   - `admin-database.ts`：8 表加入 `CODE_TABLES` + `IMMUTABLE_TABLES`；`classifyTable` 新增 `'comparison'` domain；导出 `IMMUTABLE_TABLES`/`isTruncatable`/`isDroppable` 供 contract test 直接验证。
5. **Contract test**（`portrait-comparison-schema-contract-test.ts`，30 用例）：fresh V001-V005、V001-V004 升 V005、repeat no-op、V005 checksum 64 位、schema.ts re-export 一致性、migration vs fresh schema DDL sqlite_master.sql 一致、索引、cursor 索引含 id、checkSchema real authority、extra-view 负向回归、UUID v4 负向（NOT-A-UUID）、composite FK 跨 workspace 拒绝、ON DELETE RESTRICT、UNIQUE（role/idempotency/sequence）、CHECK（非法 mode/checksum/JSON array/timestamp、included/excluded 条件矛盾、outcome conditional fields + error_message NOT NULL、evidence_refs 非空、Infinity rejection、MAX_VALUE acceptance、content object vs array）、Admin PROTECTED_TABLES + IMMUTABLE_TABLES + isTruncatable/isDroppable。
6. **package.json** 新增 `portrait-comparison-schema:contract-test` script。
7. **notes-backend.md** 更新 `## 0. 当前状态`。

## Files Changed

- `apps/server/src/db/migrations/V005_portrait_comparison.ts`（新建：8 表 DDL + `COMPARISON_DDL` 导出）
- `apps/server/src/db/schema.ts`（新增 `COMPARISON_DDL` re-export）
- `apps/server/src/db/migrate.ts`（新增 `COMPARISON_DDL` 导入 + Phase 2 执行）
- `apps/server/src/db/schema-check.ts`（新增 `COMPARISON_DDL` 导入 + ALL_DDL；提取 `checkSchema(db)` 纯 checker；修复 `viewExtra` bug）
- `apps/server/src/lib/dangerous-ops.ts`（`PROTECTED_TABLES` +8 表；rebuild DDL chain +`COMPARISON_DDL`）
- `apps/server/src/routes/admin-database.ts`（`CODE_TABLES` +8 表；`IMMUTABLE_TABLES` +8 表；`classifyTable` +`'comparison'` domain；导出 `IMMUTABLE_TABLES`/`isTruncatable`/`isDroppable`）
- `apps/server/src/db/portrait-comparison-schema-contract-test.ts`（新建：30 用例）
- `apps/server/package.json`（新增 `portrait-comparison-schema:contract-test` script）
- `docs/notes-backend.md`（更新 `## 0. 当前状态`）

## 8 表 Constraint Matrix 与单一 DDL 真源说明

**单一 DDL 真源**：`V005_portrait_comparison.ts` 导出 `COMPARISON_DDL` 常量。`up()` 执行它。`schema.ts` re-export 它。`migrate.ts`、`schema-check.ts`、`dangerous-ops.ts` rebuild 均消费它。migration path 与 fresh schema path 生成的 `sqlite_master.sql` 规范化后完全一致（contract test 验证）。

**Constraint Matrix**（每表逐项）：

| 表 | Grain | PK | workspace FK | 组合 FK (workspace_id, id) | UNIQUE | CHECK | ON DELETE |
|---|---|---|---|---|---|---|---|
| comparison_run | 一次对比运行 | id UUID v4 | workspace(workspace_id) | (workspace_id, id) 作为引用目标 | (ws, id), (ws, idempotency_key) | mode enum, score/coverage 0-100 typeof real, quality_status enum, checksum×4 64hex, fingerprint 64hex, UUID v4 | — |
| comparison_participant | 每 Run 每 role | id UUID v4 | — | → run(ws, id) | (ws, id), (ws, run, role) | role enum, family enum, object_type enum, family+type combo, UUID v4 | RESTRICT |
| comparison_portrait_source | 每 participant | id UUID v4 | — | → participant(ws, id) | (ws, id), (ws, participant_id) | source_system enum, period fmt+digit+range, period order, quality_status enum, confidence typeof real range, timestamp fmt, UUID v4 | RESTRICT |
| comparison_dimension_evidence | 每 participant 每 dimension | id UUID v4 | — | → participant(ws, id) | (ws, id), (ws, participant, dimension_key) | quality_status enum, value typeof real finite (>= -MAX, <= MAX), **evidence_refs non-empty array**, UUID v4 | RESTRICT |
| comparison_dimension_assessment | 每 Run 每 dimension | id UUID v4 | — | → run(ws, id), → baseline_evidence(ws, id), → comparison_evidence(ws, id) | (ws, id), (ws, run, dimension_key) | weight typeof real >0 finite (<= MAX), raw_delta typeof real finite, participation enum, exclusion_reason enum, participation+reason pair, evidence presence, derived null rule, value ranges typeof real, conditional evidence UUID, UUID v4 | RESTRICT |
| comparison_explanation_attempt | 每 Run 内 sequence | id UUID v4 | — | → run(ws, id) | (ws, id), (ws, run, attempt_sequence) | generator_type enum, checksum 64hex, sequence >=1, timestamp fmt, UUID v4 | RESTRICT |
| comparison_explanation_outcome | 每 attempt | id UUID v4 | — | → attempt(ws, id) | (ws, id), (ws, attempt_id) | status enum, conditional fields (succeeded→**object** content, failed→error_code+failure_contract+retryable+error_message NOT NULL), JSON validity, timestamp fmt, UUID v4 | RESTRICT |
| comparison_archive_event | 每 Run 内 sequence | id UUID v4 | — | → run(ws, id) | (ws, id), (ws, run, event_sequence), (ws, run, idempotency_key) | operation enum, fingerprint 64hex, sequence >=1, timestamp fmt, UUID v4 | RESTRICT |

**索引**：`idx_comparison_run_workspace_created`(ws, created_at, id), `idx_comparison_assessment_baseline_evidence`(ws, baseline_evidence_id), `idx_comparison_assessment_comparison_evidence`(ws, comparison_evidence_id), `idx_comparison_archive_run`(ws, run_id, event_sequence)。

## Validation

1. `cd apps/server && npm run typecheck` → 通过。
2. `cd apps/server && npm run portrait-comparison-schema:contract-test` → **30/30 pass，exit 0**。
3. `cd apps/server && npm run migration-runner:contract-test`（T0036 回归）→ **16/16 pass，exit 0**。
4. `npm run guard:worktree` → `OK`。
5. `git diff --check` → 无输出。
6. `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` → 无输出。

## Admin Protection 覆盖证据

- `PROTECTED_TABLES`：8 表全部在内（contract test 直接导入验证）。
- `IMMUTABLE_TABLES`：8 表全部在内（contract test 直接导入验证）。
- `isTruncatable(name)` → `false` × 8（contract test 直接调用验证）。
- `isDroppable(name)` → `false` × 8（contract test 直接调用验证）。
- `CODE_TABLES`：8 表全部在内（手动更新，未通过 contract test 直接验证 catalog 层面）。
- `classifyTable`：`name.startsWith("comparison_")` → `'comparison'` domain（手动更新，未通过 contract test 直接验证）。

## Risks

1. **IEEE 754 max double 边界**：使用 `1.7976931348623157e+308`（IEEE 754 max double）作为有限边界，含 `>=`/`<=` 容纳 `Number.MAX_VALUE`。`Infinity <= max` = FALSE 拒绝 Infinity；`MAX_VALUE <= max` = TRUE 通过。边界值本身是 IEEE 754 常量，不依赖溢出行为。
2. **SQLite Infinity 行为意外**：`typeof(Infinity) = 'real'` 为 TRUE；`Infinity * 0 = null`（不是 NaN）；CHECK 对 NULL 视为通过——`x * 0 = 0` 方案无效，改用范围边界。
3. **CODE_TABLES/classifyTable 无直接 contract test**：保护语义已通过 PROTECTED_TABLES/IMMUTABLE_TABLES/isTruncatable/isDroppable 直接验证；catalog 层面（isCodeDefined、domain 分类）需 route 级测试覆盖。
4. **ws_demo schema:check 未通过**：V005 未应用于 ws_demo（本任务不允许写），contract test 内直接验证了 V001-V005 fresh DB 全表完整性。
5. **rebuild DDL chain 仍缺 SIMULATED_MARKET_DDL**：pre-existing gap，不在 T0037 范围，需单独 contract change request。

## Open Questions

1. ws_demo 的 `.migration-backups/` 在 V005 真正落地后会产生未跟踪备份文件，需 controller 拍板 gitignore / guard 口径。
2. `dangerous-ops.ts` 的 rebuild DDL chain 仍缺 `SIMULATED_MARKET_DDL`（pre-existing gap），需单独 contract change request。
3. Admin `CODE_TABLES`/`classifyTable` 的 catalog 层面是否需要补充 route 级 contract test。

## Contract Drift

无。V005 是新增结构；三个现有调用方仅追加接入，未改变既有行为；schema_migration 表结构不变；admin apply-migrations 响应不变。SIMULATED_MARKET_DDL 的顺手修复已在 round 2 回退。

## ws_demo、backup、临时 workspace 和生成产物清理复核

- 未运行任何写入 `data/workspaces/ws_demo/db.sqlite` 的命令；所有测试均在 `/tmp` 临时目录。
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` 无输出；`npm run guard:worktree` 通过；`git diff --check` 无输出。
- 本次创建的临时目录在 contract test `t.after()` 中自动清理。
- 最终变更集仅含 allowed_paths 内文件与任务总线产物。

## Memory Used

- **Do not trust PRD or subagent summaries for falsifiable external-repo facts**：直接阅读 WorkPLS `0001_initial_comparison.sql` 全部 320 行 DDL、PLS `dangerous-ops.ts`/`admin-database.ts` 真实定义后才定 DDL 和保护接入方案。SQLite Infinity/NaN/NULL 行为全部经 node:sqlite 实测而非文档假设。
- **Handoff claims must be verified against actual test evidence before submission**：每轮修正的测试数量、覆盖项、bound 参数计数均以实际运行输出为准。round 4 的 viewExtra bug 和 round 5 的 MAX_VALUE 边界缺陷均由 review 发现——说明负向测试覆盖在逐轮扩展中仍有盲区。

## Memory Candidates

- **SQLite Infinity 的 CHECK 行为意外**（lesson_type: mistake）：`typeof(Infinity) = 'real'` 为 TRUE；`Infinity * 0` 返回 `null`（不是 NaN）；CHECK 中 `null = 0` 是 NULL（视为通过）。拒绝 Infinity 的唯一可靠方式是范围边界。`x * 0 = 0` 方案在 SQLite 中无效。
- **IEEE 754 max double 边界必须用 `>=`/`<=` 而非 `>`/`<`**（lesson_type: mistake）：`Number.MAX_VALUE < Number.MAX_VALUE` = FALSE，严格边界会拒绝合法的最大有限值。`MAX_VALUE <= MAX_VALUE` = TRUE，含等号。
- **SQLite bind 参数计数陷阱**（lesson_type: mistake）：SQL 模板中字面量（如 `'op'`）不是 `?` 占位符；逐一数 `?` 而不是按字段数估算。round 2 的 4 个失败测试全部因为多传了值。
- **schema-check viewExtra 二阶 regression**（lesson_type: mistake）：提取 `checkSchema(db)` 时 `viewExtra` 的 filter 条件写成了自比较（`!dbViews.includes(v)` → 恒空）。提取函数时每个分支都需有回归测试覆盖，不能只测 happy path。
