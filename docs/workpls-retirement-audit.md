# WorkPLS 退役审计报告

> 任务：T0044 / W09（`portrait-comparison-v1`），worker：mimo（backend）。
> 本任务**不是删除任务**。WorkPLS 在本任务批准前保持只读归档；本报告只产出审计证据、disposition、归档与删除 gate 判断。
> 逐项明细见 `docs/workpls-retirement-disposition.md`；恢复与删除流程见 `docs/workpls-retirement-runbook.md`。

## 1. WorkPLS Repo Identity

| 项 | 值 | 证据命令（exit code） |
| --- | --- | --- |
| 绝对路径 | `/Users/huangbo/Dev/Projects/workpls` | `ls`（0） |
| 是否 Git 仓库 | 是（分支 `main`，无其他本地/远程分支） | `git -C ... branch -a`（0） |
| HEAD | `d0da4152d239215dbb791b4750c01fe04c4f4de1`（`workpls-20260718-07`） | `git -C ... rev-parse HEAD`（0） |
| Dirty state | `M AGENTS.md`（+116 行，未提交）；无 untracked 文件 | `git -C ... status --short`（0） |
| Remote | **无**（`git remote -v` 输出为空） | `git -C ... remote -v`（0） |

因为没有 remote，**本地归档 bundle 是唯一异地恢复依据**（见 §4）。WorkPLS 工作区本体在删除前是第一恢复依据。

### 1.1 Dirty state 解释

- 唯一未提交改动是 `AGENTS.md` 追加 116 行 AgentOps 治理标准（"AgentOps 墓碑代码治理标准"等章节）。
- 该内容已存在于 PLS `AGENTS.md`（`rg -c "墓碑代码治理标准" PLS/AGENTS.md` → 1 处命中），且 canonical 来源在 coding-system；未提交副本**不含独有业务信息**。
- 为完整起见，未提交 diff 已单独保存为 patch（见 §4.2），删除前可由总控决定是否在 WorkPLS 内提交或随 patch 归档。

## 2. Inventory 摘要

对 WorkPLS 全部非 `node_modules`/`.git` 文件（`find` 只读枚举）按目录建立 inventory，逐项 disposition 见 `docs/workpls-retirement-disposition.md`。

| 状态 | 计数 | 含义 |
| --- | ---: | --- |
| migrated | 24 | 能力已在 PLS 按批准架构落位，有 Task Bus approved 证据 |
| intentionally_deferred | 6 | 批次显式延期项，均有恢复入口 |
| retained_reference | 14 | 设计/契约/任务历史，保留于归档 bundle |
| obsolete | 14 | WorkPLS 专属基础设施/工具状态/被替代物，无迁移价值 |
| unknown/blocker | 0 | — |

关键只读事实：

1. WorkPLS 仓内**不存在** `data/` 目录、fixture 目录或任何 `.sqlite`/`.db` 文件 → "WorkPLS fixture 导入"无对象。
2. WorkPLS **无 flywheel 实现代码**、**无 AI generator 实现**（`GENERATOR_TYPES` 声明了 `ai` 但全仓无调用方）、quality policy **无数值阈值常量** → 三项延期在 WorkPLS 侧同样未实现，删除不丢失已存在能力。
3. WorkPLS 的预测画像/模拟运行/经营飞轮仅存在于 PRD/CONTEXT 文档（规划未实施），不属于本批次吸收范围。

## 3. W01-W08 吸收审计

对照 `docs/workpls-absorption-retirement-checklist.md` 九项清单，逐项核对 WorkPLS 能力 → PLS 落位（全部 Task Bus `approved`）：

