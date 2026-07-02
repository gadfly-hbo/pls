# notes-app

## 0. 当前状态

最近更新：2026-07-02（A-P1-B1/B2/B3/B4 总控归档）

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
- **A-P1-B1 已完稿**：match_result 升级为 append-only + `match_result_latest` view
  - `src/db/schema.ts`：新增 `match_result_latest` VIEW（按 `workspace_id + sku_id + channel_id` ROW_NUMBER 取最新），新增 `idx_match_latest_lookup` 复合索引
  - `src/routes/matches.ts`：POST /matches 去掉 `DELETE` overwrite；GET /matches/heatmap 直接 `SELECT FROM match_result_latest`，SQL 从内嵌 window function 简化为一层查询；GET /matches 默认读 view，`?history=true` 读全量
  - 前端读取路径零变更（heatmap / list 默认口径不变）
  - 验证：重复 POST /matches 后 heatmap `cells=4 unique_channels=4`，`?skuId=&pageSize=100` latest=4，`&history=true&pageSize=100` history=12
- **A-P1-B2 已完稿并通过总控复核**：Idempotency-Key + 24h TTL 缓存
  - 新表 `idempotency_key(workspace_id, method, path, key, request_hash, response_body, resource_id, status_code, created_at, expires_at)`，PK `(workspace_id, method, path, key)`
  - 新 lib `src/lib/idempotency.ts`：SHA-256 hash raw JSON body（不存原文，仅 hash + 已经过 safety 门禁的响应 body）；middleware 只对 POST + `application/json` + `Idempotency-Key` header 生效；multipart /batches 缺 JSON body 时自动跳过
  - 覆盖 POST /predictions、POST /matches、POST /batches（后者仅在 JSON payload 场景生效）；同一 key 跨 endpoint 按 method + path 隔离，不 cross-replay
  - Key 校验 `^[A-Za-z0-9._~+/=-]{8,128}$`，命中重放返回原 body + `Idempotency-Replay: true` header
  - 冲突：same key + 不同 request_hash → 409 conflict；每次读时先 prune 过期行
  - 验证：same key + same body → 同 predictionId + replay header；different body → 409；bad key → 400
- **A-P1-B3 已完稿并通过总控复核**：真正异步 task worker + timeout fallback
  - 新 lib `src/lib/worker.ts`：`markTask()` 单点写 task 状态转换（started_at / finished_at / error / attempts）；`runWithTimeout(job, timeoutMs)` race，超时返回 `{ kind:"timeout", work }` 让调用方 detach
  - POST /predictions 重构：SKU preflight（404 快返，不写 task）→ 写 `queued` task + audit `queue` → `mode=async` 立即 202 + queued；`mode=sync`（默认）走 `runWithTimeout(job, timeoutMs ?? 8000)`，超时 fallback 到 202 + `task.fallbackReason: "sync_timeout"`
  - `job` 内部：`markTask(running)` → 计算 → INSERT prediction → `markTask(succeeded)` + audit `succeed`；异常路径 `markTask(failed)` + audit `fail`
  - Body 新增可选 `mode`、`timeoutMs`；测试延迟 hook 改为非公开 header `X-PLS-Test-Delay-Ms`，且 `NODE_ENV=production` 禁用
  - 验证：sync 快任务 succeeded；async mode 立即返 queued，~1s 后 succeeded；delay 3s + timeoutMs 500ms → 202 + fallbackReason=sync_timeout，后台继续跑到 succeeded；bad SKU → 404 not_found
  - matches 路径保留 sync 语义（沿用 P0-C1 baseline adapter），未接入 async worker——B3 range 只要求“至少 prediction 或 match 一条链路支持 async”
- **A-P1-B4 已完稿并通过总控复核**：API smoke 一条命令脚本化
  - `scripts/smoke.ts` + `scripts/smoke-steps.ts`（step 定义拆分），`package.json` 增加 `npm run smoke`
  - 覆盖 18 步：health、auth 401、workspace 400、products_list、safety_violation、predict_sync、task_poll_prediction、predict_async、predict_sync_timeout_fallback、match、heatmap_unique、match_history_vs_latest、idempotency_first / replay / conflict / **endpoint_isolation** / **batches_json_idempotent**、audit_recent
  - CLI flags：`--base` `--token` `--workspace` `--json` `--verbose`；`--json` 打机器可读 summary；退出码 all pass → 0，任一失败 → 1
  - Fixture 只用 ws_demo seed 数据（mock），不依赖真实业务
  - 验证：`npm run smoke` → 18/18 PASS exit 0；`--json` 可解析；`--token bogus` → 16 FAIL exit 1

总控审核阻塞修复（本轮回流）：

