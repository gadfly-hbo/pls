# Handoff: T0036 portrait-comparison-migration-runner-hardening（revision 3）

## What Changed

**Round 3（响应 review 第三轮两个阻断项）**：

1. **非空库的 bootstrap 也纳入备份恢复保护**（阻断项 1）。runner 顶部不再无条件执行 `BOOTSTRAP_DDL`：先用 `tableExists` 守卫只读读取已记录行；`needsBackup` 显式要求 `mutationsPlanned`；备份创建之后，`BOOTSTRAP_DDL` 才在恢复伞内执行（无备份的全新/no-op 调用仍无条件 bootstrap，保持"任何 runner 调用后 schema_migration 存在"的旧不变量）。对"有业务表但从未跑过 runner"的库，失败恢复现在连 sqlite_master 清单都逐字节回到调用前。回归断言（sqlite_master 级）：`foreign_key_check failure ...` 测试在调用前断言 `schema_migration` 不存在、恢复后仍不存在；rehearsal scenario C 断言恢复前后 `sqlite_master` 全清单 `deepEqual`。
2. **调用方资源释放：可达性矩阵 + 全调用链回归测试**（阻断项 2，未扩张路径）。逐一核对三个真实调用方源码后确认：
   - `admin-database.ts:674-692`（apply-migrations）：可达恢复-抛出路径；round 2 的活句柄恢复使其 `finally db2.close()` 成功关闭、不掩盖原错误 → 由既有 `route-shaped try/finally close ...` 调用链测试固定。
   - `dangerous-ops.ts:466-511`（rebuild）：`db.sqlite/-wal/-shm` 先被删除（L467-469）再 `openDb`（L478），传入 runner 的恒为全新空库 → drift/备份创建失败/恢复-抛出对该调用方**构造性不可达**（无行→无 drift；无行且无对象→无备份→无恢复）；runner 只会正常返回（成功或 failed-row 旧语义），调用方继续在成功路径 `db.close()`（L506）→ 无泄漏。新增 `rebuild-shaped call chain` 回归测试：全新库 + 失败 migration → runner **返回而非抛出**（`failed=1`、`backupPath=null`）、同一句柄继续执行 DDL 并正常 `close()`、恢复失败行可见、无部分结构。
   - `migrate.ts` / runner CLI：恢复-抛出可达；无 catch，进程非零退出，OS 回收 fd——单发 CLI 进程的标准资源语义，无泄漏。
   - 结论：所有真实调用方的可达路径都能正确释放句柄且原始错误不被掩盖，无需 contract change request；round 2 的活句柄恢复设计保持不变。
3. Round 1-2 全部语义保持（见前轮 handoff）：漂移 fail closed、64 位 SHA-256、旧 16 位严格前缀一次性升级+同事务审计、每 migration 事务、FK/quick 检查、owner-only 备份（0700/0600、symlink/path escape 拒绝、真实路径推导）、备份先于全部 durable mutation、失败恢复保留调用前 checksum/audit/failed-or-pending 行。

## Files Changed

- `apps/server/src/db/migration-runner.ts`（round 3：守卫式读取替代顶部无条件 bootstrap；`needsBackup` 显式含 `mutationsPlanned`；bootstrap 移至恢复伞内/按备份分支）
- `apps/server/src/db/migration-backup.ts`（新建；round 2 起为活句柄 checkpoint+truncate 后恢复，round 3 无改动）
- `apps/server/src/db/migration-runner-contract-test.ts`（新建；node:test 16 用例，全部 `/tmp` 临时目录）
- `apps/server/package.json`（仅新增 `migration-runner:contract-test` script）
- `docs/notes-infra.md`（仅 `## 0. 当前状态` T0036 条目）

未触碰：`schema.ts`、`migrate.ts`、V001-V004、fixture DB、`admin-database.ts`、`dangerous-ops.ts`（均在允许范围外；两个阻断项均在允许路径内解决）。

## Validation

