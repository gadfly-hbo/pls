# notes-app

## 0. 当前状态

最近更新：2026-07-02（A-P0-C1 收尾校验完成）

进度：

- **A-P0-3 已完稿**（同上轮，略）
- **A-P0-B2 已完稿**：SQLite schema + API 服务骨架落地 `apps/server/`
  - 技术栈：Node.js v26 + Hono 4.7 + 内置 `node:sqlite`（SQLite 3.53）
  - 9 张表 DDL（`src/db/schema.ts`），按 pipeline-design.md §6.2 一一对应
  - 8 组接口全部实现（`src/routes/`）：products / channels / predictions / matches（含 heatmap）/ batches / tasks / taxonomy / audit
  - 中间件：Bearer token auth（`pls-p0-demo-token`）+ `X-PLS-Workspace` header
  - 统一响应包装（`src/lib/response.ts`）：ok / accepted / err + 各错误码 helper
  - Safety 门禁（`src/lib/safety.ts`）：字段名黑名单 + 值级正则（手机号/邮箱/身份证）
  - Taxonomy 白名单（`src/lib/taxonomy.ts`）：36 个 tagId 对齐 profile-taxonomy-v0.md
  - Mock M Service（`src/services/mock-m.ts`）：hardcoded ProductProfile × 3 SKU + MatchResult 覆盖 4 种 recommendation 场景
  - 审计事件写入（`src/lib/audit.ts`）
  - Seed 脚本（`scripts/seed.ts`）：加载 `data/demo/` 全部 JSONL 入库
  - Smoke 验证：`typecheck` 通过；7 项 API smoke 全部通过（含 safety_violation 拦截）
  - 数据库文件：`data/workspaces/ws_demo/db.sqlite`
- **A-P0-C1 已完稿**：接入 M baseline adapter，修复 match latest 去重
  - 新增 `apps/server/src/services/model-adapter.ts`，直接调用 `apps/model/src/baseline.ts` 的 `predictProductProfile` / `matchChannels`
  - `POST /predictions` 现已从 SQLite `sku` 行组装 `ProductDNA`，返回真实 baseline `topSegments`（稳定 3 个）
  - `POST /matches` 改为读取 `prediction` + `channel_profile`，由 A 域补齐 `recommendation` / `risks`
  - latest-result overwrite：写新 `match_result` 前删除同 `workspaceId + skuId + channelId` 旧结果
  - `GET /matches/heatmap` 改为 window function 去重，按 `skuId + channelId` 只取最新结果
  - 为跨包 typecheck，`apps/server/tsconfig.json` 纳入 `../model/src/baseline.ts`；同时修复 baseline 内两处 strict TS 小问题，不改算法口径
  - Smoke 验证：重复两次 `POST /matches` 后，`heatmap cells=4 unique=4`，`/matches?skuId=` 也为 `items=4 unique=4`
  - 收尾校验：`apps/server` 与 `apps/model` 双 `typecheck` 通过；预测仍返回 `topSegments=3`
- X-P0-B5 端到端 API smoke 通过：`/products` → `/predictions` → `/matches` → `/matches/heatmap` → `/matches?skuId=` → `/audit`。

关键决策：

- 放弃 better-sqlite3（Node v26 V8 API 不兼容），改用 Node 内置 `node:sqlite`（总控已批准）
- 放弃 Drizzle ORM（无 `node:sqlite` 驱动），改用原生 SQL + prepared statements
- 中间件顺序：requestId → auth → workspace（先 401 再 400）
- feedback endpoint 骨架返回 `not_found`（`"feedback is not enabled in P0"`）
- 批次导入只建 endpoint + task，不做 CSV 解析（D-P0-B1 已提供 JSONL seed）
- 去重口径：P0 采用 latest-result overwrite，不新增幂等键表

回补记录（总控审核 3 项阻塞）：