| W | Task | WorkPLS 能力 | PLS 落位证据 | 审计结论 |
| --- | --- | --- | --- | --- |
| W01 | T0036 | migration runner（`persistence/migrations/runner.ts`） | `apps/server/src/db/migration-runner.ts`；runner contract 16/16 | 已覆盖 |
| W02 | T0037 | comparison 持久化 DDL（`0001_initial_comparison.sql`） | V005 8 表 + schema check + Admin 保护；schema contract 30/30 | 已覆盖（物理结构按账本重新设计） |
| W03 | T0038 | canonical JSON/checksum、algorithm、quality policy contract、rule summary | `portrait-comparison/canonical-json.ts`、`algorithm.ts`、`quality-policy.ts`、`rule-summary.ts`；algorithm 15/15 | 已覆盖；硬编码 80 分阈值按 S092 显式不迁移 |
| W04 | T0039 | PortraitSource interface、sqlite adapter、schema gate | `portrait-comparison/portrait-source/`（PLS + AgentHarness 双 adapter、resolver）；source 70/70 | 已覆盖 |
| W05 | T0040 | comparison/explanation/archive repository 与 service | `portrait-comparison/application/` + `repository/`；application 113/113 | 已覆盖 |
| W06 | T0041 | readiness/formal run HTTP（`http/routes.ts`、comparison-readiness、formal-comparison-run） | `routes/portrait-comparisons.ts`；HTTP contract 32/32；production `not_released` 零写入 | 已覆盖 |
| W07 | T0042 | 三步 wizard、readiness/history/detail UI | `apps/web/src/pages/PortraitComparisonWorkbench.tsx`；web build/lint + Playwright | 已覆盖（React 重新实现） |
| W08 | T0043 | browser/static smoke、internal preview 验收 | Playwright e2e（mock 4/6 skipped；real-contract 6/4 skipped）、worktree guard | 已覆盖 |

**未迁移能力**（非静默遗漏，均有 disposition）：延期六项 D1-D6（disposition 表 §7）；显式不迁移的硬编码阈值（disposition 表 §2.1）；WorkPLS 规划未实施的预测/模拟/飞轮（disposition 表 §8）。

## 4. 归档 bundle 证据

> 时效说明（revision 1，2026-07-20）：`/tmp` 曾被系统清理导致首版归档物不可复验；本节所有归档物已于 revision 1 全部重新生成并复核，sha256 与首版完全一致（WorkPLS HEAD/dirty 未变），当前存在于 `/tmp/workpls-retirement-t0044/`。

### 4.1 主 bundle

| 项 | 值 |
| --- | --- |
| 生成命令 | `git -C /Users/huangbo/Dev/Projects/workpls bundle create /tmp/workpls-retirement-t0044/workpls-retirement.bundle --all`（exit 0） |
| 路径 | `/tmp/workpls-retirement-t0044/workpls-retirement.bundle` |
| sha256 | `58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a`（`shasum -a 256`，exit 0） |
| 覆盖 HEAD | `d0da4152d239215dbb791b4750c01fe04c4f4de1`（与 §1 一致） |
| 覆盖 dirty state | **不包含**（git bundle 只含已提交历史）→ 由 §4.2 patch 补足 |
| 完整性校验 | `git bundle verify` 通过："该捆绑包记录一个完整历史"，含 `refs/heads/main` + `HEAD`（sha1 算法为 git bundle 固有） |

### 4.2 未提交改动 patch

| 项 | 值 |
| --- | --- |
| 生成命令 | `git -C ... diff AGENTS.md > /tmp/workpls-retirement-t0044/agents-md-uncommitted.patch` |
| sha256 | `b366b5a55ba65c91ff1b848bde8adc3e193d950dda5742d23968006acaf0819e` |
| 内容说明 | `AGENTS.md` +116 行 AgentOps 治理标准；同内容已在 PLS `AGENTS.md` 存在 |

**注意**：`/tmp` 会被系统清理。删除 WorkPLS 前必须把 bundle + patch 复制到持久位置，流程见 `docs/workpls-retirement-runbook.md`。

## 5. PLS 集成复验

本任务实际复跑（2026-07-20，全部在 PLS 仓库；exit code 全部为 0；命令为可直接复现的完整形式）：

