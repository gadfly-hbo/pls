## What Changed

针对 T0023 controller review 的两条 bounded revision 要求：

1. **修正 `docs/api-contract.md` 中过时的 `marketContext` 示例**：
   - 将 `POST /simulated-market/runs` 请求示例中的 `channelEntityId` / `marketingEventId` / `businessScenarioId` 从旧占位符（`douyin:shop:semir_official`、`event_001`、`scenario_001`）更新为与对象库 2.0 / 前端选择器对齐的 canonicalObjectKey 示例：`account:mock_account_douyin_style`、`marketing_event:mock_event_618`、`business_scenario:new_product_launch:mock_style`。
   - 将错误响应示例中的 `channelEntityId` 也同步为 `account:mock_account_douyin_style`。

2. **修正 live smoke 命令示例的 env 变量位置**：
   - 将 `RUN_SIMULATED_MARKET_LIVE_LLM=1 MINIMAX_API_KEY=<key> cd apps/server && npm run smoke:simulated-market` 改为 `cd apps/server && RUN_SIMULATED_MARKET_LIVE_LLM=1 MINIMAX_API_KEY=<key> npm run smoke:simulated-market`，避免 zsh 中 env 只作用于 `cd` 而未传递给 `npm run`。
   - 同步修正 `handoff.md` 中对应的命令示例。

## Files Changed

- `docs/api-contract.md` （修改：marketContext 示例 + live smoke 命令）
- `.agentops/tasks/T0023-simulated-market-llm-acceptance-regression/handoff.md` （修改：live smoke 命令示例）

## Validation

- `cd apps/server && npm run typecheck`：通过。
- `cd apps/server && npm run schema:check`：通过（3 applied, 0 pending, 0 failed）。
- `cd apps/server && npm run smoke:simulated-market`：44/44 通过，Phase 5 live Minimax 跳过。
- `cd apps/web && npm run build`：通过。
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts`：2 passed，2 skipped。
- `git diff --check`：无空白字符或 EOF 问题。

## Risks

- 与 review 的修复范围一致，无额外功能风险。
- 当前 smoke 与 e2e 仍未用真实 Minimax key 跑过 Phase 5；正式启用前需要手动执行 live smoke 命令验证。

## Open Questions

- 无。

## Memory Candidates

- 文档中 shell 命令示例必须验证 env 变量位置是否作用于实际命令，特别是在 zsh 中 `ENV=val cd ... && npm run ...` 只会把 env 赋给 `cd`。
- canonicalObjectKey 示例必须随对象库 2.0 / 前端选择器同步更新，避免占位符 ID 误导下游用户。

## Memory Used

- 未引入新的 domain memory 条目；本次修订严格依据 controller `review.md` 的明确指向，未扩展范围。
