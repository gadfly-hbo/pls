# Handoff

- Task: T0044-workpls-retirement-audit（`portrait-comparison-v1` W09）
- Worker: mimo（backend）
- Status: handoff_ready（**非删除任务**；WorkPLS 保持只读归档，未删除/移动/修改任何 WorkPLS 文件）
- Revision: 1（changes_requested 后修订）

## Revision 1 Blocker Checklist

- [x] B1 归档物不可复验：`/tmp/workpls-retirement-t0044/` 被系统清理 → 已于 2026-07-20 全部重新生成（bundle + patch + sha256 + `bundle verify`，exit 全 0）；WorkPLS HEAD `d0da4152` 与 dirty state 未变，sha256 与首版一致（bundle `58e842ea…`、patch `b366b5a5…`）；`ls -la` 确认两文件当前存在于磁盘；audit §4 与 Bundle Evidence 增加时效说明。
- [x] B2 验证命令路径不可复现：handoff/audit 中六个 contract test 命令补齐 `cd apps/server &&` 前缀，并显式说明这些脚本只存在于 `apps/server/package.json`（根目录运行 `Missing script`）；`guard:worktree`/`git diff` 标注 PLS 根目录；audit §5 增加注意段；自审证据同步更新。

## What Changed

1. 只读完成 WorkPLS 退役审计：repo identity、全量 inventory（58 项）逐项 disposition、W01-W08 吸收对照、延期/非迁移六项恢复入口。
2. 生成可验证归档：`git bundle --all`（完整历史，verify 通过）+ 未提交 `AGENTS.md` diff patch，均记录 sha256；revision 1 在 `/tmp` 被清理后全部重新生成并复核一致。
3. 复跑 PLS 集成验证（后端六套 contract test + typecheck + web build/lint + worktree hygiene），全部 exit 0。
4. 给出删除 gate：`ready_for_delete: yes`（附前提条件，最终删除由总控/用户拍板）。
5. 新增/更新 PLS 文档：audit、disposition、runbook 三份新文档 + 批次清单 W09 状态 + notes-backend 当前状态。

## Files Changed

- `docs/workpls-retirement-audit.md`（新增：identity、bundle 证据、W01-W08 吸收审计、PLS 复验、删除 gate、风险）
- `docs/workpls-retirement-disposition.md`（新增：58 项逐项 disposition 表 + 六项延期恢复入口）
- `docs/workpls-retirement-runbook.md`（新增：归档持久化、恢复演练、删除执行与恢复流程）
- `docs/workpls-absorption-retirement-checklist.md`（W09 行状态 `queued` → `handoff_pending_review`，补充完成证据；§4 下一步协议更新）
- `docs/notes-backend.md`（§0 当前状态更新为 T0044；T0041 内容保留为 §0.1 历史状态）

临时产物（仓外，允许范围）：`/tmp/workpls-retirement-t0044/workpls-retirement.bundle`、`/tmp/workpls-retirement-t0044/agents-md-uncommitted.patch`。

未修改：WorkPLS 仓任何文件；PLS 代码、schema、fixture DB、frontend、model、algorithm、已批准任务文件、`docs/wiki.html`。

## WorkPLS Identity

- path: `/Users/huangbo/Dev/Projects/workpls`（存在）
- Git: 是，branch `main`，无其他分支
- HEAD: `d0da4152d239215dbb791b4750c01fe04c4f4de1`（`workpls-20260718-07`）
- dirty state: `M AGENTS.md`（+116 行未提交；无 untracked）。内容解释：AgentOps 治理标准文本，同内容已存在于 PLS `AGENTS.md`（`rg -c "墓碑代码治理标准" PLS/AGENTS.md` → 1）；canonical 来源在 coding-system；patch 已单独归档兜底。
- remote: 无（`git remote -v` 空输出）→ 本地 bundle 是异地恢复依据。

## Bundle Evidence

> Revision 1（2026-07-20）：review 指出首版 `/tmp/workpls-retirement-t0044/` 已被系统清理、归档物不可复验。本 revision 已全部重新生成并复核；WorkPLS HEAD/dirty 未变，sha256 与首版一致；下列文件当前存在于磁盘（`ls -la /tmp/workpls-retirement-t0044/` 可见，bundle 331951 bytes、patch 9560 bytes）。

