# notes-app

## 0. 当前状态

最近更新：2026-07-11（模拟市场 LLM 统一走 pi-agent）

进度：

- **模拟市场真实 LLM 已接通**：`apps/server/src/services/simulated-market-provider.ts` 不再直连 Minimax HTTP API，真实 LLM 调用统一通过本机 `pi-agent` CLI（默认 `pi`）执行；结果仍按业务口径记录 `provider=minimax` / `modelVersion=minimax-m3`。
- **PLS 项目级 LLM 规则已沉淀**：`AGENTS.md` 新增「LLM 调用规则」，明确 PLS 所有产品 LLM 能力必须走 `pi-agent`，`pi-xanthil` 只作为 `pi-agent` 套壳产品和默认模型口径参考，不作为 PLS runtime provider。
- **模拟市场 LLM 输出解析已增强**：`apps/model/src/simulated-market.ts` 支持从带 `<think>` / 前置文本的 pi-agent 输出中抽取首尾 JSON object，避免 MiniMax-M3 reasoning 前缀导致结构化解析失败；contract test 已覆盖该场景。
- **启动脚本与 API 契约已对齐**：`启动PLS工作台.command` 改为检查 `pi-agent`，`docs/api-contract.md` 的模拟市场 provider/env/smoke 说明已从 `MINIMAX_API_KEY` 直连口径改为 `pi-agent` 口径。
- **T0024 / T0025 / T0026 / T0027 仍保持 approved 状态**：subagent contract/API/UI 与 LLM review fixes 的既有结论不变；本轮是在其上修正 provider ownership 与项目级 LLM 调用规则。

验证：

- 本轮已通过：`cd apps/server && npm run typecheck`。
- 本轮已通过：`cd apps/model && npm run simulated-market-contract-test`，输出 `ok: true` / `failures: []`。
- 本轮已通过：`cd apps/server && npm run smoke:simulated-market`，77/77；默认 fake LLM 成功路径、禁用 `pi-agent` fallback 路径、自定义 `SIMULATED_MARKET_MODEL`、非法 timeout、可选 live pi-agent phase skip、subagent CRUD 与渠道对象派生均通过。本次 session-end 复跑生成临时 workspace `ws_sm_simulated_market_1783780681422`。
- 本轮已通过：`git diff --check`（在进入 session-end 前已执行）；本次 session-end 按技能规则未再执行 git 操作。
- 真实接口曾手动验证：`POST /api/v0/simulated-market/runs` 返回 `provider=minimax`、`modelVersion=minimax-m3`、`qualityFlags=[]`，证明新报告可由 LLM 生成；旧的 `deterministic_fallback` 报告不会自动迁移。

关键决策：

- PLS 业务代码不得直接调用第三方模型 HTTP API；新增 LLM 功能必须先查真实 `pi-agent` CLI / SDK 调用方式、输出事件格式、超时与错误语义，再写 adapter、contract test 和 smoke。
- 模拟市场默认真实模型标识为 `SIMULATED_MARKET_PI_MODEL=minimax-cn/MiniMax-M3`；`SIMULATED_MARKET_MODEL=minimax-m3` 只作为写入 `SimulationRun.modelVersion` 的业务口径。
- fallback 仍允许存在，但必须显式标记 `deterministic_fallback_used` / `llm_unavailable_fallback_used`，不得冒充 LLM agent 输出；旧报告上的 fallback 标记代表历史运行，不代表当前 provider 状态。
- `schema:check` 默认验证 `ws_demo`，因此新增表类任务可在 controller 明确批准时提交 **schema-only** 的 `data/workspaces/ws_demo/db.sqlite` migration 状态；这不等于允许提交 smoke 产生的 `simulation_run` / `idempotency_key` / `audit_event` / 业务数据行。
- 清理被跟踪 fixture DB（如 `ws_demo`）时必须先对比 `HEAD` 基线，保留基线 demo 行；推荐流程是恢复 `HEAD` 后重新运行 migration，再验证关键表计数，而不是凭 smoke-style ID 手删整表行。
- 前端 Playwright 运行产物 `apps/web/playwright-report/` / `test-results/` 不属于任务交付物；T0026 曾因 `playwright-report/index.html` dirty 被打回，移除生成产物 diff 后才 approved。
- 模拟市场 subagent 从渠道画像派生时，`profile.preferences` / `decisionFactors` 只是 `AudienceProfile.tags` 的保守标签摘要，必须展示为 Derived Result，不得声称真实个人偏好或真实用户反馈。

开放问题 / 风险：

