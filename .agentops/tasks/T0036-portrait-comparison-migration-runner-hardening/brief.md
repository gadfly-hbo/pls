---
id: "T0036"
slug: "portrait-comparison-migration-runner-hardening"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "098e538ba8bd7ebc93bddbf4f0e8c95ff9dac945"
batch: "portrait-comparison-v1"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/src/db/migration-runner.ts"
  - "apps/server/src/db/migration-backup.ts"
  - "apps/server/src/db/migration-runner-contract-test.ts"
  - "apps/server/package.json"
  - "docs/notes-infra.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run migration-runner:contract-test"
  - "cd apps/server && npm run schema:check"
  - "npm run guard:worktree"
  - "git diff --check"
---

## 目标

在 PLS 现有 versioned migration 基础上迁移 WorkPLS 已验证的可靠性机制，为后续 `V005_portrait_comparison` 提供安全前置：

1. 对已应用 migration 重新校验 version、name 和 checksum，发现漂移时 fail closed。
2. checksum 改为完整 SHA-256 64 位小写 hex。
3. 兼容已有 16 位 checksum：只有与当前完整摘要前 16 位一致时才允许一次性升级，并写最小 audit；不一致时拒绝。
4. 每个 migration 在事务内执行，失败不得留下部分 schema。
5. migration 后执行 `foreign_key_check` 与 `quick_check`。
6. 拒绝数据库中高于当前代码 registry 的未知 migration version。
7. 升级前 checkpoint WAL，并在 workspace 的 `.migration-backups/` 创建 owner-only 备份；失败恢复；正式备份不自动清理。

权威结构决定：`docs/portrait-comparison-structure-decision-ledger.md` S051-S055、S077。

## 非目标

- 不创建 `V005_portrait_comparison`。
- 不新增或修改 Comparison 表、API、算法、PortraitSource 或前端。
- 不修改 V001-V004 的既有 migration 内容。
- 不整体替换为 WorkPLS 独立 DB bootstrap。
- 不修改 `ws_demo` fixture 数据或 schema。
- 不安装新依赖，不提交或推送代码。

## 允许范围

- `apps/server/src/db/migration-runner.ts`
- `apps/server/src/db/migration-backup.ts`（确有必要时新建）
- `apps/server/src/db/migration-runner-contract-test.ts`（新建）
- `apps/server/package.json`（仅增加定向测试 script）
- `docs/notes-infra.md`（仅更新 `## 0. 当前状态` 或本任务验证事实）

超出以上路径必须停止并提交 contract change request，不得顺手修改 `schema.ts`、`migrate.ts`、现有 migration 或 fixture DB。

## 约束

- 先读 PLS `AGENTS.md`、`docs/portrait-comparison-structure-decision-ledger.md`、`docs/notes-infra.md`、现有 runner，以及 WorkPLS migration runner/tests 作为只读证据。
- 旧 16 位 checksum 只能在前缀严格匹配时升级；禁止无条件覆盖。
- 新 migration 从首次应用起只写 64 位 checksum。
- 不得依赖 `catch` 吞掉 migration 或校验错误。
- backup 路径必须从真实数据库路径安全推导，拒绝 symlink/path escape；权限仅当前系统用户。
- 测试使用 `/tmp` 或临时 workspace，覆盖 fresh、repeat、checksum/name drift、未知高版本、事务回滚、检查失败、旧 checksum 升级、备份恢复。
- 如现有 `db_admin_audit` 在某个 bootstrap 阶段不可用，必须显式设计并测试时序，不能静默丢失已批准的 audit 语义。
- 不运行会写入 `data/workspaces/ws_demo/db.sqlite` 的命令。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run migration-runner:contract-test`
- `cd apps/server && npm run schema:check`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

## Handoff

使用 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed
- Files Changed
- Validation（逐条命令与结果）
- Risks
- Open Questions
- Contract Drift（无则明确写“无”）
- `ws_demo` 与生成产物清理复核结果

如果实现发现必须修改 schema、V001-V004、`migrate.ts` 或其他未授权路径，停止并在 Open Questions 中说明 blocker，不扩张范围。

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：1
- 依赖：无