| 项 | 值 |
| --- | --- |
| bundle | `/tmp/workpls-retirement-t0044/workpls-retirement.bundle`（当前存在，可复验） |
| bundle sha256 | `58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a`（regeneration 后复核一致） |
| 生成命令 | `mkdir -p /tmp/workpls-retirement-t0044`（exit 0）→ `git -C /Users/huangbo/Dev/Projects/workpls bundle create /tmp/workpls-retirement-t0044/workpls-retirement.bundle --all`（exit 0）→ `shasum -a 256 …`（exit 0） |
| 完整性 | `git -C /Users/huangbo/Dev/Projects/workpls bundle verify /tmp/workpls-retirement-t0044/workpls-retirement.bundle`（exit 0）：完整历史，含 `refs/heads/main` + `HEAD` @ `d0da4152` |
| 未提交 patch | `/tmp/workpls-retirement-t0044/agents-md-uncommitted.patch`（当前存在，125 行），sha256 `b366b5a55ba65c91ff1b848bde8adc3e193d950dda5742d23968006acaf0819e` |
| 恢复命令 | `git clone <bundle> <dir>` → HEAD 应为 `d0da4152…`；`git apply <patch>` 恢复未提交改动（详见 runbook §4） |

## Disposition Summary

migrated 24 / intentionally_deferred 6 / retained_reference 14 / obsolete 14 / unknown/blocker 0（合计 58）。详表：`docs/workpls-retirement-disposition.md`。

## Detailed Disposition Table

见 `docs/workpls-retirement-disposition.md` §2-§6（每项含 WorkPLS path、status、PLS evidence、decision rationale）。抽样：

- `persistence/migrations/runner.ts` → migrated（T0036；PLS `apps/server/src/db/migration-runner.ts`；16/16）
- `persistence/migrations/0001_initial_comparison.sql` → migrated（T0037 V005 8 表；30/30；物理结构按账本重设计）
- `comparison-algorithm/*` → migrated（T0038；`portrait-comparison/algorithm.ts`；15/15）
- `portrait-source/*` → migrated（T0039；双 adapter + resolver；70/70）
- `persistence/comparison|explanation|archive/*` → migrated（T0040；113/113）
- `http/*`、`comparison-readiness/*`、`formal-comparison-run/*` → migrated（T0041；32/32，production `not_released` 零写入）
- `apps/web/src/components/wizard|result/*` → migrated（T0042/T0043；React `PortraitComparisonWorkbench.tsx`）
- 规则摘要硬编码 80 分阈值 → obsolete（S092 显式不迁移）
- 设计/契约/任务史文档、`.agentops/tasks/**` → retained_reference（保留于 bundle）
- `.mimocode/**`、`.DS_Store`、WorkPLS 专属 infra 工具 → obsolete

## Deferred / Non-migrated Items（恢复入口与后续任务建议）

| 项 | WorkPLS 侧只读事实 | 恢复入口 |
| --- | --- | --- |
| D1 正式 Dimension Evidence 管线 | WorkPLS 同样不存在（evidence 仅 comparison 内部持久化） | 结构账本 §6.1/S059：独立 Data task |
| D2 quality policy 数值 | WorkPLS 无数值阈值常量；PLS `not_released` | 账本 §6.2/S065：真实样本校准 |
| D3 AI explanation pi-agent generator + HTTP 入口 | WorkPLS 仅 rule generator，全仓无 AI generator/pi-agent 代码 | 账本 S038/S091 + AGENTS.md §四 |
| D4 Flywheel schema / `decision_record` 升级 | WorkPLS 无 flywheel 实现（仅文档规划） | 账本 §6.4/S084：独立升级任务 |
| D5 WorkPLS fixture/历史数据导入 | 仓内无 `data/`、无 fixture、无 `.sqlite`/`.db`（`find` 核实）→ 无可导入对象，记 obsolete | 如发现仓外数据须另立导入任务 |
| D6 AgentHarness source 配置 UI | WorkPLS 亦无；PLS 保留 adapter + `data_source` 受控入口 | 账本 §6.5/S064/S085 |