1. `cd apps/server && npm run typecheck` → 通过。
2. `cd apps/server && npm run migration-runner:contract-test` → **16/16 pass，exit 0**（失败时 exit 1 已在 round 1 验证）。16 用例：fresh、repeat no-op、name drift、64 位 checksum drift、未知高版本（V999）拒绝、旧 16 位升级（先建 0600 备份、2 升级 + 2 审计、一次性幂等）、16 位错误前缀拒绝、`db_admin_audit` 缺失升级 fail closed、fresh 失败无部分 schema + failed 行 + 同 checksum 重试恢复（**恢复保留 failed 行**）、failed 行文件变更 Manual intervention、升级备份 owner-only + 数据保留 + 备份不自动清理、**FK 检查失败恢复（调用前后 `schema_migration` 均不存在的 sqlite_master 级断言）**、symlink `.migration-backups` 拒绝、后续 migration 失败回滚 legacy 升级与审计、**route 形调用链 close 不掩盖原始错误**、**rebuild 形调用链 runner 返回不抛出且调用方正常关闭句柄**。
3. `cd apps/server && npm run schema:check` → `Valid: true`，ws_demo `4 applied, 0 pending, 0 failed`。
4. `npm run guard:worktree`（根目录）→ `OK: no forbidden generated artifacts in worktree diff.`
5. `git diff --check` → 无输出。
6. `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` → 无输出。
7. 真实数据只读核对（不写 ws_demo）：V001-V004 完整 SHA-256 与 ws_demo `mode=ro` 读出的 4 条 16 位存储值 **4/4 严格前缀匹配**。
8. ws_demo 副本演练（/tmp，真身未动，round 3 预期全过）：A) 升级-only → 先备份、4 升级 + 4 审计、repeat no-op 且备份保留；B) 副本 + 伪造 `V005_probe` → 备份 + 事务应用 + 检查通过；C) 副本 + 伪造失败 `V005_broken` → 恢复后 `schema_migration` 行与 **`sqlite_master` 全清单**均逐字节等于调用前、升级审计 0 行。演练目录已删除。
9. review 阻断项 2 实证（round 2 probe，Node 26/WAL）：二次 close 掩盖、脏 WAL 重放撤销恢复两种失败形态均复现；现行活句柄 checkpoint+truncate 方案 close 安全、恢复逐字节正确。

## Risks

1. **quick_check 失败路径无法真实模拟**：不损坏文件无法构造运行时 `quick_check` 失败；与 `foreign_key_check` 共用同一 `failWithRestore`，后者已有恢复证据；两项检查每次成功运行真实执行。
2. **恢复后句柄为 dead handle**：runner 恢复后不再使用该句柄；未来新增调用方在 catch 后继续读写句柄属必须 review 的新约束（已在 `migration-backup.ts` 注释记录）；新调用方还须纳入本轮的可达性矩阵。
3. **旧 pending 行重跑假设 migration 幂等**：V001-V004 全部 `IF NOT EXISTS` 幂等；新 runner 不再产生 pending 行。
4. **V005 落地时 ws_demo 会产生未跟踪备份**：`data/workspaces/ws_demo/.migration-backups/` 属正式备份（不自动清理），届时 handoff/review 需按生成产物口径复核；本任务未在 ws_demo 创建任何备份。
5. **checksum 口径**：对 `.ts` 源文件全文 SHA-256（沿用旧实现，去掉 16 位截断）；源文件任何字节变动即改变摘要，属预期 fail-closed 行为。

## Open Questions

1. V005 真正落地后，ws_demo 的 `.migration-backups/` 是否需要纳入 `.gitignore` 或 worktree guard 的显式白名单/清理策略，需总控拍板（本任务未改 `.gitignore`，不在范围）。

## Contract Drift

无。`runMigrations(db, migrationsDir)` 签名与 `RunResult` 既有字段不变；三个调用方零改动（两个阻断项均在允许路径内解决）；schema_migration 表结构不变；admin apply-migrations 成功路径响应不变。

