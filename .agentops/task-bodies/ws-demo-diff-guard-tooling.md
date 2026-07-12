## 目标

新增一个统一的 diff guard，让 controller、worker、smoke wrapper 在提交 handoff 前能自动发现 `ws_demo/db.sqlite` 和 Playwright report 这类禁止进入产品迭代 diff 的文件。

## 背景

即使后端和前端分别做了隔离，仍需要一个统一、低成本、可复用的验收命令，避免每次 review 靠人工检查 `git status`。本任务负责把“禁止污染 tracked fixture / generated artifact”的规则落成脚本和 package command。

## 非目标

- 不修改产品功能。
- 不重构 Task Bus 本身。
- 不修改 `.gitignore`。
- 不删除或重建 `ws_demo` fixture DB。

## 允许改动范围

- `scripts/**/*.mjs`
- `package.json`
- `apps/server/package.json`
- `apps/web/package.json`
- `docs/notes-infra.md`
- `docs/notes-data.md`
- `docs/notes-viz.md`
- `AGENTS.md`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- guard 必须基于真实 `git diff --name-only` / `git status --short`，不能只检查文件时间戳。
- 默认禁止以下文件出现在 diff 中：
  - `data/workspaces/ws_demo/db.sqlite`
  - `apps/web/playwright-report/index.html`
  - `apps/web/test-results/` 下生成产物（如适用）
- 输出必须清楚说明如何恢复或下一步怎么处理。
- guard 不能破坏已有合法业务 diff；只对禁止文件失败。
- 如果需要允许 controller override，必须明确命名环境变量，默认不开启。

## 建议实现方向

- 新增脚本，例如 `scripts/check-generated-diff.mjs` 或 `scripts/check-worktree-guard.mjs`。
- 顶层 `package.json` 增加命令，例如 `npm run guard:worktree`。
- 必要时在 server/web validation 文档中要求 handoff 前运行该 guard。
- 更新 `AGENTS.md` 或 notes，说明 PLS 产品迭代 handoff 前必须运行该 guard。

## 验收标准

- 当禁止文件未出现在 diff 时，guard 退出码为 0。
- 当模拟禁止文件出现在 diff 时，guard 能以非 0 退出并输出文件名和恢复建议；如不能做破坏性模拟，在 handoff 中说明未模拟原因。
- T0028-T0031 当前已批准业务 diff 不会导致 guard 失败。

## 验证命令

- `npm run guard:worktree`
- `git diff --check`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html`

## Handoff 格式

- What Changed
- Files Changed
- Guard behavior
- Validation
- Risks
- Open Questions