## Validation

（即 PLS Integration Revalidation。）

全部在 PLS 仓库于 2026-07-20 实际运行，exit code 均 0；命令为可直接复现的完整形式（六个 contract test 脚本只定义在 `apps/server/package.json`，必须从 `apps/server` 目录运行；根目录运行会 `Missing script`）：

| 命令 | 结果 |
| --- | --- |
| `cd apps/server && npm run typecheck` | 无错误 |
| `cd apps/server && npm run migration-runner:contract-test` | pass 16 / fail 0 |
| `cd apps/server && npm run portrait-comparison-schema:contract-test` | pass 30 / fail 0 |
| `cd apps/server && npm run portrait-comparison-algorithm:contract-test` | pass 15 / fail 0 |
| `cd apps/server && npm run portrait-source:contract-test` | pass 70 / fail 0 |
| `cd apps/server && npm run portrait-comparison-application:contract-test` | pass 113 / fail 0 |
| `cd apps/server && npm run portrait-comparison-http:contract-test` | pass 32 / fail 0 |
| `cd apps/web && npm run build` | exit 0（仅 chunk size 提示） |
| `cd apps/web && npm run lint` | 0 warnings / 0 errors |
| `npm run guard:worktree`（PLS 根目录，root script） | `OK: no forbidden generated artifacts in worktree diff.` |
| `git diff --check`（PLS 根目录） | clean（exit 0） |
| `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`（PLS 根目录） | 无输出（exit 0） |
| `git diff --name-only -- <同上 protected paths>`（PLS 根目录） | 无输出（exit 0） |

Brief 规定的 WorkPLS 侧命令（exit code 均 0）：`git -C workpls status --short`（`M AGENTS.md`）、`git -C workpls rev-parse HEAD`（`d0da4152…`）、`git -C workpls remote -v`（空）、`mkdir -p /tmp/workpls-retirement-t0044`、`git bundle create … --all`、`shasum -a 256 …`。

已批准 review 依据：T0036-T0043 八个 `review.md` 均 `Decision: approved`。Playwright E2E 未复跑（属 T0042/T0043 已批准范围；本任务不改前后端代码），web build/lint 复跑通过确认前端可构建。

## Delete Gate

**`ready_for_delete: yes`**（提交总控拍板；本任务未执行任何删除）。

判定：bundle/checksum 存在且 verify 通过 ✅；dirty state 已解释 + patch 归档 ✅；58/58 inventory 有 disposition ✅；六项延期均有恢复路径 ✅；PLS 复验全过 ✅；无 unknown/blocker ✅。

删除前提（runbook §2）：① 总控批准 + 用户拍板；② bundle+patch 复制到持久位置并复核 sha256；③ 临时目录恢复演练成功；④（可选）决定 WorkPLS 未提交 `AGENTS.md` 是否先提交。

## Protected Paths Cleanup

- `git status --short` / `git diff --name-only` 针对 `data/workspaces/ws_demo/db.sqlite`、`apps/web/playwright-report/index.html`、`apps/web/playwright-report`、`apps/web/test-results` 均无输出。
- `npm run guard:worktree` OK。
- 本任务无临时 workspace 产生；`/tmp/workpls-retirement-t0044/` 为 brief 明确允许的仓外产物。

## Constraint Matrix