- **B2-1 Idempotency-Key 按 endpoint 隔离**（Blocker 1 fix）
  - `idempotency_key` PK 由 `(workspace_id, key)` 改为 `(workspace_id, method, path, key)`
  - `src/lib/idempotency.ts` lookup 和 INSERT OR REPLACE 均带 method + path
  - `src/db/migrate.ts` 添加 PK 检测：老表 PK 缺 method+path 时自动 DROP 重建（24h TTL 缓存，重建安全）
  - 验证：same key 分别打 /predictions 和 /matches → 各自返 fresh response 且无 `Idempotency-Replay` header；smoke 新增 `idempotency_endpoint_isolation` 防回归
- **B2-2 /batches JSON 幂等路径可用**（Blocker 2 fix）
  - `src/routes/batches.ts` 按 Content-Type 分派：`application/json` → `readJson<{meta}>()`（支持 object 或字符串形式的 meta），multipart → 原 `parseBody()` 路径
  - middleware 侧不变，仍只对 `application/json` 生效；multipart 上传自动跳过幂等（保持 P0-B2 原有 CSV 通路契约）
  - 验证：first POST 202 + resourceUrl；replay 202 + 同 batchId + `Idempotency-Replay: true`；smoke 新增 `batches_json_idempotent` 防回归
- **B3 simulatedDelayMs 从公开 body 移除**（Blocker 3 fix）
  - `PredictBody` 不再声明 `simulatedDelayMs`；body 里带该字段会被静默忽略（验证：body `simulatedDelayMs:3000` + `timeoutMs:500` → 94ms 内返回 200）
  - 改为内部 header `X-PLS-Test-Delay-Ms`，通过 `readTestDelay()` 读取
  - `NODE_ENV === "production"` 时 `readTestDelay` 恒返 `undefined`，生产环境无法触发
  - 上限 30_000ms，防止 header 被滥用
  - smoke 更新为通过 header 传递
- **总控最终归档**：
  - `npm run typecheck`、`npm run migrate`、`npm run seed`、`npm run smoke` 均通过。
  - 手工复验同 key 跨 `/predictions` 与 `/matches` 不 cross-replay；`/batches` JSON replay 返回同一 `resourceUrl` 且带 `Idempotency-Replay: true`。
  - `docs/api-contract.md` 已补充幂等 scope、replay header、`GET /matches?history=true`、`POST /predictions.timeoutMs` 和 JSON `/batches` 口径。

关键决策：

- 放弃 better-sqlite3（Node v26 V8 API 不兼容），改用 Node 内置 `node:sqlite`（总控已批准）
- 放弃 Drizzle ORM（无 `node:sqlite` 驱动），改用原生 SQL + prepared statements
- 中间件顺序：requestId → auth → workspace（先 401 再 400）
- feedback endpoint 骨架返回 `not_found`（`"feedback is not enabled in P0"`）
- 批次导入只建 endpoint + task，不做 CSV 解析（D-P0-B1 已提供 JSONL seed）
- 去重口径：P0 采用 latest-result overwrite，不新增幂等键表
- P1-B1 起 match_result 升级为 append-only；latest 通过 `match_result_latest` view 提供，避免读改写路径侵入
- P1-B2 幂等 hash 只对 `application/json` 生效；multipart 上传（当前只有 /batches）暂不做幂等（JSON payload 场景仍支持）
- P1-B2 幂等 replay 用原样返回缓存 body，保留 `requestId` 与 `generatedAt` 是首次响应的值（重放语义清晰）
- P1-B3 worker 用同进程 + `runWithTimeout`，不引入外部队列；未来切 BullMQ 时 markTask / runWithTimeout 接口保持不变
- P1-B3 `simulatedDelayMs` 仅作为 smoke 用的 test hook，不改变业务字段口径

回补记录（总控审核 3 项阻塞）：

- 安全门禁从 `checkSafety`（浅层）升级为 `deepScanSafety`（递归），覆盖 `attributes` / `assets` 嵌套 S0/S1 字段
- 新增 `requestId` 中间件（`src/middleware/request-id.ts`），审计链路不再写空字符串
- auth / workspace 中间件改用 `lib/response.ts` 统一响应包装（含 `requestId` + `generatedAt`）

下一步：

- P1-B 序列全部关闭；若继续 P1，候选 A-P1-E3（抖音账号货匹配接口）需先等 X-P1-E0 契约冻结。
- match 链路是否也接入 async worker + timeout fallback 视 V 域需求；当前 P1-B3 交付边界满足。
- 真实 worker 调度与异步 pipeline：prediction 链路已支持；match / batches 仍走同步主路径。

阻塞：

- 无

开放问题：

- P0-C 保留问题：M baseline adapter 是否 P1 拆成单独 model-serving 进程（未变）。
- P1-B2 幂等缓存 prune 目前每次读时执行一次 DELETE；量大后可改成后台定期 job（P1 后再评估）。
- P1-B4 smoke 需 server 已在 3100 运行；CI 层需先 `npm start` 或改脚本自动拉起子进程。
- 如需保留完整 `match_result` 历史查询接口（当前需带 `?history=true`），可评估是否升级为独立 endpoint。

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