## ws_demo 与生成产物清理复核

- 未运行任何写入 `data/workspaces/ws_demo/db.sqlite` 的命令；所有测试/演练/probe 均在 `/tmp` 临时目录。
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results` 无输出；`npm run guard:worktree` 通过；`git diff --check` 无输出。
- ws_demo 的 `db.sqlite-shm/-wal` 未跟踪 sidecar 在 schema:check 正常关闭后被 SQLite 自动 checkpoint 清除（瞬态运行时文件，tracked 主文件无改动）。
- 本次创建的临时目录（`/tmp/pls-migration-runner-*`、`/tmp/pls-t0036-rehearsal-*`、`/tmp/t0036-*`）已删除，无临时 workspace 残留。
- 最终变更集仅含 allowed_paths 内文件与任务总线产物；`.mimocode/.cron-lock`、`docs/portrait-comparison-structure-decision-ledger.md` 为任务前已存在，非本任务产物。

## Memory Used

- **Do not trust PRD or subagent summaries for falsifiable external-repo facts**：直接阅读 WorkPLS runner/types/inspector/checksum/database 与 migration.test.ts，以及 PLS 三个 `runMigrations` 调用方（`migrate.ts:27`、`dangerous-ops.ts:466-511`、`admin-database.ts:674-692`）真实代码；round 3 的调用方可达性矩阵完全建立在 `dangerous-ops.ts` 先删库文件再 openDb 的行级证据（L467-478）上；Node 26 close/WAL 语义全部经 probe 实测而非文档记忆。
- **Handoff claims must be verified against actual test evidence before submission**：handoff 每条覆盖声明均以 `npm run migration-runner:contract-test` 实际输出（16/16、exit 0）与演练脚本实际输出为准；三轮中 macOS realpath、backupPath 语义变化、bootstrap 顺序导致的预期修正均先复跑再改断言。

## Memory Candidates

- **WAL 模式下"覆盖库文件"必须先经活句柄 `wal_checkpoint(TRUNCATE)`，再恢复，且绝不能依赖调用方 close 时无帧可重放**（lesson_type: mistake；evidence: T0036 review round 2 + Node 26 probe 实测：脏 WAL 下直接 copyFile + 删 sidecar，调用方 close 会把旧 WAL 帧 checkpoint 回新文件静默撤销恢复；guardrail: 先 checkpoint 截断 → 复制 → 删 sidecar，并用"备份后提交变更再失败"的脏 WAL 回归测试固定）。
- **node:sqlite `DatabaseSync.close()` 对已关闭句柄抛 `database is not open`**（lesson_type: rule；evidence: T0036 review round 2 实测；guardrail: 设施代码若可能已关闭句柄，调用方 `finally close` 会二次抛错掩盖原始错误；优先保持句柄开放但 dead，或用 isOpen 探测/closeQuietly）。
- **基础设施函数的失败模式必须按调用方做可达性矩阵，而不是只看函数实现**（lesson_type: mistake；evidence: T0036 review round 3：`dangerous-ops.ts` 先删库文件再 openDb 使 runner 的 throw 路径对该调用方构造性不可达——handoff 的"调用方均满足"断言只有落到每个调用方的真实调用序列+回归测试才成立；guardrail: 对每个真实调用方写出"可达失败模式 → 句柄/资源后果 → 对应调用链测试"三列表，缺一行就不提交）。
- **macOS `/tmp` 是 `/private/tmp` symlink**（lesson_type: mistake；evidence: T0036 round 1 断言失败；guardrail: 断言临时目录绝对路径前先 `fs.realpathSync` 基线）。
- **tsx 运行 `/tmp` 脚本默认 CJS**（lesson_type: mistake；evidence: T0036 round 1 演练脚本 Transform 失败；guardrail: /tmp 演练脚本旁放 `{ "type": "module" }` package.json）。