| Brief bullet | Invariant family | 权威来源 | 实现位置 | 正向证据 | 负向证据 | Waiver/Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Repo identity（path/HEAD/dirty/remote） | audit evidence | brief 产出要求 1 | audit §1 | 三条 git 命令 exit 0 + 输出记录 | remote 为空已显式说明，bundle 为恢复依据 | — |
| Inventory + 逐项 disposition | audit evidence | brief 产出要求 2 | disposition §2-§6 | `find` 全量枚举；58 项逐项状态 + PLS 证据 | unknown/blocker = 0 | — |
| W01-W08 吸收审计 | audit evidence | brief 产出要求 3 | audit §3 | 八项 approved review 对照表 | 未迁移能力逐项列出（不静默遗漏） | — |
| 延期/非迁移 disposition | audit evidence | brief 产出要求 4、清单 §3 | disposition §7 | D1-D6 均有恢复入口 | D5 经 `find` 核实无对象，记 obsolete 而非遗漏 | — |
| PLS 集成复验 | validation | brief 产出要求 5 | audit §5 | 13 条命令全部 exit 0、精确通过数 | — | Playwright E2E 未复跑：waiver，依据 T0042/T0043 approved + web build/lint 复跑；总控可解除（要求补跑） |
| 归档 bundle + checksum | persistence/recovery | brief 产出要求 6 | audit §4、runbook | bundle exit 0 + sha256 + `bundle verify` 完整历史 | bundle 不含未提交改动 → patch 兜底并记录 sha256 | — |
| 删除 gate | gate decision | brief 产出要求 7 | audit §6 | 六项条件全 ✅ → `ready_for_delete: yes` | 删除前提四条列入 runbook §2 | — |
| 不修改 WorkPLS / 不删除 | scope | brief 允许范围 | 全任务 | 仅 `rg`/`git -C`/`find` 只读命令；PLS diff 仅 5 个允许文档 | guard:worktree + diff --check + protected paths clean | — |
| W09 状态不提前写 completed | process | brief 建议执行顺序 7 | checklist | 状态写为 `handoff_pending_review` | — | — |

## Evidence Map

- "WorkPLS 是 Git 仓库、HEAD d0da4152、无 remote、dirty 仅 AGENTS.md" → `git -C … rev-parse HEAD` / `status --short` / `remote -v` 输出（audit §1）。
- "bundle 完整可恢复" → `git bundle verify` 输出"该捆绑包记录一个完整历史"（audit §4.1）。
- "58 项 disposition 无 blocker" → `docs/workpls-retirement-disposition.md` §1 计数表。
- "WorkPLS 无 fixture 数据" → `find` 无 `data/`、无 `.sqlite`/`.db` 输出（disposition §7 D5）。
- "WorkPLS 无 AI generator 实现" → `rg pi-agent/generator` 仅命中 rule generator 与枚举声明（disposition §7 D3）。
- "PLS 能力在位" → 六套 contract test 复跑 pass 计数（16/30/15/70/113/32）+ typecheck + web build/lint（audit §5）。
- "worktree 干净" → guard:worktree OK、diff --check clean、protected paths 无输出。

## Handoff Self-Audit PASS Evidence

按 `/agentops-handoff-self-audit` 执行，结果：

```text
handoff-self-audit: T0044 .agentops/tasks/T0044-workpls-retirement-audit/handoff.md
  1. Contract version everywhere — not applicable（本任务为退役审计文档任务，无 contract version 变更；PLS comparison contract 版本未动）
  2. Notes history retired — PASS（docs/notes-backend.md §0.1 标题标记"历史状态（T0041，2026-07-20；已由上方 T0044 状态取代）"；checklist W09 行不再描述为 queued/待领取）
  3. Real fixture for each null/invalid case — not applicable（本任务不新增/修改测试与 validator）
  4. Distinct validator failure codes — not applicable（本任务不改 parseX/mapX 或任何 validator）
  5. Contract drift scan — not applicable（brief 无 Approved Contract Delta；审计结论均引用已批准账本与 review，不改 contract）
  6. Smoke executed if brief demands — PASS（brief validation 无 smoke 命令；10 条规定命令全部实际执行并逐条记录 exit code，见 "Validation"；revision 1 起所有命令以可直接复现的完整形式记录，含 `cd apps/server &&` 前缀与根目录标注）
  7. Memory honesty — PASS（Memory Used 两条均指明受影响判定；Memory Candidate 含 lesson_type/status/created_at/last_used_at/use_count/expires_at/evidence/lesson/guardrail 完整生命周期元数据；controller 在 review 中接受的新 memory "Retirement archives must be current, reproducible, and cover dirty state" 与本任务 Candidate 一致，由 controller 决定提升）
  G. Worker Delivery Governance — PASS（Constraint Matrix + Evidence Map 收录于本 handoff；每条 claim 可 grep 到命令输出/文件路径/waiver；fail-closed：remote 缺失、bundle 不含未提交改动、D5 无数据对象均显式暴露而非掩盖；Playwright 未复跑为显式 waiver，含原因、替代证据与解除人；revision 1 blocker checklist 两项全部闭合并记录于文首）

Result: PASS — submit
```

