## 目标

执行 `portrait-comparison-v1` W09：WorkPLS 退役审计与删除 gate 准备。

本任务不是删除任务。WorkPLS 在本任务批准前保持只读归档；worker 不得删除、重命名、移动或清空 WorkPLS 文件。任务产出是审计证据、逐项 disposition、可恢复归档 bundle/checksum、PLS 集成复验记录，以及是否允许后续总控发起删除的 gate 判断。

## 上下文

- PLS 仓库：`/Users/huangbo/Dev/Projects/pls`
- WorkPLS 只读参考路径：优先使用 `/Users/huangbo/Dev/Projects/workpls`；如路径不存在，先在 handoff 中阻塞说明，不要猜测或扫描/修改无关目录。
- 批次：`portrait-comparison-v1`
- Sequence：9
- Depends on：T0043 / W08 approved
- 权威结构决定：`docs/portrait-comparison-structure-decision-ledger.md`
- 批次清单：`docs/workpls-absorption-retirement-checklist.md`
- 不读取、不修改 `docs/wiki.html`

## 必须先读的权威证据

PLS 内：

- `AGENTS.md`
- `docs/portrait-comparison-structure-decision-ledger.md`
- `docs/workpls-absorption-retirement-checklist.md`
- `docs/notes-backend.md`
- `docs/notes-model.md`
- `docs/notes-app.md`
- `.agentops/tasks/T0036-portrait-comparison-migration-runner-hardening/review.md`
- `.agentops/tasks/T0037-portrait-comparison-v005-persistence/review.md`
- `.agentops/tasks/T0038-portrait-comparison-algorithm-foundation/review.md`
- `.agentops/tasks/T0039-portrait-source-adapters/review.md`
- `.agentops/tasks/T0040-portrait-comparison-application-repository/review.md`
- `.agentops/tasks/T0041-portrait-comparison-http-contract/review.md`
- `.agentops/tasks/T0042-portrait-comparison-ui-readiness-history-detail/review.md`
- `.agentops/tasks/T0043-portrait-comparison-acceptance-real-contract-e2e/review.md`

WorkPLS 内（只读）：

- `AGENTS.md` 或等效项目规则（如存在）
- `README*`、`package.json`、`docs/**`、`apps/**`、`src/**`、`data/**` 中与 portrait/comparison/source/evidence/report/flywheel/decision 相关的文件
- `.git` 状态与 HEAD（如 WorkPLS 是 Git 仓库）

只读检查必须用 `rg` / `git -C` / `find` 等非写入命令；不要运行 WorkPLS 的 install、build、migrate、test 或 dev server，除非 handoff 先说明原因且不产生持久化副作用。

## 产出要求

在 PLS 中新增或更新审计文档，至少包含：

1. WorkPLS repo identity：
   - 绝对路径
   - 是否 Git 仓库
   - `git rev-parse HEAD`
   - `git status --short`
   - 是否存在 remote；没有 remote 时明确说明本地 bundle 是恢复依据
2. WorkPLS inventory：
   - 逐文件或逐目录 inventory，聚焦 PLS 已吸收能力相关路径
   - 每项标注 `migrated | intentionally_deferred | retained_reference | obsolete | unknown/blocker`
   - 每项给出 PLS 落位证据（Task ID、review、文件路径、contract/test）或延期依据
3. W01-W08 absorption audit：
   - 对照九项清单，确认每个已批准任务覆盖了哪些 WorkPLS 能力
   - 明确哪些能力没有迁移，不能静默遗漏
4. 延期与非迁移范围 disposition：
   - 正式 Dimension Evidence 新 schema、taxonomy、单位和数据管线
   - 基于真实样本发布的 quality policy 数值
   - AI explanation 的 `pi-agent` generator 与公共 HTTP 入口
   - Flywheel schema / `decision_record` 来源模型升级
   - WorkPLS fixture 或历史业务数据导入
   - AgentHarness source 配置 UI
5. PLS 集成复验：
   - 用已批准的 W01-W08 review 和当前可运行校验说明 PLS 侧能力状态
   - 不得仅口头宣称“已迁移”
6. 归档 bundle：
   - 如果 WorkPLS 是 Git 仓库，生成本地 bundle 到 `/tmp/workpls-retirement-t0044/workpls-retirement.bundle`
   - 记录 bundle 绝对路径、sha256、生成命令、WorkPLS HEAD、dirty state
   - 如果 WorkPLS 不是 Git 仓库或 bundle 失败，记录 blocker 和替代恢复建议；不要删除任何东西
7. 删除 gate：
   - 明确给出 `ready_for_delete: yes|no`
   - `yes` 必须满足：bundle/checksum 存在、dirty state 已解释、所有 inventory 项都有 disposition、所有延期项有恢复路径、PLS 复验通过、无 unknown/blocker
   - `no` 必须列出阻塞项和需要总控拍板的问题

## 允许范围

允许修改 PLS 仓库内：

- `docs/workpls-retirement-audit.md`
- `docs/workpls-retirement-disposition.md`
- `docs/workpls-retirement-runbook.md`
- `docs/workpls-absorption-retirement-checklist.md`
- `docs/notes-backend.md`

允许在 `/tmp/workpls-retirement-t0044/` 生成临时 bundle 和 checksum 文件。

不允许：

- 修改 WorkPLS 仓库任何文件
- 删除 WorkPLS 仓库或其中任何文件
- 修改 PLS 代码、DB schema、fixture DB、frontend、model、algorithm、Task Bus 已批准任务文件
- 修改 `docs/wiki.html`

## 建议执行顺序

1. 读取 PLS 规则、清单、结构决定和 W01-W08 review。
2. 只读确认 WorkPLS 路径、Git HEAD、dirty state、remote。
3. 只读 inventory WorkPLS 中与 portrait/comparison/source/evidence/report/flywheel/decision 相关路径。
4. 建立 disposition 表，逐项映射到 PLS 证据或延期/保留依据。
5. 生成 `/tmp` bundle 与 sha256；记录恢复命令。
6. 运行 PLS 复验命令和 worktree hygiene。
7. 更新审计文档、backend notes 和批次清单。W09 状态只能写成 `ready_for_review` / `handoff_pending_review`，不要提前写 completed；completed 由 controller approval 后更新。

## 验证

至少运行并在 handoff 中逐条记录 exit code：

- `git -C /Users/huangbo/Dev/Projects/workpls status --short`
- `git -C /Users/huangbo/Dev/Projects/workpls rev-parse HEAD`
- `git -C /Users/huangbo/Dev/Projects/workpls remote -v`
- `mkdir -p /tmp/workpls-retirement-t0044`
- `git -C /Users/huangbo/Dev/Projects/workpls bundle create /tmp/workpls-retirement-t0044/workpls-retirement.bundle --all`
- `shasum -a 256 /tmp/workpls-retirement-t0044/workpls-retirement.bundle`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`

如 WorkPLS 路径不存在或不是 Git 仓库，前三条可用失败证据替代，但 handoff 必须标记 blocker，不得声称 deletion-ready。

## Handoff

先执行 `/agentops-handoff-self-audit`，再执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed
- WorkPLS identity：path、HEAD、dirty state、remote
- Bundle evidence：path、sha256、恢复命令；或 blocker
- Disposition summary：按状态计数
- Detailed disposition table：WorkPLS path、status、PLS evidence、decision rationale
- Deferred/non-migrated items：恢复入口和后续任务建议
- PLS integration revalidation：命令、exit code、关键 evidence
- Delete gate：`ready_for_delete: yes|no` 和理由
- Protected paths cleanup
- Risks / Open Questions
- Memory Used / Memory Candidates

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。
