# notes-app

## 0. 当前状态

最近更新：2026-07-03（Session 收尾：A-P1-F2 / A-P2-1 / A-P2-3 / A-P2-9 / A-P2-10 全部完稿）

进度：

- A-P0-3 / A-P0-B2 / A-P0-C1 已完稿。
- A-P1-B1/B2/B3/B4 / A-P1-E3 / A-P1-F2 已完稿并通过总控复核。
- A-P2-1 已通过总控复核（data_source 注册表 + adapter 模式 + /data-management/*）。
- A-P2-3 已通过总控复核（channel_entity 投影表 + /channels/entities）。
- **A-P2-9 本轮完稿**：新品预测 API + 匹配衔接。`/api/v0/new-products/predictions` 提交预测（sync）、列表/详情、POST /:id/match 桥接到匹配链路。对接 M-P2-8 `predictNewProductProfile()` baseline。
- **A-P2-10 本轮完稿**：经营飞轮最小闭环 API。`/api/v0/operations/decisions` 决策→行动→反馈→复盘全流程。P2 Phase 1 只做记录与复盘，不做自动执行。
- 应用侧数据准入按项目级放行口径；taxonomy gate 未变。

关键决策（本轮）：

- **A-P2-9**：新品预测结果存 `new_product_prediction` 表（与 P0/P1 `prediction` 表隔离）；匹配桥接通过 `toProductChannelFitProfile()` + `matchFromPredictionAndChannels()`；match 链路当前只查 `channel_profile`（P0 mock），V-P2-4 接入后需改为 `channel_entity`。
- **A-P2-10**：decision_record 关联 match_result（通过 match_id）；action_type / feedback_type 枚举在 contract 中定义但不做 DB 层 CHECK 约束（P2 初期灵活扩展）；review_status 反写 decision.status（verified / needs_adjustment）。
- **A-P2-3**：ChannelEntity 是 P2 渠道人群 first-class 锚；channel_entity 为投影表非运行时合并；channelEntityId 格式 `<source>:<entityType>:<channelId>`。
- **A-P2-1**：adapter 模式投影 douyin_* / channel_profile / 未来 source；不复制 import 元数据，batch + audit_event 仍是导入真源。

下一步：

- 等 X 总控复核 A-P2-9、A-P2-10 并 mark done。
- V-P2-4 / V-P2-6 / V-P2-11 可消费 `/channels/entities`、`/new-products/predictions`、`/operations/decisions` API。
- M-P2-8 baseline 正式模型替换后，A-P2-9 的 `new_product_prediction` 表无需改 schema（只换 `modelVersion` / `source`）。
- 经营飞轮后续：事件驱动 action 执行、自动 feedback 采集、策略推荐生成（需 X 拍板）。

阻塞：

- 无

开放问题：

- 新品预测 match 链路当前查 `channel_profile`（P0 mock 4 行）；V-P2-4 接入后需改为查 `channel_entity`（17 行）。
- 经营飞轮 action/feedback 只存不触发；webhook / 事件驱动待后续 P2 任务。
- `channel_entity` 投影表更新需手动重跑 `sync:channel-entities`；自动触发待 X 拍板。
- `/channels`（P0 mock）和 `/channels/entities`（P2 投影）并存；迁移策略需 X 冻结。

验证：

- `apps/server npm run typecheck` 通过（0 错误）。
- `apps/server npm run migrate` 通过；全部新表（douyin_*、data_source、channel_entity、new_product_prediction、decision_record、action_record、feedback_record、strategy_review）创建。
- `apps/server npm run smoke` 通过：24/24（P0/P1 主链路）。
- `apps/server npm run smoke:douyin-bi` 通过：15/15。
- `apps/server npm run smoke:data-management` 通过：22/22。
- `apps/server npm run smoke:channel-entities` 通过：15/15。
- `apps/server npm run smoke:p2-api` 通过：20/20（A-P2-9 + A-P2-10 全流程）。
- **总计 96 项冒烟测试全部通过，无回归。**

---

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 用户授权进入 PLS 的数据默认放行；应用层不再按隐私字段名或值形态做 safety 拦截。
- taxonomy gate、quality gate 和产品对象契约仍然有效。
- pipeline 每一步要可追溯，便于后续回测和纠偏。
- 抖音 BI 数据（D-P1-F1）作为独立数据资产存 `douyin_*` 表，不合并进主 `channel_profile / sku`；前端只能通过 `/api/v0/bi/douyin/*` 读取。
- 数据管理底座（A-P2-1）是 source-agnostic 的；新数据源通过注册 adapter 接入，不改 `/data-management/*` 路由层。
- 渠道人群实体（A-P2-3）以 `channel_entity` 投影表为 read-optimized 层；V-P2-4 应优先消费 `/channels/entities` 而非 `/channels`（P0 mock）。

## A-P0-3 沉淀

- 契约定型见 `## 0` 关键契约点段落。
- V 域调用序列已定型两套（新品画像工作台 5 步、渠道匹配热力图 4 步）。
- 数据准入门禁当前口径：
  - safety 接口保留但默认 pass；不再因 `phone` / `name` / `address` / `orderId` / `memberId` / `openId` / `adId` / `deviceId` 或手机号/邮箱/身份证形态拒绝。
  - taxonomy 门禁：`tagId` 必须在标签体系白名单；未命中且有 `mappingRuleId` 进 `unmappedTags`；否则 `taxonomy_violation`。
  - quality 门禁：`sampleSize < 100` 与 `profileCoverageRate < 0.7` 只告警不拦截，落 `qualityReport`。
- 存储 6 张主表（`pipeline-design.md §6.2`）：`workspace` / `sku` / `channel_profile` / `wide_table_row` / `batch` / `prediction` / `match_result` / `task` / `audit_event`。索引：`(workspaceId, createdAt DESC)`、`(workspaceId, skuId)`、`(workspaceId, taskType, status)`、`(taskId)`、`(predictionId)`。
- 审计事件默认记录处理阶段和摘要；是否记录原文按用户授权口径和产品调试需求决定。

## 风险与踩坑记录

- **超长中文 + JSON 混排 payload 触发 write/edit 工具层 JSON parser `Unterminated string`**。多次可复现，主要发生在 write 单次载荷 > 10KB 且含大量 JSON schema + 中文表格混排时。变通方案：先 Write < 200 行骨架，再 Edit 分段追加，每段控制在 < 2000 字符。本 session 全程沿用该策略，两份文档均无残缺。
- **文件读 offset 越界不代表内容缺失**：本 session 收尾 turn 曾用 `Read(offset=150)` 读 88 行文件收到 out-of-range，一度误判 `pipeline-design.md` 只有骨架。实际是完整 349 行 v0.1。教训：越界 error 时先 `Read` 无 offset 拿完整文件，或用 `wc -l` 等价手段（此环境 bash 不可用则改用 Grep 数章节数）确认真实长度，再做状态判断。
- **上游冻结锚定策略生效**：M-P0-2 已 done，A 域契约直接锚定 `model-plan.md §3.3 / §4.4` 字段，不再需要反向对齐。这一模式适用于所有下游域：优先直接引用上游冻结 schema，不预留占位。
- **`recommendation` 阈值表规则顺序**：按表格自上而下执行，`avoid` 优先级最高；`dimension` 从 `tagId` 前缀推导。已在 `api-contract.md §3.4` 明文写入，覆盖需回流 X。
- **本地 `3100` 端口可能已有残留 server 进程**：收尾 smoke 如遇 `EADDRINUSE`，通常代表前一轮本地实例仍在运行；可直接复用已启动实例验证接口，不影响 API 结果判读，但若要复现实验需先清理端口占用。
- **SQLite NOT NULL DEFAULT 只在列不出现在 INSERT 时生效**：显式传 NULL 违反约束，即使列有 DEFAULT。INSERT 必须只列有值的列，或显式传非 NULL 值。A-P1-E3 的 INSERT 调试中踩过此坑。
- **Node.js `tsx` 不热加载已 kill 的进程**：`kill -9` 后 `nohup npm start` 可能仍加载旧代码缓存。确认方式：在关键路径加 `console.log` 检查新逻辑是否执行。
- **跨包 typecheck 引用 model 源码需在 tsconfig 纳入**：`apps/server/tsconfig.json` 需包含 `../model/src/account-fit.js`，否则 `diagnoseAccountFit` 的类型推断断裂。
- **node:sqlite `db.transaction()` 不可用**：Node.js `node:sqlite` 模块不提供 `db.transaction()` 方法（与 better-sqlite3 不同）。变通方案：手动 `BEGIN` / `COMMIT` / `ROLLBACK` + try-catch。import-douyin-bi.mjs 首版因调用 `db.transaction()` 报 `TypeError`，改为手动事务后通过。
- **SQLite INSERT 列数 vs VALUES `?` 占位符计数**：手动计数极易出错（尤其含 `datetime('now')` 硬编码时）。变通方案：用脚本验证 `?` 数量 = 列数 - 硬编码列数；或用对象化 INSERT 辅助函数避免手动对齐。sync-channel-entities.mjs 和 channel_entity DDL 反复踩此坑。
- **Hono 路由注册顺序决定匹配优先级**：`api.route("/channels/entities", ...)` 必须在 `api.route("/channels", ...)` 之前注册，否则 `/:channelId` 会错误匹配 `entities` 路径。教训：通用路由（含 `:param`）始终放在具体路由之后注册。
- **data_source INSERT OR IGNORE 不更新已有行**：种子脚本用 `INSERT OR IGNORE` 注册 source 时，已存在的 stub 行不会被更新为 active。改为 `INSERT OR REPLACE` 后正确覆盖。注意：REPLACE 会重置 created_at；如需保留原时间戳，应改用 `UPDATE ... SET`。
