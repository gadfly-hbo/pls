---
id: "T0041"
slug: "portrait-comparison-http-contract"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "098e538ba8bd7ebc93bddbf4f0e8c95ff9dac945"
batch: "portrait-comparison-v1"
sequence: "6"
depends_on: 
  - "T0040"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/src/routes/portrait-comparisons.ts"
  - "apps/server/src/index.ts"
  - "apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts"
  - "apps/server/src/portrait-comparison/index.ts"
  - "apps/server/package.json"
  - "docs/notes-backend.md"
  - "docs/workpls-absorption-retirement-checklist.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run portrait-comparison-http:contract-test"
  - "cd apps/server && npm run portrait-comparison-application:contract-test"
  - "cd apps/server && npm run portrait-source:contract-test"
  - "cd apps/server && npm run portrait-comparison-algorithm:contract-test"
  - "cd apps/server && npm run portrait-comparison-schema:contract-test"
  - "npm run guard:worktree"
  - "git diff --check"
  - "git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
  - "git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
---

## 目标

在 T0040 已批准的 Portrait Comparison application/repository 之上，新增 PLS HTTP transport：

1. 注册 `/api/v0/portrait-comparisons` route。
2. 提供 readiness、gated create、list、detail、archive/restore HTTP endpoints。
3. 用真实 Hono app / middleware / response envelope 做 HTTP contract tests，证明 headers、body、错误码、workspace 隔离、idempotency 与 production `not_released` gate 均与 application contract 对齐。

前置任务 T0040 已 approved。必须先读取真实证据，不得只依赖本文摘要：

- `.agentops/tasks/T0040-portrait-comparison-application-repository/brief.md`、`handoff.md`、`review.md`。
- `apps/server/src/index.ts` route 注册方式。
- `apps/server/src/lib/response.ts` response envelope 与 error helpers。
- `apps/server/src/middleware/auth.ts`、`workspace.ts`、`request-id.ts`。
- `apps/server/src/portrait-comparison/application/` public exports、DTO 和 errors。
- `apps/server/src/portrait-comparison/portrait-comparison-application-contract-test.ts` 现有 success/failure fixture 方式。

## 非目标

- 不修改 V005 schema/migration/index/Admin protection。
- 不修改 algorithm、quality policy 数值、source adapter、rule summary、application 核心 transaction 语义。
- 不发布 production candidate dimensions、normalization、weight、coverage threshold；当前 formal create 必须继续被 `not_released` gate 拦截，Comparison 八表写入为 0。
- 不实现 AI explanation、`pi-agent`、Flywheel 集成、UI 或 Playwright E2E。
- 不修改通用 auth/workspace/request-id/response envelope/idempotency middleware 的全局 contract；如现有 helper 不足，先在 route 内做窄映射，必要时提交 `CONTRACT_CHANGE_REQUEST`。
- 不读取、复制、写入 `ws_demo` fixture DB；HTTP contract tests 使用临时 SQLite workspace。

## HTTP Contract

所有 endpoints 都挂载在 `/api/v0/portrait-comparisons`，使用现有 API middleware：

- `Authorization: Bearer pls-p0-demo-token`
- `X-PLS-Workspace: <workspace_id>`
- `X-PLS-Request-Id` 可选，用于 envelope `requestId`
- 写型正式执行必须要求 `Idempotency-Key`

请求/响应矩阵：

| Method | Path | Body / Query | 结果 |
| --- | --- | --- | --- |
| GET | `/readiness` | none | `ok({ status, contractVersion, productionPolicyStatus, capabilities, blockers })`；当前 status 必须表达未发布/不可正式创建，不得让前端误判可创建 |
| POST | `/` | `{ mode, baseline, comparison }`，只接收 application create input 所需字段 | 调用 production application；当前因 `not_released` 返回受控 422/424 类错误，八表写入 0；不得通过 body/env 打开 internal released fixture |
| GET | `/` | `limit`, cursor fields, `archiveFilter=active|archived|all` | 调用 list；返回 `{ items, page }` 或与现有 `ListResponse` 同构结构；默认隐藏 archived |
| GET | `/:runId` | none | 调用 detail；found 返回 detail DTO；not found 与 cross-workspace 使用同一受控 404，不泄露存在性 |
| POST | `/:runId/archive` | `{ operation: "archived"|"restored", expectedCurrentState, expectedSequence, reason? }` + `Idempotency-Key` | 调用 archive；replay/conflict/concurrency 错误映射为稳定 HTTP code/status |

Body 纪律：

