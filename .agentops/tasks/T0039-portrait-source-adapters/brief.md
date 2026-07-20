---
id: "T0039"
slug: "portrait-source-adapters"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "098e538ba8bd7ebc93bddbf4f0e8c95ff9dac945"
batch: "portrait-comparison-v1"
sequence: "4"
depends_on: 
  - "T0038"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/src/portrait-comparison/portrait-source/"
  - "apps/server/src/portrait-comparison/portrait-source-contract-test.ts"
  - "apps/server/src/portrait-comparison/index.ts"
  - "apps/server/package.json"
  - "docs/notes-backend.md"
  - "docs/workpls-absorption-retirement-checklist.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run portrait-source:contract-test"
  - "cd apps/server && npm run portrait-comparison-algorithm:contract-test"
  - "cd apps/server && npm run portrait-comparison-schema:contract-test"
  - "npm run guard:worktree"
  - "git diff --check"
  - "git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
---

## 目标

在 T0038 已批准的纯算法 contract 与 T0037 已批准的 V005 结构之上，实现 PLS 自有的 `PortraitSource` 深模块，为 W05 application/persistence 提供稳定、只读、fail-closed 的画像来源 seam：

1. 实现中性 `PortraitSource` interface，外部只暴露结构账本批准的四项能力：`getCapabilities`、`listPortraitObjects`、`listPortraitSnapshots`、`resolvePortraitSnapshot`。
2. 实现 `PlsWorkspacePortraitSource`：默认来源，只基于 PLS 当前真实 schema 做对象/快照发现；当前没有正式 unit-bearing Dimension Evidence，evidence capability 与正式 resolve 必须明确 `not_ready`，不得从 mock/tag score 猜 unit 或伪造 evidence。
3. 实现可选 `AgentHarnessPortraitSource`：读取当前 AgentHarness 0.3.0 已落盘只读 views，使用显式绝对路径、独立 `readOnly` + `PRAGMA query_only=ON` 连接和精确 schema gate。
4. 实现 workspace active source resolver：复用当前 workspace DB 的 `data_source`，固定 `source_id=portrait_source`；无记录时最终默认 `pls_workspace`，有记录但非法、inactive、不可用或 schema 不兼容时 fail closed，禁止静默 fallback。
5. 提供真实 contract tests，证明 workspace 隔离、外部 ID 原样保留、source facts/lineage 完整、配置解析严格、AgentHarness 只读、PLS evidence gate 和 resolver 无静默 fallback。

权威决定：`docs/portrait-comparison-structure-decision-ledger.md` S021-S029、S056-S059、S064、S070-S072、S080、S083、S085-S086，以及 `## 4.1`、`## 4.4`、`## 6`、`## 8`。前置任务 T0038 已批准。

只读证据必须先查真实文件，不得只依赖本文摘要：

- PLS `apps/server/src/db/schema.ts` 中 `data_source`、channel/profile 相关表与 view。
- PLS `apps/server/src/db/connection.ts` 与 `apps/server/src/services/data-source-registry.ts`。
- PLS T0037 V005 migration/schema contract 与 T0038 algorithm/evidence contract。
- AgentHarness `/Users/huangbo/Dev/AgentHarness/DataBase/migrations/029_create_v_pls_audience_profile_snapshots.sql`。
- AgentHarness `/Users/huangbo/Dev/AgentHarness/DataBase/migrations/030_create_v_workpls_dimension_evidence.sql`。
- AgentHarness `/Users/huangbo/Dev/AgentHarness/DataBase/validations/030_validate_v_workpls_dimension_evidence.sql`。
- AgentHarness `/Users/huangbo/Dev/AgentHarness/DataBase/docs/pls-consumption-guide.md`。
- WorkPLS 只读参考 `/Users/huangbo/Dev/Projects/workpls/apps/server/src/portrait-source/` 与 `/Users/huangbo/Dev/Projects/workpls/apps/server/test/portrait-source.test.ts`。

WorkPLS 仅是已验证实现参考；PLS module identity、errors、paths 和 interface 必须属于 PLS。AgentHarness 的既有 `v_workpls_dimension_evidence` 名称是当前上游兼容读取面，不得在本任务修改 AgentHarness 或假称已重命名。

## 非目标

