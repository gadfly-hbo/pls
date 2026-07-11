# learning_proposal.md

## Learned Lesson

在文档或 handoff 中记录 shell 命令时，环境变量必须放在实际要执行命令之前（或先 `export`），不能放在 `cd ... &&` 之前，否则可能只作用于 `cd` 而没传给目标命令。

## Evidence

- T0023 controller review 发现：`RUN_SIMULATED_MARKET_LIVE_LLM=1 MINIMAX_API_KEY=<key> cd apps/server && npm run smoke:simulated-market` 在 zsh 中只把 env 赋给 `cd`，`npm run` 未收到 `RUN_SIMULATED_MARKET_LIVE_LLM` 和 `MINIMAX_API_KEY`，导致 Phase 5 未真正启用。修正为 `cd apps/server && RUN_SIMULATED_MARKET_LIVE_LLM=1 MINIMAX_API_KEY=<key> npm run smoke:simulated-market`。
- 来源：`/Users/huangbo/Dev/Projects/pls/.agentops/tasks/T0023-simulated-market-llm-acceptance-regression/review.md` 与本次修订实践。

## Classification

Rule

## Target File

`/Users/huangbo/.config/mimocode/AGENTS.md`（全局 agent 规则，适用于所有使用 MimoCode 的 session）

## Proposed Change

在 `~/.config/mimocode/AGENTS.md` 的「代码规范」或「操作安全」章节新增一条：

```md
- 在文档、handoff 或脚本中记录 shell 命令时，若命令通过 `cd ... && npm run ...` 串联，环境变量应放在 `&&` 之后的目标命令前，或先 `export` 再执行。禁止写成 `ENV=val cd dir && npm run ...`，因为在 zsh 中 env 只会赋给 `cd` 而不被 `npm run` 继承。
```

## Scope

Global AgentOps rule（所有 MimoCode session 生效）。

## Risks

- 在 bash 中 `ENV=val cd dir && npm run ...` 可能确实会继承，但依赖 shell 版本/实现差异。规则采用更保守的写法，无向后兼容风险，反而避免跨 shell 歧义。
- 可能让已有文档中的类似命令被判定为不规范，但属于正确的约束收紧。

## Approval Needed

请回复「确认」以应用此规则到 `/Users/huangbo/.config/mimocode/AGENTS.md`；如需修改提案，请直接说明。