- 安全门禁从 `checkSafety`（浅层）升级为 `deepScanSafety`（递归），覆盖 `attributes` / `assets` 嵌套 S0/S1 字段
- 新增 `requestId` 中间件（`src/middleware/request-id.ts`），审计链路不再写空字符串
- auth / workspace 中间件改用 `lib/response.ts` 统一响应包装（含 `requestId` + `generatedAt`）

下一步：

- 真实 worker 调度与异步 pipeline（目前全部同步返回）仍为 P1 前风险。
- 如需保留完整 `match_result` 历史，P1 可从 overwrite 升级到显式幂等键 + latest view。

阻塞：

- 无

开放问题：

- P0-C 是否继续保留 M baseline 同进程 adapter，还是 P1 拆成单独 model-serving 进程。
- heatmap 已完成 latest 去重；SKU×channel 量大时再评估缓存或物化视图。

---

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 任何进入模型或 LLM 的数据都要经过数据安全层确认。
- pipeline 每一步要可追溯，便于后续回测和纠偏。

## A-P0-3 沉淀

- 契约定型见 `## 0` 关键契约点段落。
- V 域调用序列已定型两套（新品画像工作台 5 步、渠道匹配热力图 4 步）。
- 数据准入三级门禁（`pipeline-design.md §2.3`）：
  - safety 门禁：字段名黑名单（`phone`/`name`/`address`/`orderId`/`memberId`/`openId`/`adId`/`deviceId`）+ 值级正则（手机号/邮箱/身份证形态）。命中即全批 `rejected`。
  - taxonomy 门禁：`tagId` 必须在标签体系白名单；未命中且有 `mappingRuleId` 进 `unmappedTags`；否则 `taxonomy_violation`。
  - quality 门禁：`sampleSize < 100` 与 `profileCoverageRate < 0.7` 只告警不拦截，落 `qualityReport`。
- 存储 6 张主表（`pipeline-design.md §6.2`）：`workspace` / `sku` / `channel_profile` / `wide_table_row` / `batch` / `prediction` / `match_result` / `task` / `audit_event`。索引：`(workspaceId, createdAt DESC)`、`(workspaceId, skuId)`、`(workspaceId, taskType, status)`、`(taskId)`、`(predictionId)`。
- 审计事件禁写 payload 原文；`meta` 只允许 `modelVersion` / `modelPath` / `dnaHash` / `sourceType` 等元信息，字段名可写、字段值不写。

## 风险与踩坑记录

- **超长中文 + JSON 混排 payload 触发 write/edit 工具层 JSON parser `Unterminated string`**。多次可复现，主要发生在 write 单次载荷 > 10KB 且含大量 JSON schema + 中文表格混排时。变通方案：先 Write < 200 行骨架，再 Edit 分段追加，每段控制在 < 2000 字符。本 session 全程沿用该策略，两份文档均无残缺。
- **文件读 offset 越界不代表内容缺失**：本 session 收尾 turn 曾用 `Read(offset=150)` 读 88 行文件收到 out-of-range，一度误判 `pipeline-design.md` 只有骨架。实际是完整 349 行 v0.1。教训：越界 error 时先 `Read` 无 offset 拿完整文件，或用 `wc -l` 等价手段（此环境 bash 不可用则改用 Grep 数章节数）确认真实长度，再做状态判断。
- **上游冻结锚定策略生效**：M-P0-2 已 done，A 域契约直接锚定 `model-plan.md §3.3 / §4.4` 字段，不再需要反向对齐。这一模式适用于所有下游域：优先直接引用上游冻结 schema，不预留占位。
- **`recommendation` 阈值表规则顺序**：按表格自上而下执行，`avoid` 优先级最高；`dimension` 从 `tagId` 前缀推导。已在 `api-contract.md §3.4` 明文写入，覆盖需回流 X。
- **本地 `3100` 端口可能已有残留 server 进程**：收尾 smoke 如遇 `EADDRINUSE`，通常代表前一轮本地实例仍在运行；可直接复用已启动实例验证接口，不影响 API 结果判读，但若要复现实验需先清理端口占用。