- 不修改任何 DB schema、migration、V005 表、`data_source` 表结构或 AgentHarness 文件。
- 不新增 HTTP route、readiness endpoint、repository、Run transaction、idempotency、explanation persistence、archive 或 UI。
- 不写 `data_source` 配置记录，不实现 Admin 配置 UI；本任务只读取并验证既有记录。
- 不发布 candidate dimensions、normalization、weight、coverage/quality thresholds 或 released quality policy。
- 不把 PLS mock/tag score、缺少 unit 的数据转换为正式 Dimension Evidence。
- 不导入 WorkPLS fixture/业务数据，不修改 ModelEvol artifact，不安装依赖，不提交或推送。

## Contract

### Interface 与 source facts

- 外部 interface 只有：`getCapabilities(workspaceId)`、`listPortraitObjects(workspaceId, filters)`、`listPortraitSnapshots(workspaceId, objectId)`、`resolvePortraitSnapshot(workspaceId, objectId, snapshotId)`；不得把 SQLite row、SQL、view/table 名或 adapter implementation 暴露给调用方。
- source system 仅 `pls_workspace|agentharness`；source contract version 必须显式保存/返回。
- object family 首期为 `channel|product`，object type 只能使用结构账本与 V005 已批准枚举；AgentHarness 首期只映射真实支持的 channel types，PLS product 仅在真实稳定 `sku` identity 存在时开放。
- 外部 object/snapshot ID 原样、case-sensitive、不得 trim/重写/拼接占位 ID；display name 缺失或空白时 fail closed。
- snapshot 必须保留 data version、闭合 period、source generatedAt、可空 source batch/sample/confidence、source quality flags 与稳定 evidence refs；未知值使用 `null`，不得补 0/default。
- `resolvePortraitSnapshot` 返回同一 object/snapshot 的不可变计算输入快照；missing dimension 不建行、不补零。source quality facts 与 PLS policy derivation 分离，不由 adapter 发布 `ready|limited` 最终结论。

### PLS workspace adapter

- 只查询 PLS 当前真实 schema；先确认 table/view、字段、枚举和 grain，再实现 mapper。
- 当前只开放有真实依据的 object/snapshot discovery。没有正式 non-mock、unit-bearing evidence 时，capability 必须明确 `not_ready`，resolve 走受控不可用错误，不得返回空 evidence 冒充可计算快照。
- 禁止依赖 `ws_demo` 特定业务行、dataVersion 或 mock 名称；contract test 使用临时 DB 与最小真实同构 schema/rows。

### AgentHarness adapter

- 构造参数使用显式 `dbPath`；必须为 absolute regular file，拒绝相对路径、symlink、目录、PLS 自身 workspace DB 路径与不可访问路径。
- 使用独立 `DatabaseSync(dbPath, { readOnly: true })` 连接；设置并回读验证同一连接的 `PRAGMA query_only=ON`。任何写尝试必须失败。
- schema gate 精确核对当前 0.3.0 required views 与 required columns（名称、缺失、extra/reordered 的处理需按 AgentHarness 权威 migration/validation）；不得 `SELECT *` 或按 ordinal 猜字段。
- 所有查询必须带 `workspace_id`，objectId/snapshotId 精确 BINARY 语义；跨 workspace、重复/歧义 snapshot、blank/non-finite/非法 JSON/不一致 source facts 必须 fail closed。
- `v_workpls_dimension_evidence` 的 metric、unit、snapshot、time window、batch 和 evidence refs 必须成组一致；不得丢弃 lineage、伪造 unit 或使用 SQL/path/rowid/raw row 作为 evidence ref。

### Active source resolver

- 在当前 workspace DB 中按 `workspace_id` + `source_id='portrait_source'` 精确读取 `data_source`。
- 无记录：返回 `pls_workspace` 默认来源；该默认仅发生于“记录缺失”。
- 有记录：`status` 必须为 `active`，`adapter` 只允许 `pls_workspace|agentharness`，`config` 必须是 JSON object。非法 JSON、unknown adapter、inactive、重复/错 workspace 或 adapter 构造失败均返回受控错误，不得 fallback。
- `pls_workspace` config 必须保持空 object；`agentharness` config 只允许 WorkPLS 已有构造语义对应的 `dbPath` 非空字符串。若真实 PLS/AgentHarness 证据要求不同持久化字段名或新增配置语义，停止并提交 `CONTRACT_CHANGE_REQUEST`，不得自行扩展 durable config contract。
- resolver 与 adapters 只读，不得 INSERT/UPDATE/DELETE `data_source` 或来源 DB。

