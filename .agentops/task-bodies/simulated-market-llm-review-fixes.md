## Objective

修复外部 review 指出的两个 P2 阻断问题，收口模拟市场 LLM provider / smoke 隔离契约：

1. `SIMULATED_MARKET_LLM_TIMEOUT_MS` 必须真实控制 pi-agent 调用超时，不得被静默抬高到 120000ms。
2. `data/workspaces/ws_demo/db.sqlite` 不得包含本地 simulated-market smoke 生成的数据 diff；默认 smoke 必须只写独立临时 workspace。

## Context

- 外部 review finding：
  - `apps/server/src/services/simulated-market-provider.ts` 当前使用 `Math.max(config.timeoutMs, 120000)`，使未设置或设置为默认 `30000` 时实际等待 120s，违背 `docs/api-contract.md` 与 parser 默认值。
  - `data/workspaces/ws_demo/db.sqlite` 当前含本地 smoke 产生的 `simulation_run`、`idempotency_key`、`audit_event` 行变更，违背 smoke 声明“isolated temporary workspaces only / does not touch ws_demo”。
- 原归属任务 `T0021-simulated-market-minimax-provider-api` 已是 `approved`，Task Bus helper 不允许重新 review approved task，因此用本 follow-up 修复任务承接 bounded revision。
- 当前 worktree 还有其他未提交改动；worker 必须只处理本 brief 指定问题，不覆盖用户或其他 agent 的无关改动。

## Deliverables

- Timeout 修复：
  - 移除 `Math.max(config.timeoutMs, 120000)` 或等价静默下限。
  - `runPiPrompt()` 必须使用 `parseTimeoutMs()` 得到的配置值。
  - 保持非法/空/非正整数 timeout 回退到 `30000`。
  - 如需要保留 live LLM 手动长超时能力，必须通过用户显式设置更大的 `SIMULATED_MARKET_LLM_TIMEOUT_MS` 实现，不得代码强制抬高。
- Smoke / 数据隔离修复：
  - 确认 `apps/server/scripts/smoke-simulated-market.mjs` 默认运行不读写 `ws_demo`。
  - 移除当前 `data/workspaces/ws_demo/db.sqlite` 中由 simulated-market smoke 造成的生成型 diff，使该文件不再出现在本轮实现 diff 中。
  - 不得删除、重建或清理无关临时 workspace 目录。
  - 若无法安全判断 `ws_demo` diff 是否全是生成数据，停止并在 handoff 说明 blocker，不要擅自覆盖。
- 文档：
  - 如文档已写默认 `30000`，保持一致；如发现手动 live smoke 需要更长 timeout，只能说明用户可显式设置 env。
- 验证：
  - 后端 typecheck/schema/smoke 通过。
  - `git diff --check` 通过。
  - `git status --short` 中不应再出现 `data/workspaces/ws_demo/db.sqlite`，除非 handoff 明确说明 blocker。

## Non-goals

- 不新增 subagent 功能。
- 不改前端 UI。
- 不修改模型算法。
- 不安装依赖。
- 不提交，不推送。
- 不清理临时 workspace 目录。
- 不重构 provider 结构，只做 bounded fix。

## Allowed Scope

- `apps/server/src/services/simulated-market-provider.ts`
- `apps/server/scripts/smoke-simulated-market.mjs`
- `docs/api-contract.md`
- `docs/prd-simulated-market.md`
- `data/workspaces/ws_demo/db.sqlite`（仅允许移除本地 smoke 生成型 diff；不得加入新数据）

当前 worktree 已有未提交改动，worker 必须先读 `git status --short`、`git diff -- apps/server/src/services/simulated-market-provider.ts apps/server/scripts/smoke-simulated-market.mjs docs/api-contract.md docs/prd-simulated-market.md`，并用 SQLite 查询或等价方式确认 `ws_demo` diff 性质后再处理 DB 文件。

## Validation Required

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- `cd apps/server && npm run smoke:simulated-market`
- `git diff --check`

## Handoff Format

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Review Findings Addressed
- Risks
- Open Questions
- ws_demo Handling Notes
- Whether Controller Review Is Needed
