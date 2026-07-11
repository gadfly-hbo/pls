## What Changed

- 新增 `simulated_market_subagent` 持久化表，包含 workspace 隔离、enabled、sourceType/sourceRef、profile/persona、weight、created_at/updated_at。
- 新增 migration `V004_simulated_market_subagent.ts`，并同步更新 `schema.ts` 中的 `SIMULATED_MARKET_DDL`，`schema:check` 可通过。
- `ws_demo/db.sqlite` 已应用 V004 迁移（schema-only，`simulated_market_subagent` 表 0 行，无 business data mutation）。
- 扩展 `apps/server/src/services/simulated-market-adapter.ts`：
  - 新增 subagent CRUD 函数（`listSubagents`、`getSubagentById`、`createSubagent`、`updateSubagent`、`deleteSubagent`）。
  - 新增 `deriveSubagentFromChannelObject`，从当前 workspace 的 `channel_object_latest` + `audience_profile_latest` 派生 subagent；无可用画像时返回 `null`，不编造画像。
  - 新增 `buildAgentCandidates`，返回 `{ templates, subagents }`。
  - 新增 `toTargetUserAgent` 用于把持久化 subagent 转换为模型所需的 `TargetUserAgent`。
- 扩展 `apps/server/src/routes/simulated-market.ts`：
  - `GET /simulated-market/agent-templates`：返回 `{ agents: ABC模板[], subagents: 已启用subagent[] }`，保持 `agents` 向后兼容。
  - `GET /simulated-market/subagents`：支持 `?enabled=true|false`。
  - `GET /simulated-market/subagents/:agentId`
  - `POST /simulated-market/subagents`：接入 `idempotencyMiddleware()`，写入 `audit_event`。
  - `PATCH /simulated-market/subagents/:agentId`：使用 `handleIdempotentWrite` 提供完整幂等支持，只允许更新 `name`、`enabled`、`persona`、`profile`、`weight`。
  - `DELETE /simulated-market/subagents/:agentId`：使用 `handleIdempotentWrite` 提供完整幂等支持。
  - `POST /simulated-market/subagents/from-channel-object`：接入 `idempotencyMiddleware()`，写入 `audit_event`；无可用画像返回 `unprocessable` / 422。
  - `handleIdempotentWrite`：为 PATCH/DELETE 提供完整幂等实现，共享 `idempotency_key` 表，缓存 24 小时，命中时返回 `Idempotency-Replay: true`，不同请求体命中同一 key 返回 409 `conflict`。
  - `CREATE_SUBAGENT_SOURCE_TYPES`：创建 subagent 时仅允许 `saved_subagent`、`channel_audience_profile`、`manual_persona`，不允许 `three_audience_segment`（仅限 ABC 模板）。
- 扩展 `apps/server/scripts/smoke-simulated-market.mjs`：
  - Phase 6 覆盖 subagent CRUD、from-channel-object、enabled 过滤、workspace 隔离、idempotency replay（POST/PATCH/DELETE）、使用 saved subagent 运行模拟。
  - `seedChannelObjectAndAudienceProfile` 使用真实的 `target_object`（`{ type: "ChannelEntity", entityType: "account", ... }`）和 `entity_attributes`（`{ accountKind, contentFormats, ... }`）。
- 更新 `docs/api-contract.md` 与 `docs/prd-simulated-market.md`：明确新 endpoint、字段、派生规则、错误码、幂等语义、sourceType 限制和 Derived Result 边界。

## Files Changed

- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/V004_simulated_market_subagent.ts`
- `apps/server/src/services/simulated-market-adapter.ts`
- `apps/server/src/routes/simulated-market.ts`
- `apps/server/scripts/smoke-simulated-market.mjs`
- `docs/api-contract.md`
- `docs/prd-simulated-market.md`
- `data/workspaces/ws_demo/db.sqlite`（schema-only migration，controller 批准）

未触碰 allowed scope 外文件（除 ws_demo 由 controller 批准外）。

## API Contract

- 所有路径前缀 `/api/v0`。
- `GET /simulated-market/agent-templates` 返回 `{ agents: TargetUserAgent[], subagents: TargetUserAgent[] }`。
- `GET /simulated-market/subagents` 返回 `{ items: SimulatedMarketSubagent[] }`。
- `POST /simulated-market/subagents` 创建 subagent，默认 `sourceType=saved_subagent`；不允许 `three_audience_segment`。
- `PATCH /simulated-market/subagents/:agentId` 只允许更新 `name` / `enabled` / `persona` / `profile` / `weight`。
- `DELETE /simulated-market/subagents/:agentId` 删除当前 workspace 的 subagent。
- `POST /simulated-market/subagents/from-channel-object` 从 `channel_object_latest` + `audience_profile_latest` 派生；无画像返回 422 `unprocessable`。
- 所有写操作均支持 `Idempotency-Key` 头，共享 `idempotency_key` 表，缓存 24 小时。

## Validation

- `cd apps/server && npm run typecheck`：通过。
- `cd apps/server && npm run schema:check`：通过（ws_demo V004 applied，4 migrations）。
- `cd apps/server && npm run smoke:simulated-market`：通过，77 个断言全部通过，使用独立临时 workspace。
- `git diff --check`：通过，无空白/行尾问题。
- ws_demo schema-only 证明：`simulated_market_subagent` 0 rows，0 audit rows，仅 schema_migration V004 applied。

## Risks

- `handleIdempotentWrite` 为 PATCH/DELETE 提供完整幂等支持，但实现于路由层而非中间件层（因 `idempotency.ts` 不在 allowed scope）。如果未来其他 PATCH/DELETE 端点也需要幂等，应将此逻辑抽取为通用中间件。
- `from-channel-object` 派生 `profile` 的策略是保守的：取 `AudienceProfile.tags` 的 top 5 作为 `preferences`，全部 tagId 作为 `decisionFactors`，并加上“标签摘要”/“标签”前缀，避免声称真实个人偏好。该策略是否满足前端展示需要，需 controller/产品确认。
- 当前 worktree 在任务创建前已存在未提交改动（AGENTS.md、apps/model/、apps/server/scripts/provider 等），本次修改仅涉及 allowed scope + controller 批准的 ws_demo，未覆盖 pre-existing diff。
- `agent-templates` 响应从 `{ agents: [...] }` 扩展为 `{ agents, subagents }`。旧 smoke 已更新，但如外部客户端仍只读 `agents`，则不会感知 subagent 候选；这是预期的向后兼容行为。
- 临时 workspace 目录（`ws_sm_simulated_market_*`）在 smoke 运行后未清理，符合任务 brief “不清理临时 workspace 目录”的要求。

## Open Questions

- `from-channel-object` 的 `profile` 保守摘要策略（top 5 preferences + all tags as decisionFactors）是否需要在 UI 文案上额外标注“Derived Result / 保守摘要”？
- `agent-templates` 中 subagent 与模板合并为候选池的 UX 细节由 T0026 前端任务决定；本后端仅提供分离字段。

## Workspace / Smoke Isolation Notes

- 所有写型 smoke 使用独立临时 workspace `ws_sm_simulated_market_${timestamp}` 和 `ws_sm_simulated_market_${timestamp}_other_${timestamp}`，不依赖或破坏 `ws_demo`。
- Smoke 通过 `POST /admin/database/rebuild` 创建/重建临时 workspace，并通过 `seedChannelObjectAndAudienceProfile` 直接写入 SQLite 测试数据（使用真实 `target_object` 与 `entity_attributes` 形状）。
- `ws_demo/db.sqlite` 已应用 V004 迁移（schema-only，0 行 business data），controller 批准。

## Memory Used

- `agentops/memory/mimo-backend.md`：读取了 domain memory，确认 backend 域负责 API handler、service boundary、persistence、idempotency、workspace 隔离和错误处理。本任务遵循了“先读真实 route/schema/storage 再改行为”、“错误显式不吞异常”、“保留 API 兼容”、“考虑并发与重试”等规则。

## Whether Controller Review Is Needed

建议 controller review。本任务属于 `simulated-market-subagents-v1` 批次顺序 2，承接 T0024 的契约扩展，输出为 T0026 前端任务的后端输入。涉及 API 响应形态变更（`agent-templates` 新增 `subagents`）、`from-channel-object` 派生策略、PATCH/DELETE 幂等实现、sourceType 创建限制和 ws_demo schema evolution，需 controller 确认前后端衔接口径。