## 允许范围

- `apps/server/src/portrait-comparison/portrait-source/`
- `apps/server/src/portrait-comparison/portrait-source-contract-test.ts`
- `apps/server/src/portrait-comparison/index.ts`（仅导出 W04 public contract）
- `apps/server/package.json`（仅新增定向 contract-test script）
- `docs/notes-backend.md`（仅更新 `## 0. 当前状态` 与 W04 验证事实）
- `docs/workpls-absorption-retirement-checklist.md`（handoff 前仅更新 W04 执行事实；completed 状态由总控 review 后写）

超出范围必须停止并提交 `CONTRACT_CHANGE_REQUEST`。特别是任何 schema/migration、HTTP、V005 repository 或 AgentHarness 持久化变更均不在本任务授权内。

## 实施约束

- 先读取 PLS `AGENTS.md`、结构账本、T0037/T0038 handoff+review、backend domain memory 和上述真实 PLS/AgentHarness/WorkPLS 文件。
- 在编码前列出 interface/config/schema-gate/mapper/query/failure constraint matrix；逐项做静态负向走查。
- TypeScript strict，避免 `any`；错误 taxonomy 与 validation issues 显式，不吞 unknown error，不把原始 SQLite/provider error 直接透传上层。
- 多来源取值不得提前 `?? {}` 固化 config；保持 undefined/null 到最终 resolver fallback 点。
- AgentHarness DB 生命周期必须显式可关闭；构造中途失败需关闭已打开连接；测试需证明无 FD/连接泄漏风险。
- 不得从 WorkPLS 复制 `workpls-*` 产品 identity；外部 AgentHarness view 名作为只读 source evidence 可保留。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run portrait-source:contract-test`
- `cd apps/server && npm run portrait-comparison-algorithm:contract-test`
- `cd apps/server && npm run portrait-comparison-schema:contract-test`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

Contract test 至少覆盖：

- 四方法 public surface，无额外 DB/HTTP leakage。
- PLS default only when config row missing；explicit invalid/unavailable AgentHarness 不 fallback。
- PLS discovery 使用真实 schema 且 evidence capability `not_ready`；无 unit 时 resolve fail closed。
- AgentHarness exact schema gate：missing view/column、extra/reordered contract drift、0.3.0 version。
- absolute path、symlink/self-DB/directory 拒绝；readOnly + query_only 设置与回读；写入失败。
- workspace/object/snapshot exact matching、case sensitivity、重复/歧义拒绝、稳定排序。
- period/timestamp/sample/confidence/JSON/source flags/evidence refs 的合法与负向边界。
- evidence 同 snapshot/metric/unit/window/batch 一致；non-finite/blank/缺 unit/空 refs/cross-workspace 拒绝。
- source facts 原样保留；unknown 不补默认；没有 mock/fixture 伪装正式 evidence。

## Handoff

使用 `/agentops-handoff-self-audit` 后执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed。
- Interface/config/schema-gate/mapper/query/failure constraint matrix。
- 真实 PLS 与 AgentHarness 证据路径、symbol/view/column 对照；WorkPLS→PLS identity/contract 差异。
- Validation：逐条命令、exit code、测试数量与关键负向用例。
- 明确证明 PLS evidence capability 仍为 `not_ready`，未发布 policy 数值、未开放 formal Run。
- 明确证明 AgentHarness 只读/query_only、无 fallback、workspace 隔离与连接关闭。
- Risks / Open Questions / Contract Drift / Protected paths cleanup。
- Memory Used / Memory Candidates。
- 建议下一任务 W05：Comparison repository/application transaction、幂等 Run、list/detail、rule explanation persistence、archive。

发现新 durable config 字段、AgentHarness contract drift、PLS 无真实 snapshot identity、需要 schema/HTTP 变更或无法满足只读 gate 时，必须停止并提交 `CONTRACT_CHANGE_REQUEST`，不得扩张范围。

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：4
- 依赖：T0038
- 只有依赖任务全部 approved 后才可领取。
