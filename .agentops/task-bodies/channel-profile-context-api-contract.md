## 目标

补齐“渠道画像”模块后续产品化所需的真实 API 契约支撑，重点服务活动 (`marketing_event`) 和场景 (`business_scenario`) 可单独存在、可单独浏览、可作为匹配上下文的前端体验。

## 背景

当前前端已经把“渠道画像”左侧拆成 `渠道实体 / 活动 / 场景` 三段视图，并能在 mock/local 路径下浏览对象。后续 UI 需要真实 API 能稳定提供：

- 活动 / 场景对象详情中的业务字段。
- 绑定关系里可读的关联渠道信息，而不是只暴露 canonical key。
- 批量货渠匹配分析所需的活动/场景上下文契约。

## 非目标

- 不实现复杂 CRUD、批量删除、自动合并、版本回滚或对象治理工作流。
- 不修改模型算法权重。
- 不改前端 UI，除非为了 contract fixture 或 smoke 最小验证必须同步类型。
- 不写入或清理 `data/workspaces/ws_demo/db.sqlite` 的业务数据；如需 smoke 写入，必须使用临时 workspace。

## 允许改动范围

- `apps/server/src/routes/channel-objects.ts`
- `apps/server/src/routes/channel-entities.ts`
- `apps/server/src/lib/import-channel-object-library.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/`
- `apps/server/scripts/smoke-channel-object-library.mjs`
- 必要时可改 `apps/web/src/types/index.ts` 中与返回 contract 对齐的共享前端类型，但不得改 UI 组件。

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 先阅读 `docs/channel-profile-2.0-plan.md`、`docs/api-contract.md`、`apps/server/src/routes/channel-objects.ts` 和现有 schema/import runner。
- 遵守 `AGENTS.md` API 联调纪律：真实路由、schema、headers、workspace、confirmText / Idempotency-Key 语义必须按源码确认。
- 活动和场景是长期维护对象，可绑定任意渠道实体，但不得改变渠道实体层级。
- 绑定关系返回如需增强，必须保持旧字段兼容，并新增前端可读字段或 companion object，不破坏现有消费者。
- Mock 与真实 response shape 必须同构。

## 验收标准

- 活动 / 场景详情真实 API 可返回 `eventType/customTags` 或 `scenarioType/description` 等业务字段。
- 绑定关系读取可支持前端展示“关联渠道名称 / 对象类型 / 绑定类型 / 版本”。
- 批量分析 API 或 contract 明确活动/场景上下文如何传入；未实现真实计算时必须有明确错误/未开放语义，不得伪造真实模型结果。
- 更新或新增 server smoke，覆盖临时 workspace 或只读路径。

## 验证命令

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run smoke:channel-object-library`
- `git diff --check`

如果某条命令无法运行，handoff 必须说明原因和替代验证。

## Handoff 格式

按 `docs/templates/HANDOFF_BACK.template.md` 回流，至少包含：

- 改了什么。
- 真实 API 路径和 response shape。
- 验证命令与关键结果。
- 是否涉及 contract change request。
- 风险和未覆盖项。