- 可选 live LLM smoke 默认跳过；需要设置 `RUN_SIMULATED_MARKET_LIVE_LLM=1` 且本机 `pi-agent` 可用时才会发起真实模型调用。
- `pi-agent` 输出事件格式若升级，`extractPiMessageText()` / `runPiPrompt()` 需要按真实事件结构同步调整。
- `from-channel-object` 当前派生策略是保守摘要（top preferences + all tag ids as decision factors），后续如需更强 persona 文案应另开模型/产品任务。
- 管理页的渠道对象下拉会列出 ChannelEntity；对象无 AudienceProfile 时依赖后端/mock 错误提示，不自动编造画像。
- 本轮 smoke 新增多个 `data/workspaces/ws_sm_simulated_market_*` 临时目录，符合任务“不清理临时 workspace”要求，但仓库整理/清理策略仍待后续处理。
- worktree 仍有多项未提交变更、Task Bus 文件与临时 workspace 目录；代码/任务均已通过 review，但尚未 commit/push。

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 用户授权进入 PLS 的数据默认放行；应用层不再按隐私字段名或值形态做 safety 拦截。
- taxonomy gate、quality gate 和产品对象契约仍然有效。
- pipeline 每一步要可追溯，便于后续回测和纠偏。
- 抖音 BI 数据（D-P1-F1）作为独立数据资产存 `douyin_*` 表，不合并进主 `channel_profile / sku`；前端只能通过 `/api/v0/bi/douyin/*` 读取。
- 数据管理底座（A-P2-1）是 source-agnostic 的；新数据源通过注册 adapter 接入，不改 `/data-management/*` 路由层。
- 渠道人群实体（A-P2-3）以 `channel_entity` 投影表为 read-optimized 层；V-P2-4 应优先消费 `/channels/entities` 而非 `/channels`（P0 mock）。
- Schema 变更通过 `apps/server/src/db/migrations/` 版本化迁移追踪（A-P3-DB-2）；新表 DDL 同时写入 migration 文件和 schema.ts 常量。`npm run schema:check` 可检测代码定义与库实际结构的一致性。

## A-P0-3 沉淀

- 契约定型见 `## 0` 关键契约点段落。
- V 域调用序列已定型两套（新品画像工作台 5 步、渠道匹配热力图 4 步）。

## A-P3-DB-MGMT-3 沉淀

- **Smoke wrapper 模板**：把数据库管理 smoke 切成 `empty` / `imported` 两套独立临时 workspace 后，复制成本极低；后续只要在 wrapper 内追加新的子脚本和模式字段即可。跨产品 / 跨任务都可以复用此模式（见 `AGENTS.md` §2.x）。
- **危险操作 confirmText 前置校验**：所有"先查后写"的危险操作路由都必须把 `confirmText` 校验放在打开 DB / 计算影响之前。否则对"目标不存在 / 空库 / 未经导入的数据集"的错误 confirmText 会被短路成 404 / 200 success，绕过用户明确确认的强制语义。该规则已写入 `AGENTS.md` §2.x-4。
- **ESM .mjs 文件易掉坑**：用 `edit` 多次插入 `let passed = 0;` / `function printResult() {}` 时，必须注意 `Replace all` 默认替换所有同名标识符；本次曾因重复声明 `function printResult` 触发 SyntaxError。落地：在 edit 前先 `grep -n` 整个文件确认无同名标识符，再做精准 patch。
- **JSON summary runner 子脚本末尾必须输出 `RESULT: {...}`**：wrapper 通过正则 `RESULT:\s*(\{[^\n]+\})` 抓取并汇总；任何不带该行的子脚本都会被 wrapper 标记为 "no result line"。

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
- **路由层错误用 warnings 判 not-found**：A-P3-DB-6 第二轮返工暴露。`impactDeleteVersion` 对真实业务版本返回 `warnings: ["contains user_authorized douyin_* data"]`，路由曾用 `warnings.length > 0` 直接 404，导致 dry-run 找到 692 行但正式删除返回 404。教训：impact 报告中 warnings 是数据特征描述，存在性必须用 `affectedRows === 0` 或独立的 `notFound` 标记判断。
- **工具模块运行目录、workspace 与 DB 隔离**：A-P4-TOOLS-1 把工具运行输出限定在 `data/local/tool-runs/<runId>/`，只写文件系统，不写入业务表；失败运行仍保留 `run_manifest.json` + `quality_report.json` + errors。总控复核时补强 run / artifact 查询的 `workspaceId` 校验，避免跨 workspace 读取运行记录或产物。
- **Hono 子路由含参与具体路由顺序同样重要**：`tools.get("/:toolId")` 若放在 `tools.get("/runs")` 之前，`/runs` 会被 `/:toolId` 吃掉。教训：子路由内同样遵循“具体路由在前，通用参数路由在后”。
- **artifact 路径遍历防御在路由层之外也需做**：虽然 Hono 对未编码的 `../` 路径直接 404，但编码后的 `%2F..` 会进入 handler，因此 `isSafeArtifactId` 必须显式拒绝 `..` / `//` / 绝对路径。
- **受控样本包 adapter 必须按绑定键过滤**：`single-product-portrait` 工具消费 `product_attributes.jsonl` + `platform_portrait.csv` 时，不能把所有画像行作为 anchor 丢给当前 SKU。必须按 `skuId + sourceProductKey` 过滤，否则多 SKU 样本包会串画像。`loadPackageAnchor` 应接受 filter 参数，无匹配画像行时显式失败。
- **artifact 机器可读产物必须保留来源 lineage**：`prediction.json` 不仅要有人工可读的 `report.md`，顶层也要写 `sourceFiles` 数组，让下游 V/A 读取时不丢失数据来源和版本信息。
- **跨包引用 model 源码会触发 server 的 `noUncheckedIndexedAccess`**：`apps/server/tsconfig.json` 纳入 `../model/src/single-product-portrait.ts` 后，model 文件内 `const [a, b] = fields` 这种解构会被推断为 `string | undefined`。修复只能是 model 侧加 `fields[0]!` 或默认值，因为 server 的 strict 配置比 model 更严格。契约测试和 smoke 回归可验证行为无变化。
- **工具 dry-run 的 plannedArtifacts 应来自工具定义**：`sample-profile-extract` 的 `outputFormats` 推导出的 `aggregate_profile.json` 不适用于新工具。为 `single-product-portrait` 注册 `plannedArtifacts: ["artifacts/prediction.json", "artifacts/report.md"]` 后，`planDryRun` 改为优先使用定义字段，避免 dry-run 与实际产物不一致。