| 命令 | 结果 |
| --- | --- |
| `cd apps/server && npm run typecheck` | 通过，无错误 |
| `cd apps/server && npm run migration-runner:contract-test` | pass 16 / fail 0 |
| `cd apps/server && npm run portrait-comparison-schema:contract-test` | pass 30 / fail 0 |
| `cd apps/server && npm run portrait-comparison-algorithm:contract-test` | pass 15 / fail 0 |
| `cd apps/server && npm run portrait-source:contract-test` | pass 70 / fail 0 |
| `cd apps/server && npm run portrait-comparison-application:contract-test` | pass 113 / fail 0 |
| `cd apps/server && npm run portrait-comparison-http:contract-test` | pass 32 / fail 0 |
| `cd apps/web && npm run build` | 通过（exit 0；仅 chunk size 提示） |
| `cd apps/web && npm run lint` | 0 warnings / 0 errors |
| `npm run guard:worktree`（PLS 根目录，root script） | `OK: no forbidden generated artifacts in worktree diff.` |
| `git diff --check`（PLS 根目录） | clean |
| `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`（PLS 根目录） | 无输出（clean） |
| `git diff --name-only -- <同上 protected paths>`（PLS 根目录） | 无输出（clean） |

注意：六个 contract test 脚本只定义在 `apps/server/package.json`，**不是** PLS 根目录 npm script；在根目录运行会报 `Missing script`，必须从 `apps/server` 目录执行。

已批准 review 证据：T0036-T0043 八个 `review.md` 均为 `Decision: approved`，其独立验证记录与本表一致。Playwright E2E 未在本任务复跑（属 T0042/T0043 已批准范围，且本任务不改前端/后端代码）；web build/lint 复跑通过，确认前端产物可构建。

## 6. 删除 gate

**`ready_for_delete: yes`**（提交总控拍板；本任务自身不执行删除）。

判定对照：

| 条件 | 结果 |
| --- | --- |
| bundle/checksum 存在且完整性校验通过 | ✅ §4.1 |
| dirty state 已解释并有 patch 归档 | ✅ §1.1、§4.2 |
| 所有 inventory 项都有 disposition | ✅ 58/58，无 unknown/blocker |
| 所有延期项有恢复路径 | ✅ disposition 表 §7（D1-D6） |
| PLS 复验通过 | ✅ §5 全部 exit 0 |
| 无 unknown/blocker | ✅ |

前提条件（删除动作发生前必须完成，详见 runbook）：

1. 总控/用户批准本审计与删除决定。
2. 把 bundle + patch 复制到持久位置并复核 sha256。
3. 由总控决定 WorkPLS 未提交的 `AGENTS.md` 改动是否先在 WorkPLS 内提交（可选；patch 已兜底）。

## 7. 风险与开放问题

1. git bundle 使用 sha1 算法（git 固有），不含未提交改动；§4.2 patch 已补足，runbook 已写明恢复步骤。
2. `/tmp` 非持久存储；bundle 复制到持久位置前不得删除 WorkPLS。
3. Playwright E2E 本任务未复跑，依赖 T0042/T0043 approved 记录 + 本次 web build/lint；如需更强保证可由总控要求补跑。
4. WorkPLS 仓外是否存在历史数据（如其他目录的 fixture DB）不在本任务视野内；D5 结论仅限仓内只读核实。

## 8. 批准后归档执行记录

用户 2026-07-20 明确选择"归档暂停，不直接删除"：

- T0044 审计点 bundle + dirty patch 已从 `/tmp/workpls-retirement-t0044/` 复制到持久目录 `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/`，sha256 复核一致。
- 原 WorkPLS 项目目录已从 `/Users/huangbo/Dev/Projects/workpls` 移动到 `/Users/huangbo/Dev/Archive/workpls`；原路径不再存在。
- 移动后复核发现归档项目当前 HEAD 为 `0e0bd4829ba27bed5e8a7b872cf36ff6d3ff14a3`（`wpls-20260720-05`），工作树干净；这比 T0044 审计点 `d0da4152d239215dbb791b4750c01fe04c4f4de1` 多一个提交。为覆盖实际归档状态，已补充当前状态 bundle：`/Users/huangbo/Dev/Archive/workpls-retirement-20260720/workpls-archive-current.bundle`，sha256 `6428005e9d223dfcdb628b9459704fe1cf4be334ad4304c5f316869bebbc667b`，`git bundle verify` 通过。
- WorkPLS 未被删除；若未来要彻底删除 `/Users/huangbo/Dev/Archive/workpls`，必须另行获得用户/总控明确授权。