- `trustedActor` 由 HTTP boundary 生成或从已认证上下文注入，不允许从 request body 获取。
- `idempotencyKey` 来自 `Idempotency-Key` header，不允许 body 重复注入。
- 不允许派生字段由 body 注入：score、coverage、quality、algorithm/contract checksum、source facts、evidence、actor、runId、createdAt。
- `runId` 来自 path param；body 不得重复 `runId`。
- 外部 object/snapshot ID 必须原样透传给 application，不 trim、不大小写改写。
- 错误响应不得包含 SQLite/source/provider 原文、stack、SQL、DB path、rowid、request fingerprint 或 idempotency internal fields。

错误映射建议：

- `ComparisonValidationError` → `invalid_input` / 400，field 尽量指向 application issue path。
- `ComparisonQualityGateError` → `dependency_failed` / 424 或明确的 unavailable code；必须可被前端识别为 production not released。
- `ComparisonIdempotencyConflictError`、`ComparisonConcurrencyConflictError` → `conflict` / 409。
- `ComparisonNotFoundError` 或 null detail → `not_found` / 404。
- `ComparisonSourceError` → `dependency_failed` / 424。
- `ComparisonStateError` → `internal_error` / 500，但 message 必须脱敏且稳定。

## 允许范围

- `apps/server/src/routes/portrait-comparisons.ts`
- `apps/server/src/index.ts`（仅注册 route）
- `apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts`
- `apps/server/src/portrait-comparison/index.ts`（仅补足 production public exports；不得导出 test fixtures 或 released fake policy）
- `apps/server/package.json`（仅新增定向 HTTP contract-test script）
- `docs/notes-backend.md`（仅更新 `## 0. 当前状态` 与 W06 验证事实）
- `docs/workpls-absorption-retirement-checklist.md`（handoff 前仅更新 W06 执行事实；completed 由总控 review 后写）

如需修改 application/repository 核心语义、schema/migration、middleware global behavior、shared response envelope、idempotency cache 或 Admin 保护，必须停止并提交 `CONTRACT_CHANGE_REQUEST`。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run portrait-comparison-http:contract-test`
- `cd apps/server && npm run portrait-comparison-application:contract-test`
- `cd apps/server && npm run portrait-source:contract-test`
- `cd apps/server && npm run portrait-comparison-algorithm:contract-test`
- `cd apps/server && npm run portrait-comparison-schema:contract-test`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

HTTP contract tests 至少覆盖：

- auth/workspace headers 缺失或错误时走现有 middleware contract。
- readiness 当前明确返回 production `not_released` / create unavailable，不冒充可创建。
- formal POST `/` 缺 `Idempotency-Key` 被拒绝；带 key 但当前 not_released 时受控失败，Comparison 八表写入 0。
- POST body 中包含 `trustedActor`、`idempotencyKey`、`runId`、score/coverage/contract checksum 等派生字段时被拒绝或忽略，测试必须证明不会写入或影响 application input。
- list query 参数映射到 application list：limit、cursor、archiveFilter；invalid query 返回 400。
- detail not found 和 cross-workspace 返回同一 404 envelope。
- archive endpoint 要求 `Idempotency-Key`，合法 request 映射 operation/expected state/sequence/reason，stale expected 返回 409；cross-workspace 返回 404。
- HTTP response envelope 精确为 `{ code, requestId, generatedAt, data|error }`，成功 data 层级不得自造 `.items` 外层漂移。
- 错误响应不泄露 SQLite/source/provider 原文、SQL、DB path、stack、request fingerprint 或 idempotency internals。
- Tests 使用临时 DB / workspace，不依赖 `ws_demo` 任何业务行。

## Handoff

先执行 `/agentops-handoff-self-audit`，再执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed。
- HTTP request matrix：method、exact path、headers、body/query、application method、success/error envelope。
- Error taxonomy mapping 与脱敏证据。
- Validation：逐条命令、exit code、测试数量、关键 not_released gate / idempotency / workspace isolation / archive conflict 证据。
- 明确证明 production policy 仍 `not_released`、formal create 零 Comparison 写入、无 schema/algorithm/source/AI/Flywheel/UI 变更。
- Contract Drift / Protected paths cleanup / Risks / Open Questions。
- Memory Used / Memory Candidates。
- 建议下一任务 W07：React 三步 readiness、历史与详情 UI；不得伪造正式 Run 可用状态。

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：6
- 依赖：T0040
- 只有依赖任务全部 approved 后才可领取。

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：6
- 依赖：T0040
- 只有依赖任务全部 approved 后才可领取。