## A-P7-INGEST-2 沉淀

- **CSV 上传暂存与 dry-run 解耦**：dry-run 接收 multipart 文件并落盘到 `data/local/csv-staging/<workspace>/<stagedFileId>/`，返回 `stagedFileId`；正式 import 用 JSON 提交 `stagedFileId`，可复用现有 `idempotencyMiddleware`（JSON body）。`staging.json` 保存 `contentHash`，execute 时拒绝被修改过的 staged file。
- **目标表双重校验**：`CSV_PROTECTED_TABLES`（系统表）+ `CSV_ALLOWED_TABLES`（业务表白名单）+ `PRAGMA table_info` 存在性检查。三层任一失败都按 `unsupported_target_table` 处理。
- **NOT NULL DEFAULT 列的 INSERT 策略**：CSV 提供的列按值插入；未提供的列不进入 INSERT column list，让 SQLite 使用 DEFAULT。这样避免显式传 NULL 触发 NOT NULL 约束失败。
- **workspace_id 作为上下文注入**：CSV 可省略 `workspace_id`；若提供但与请求头不一致，仅 warning 并以请求头为准。INSERT 时统一写入 `workspaceId`。
- **类型推断 = PRAGMA 声明类型 + 表级 override**：JSON / BOOLEAN / DATETIME 等在 SQLite 中多为 TEXT/INTEGER，需通过 `COLUMN_TYPE_OVERRIDES` 显式标记。后续 schema 新增 JSON 列时，应同步更新该配置。
- **主键缺失归入 `missingColumns`**：D 契约把 `primary_key_missing` 与 `missing_required_column` 分为两个 rule，但 `missingColumns` 字段汇总所有 header 中缺失的必填/主键列，便于 V 域展示。
- **CSV 解析手写**：当前无 csv-parse 依赖，parser 处理引号、逗号、CRLF/LF。复杂 RFC 4180 场景（如引号内换行）后续可考虑引入 `csv-parse`。
- **Staging 文件生命周期**：当前成功导入后不清除 staged file，长期运行会累积。临时 workspace 运行结束可整体清理；生产环境需后续加 retention。
- **stagedFileId 必须强校验**：限制格式 `^csv_[0-9]+_[a-z0-9]{6}$`，resolve 后确认路径仍在当前 workspace 的 staging 目录下，读取 `staging.json` 后再次校验 `meta.workspaceId`/`meta.stagedFileId`/`meta.targetTable`。任何一项失败都视为 staged file 不存在，返回 400 而非 500。
- **CSV 导入仅 append**：第一期不支持 upsert。dry-run 阶段查询目标表，已有主键冲突时生成 `primary_key_conflict` blocking error；execute 使用普通 `INSERT`，二次导入同一批数据会被 dry-run 拦截。这避免了 REPLACE 语义下的业务数据被静默覆盖。
- **typeErrors 只统计类型转换失败**：`typeErrors` 字段仅对 `rule === "type_conversion_failed"` 累加，header 缺失、主键缺失、主键冲突等 blocking errors 不再混入该计数。
- **正式导入响应 snapshot 用真实行数**：`beforeSnapshot` / `afterSnapshot` 通过 `COUNT(*) WHERE workspace_id = ?` 读取目标表实际行数，并同步写入 `db_admin_audit`，不再固定为 0。
