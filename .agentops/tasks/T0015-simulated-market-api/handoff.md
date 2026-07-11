# Handoff: T0015-simulated-market-api (Revision 1)

## What Changed

在 `apps/server` 中实现了模拟市场一期 API、落库保存与 smoke，并针对 review 反馈做了修订：

- 新增 `simulation_run` 表与 versioned migration `V003_simulated_market_run`，用于保存 `SimulationRun` Derived Result。
- 新增 `apps/server/src/services/simulated-market-adapter.ts`，作为后端调用 `apps/model` 模拟市场 contract 的 adapter。
- 新增 `apps/server/src/routes/simulated-market.ts`，实现：
  - `GET /api/v0/simulated-market/agent-templates`
  - `POST /api/v0/simulated-market/runs`（支持 `Idempotency-Key`，落库，写 audit）
  - `GET /api/v0/simulated-market/runs`
  - `GET /api/v0/simulated-market/runs/:runId`
- 响应使用 PLS 统一 wrapper `{ code, requestId, generatedAt, data }`。
- 在主路由 `index.ts` 注册 `/api/v0/simulated-market`。
- 新增 `npm run smoke:simulated-market` 与对应脚本，覆盖 agent templates、run 创建、列表、详情、workspace 隔离、错误输入、idempotency replay、auth/workspace header 校验。
- 更新 `docs/api-contract.md` §13 模拟市场 API 章节。

**Review 修订内容：**

- Smoke 脚本从「基于 `ws_demo` + 文件复制」改为「通过 Admin API `POST /admin/database/rebuild` 创建独立临时 workspace」，不再触碰 `ws_demo`；脚本注释中显式声明 workspace 假设与隔离口径。
- 已回退对 `apps/server/tsconfig.json` 的修改：移除 `../model/src/simulated-market.ts` 的显式 include 后 `npm run typecheck` 仍通过，因此没有 allowed_paths 漂移。

## Files Changed

- `apps/server/src/db/schema.ts`（新增 `SIMULATED_MARKET_DDL`）
- `apps/server/src/db/migrations/V003_simulated_market_run.ts`（新增）
- `apps/server/src/db/migrate.ts`（执行 `SIMULATED_MARKET_DDL`）
- `apps/server/src/db/schema-check.ts`（导入 `SIMULATED_MARKET_DDL`）
- `apps/server/src/services/simulated-market-adapter.ts`（新增）
- `apps/server/src/routes/simulated-market.ts`（新增）
- `apps/server/src/index.ts`（注册路由）
- `apps/server/package.json`（新增 `smoke:simulated-market` script）
- `apps/server/scripts/smoke-simulated-market.mjs`（新增）
- `docs/api-contract.md`（新增 §13）

**Review 后不再变更的文件：**

- `apps/server/tsconfig.json`：已还原，未纳入本次变更集。

## Validation

- `cd apps/server && npm run migrate`：通过，V003 已 applied。
- `cd apps/server && npm run typecheck`：通过，无错误。
- `cd apps/server && npm run schema:check`：通过，`simulation_run` 表存在，无缺失表/视图。
- `cd apps/server && npm run smoke:simulated-market`：通过，26/26 断言通过，仅写入临时 workspace。

## Risks

- 当前 `POST /runs` 直接调用 `apps/model` 的 deterministic fallback，未接入真实 `minimax-m3` LLM provider；后续接入真实 provider 时需要在 adapter 中增加 provider 失败捕获与 fallback 切换逻辑，并更新 `provider`/`modelVersion`/`qualityFlags` 的填充口径。
- `simulation_run` 表没有长期运行状态机（pending/running/succeeded/failed）；当前 deterministic fallback 同步完成，直接写 `succeeded`。若后续改为异步调用，需要补充状态流转与任务轮询能力。
- 输入校验完全依赖 model 层的 `validateSimulatedMarketInput` 抛错；虽然已覆盖 PRD 要求的错误情况，但若后续需要更细粒度的字段级错误码（如 `taxonomy_violation`），需在后端补充校验层。
- `qualityFlags` 使用 model 层输出的 `deterministic_fallback_used`，与 PRD 原始口径 `llm_unavailable_fallback_used` 命名不同；已作为等价 flag 在 API 文档中说明，但需总控确认是否统一。
- Smoke 脚本启动独立 server 并通过 admin rebuild 创建临时 workspace；若 `X-PLS-Admin-Token` 或 admin 路由配置变更，脚本需要同步更新。当前硬编码 `pls-admin-token` 与 server 实现一致。

## Open Questions

- `llm_unavailable_fallback_used` 与 `deterministic_fallback_used` 的命名是否需要总控统一？
- 后续是否需要在 `POST /runs` 中显式支持 `mode: sync|async`（目前仅同步）？
- 跨模块衔接（新品预测/人货匹配送入模拟市场、从模拟结果创建经营决策）的输入转换逻辑不在本任务范围，需后续任务明确。

## Contract Drift or Change Requests

- 无 contract drift。实现严格遵循 `docs/prd-simulated-market.md` 的领域对象定义与 `T0014` 的模型 contract。
- 唯一命名差异是 `qualityFlags` 使用 `deterministic_fallback_used`（等价于 PRD 的 `llm_unavailable_fallback_used`），已在 `docs/api-contract.md` §13.4 中显式说明。
- 未写入 `sales`、`gmv`、`conversion`、`feedback_record`、`decision_record` 等真实反馈或经营飞轮表，符合 Derived Result 口径。
- Review 中提出的 `apps/server/tsconfig.json` 越权问题已通过还原解决，未引入 allowed_paths 漂移。

## Memory Candidates

- 后端调用模型 contract 时，应将模型抛出的校验错误显式映射为 API 错误，而不是吞掉或返回 500；本次 `POST /runs` 捕获 `validateSimulatedMarketInput` 抛错并返回 `invalid_input`，可作为后续后端-模型接缝的参考模式。
- 新增业务表时，需要同时更新：schema DDL 常量、versioned migration、migrate.ts 执行、schema-check.ts 导入；遗漏任一环节会导致 `schema:check` 失败。本次按 checklist 全部覆盖。
- Smoke 脚本应遵循 AGENTS.md §2.x 的 workspace 隔离规则：不直接写入 `ws_demo`，而是通过 Admin API `POST /admin/database/rebuild` 创建临时 workspace，并在脚本头部显式声明假设。

## Memory Used

- `agentops/memory/mimo-backend.md`：
  - 开工前读取了 brief 和 domain memory。
  - 遵循「Read real routes, handlers, schemas, and storage code before changing backend behavior」：先读了 `predictions.ts`、`matches.ts`、`flywheel.ts`、`schema.ts`、`idempotency.ts` 等既有实现，再动手写新路由。
  - 遵循「Keep errors explicit. Do not swallow exceptions」：在 `POST /runs` 中显式捕获模型校验错误并返回 `invalid_input`；不吞 idempotency 存储失败（虽然其为 best-effort）。
  - 遵循「Prefer handler-level, contract, or smoke validation over only reading docs」：新增 smoke 覆盖成功路径、错误路径、workspace 隔离和 idempotency。
- `AGENTS.md` §2.x（Smoke 测试的 workspace 隔离）：
  - 本次修订后，smoke 脚本使用 `/admin/database/rebuild` 创建临时 workspace，不再写入 `ws_demo` 或复制其数据库文件。
- Review 反馈：
  - 针对 `tsconfig.json` 越权问题，验证了 `npm run typecheck` 不依赖该 include 项，因此回退该修改，避免 allowed_paths 漂移。
