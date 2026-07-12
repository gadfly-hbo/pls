## 目标

对 `ws-demo-fixture-isolation` 批次做最终验收，确认后端写型隔离、前端 Playwright 产物隔离、统一 diff guard 三条防线都能工作，并更新本轮治理状态。

## 背景

本批次目标是彻底减少 PLS 产品迭代中反复出现的 `data/workspaces/ws_demo/db.sqlite` 污染问题。前置任务会分别修改后端脚本、前端测试配置和统一 guard。本任务负责验收闭环，不再新增大功能。

## 非目标

- 不新增产品功能。
- 不继续扩大隔离方案范围。
- 不提交 `ws_demo/db.sqlite`、Playwright report 或 test-results。
- 不替代 controller 最终 review。

## 允许改动范围

- `docs/notes-infra.md`
- `docs/notes-data.md`
- `docs/notes-viz.md`
- `docs/notes-backend.md`
- `apps/web/e2e/**/*.ts`
- `scripts/**/*.mjs`
- `package.json`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 必须实际运行统一 guard。
- 必须验证 `data/workspaces/ws_demo/db.sqlite` 不在 diff 中。
- 必须验证 `apps/web/playwright-report/index.html` 不在 diff 中。
- 如果某个 live backend 验证无法运行，必须明确说明原因，并使用 contract/interception 替代验证。
- 不得为了通过验收而删除或隐藏已有合法业务 diff。

## 验收标准

- 后端写型脚本默认不写 `ws_demo` 的口径有验证证据。
- 前端 Playwright 运行不再把 report 文件带入 diff。
- `npm run guard:worktree` 或等价 guard 命令通过。
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` 无输出。
- notes 中记录本轮治理已完成、剩余风险、后续如需将 tracked SQLite 改为生成物的建议。

## 验证命令

- `npm run guard:worktree`
- `cd apps/server && npm run smoke:channel-object-library`
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
- `git diff --check`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html`

## Handoff 格式

- Acceptance Scope
- What Changed
- Validation Results
- Remaining Risks
- Whether further architecture work is recommended
