# Handoff — T0017 Simulated Market Decision Provenance API (Revision)

## What Changed

针对 review 反馈完成以下修订：

1. 修复 `sourceRef` fallback 逻辑：原代码 `const sourceRef = body.sourceRef ?? {}` 导致 sourceRef 永远非 undefined，无法回退到 `simulation_run.inputSnapshot.sourceRef`。改为保留 `body.sourceRef` 的 undefined/null 状态，仅在未提供时回退到 run 的 `inputSnapshot.sourceRef`，最终缺省为 `{}`。
2. 新增 smoke 断言：模拟运行 body 带 `sourceRef`，创建决策时不传 `sourceRef`，验证详情/列表均返回 run 的原始 `sourceRef`；同时验证显式传入 `sourceRef` 可覆盖 run 默认值。
3. 对齐文档：`docs/api-contract.md` 中关于 `matchId` / `simulationRunId` 的描述改为“建议至少提供其一，但 API 不强制互斥，保持旧路径兼容”。

## Files Changed

- `apps/server/src/routes/flywheel.ts` — 修复 sourceRef 默认值处理。
- `apps/server/scripts/smoke-simulated-market-decision.mjs` — 补充 sourceRef fallback 与覆盖断言。
- `docs/api-contract.md` — 调整 matchId / simulationRunId 可选性说明。

## Validation

| 命令 | 结果 |
|---|---|
| `cd apps/server && npm run typecheck` | 通过 |
| `cd apps/server && npm run schema:check` | Valid: true |
| `cd apps/server && npm run smoke:simulated-market-decision` | 27/27 passed |
| `cd apps/server && npm run smoke:simulated-market` | 26/26 passed（回归） |
| `cd apps/server && npm run smoke:p2-api` | All checks passed（回归） |

## Risks

- 同初版：旧 workspace 未跑 `npm run migrate` 会出现列缺失错误；`schema-check.ts` 不校验列。
- `sourceRef` 仍保持松散 JSON 透传，未强制 schema，前端消费时需注意字段形态。

## Open Questions

- 是否需要 `schema-check.ts` 升级为列级别校验，避免类似旧库列缺失的回归？
- `sourceRef` 的 schema 是否需要在后端做更严格校验（如必须包含 `id` / `type`），还是保持松散的 JSON 透传？

## Contract Notes

- `POST /operations/decisions` 新增可选字段：`simulationRunId`、`sourceType`、`sourceRef`、`simulationSummary`。
- `sourceType` 枚举：`product_channel_match` / `single_product_portrait` / `campaign_product_strategy` / `manual_strategy`。
- 未提供 `sourceRef` 且携带 `simulationRunId` 时，自动回退到 `simulation_run.inputSnapshot.sourceRef`。
- 未提供 `simulationSummary` 且携带 `simulationRunId` 时，自动从 `simulation_run.result.overall` 提取摘要。
- 跨 workspace 引用 `simulation_run` 返回 `not_found`（HTTP 404，code `not_found`）。
- `POST /simulated-market/runs` 不自动写入 `decision_record`。
- `matchId` 与 `simulationRunId` 建议至少提供其一，但 API 不强制，保持旧路径兼容。

## Memory Candidates

- 后端 schema 变更需同时更新 `schema.ts` + `migrate.ts` 的 ALTER TABLE 兼容路径，否则旧 workspace 运行时会出现列缺失错误。
- `schema-check.ts` 只检查表/视图存在性，不检查列；重大 schema 变更后应主动跑 `npm run migrate` 再验证回归 smoke。
- 默认值/回退逻辑中，不能把 `body.field ?? {}` 提前固化，否则会阻止后续从其他来源（如关联表）回退。应保留 undefined 直到最终 fallback 解析点。
