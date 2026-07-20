# WorkPLS 退役 Runbook：归档、恢复与删除流程

> 任务：T0044 / W09（`portrait-comparison-v1`）。本 runbook 配合 `docs/workpls-retirement-audit.md`（审计结论）与 `docs/workpls-retirement-disposition.md`（逐项 disposition）使用。
> **本任务不执行删除。** 以下删除流程只有在总控/用户明确批准后才可由后续任务执行。

## 1. 归档产物

> 时效说明（revision 1，2026-07-20）：首版归档物曾因 `/tmp` 被系统清理而不可复验（review blocker）；当前版本为 revision 1 全部重新生成并复核的产物。WorkPLS HEAD/dirty 未变，sha256 与首版一致（重生成是确定性的）。执行 §2 前必须先确认文件仍存在（`ls -la /tmp/workpls-retirement-t0044/`）；若再次丢失，按 §2 注释中的生成命令重新生成并复核 sha256 与下表一致后再继续。

> 归档执行记录（2026-07-20）：用户决定不直接删除 WorkPLS，而是将项目移动到 `/Users/huangbo/Dev/Archive/workpls`。T0044 审计点 bundle + patch 已复制到 `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/` 并复核 sha256。移动后发现归档项目当前 HEAD 为 `0e0bd4829ba27bed5e8a7b872cf36ff6d3ff14a3`（`wpls-20260720-05`），工作树干净；已补充当前状态 bundle `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/workpls-archive-current.bundle`，sha256 `6428005e9d223dfcdb628b9459704fe1cf4be334ad4304c5f316869bebbc667b`，`git bundle verify` 通过。

| 产物 | 路径 | sha256 |
| --- | --- | --- |
| Git bundle（完整已提交历史，`--all`） | `/tmp/workpls-retirement-t0044/workpls-retirement.bundle` | `58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a` |
| 未提交改动 patch（`AGENTS.md` +116 行） | `/tmp/workpls-retirement-t0044/agents-md-uncommitted.patch` | `b366b5a55ba65c91ff1b848bde8adc3e193d950dda5742d23968006acaf0819e` |
| 当前归档项目 bundle（移动后 HEAD） | `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/workpls-archive-current.bundle` | `6428005e9d223dfcdb628b9459704fe1cf4be334ad4304c5f316869bebbc667b` |

- WorkPLS HEAD：`d0da4152d239215dbb791b4750c01fe04c4f4de1`（branch `main`，无 remote）。
- `git bundle` 使用 sha1（git 固有），且**不含未提交改动**；patch 文件是对 dirty state 的补足。
- `/tmp` 会被系统清理；**删除 WorkPLS 前必须先完成 §2 的持久化复制**。

## 2. 删除前：归档持久化（必做）

```bash
# 1) 选择持久位置（示例；由总控指定正式归档目录）
ARCHIVE_DIR=<durable-archive-dir>/workpls-retirement-20260720
mkdir -p "$ARCHIVE_DIR"

# 2) 复制产物
cp /tmp/workpls-retirement-t0044/workpls-retirement.bundle "$ARCHIVE_DIR/"
cp /tmp/workpls-retirement-t0044/agents-md-uncommitted.patch "$ARCHIVE_DIR/"

# 3) 复核 sha256（必须与 §1 完全一致）
shasum -a 256 "$ARCHIVE_DIR/workpls-retirement.bundle"
#   期望: 58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a
shasum -a 256 "$ARCHIVE_DIR/agents-md-uncommitted.patch"
#   期望: b366b5a55ba65c91ff1b848bde8adc3e193d950dda5742d23968006acaf0819e

# 4) 验证 bundle 完整性
git bundle verify "$ARCHIVE_DIR/workpls-retirement.bundle"
#   期望: 含有 refs/heads/main + HEAD @ d0da4152...，"记录一个完整历史"

# 5) 可选：恢复演练（推荐，证明归档可用）
git clone "$ARCHIVE_DIR/workpls-retirement.bundle" /tmp/workpls-restore-drill
git -C /tmp/workpls-restore-drill rev-parse HEAD
#   期望: d0da4152d239215dbb791b4750c01fe04c4f4de1
```

如果 WorkPLS 的 dirty `AGENTS.md` 需要在归档中体现为已提交历史，可在删除前由总控决定在 WorkPLS 内执行一次提交（worker 本任务未执行，WorkPLS 全程只读）；否则 patch 文件即为该改动的恢复依据。

## 3. 恢复流程（删除后如需找回）

```bash
# 1) 从 bundle 恢复完整仓库
git clone <ARCHIVE_DIR>/workpls-retirement.bundle workpls-restored
cd workpls-restored
git rev-parse HEAD   # 期望 d0da4152d239215dbb791b4750c01fe04c4f4de1

# 2) 如需要未提交的 AGENTS.md 改动
git apply <ARCHIVE_DIR>/agents-md-uncommitted.patch
```

注意：bundle 恢复出的仓库没有 remote（原仓库即无 remote）；`main` 分支历史完整。

## 4. 删除流程（仅在批准后执行）

前置条件（全部满足才可删除）：

1. 总控/用户明确批准删除（本审计 `ready_for_delete: yes` 只是 worker 判断，不是授权）。
2. §2 持久化复制完成且 sha256 复核一致；建议恢复演练通过。
3. 确认没有进行中的工作引用 `/Users/huangbo/Dev/Projects/workpls`（如 IDE、dev server、其他 agent session）。

删除步骤：

```bash
# 由总控或用户执行（worker 无权执行）
rm -rf /Users/huangbo/Dev/Projects/workpls
```

删除后验证：

1. `ls /Users/huangbo/Dev/Projects/workpls` 应报不存在。
2. PLS 侧回归不受影响（本批次 PLS 代码不依赖 WorkPLS 路径；AgentHarness adapter 指向 AgentHarness 仓库而非 WorkPLS）：可按需复跑 `npm run guard:worktree` 与 portrait-comparison contract 套件。
3. 在 PLS `docs/workpls-absorption-retirement-checklist.md` 记录删除执行时间、执行人与归档位置。

## 5. 延期项恢复入口（删除后建设对应能力时查阅）

| 延期项 | 恢复入口 |
| --- | --- |
| D1 正式 Dimension Evidence 管线 | 结构账本 §6.1、S059；独立 Data task |
| D2 quality policy 数值发布 | 结构账本 §6.2、S065；真实样本校准后版本化 TS 配置 |
| D3 AI explanation（pi-agent） | 结构账本 S038/S091、§6.3；PLS AGENTS.md §四 LLM 调用规则 |
| D4 Flywheel / decision_record 升级 | 结构账本 §6.4、S016/S084 |
| D5 WorkPLS fixture 导入 | 仓内无对象（disposition 表 §7）；如仓外发现数据须另立任务 |
| D6 AgentHarness source 配置 UI | 结构账本 §6.5、S064/S085 |

上述建设均不依赖 WorkPLS 仓库文件；如需查阅 WorkPLS 原始设计文档，从 §3 恢复 bundle 即可。
