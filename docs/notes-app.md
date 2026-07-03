# notes-app

## 0. 当前状态

最近更新：2026-07-03（A-P1-F2 抖音 BI SQLite 入库 / 原生 API / smoke 完稿）

进度：

- A-P0-3 / A-P0-B2 / A-P0-C1 已完稿。
- A-P1-B1/B2/B3/B4 已完稿并通过总控复核。
- A-P1-E3 已完稿。
- **A-P1-F2 本轮完稿**：抖音 BI 数据资产化包（D-P1-F1，`data/p1/douyin-bi/`）已完整导入 `ws_demo` SQLite；8 张 `douyin_*` 表 + 8 个 `_latest` view；6 个读取 endpoint（`/bi/douyin/accounts` / `.../:id` / `products` / `.../:id` / `fits` / `.../:id` / `advice` / `summary-metrics` / `versions`）；支持 `?dataVersion=` / `?sourceBatchId=` 指定历史快照，默认 latest projection。
- 应用侧数据准入按项目级放行口径，safety gate 保留但对用户授权数据默认 pass；taxonomy gate 未变。
- 前端 Dashboard 隐私提示已删除。

关键决策（本轮）：

- 抖音 BI 使用独立表命名空间 `douyin_*`，不复用 `channel_profile / sku / prediction / match_result`（避免污染 P0/P1 主链路）。
- API 路径 `/api/v0/bi/douyin/*`，走既有 requestId → auth → workspace 中间件。
- 表 PK 完整包含 `source_batch_id + data_version`；重复导入用 `INSERT OR REPLACE` 保证幂等（re-run 相同 batchId+version 不产生重复业务行）。
- 每张表配 `douyin_*_latest` view（按 businessKey group + generated_at DESC + rowid DESC）。
- 新增 `resource_type` 值 `bi_account / bi_product / bi_fit / bi_advice / bi_summary / bi_batch`。
- 导入脚本 `scripts/import-douyin-bi.mjs`：读 `sqlite_import_manifest.json` → 事务批量 upsert → 写 `batch` 表 + `audit_event`。
- 未同步登记 `douyin_account` 为 `channel_profile` 行（保持 E3 链路不被自动覆盖）。
- `raw` 列保存原始 JSONL 行，用户授权 BI 字段（八大消费群体、legacyFitScore、性别/年龄/城市等级 profileDistribution 等）可 verbatim 输出。

下一步：

- 等 X 总控复核 A-P1-F2 并 mark done。
- V 域 (V-P1-F4 / V-P1-F5) 可直接消费 `/api/v0/bi/douyin/*` 读取 API。
- M 域 (M-P1-F3) 可消费 fits / comparison_dimension / advice，输出 ProductAccountFitDiagnostic 后回流到本 API 层做投影。
- `/bi/douyin/*` 目前是纯只读；导入 endpoint 若产品需要可后续新增（当前只支持 CLI 脚本导入）。

阻塞：

- 无

开放问题：

- P1-B2 幂等缓存 prune 每次读时 DELETE；量大后改后台 job（未变）。
- A-P1-F2 是否需要把 `douyin_account` 同步到 `channel_profile`（供既有 `/account-matches` 消费）？当前设计为否；如需要走 E3 链路，需回流 X 拍板。
- 抖音 BI 导入 endpoint 化（HTTP POST 上传 + 后台 upsert）待需求确认。

验证：

- `apps/server npm run typecheck` 通过。
- `apps/server npm run migrate` 通过；重新迁移后 8 个 douyin_* 表 + 8 个 _latest view 就绪。
- `apps/server node scripts/import-douyin-bi.mjs` 通过：692 行数据落地；重复执行不产生重复业务行（total = 692 保持不变）。
- `apps/server npm run smoke:douyin-bi` 通过：15 项检查全绿（accounts / product / fit / advice / summary / versions / 401 / 400 / 404 / dataVersion filter）。
- 多版本验证：临时导入第二个 dataVersion（v2_20260704），latest projection 自动更新到 v2，v1 仍可通过 `?dataVersion=v1_20260703` 读取；测试后 v2 已清理。
- `apps/server npm run smoke` P0/P1 24 项全绿，未回退。

---

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 用户授权进入 PLS 的数据默认放行；应用层不再按隐私字段名或值形态做 safety 拦截。
- taxonomy gate、quality gate 和产品对象契约仍然有效。
- pipeline 每一步要可追溯，便于后续回测和纠偏。
- **抖音 BI 数据（D-P1-F1）作为独立数据资产存 `douyin_*` 表，不合并进主 `channel_profile / sku`；前端只能通过 `/api/v0/bi/douyin/*` 读取。**

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
