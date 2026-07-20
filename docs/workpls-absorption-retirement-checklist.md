# WorkPLS 吸收与退役清单

## 1. 目的

本清单是 `portrait-comparison-v1` 批次从 WorkPLS 吸收可复用能力、在 PLS 中按已批准架构重新落位，并最终判断 WorkPLS 是否可退役的总控清单。

权威结构决定：`docs/portrait-comparison-structure-decision-ledger.md`。任务状态以 `.agentops/tasks/` Task Bus 为准；只有 `approved` 任务计为完成。

## 2. 执行清单

| 编号 | Task ID | Sequence | Domain / Assignee | 任务 | Depends on | 状态 | 完成证据 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| W01 | T0036 | 1 | backend / mimo | Migration runner 加固 | — | completed | Task Bus `approved`；runner contract 16/16 |
| W02 | T0037 | 2 | backend / mimo | V005、8 表、schema check、Admin 保护 | T0036 | completed | Task Bus `approved`；schema contract 30/30 |
| W03 | T0038 | 3 | algorithm / opencode | Canonical JSON/checksum、Comparison algorithm、未发布 quality policy contract、deterministic rule summary | T0037 | completed | Task Bus `approved`；algorithm contract 15/15，schema contract 30/30 |
| W04 | T0039 | 4 | backend / mimo | `PortraitSource` interface、PLS adapter、AgentHarness read-only adapter、active source 解析 | T0038 | completed | Task Bus `approved`；portrait-source contract 70/70，algorithm 15/15，schema 30/30 |
| W05 | T0040 | 5 | backend / mimo | Comparison repository/application transaction、幂等 Run、list/detail、explanation persistence、archive | T0039 | completed | Task Bus `approved`；Revision 36 关闭 revision 35 全部 blocker：candidate contract 外的额外 evidence 按 role fail closed；detail validation 改为 run-scoped，不再被 workspace 无关 orphan outcome 污染；post-insert audit 测试真实篡改 persisted projection 并由 validator 检出；`comparison-application.ts` NUL 字节已清除；handoff 包含 7 点 self-audit PASS。独立验证：typecheck；application 113/113；source 70/70；algorithm 15/15；schema 30/30；guard:worktree；git diff --check；protected paths clean |
| W06 | T0041 | 6 | backend / mimo | `/api/v0/portrait-comparisons` readiness、gated create、list/detail/archive 与真实 HTTP contract tests | W05 | completed | Task Bus `approved`；Revision 3 关闭 revision 2 scope blocker：algorithm config 移入允许范围内的 HTTP route，本次无 application layer diff。独立验证：typecheck；HTTP contract 32/32；application 113/113；source 70/70；algorithm 15/15；schema 30/30；guard:worktree；git diff --check；protected paths clean。Production policy 仍 `not_released`，formal create 受控失败且八张 Comparison 表零写入 |
| W07 | T0042 | 7 | frontend / kilo | PLS React 三步 readiness、历史与详情 UI；不得伪造正式 Run 可用状态 | W06 | completed | Task Bus `approved`；Revision 3 关闭 revision 2 blocker：`expectedSequence` 改为 next sequence（空 `archiveEvents` => 1），新增 archive POST `Idempotency-Key`/body/no `runId` 断言，以及 409/404 error envelope UI 覆盖。独立验证：web build；web lint；mock Playwright 4 passed / 4 skipped；`VITE_USE_MOCK=false` Playwright 4 passed / 4 skipped；guard:worktree；git diff --check；protected paths clean |
| W08 | T0043 | 8 | frontend / kilo | 全链路验收：真实 contract、E2E、临时 workspace smoke、响应式与 worktree guard | W07 | completed | Task Bus `approved`；Revision 2 关闭 revision 1 blocker：responsive test 加入 `page.route` backend-shaped intercepts 覆盖 history + detail（含长 run id/checksum/source text），`body.scrollWidth` + `documentElement.scrollWidth` 双断言；`VITE_USE_MOCK=false` 下无 ECONNREFUSED；no-leak test 覆盖 SQL/stack/DB-path；docs/notes-app.md 与 checklist 已更新。独立验证：web build；web lint；mock Playwright 4 passed / 6 skipped；`VITE_USE_MOCK=false` Playwright 6 passed / 4 skipped；guard:worktree；git diff --check；protected paths clean |
| W09 | T0044 | 9 | backend / mimo | WorkPLS 退役审计、逐文件 disposition、PLS 集成复验、`git bundle` 与 checksum、删除 gate | W08 | completed | Task Bus `approved`；Revision 1 关闭 revision 0 blocker：归档物已重新生成且 review 时可复核（bundle sha256 `58e842ea…`、patch sha256 `b366b5a5…`、`git bundle verify` 完整历史，WorkPLS HEAD/dirty 未变、重生成一致）；validation 命令已改为可复制的 `cd apps/server && npm run ...` 形式并标注脚本归属。复验：apps/server typecheck；六套 backend contract（16/30/15/70/113/32）；web build/lint；guard:worktree；git diff --check；protected paths clean。`ready_for_delete: yes` 获审计 gate 接受；删除仍需用户/总控另行授权并先持久化归档 |

## 3. 延期与非迁移范围

以下项目不计入首期实现完成，但必须在 W09 中明确 disposition，不能静默遗漏：

- 正式 Dimension Evidence 新 schema、taxonomy、单位和数据管线。
- 基于真实样本发布的 quality policy 数值。
- AI explanation 的 `pi-agent` generator 与公共 HTTP 入口。
- Flywheel schema / `decision_record` 来源模型升级。
- WorkPLS fixture 或历史业务数据导入。
- AgentHarness source 配置 UI；首期仅保留 adapter 与受控配置入口。

## 4. 下一步协议

当前状态：`portrait-comparison-v1` W01-W09 全部 `approved` / completed。本批次 WorkPLS 吸收与退役审计已收口。

用户 2026-07-20 决定不直接删除 WorkPLS，而是归档暂停：

- 原路径 `/Users/huangbo/Dev/Projects/workpls` 已移动到 `/Users/huangbo/Dev/Archive/workpls`。
- T0044 审计点归档物已复制到 `/Users/huangbo/Dev/Archive/workpls-retirement-20260720/`：
  - `workpls-retirement.bundle` sha256 `58e842ead071163848be06dc56479728f568e7e1246de02e05a2c1296b489c0a`，覆盖 T0044 审计时 HEAD `d0da4152d239215dbb791b4750c01fe04c4f4de1`。
  - `agents-md-uncommitted.patch` sha256 `b366b5a55ba65c91ff1b848bde8adc3e193d950dda5742d23968006acaf0819e`，保留 T0044 审计时 dirty `AGENTS.md` patch。
- 移动后复核发现归档项目当前 HEAD 为 `0e0bd4829ba27bed5e8a7b872cf36ff6d3ff14a3`（`wpls-20260720-05`），工作树干净；已额外生成当前状态 bundle：`/Users/huangbo/Dev/Archive/workpls-retirement-20260720/workpls-archive-current.bundle`，sha256 `6428005e9d223dfcdb628b9459704fe1cf4be334ad4304c5f316869bebbc667b`，`git bundle verify` 通过。

WorkPLS 当前未删除。若未来要彻底删除 Archive 中的 WorkPLS，也必须另行获得用户/总控明确授权。
