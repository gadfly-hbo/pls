# T0034 Handoff: ws-demo diff guard tooling

## What Changed

- 新增统一工作树 diff guard 脚本 `scripts/check-worktree-guard.mjs`：
  - 基于真实的 `git diff --name-only`、`git diff --cached --name-only` 和 `git ls-files --others --exclude-standard` 检查当前工作树。
  - 默认禁止以下生成产物/tracked fixture 出现在 diff 中：
    - `data/workspaces/ws_demo/db.sqlite`
    - `apps/web/playwright-report/index.html`
    - `apps/web/test-results/`
  - 命中时输出受污染路径和恢复建议（`git checkout HEAD -- <path>` / `rm -rf <path>`）。
  - 提供 controller-only 绕过开关 `PLS_ALLOW_DIRTY_WORKTREE=1`。
  - 支持自定义禁止模式：`PLS_WORKTREE_GUARD_FORBIDDEN=path1:path2/`。
- 新增根 `package.json` 并暴露 `npm run guard:worktree` 命令。
- 更新 `docs/notes-infra.md`：在 `## 0. 当前状态` 记录 T0034 完成，新增 `## 工作树 diff guard（T0034）` 说明命令、脚本、禁止列表、检查来源和绕过方式。
- 更新 `AGENTS.md`：在 "2.x Smoke 测试的 workspace 隔离" 第 8 条中明确要求产品迭代 handoff 前必须运行 `npm run guard:worktree`。

## Files Changed

- `scripts/check-worktree-guard.mjs` (new)
- `package.json` (new)
- `docs/notes-infra.md`
- `AGENTS.md`

## Guard behavior

- 当禁止文件未出现在 diff 时，guard 退出码为 0，输出 `OK: no forbidden generated artifacts in worktree diff.`。
- 当禁止文件出现在 diff 时，guard 退出码为 1，列出命中路径和匹配模式，并给出恢复建议。
- 当 `PLS_ALLOW_DIRTY_WORKTREE=1` 时，即使检测到禁止文件也会输出警告并退出 0，供 controller 在特殊情况下手动放行。
- 只检查禁止列表中的文件；其他业务 diff（如 T0028-T0031 的已批准文件）不会导致 guard 失败。

## Validation

- `npm run guard:worktree` — 通过，当前工作树无禁止生成产物。
- `git diff --check` — 通过。
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` — 无输出。
- 模拟 dirty 测试：
  - 创建 `apps/web/test-results/test-dirty.json` 后运行 `npm run guard:worktree`，正确输出 FAIL 并退出码 1。
  - 设置 `PLS_ALLOW_DIRTY_WORKTREE=1` 后运行，正确输出 WARN 并退出码 0。
  - 清理测试文件后恢复 clean 状态。
- 自定义模式测试：`PLS_WORKTREE_GUARD_FORBIDDEN=package.json node scripts/check-worktree-guard.mjs` 能命中 `package.json`（恢复后不再命中）。
- 当前 `ws_demo/db.sqlite` 干净：`git diff --quiet -- data/workspaces/ws_demo/db.sqlite` 返回 0。

## Risks

- 根 `package.json` 是新文件；如果项目后续引入 workspace 管理（如 pnpm workspaces），该文件需要同步调整。当前保持最小化，仅含 `guard:worktree` 脚本。
- 禁止列表是硬编码的默认值；未来新增需要拦截的生成产物时，必须同步修改 `scripts/check-worktree-guard.mjs` 中的 `DEFAULT_FORBIDDEN`，或让调用方通过 `PLS_WORKTREE_GUARD_FORBIDDEN` 覆盖。
- `PLS_ALLOW_DIRTY_WORKTREE=1` 是 controller-only 绕过开关；worker 不应在 handoff 中默认使用。
- guard 只检查 diff，不检查文件系统 mtime 或大小；如果生成产物被 `git add` 到暂存区但仍未提交，也会被检测到。
- 如果某个生成产物已经在 `HEAD` 中被跟踪（例如 `apps/web/test-results/.last-run.json`），guard 不会报错，因为它不在 diff 中；删除该文件才会触发 diff。

## Open Questions

- 是否需要把 `guard:worktree` 作为 pre-handoff 钩子自动注入 Task Bus handoff 流程？当前只在 AGENTS.md 和 notes-infra.md 中要求手动运行。
- 是否需要扩展禁止列表到 `data/local/tool-runs/` 或 `data/workspaces/` 下其他临时 workspace 目录？当前只拦截 `ws_demo/db.sqlite` 和 Playwright 产物。
- 根 `package.json` 是否需要补充 `workspaces` 字段以支持 `npm run --workspace` 调用 apps 下的脚本？当前任务范围不需要。

## Memory Candidates

- 产品迭代 handoff 前必须运行 `npm run guard:worktree` 来拦截 `ws_demo/db.sqlite`、Playwright report 等生成产物；`git diff --check` 和 `git diff --name-only` 不足以保证 binary 生成产物未进入 diff。
- 新增仓库级 npm 脚本时，如果根目录没有 `package.json`，可以直接创建最小化根 `package.json`；但需评估后续 workspace 管理兼容性。
- controller-only 绕过开关必须显式命名（如 `PLS_ALLOW_DIRTY_WORKTREE`），默认关闭，并在日志中输出警告。

## Memory Used

- 未直接引用 `agentops/memory/mimo-backend.md` 中的具体条目；本任务主要是脚本/文档/流程治理，不涉及 backend handler 或 API 契约修改。domain memory 的通用工作规则（显式错误、不吞异常、最小改动）已遵循。
