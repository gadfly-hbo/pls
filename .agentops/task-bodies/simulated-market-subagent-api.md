## Objective

实现模拟市场 subagent 的后端持久化与 API，支持用户新增/管理 subagent，并支持从 PLS 渠道画像对象及其 `AudienceProfile` 派生 subagent，供模拟市场运行选择。

## Context

- 依赖契约任务 approved 后领取，必须以模型层已扩展的 `TargetUserAgent` sourceType/sourceRef 为准。
- 当前真实后端路由：
  - `GET /api/v0/simulated-market/agent-templates`
  - `POST /api/v0/simulated-market/runs`
  - `GET /api/v0/simulated-market/runs`
  - `GET /api/v0/simulated-market/runs/:runId`
- 当前渠道画像对象/API：
  - `GET /api/v0/channel-objects`
  - `GET /api/v0/channel-objects/:canonicalObjectKey/audience-profiles`
  - 真实表包括 `channel_object_latest` / `audience_profile_latest`。
- 本迭代要求“agent 与人群画像联动”，PLS 的联动对象应优先使用现有 `channel_object` / `audience_profile`，不得发明新画像来源。
- 写操作必须保留 workspace 隔离、审计和 idempotency 纪律；不得污染 `ws_demo` smoke，写型 smoke 必须使用独立临时 workspace。

## End-to-End API Expectation

所有路径均在 `/api/v0` 前缀下，统一返回 wrapper `{ code, requestId, generatedAt, data }`。

- `GET /simulated-market/subagents`
  - Headers: `Authorization: Bearer ...`, `X-PLS-Workspace`
  - Query: 可选 `enabled=true|false`
  - Response data: `{ items: SimulatedMarketSubagent[] }`
- `POST /simulated-market/subagents`
  - Headers: `Authorization`, `X-PLS-Workspace`, `Idempotency-Key`
  - Body: `{ name, enabled?, persona?, profile, sourceType?, sourceRef?, weight? }`
  - 默认 `sourceType` 为 `saved_subagent`
- `PATCH /simulated-market/subagents/:agentId`
  - Headers: `Authorization`, `X-PLS-Workspace`, `Idempotency-Key`
  - Body: 只允许更新 `name`、`enabled`、`persona`、`profile`、`weight`
- `DELETE /simulated-market/subagents/:agentId`
  - Headers: `Authorization`, `X-PLS-Workspace`, `Idempotency-Key`
  - 行为：删除当前 workspace 的 subagent；找不到返回 `not_found`
- `POST /simulated-market/subagents/from-channel-object`
  - Headers: `Authorization`, `X-PLS-Workspace`, `Idempotency-Key`
  - Body: `{ canonicalObjectKey, profileId?, name?, enabled? }`
  - 读取当前 workspace 的 `channel_object_latest` 与 `audience_profile_latest`。
  - 若没有 `AudienceProfile`，不得编造画像；返回明确错误或带 quality flag 的不可用结果，由实现根据现有错误模式选择，但必须在文档和 smoke 中固定。

`GET /simulated-market/agent-templates` 可扩展为返回默认 ABC + enabled subagents，或新增字段区分 templates/subagents；选择哪种方式必须在 `docs/api-contract.md` 写清楚，并保持前端可精确解包。

## Deliverables

- DB schema/migration：
  - 新增持久化表，例如 `simulated_market_subagent`。
  - 必须包含 workspace 隔离、enabled、sourceType/sourceRef、profile/persona、created_at/updated_at。
  - `apps/server/src/db/schema.ts` 与 migration 文件保持一致，`schema:check` 可通过。
- Routes/services：
  - 在 `apps/server/src/routes/simulated-market.ts` 或清晰拆分的同域 route/service 中实现上述 API。
  - 写操作接入 `idempotencyMiddleware()`；成功写入 audit_event。
  - 输入校验显式，不吞异常，不用 `any`。
  - 从 `AudienceProfile.tags` 派生 `TargetUserAgent.profile` 时，必须保留来源字段到 `sourceRef`，并将 tagId 作为偏好/决策因素的保守摘要；不得声称这些是真实个人偏好。
- Agent templates：
  - 保留 ABC 默认模板。
  - enabled subagents 必须能被前端作为 `TargetUserAgent` 候选，用于 `POST /runs`。
- Mock/fixtures 不是本任务重点；但后端 smoke 需要可自建临时 workspace 和测试数据。
- 文档：
  - 更新 `docs/api-contract.md` 的模拟市场 API 部分，明确新 endpoint、字段、错误、Derived Result 边界。
  - 如修改 PRD，只追加二期扩展口径，不删除一期历史结论。
- Smoke：
  - 扩展或新增 `apps/server/scripts/smoke-simulated-market.mjs` 用例。
  - 覆盖 CRUD、from-channel-object、enabled 过滤、workspace 隔离、idempotency replay、run 使用新 subagent。
  - 写型 smoke 必须使用独立临时 workspace，不依赖或破坏 `ws_demo`。

## Non-goals

- 不做前端 UI。
- 不安装依赖。
- 不直接调用 pi-xanthil，不改 pi-agent provider。
- 不修改正式模型 artifact、ModelEvol marker 或单品画像模型。
- 不自动从任意 DMP 明细/会员明细生成 agent；只支持用户显式创建或当前 workspace 已有 `AudienceProfile`。
- 不自动创建经营飞轮决策，不写真实销售事实/Fact Table。
- 不提交，不推送，不清理临时 workspace 目录。

## Allowed Scope

- `apps/server/src/routes/simulated-market.ts`
- `apps/server/src/services/simulated-market-adapter.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations`
- `apps/server/scripts/smoke-simulated-market.mjs`
- `apps/server/package.json`
- `docs/api-contract.md`
- `docs/prd-simulated-market.md`

如必须修改 `apps/model/src/simulated-market.ts`，说明契约任务缺口并停止回流，不要自行扩大范围。当前 worktree 已有未提交改动，worker 必须先读 `git status --short` 和相关 diff，避免覆盖他人改动。

## Validation Required

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run schema:check`
- `cd apps/server && npm run smoke:simulated-market`
- `git diff --check`

## Handoff Format

写 `handoff.md`，包含：

- What Changed
- Files Changed
- API Contract
- Validation
- Risks
- Open Questions
- Workspace / Smoke Isolation Notes
- Whether Controller Review Is Needed