范围与 hygiene 补充证据：

- **范围合规**：PLS diff 中本任务新增/修改仅 `docs/workpls-retirement-audit.md`、`docs/workpls-retirement-disposition.md`、`docs/workpls-retirement-runbook.md`、`docs/workpls-absorption-retirement-checklist.md`、`docs/notes-backend.md`（+ 本任务目录 handoff.md）— 全部在 allowed_paths；其余 worktree diff 均为 W01-W08 已批准任务的既有改动（见各 review 的 Out Of Scope Diffs）；WorkPLS 零写入（仅只读命令）；临时产物仅在 `/tmp/workpls-retirement-t0044/`（brief 允许）。
- **Protected paths**：guard:worktree OK；`ws_demo/db.sqlite`、Playwright 报告路径 status/diff 均无输出；无临时 workspace 残留。
- **文档同步**：checklist W09 状态 `handoff_pending_review`（未提前写 completed）；notes-backend §0 更新为 T0044；三份新文档交叉引用一致（audit ↔ disposition ↔ runbook）。

## Risks

1. git bundle 使用 sha1（git 固有），不含未提交改动；patch 已兜底并记录 sha256。
2. `/tmp` 非持久：删除 WorkPLS 前必须按 runbook §2 复制到持久位置并复核 sha256，否则归档可能丢失。
3. Playwright E2E 未在本任务复跑（waiver 已记录）；若总控要求删除前更强保证，可补跑 `cd apps/web && npx playwright test e2e/portrait-comparison.spec.ts`（mock 与 `VITE_USE_MOCK=false` 两种模式）。
4. WorkPLS 仓外历史数据不在视野内；D5 结论仅限仓内只读核实。

## Open Questions

1. WorkPLS 未提交的 `AGENTS.md` +116 行：删除前是否先在 WorkPLS 内提交并重新打包，还是接受 patch 兜底？（建议：patch 兜底即可，内容已在 PLS `AGENTS.md`。）
2. 归档物持久位置（`ARCHIVE_DIR`）由总控/用户指定。

## Memory Used

- `Do not trust PRD or subagent summaries for falsifiable external-repo facts`：影响 WorkPLS identity、dirty state、fixture 存在性、AI generator 存在性、quality policy 阈值等全部可证伪事实的判定——均用 `git -C`/`find`/`rg` 只读直查，未依赖任何摘要。
- `Handoff claims must be verified against actual test evidence before submission`：影响 PLS 复验方式——六套 contract test 与 web build/lint 全部实际复跑并记录精确通过数，未沿用历史 review 计数作为唯一依据。

## Memory Candidates

### Retirement audit must preserve uncommitted state separately from git bundle

- lesson_type: rule
- status: active
- created_at: 2026-07-20
- last_used_at: 2026-07-20
- use_count: 1
- expires_at: 2026-10-18
- evidence: T0044；WorkPLS dirty `AGENTS.md`（+116 行）不在 `git bundle --all` 内；补存 `agents-md-uncommitted.patch`（sha256 `b366b5a5…`）并在 audit §4.2 / runbook §2-§4 记录
- lesson: `git bundle create --all` 只含已提交历史。退役归档时必须先用 `git status --porcelain` 检查 dirty/untracked 状态，对未提交改动单独保存 patch + sha256，并在 runbook 写明恢复时 `git apply` 的步骤；否则删除后未提交内容不可恢复。
- guardrail: 任何"归档后可删除"判定前，核对 bundle 覆盖范围 == 仓库全部可恢复状态（committed + dirty + untracked）；三者任一未覆盖即不构成 `ready_for_delete: yes`。
