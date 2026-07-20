## 目标

在 T0037 已批准的 V005 八表结构、T0038 已批准的纯算法/规则摘要 contract、T0039 已批准的四方法 `PortraitSource` seam 之上，实现 PLS 自有的 Portrait Comparison repository/application 深模块：

1. 提供受控的 create/list/detail/explanation/archive application interface 与稳定 DTO；隐藏 SQLite row、SQL、幂等内部字段和 provider 细节。
2. 实现来源读取在事务外、核心 Comparison Run 聚合图在单个 `BEGIN IMMEDIATE` 事务内原子持久化，并在事务内完成 race-safe 幂等复核。
3. 实现 workspace-scoped 创建幂等、稳定 list cursor、聚合 detail、追加式 archive/restore，以及 Run 成功后的 deterministic rule explanation Attempt/Outcome。
4. 对所有跨行不变量做 application 校验和持久化前/后交叉复算；任何 blocked、来源、算法或事务失败都不得留下 Comparison 核心表半成品。
5. 提供临时 SQLite DB contract tests，覆盖 rollback、重放/冲突/竞争、workspace 隔离、读模型、解释和归档。

权威决定：`docs/portrait-comparison-structure-decision-ledger.md` S001-S015、S023、S027、S030、S033-S050、S060、S062-S063、S065-S066、S069-S075、S078-S082、S086、S088-S091、S093，以及 `## 4.2`、`## 4.3`、`## 4.4`、`## 6`、`## 8`。前置任务 T0039 已批准。

必须先读取真实证据，不得只依赖本文摘要：

- T0037、T0038、T0039 的 `brief.md`、`handoff.md`、`review.md`。
- `apps/server/src/db/migrations/V005_portrait_comparison.ts` 的真实列、约束、唯一键与外键。
- `apps/server/src/portrait-comparison/algorithm.ts`、`quality-policy.ts`、`rule-summary.ts` 与 `portrait-source/` public contract。
- `apps/server/src/lib/audit.ts`、`apps/server/src/db/connection.ts` 的真实行为。
- WorkPLS 只读参考：`/Users/huangbo/Dev/Projects/workpls/apps/server/src/persistence/`、`application/`、`explanation/` 及相应 tests；只能吸收已批准的机制，不能迁入产品 identity、transport、阈值或 fixture。

## 非目标

- 不修改 schema、migration、索引、Admin protection、`data_source` 结构或任何 AgentHarness 文件。
- 不新增或修改 HTTP route、middleware、response envelope、readiness endpoint 或 UI；HTTP 属 W06。
- 不发布 production candidate dimensions、normalization、weight、coverage/quality threshold；不允许 env、fixture 或隐式 fallback 绕过 `not_released` gate。
- 不实现 AI explanation、`pi-agent`、AI HTTP 入口或 Flywheel 集成。
- 不导入 WorkPLS 数据/fixture，不依赖 `ws_demo` 特定行，不安装依赖，不提交或推送代码。
- 不新建 View/物化 ReadModel，不修改通用 idempotency cache 作为 Comparison 权威。

## Contract

### Application 与 production gate

- public application surface 只覆盖 `create`、`list`、`detail`、`explanation`、`archive` 五类受控能力；repository 作为聚合持久化边界，不向调用方暴露 DB row、表名或 SQL。
- production composition 必须读取 `getProductionQualityPolicy()`；当前为 `not_released`，所以正式 create 必须 fail closed，且八张 Comparison 表写入数均为 0。不得导出 production 数值默认值或可由环境变量开启的旁路。
- 为验证成功图，可提供显式 dependency injection 的 internal/test-only execution profile（released quality evaluator + algorithm config + clock/UUID/fault hooks）；不得从 `apps/server/src/portrait-comparison/index.ts` 暴露测试 fixture、released 假 policy 或数值默认值。
- 受信任 actor 由 application caller context 注入，不从 create body 获取；HTTP 映射留给 W06。
- 失败使用稳定、受控 error taxonomy；原始 SQLite/source/provider error 和 stack 不进入 DTO、audit metadata 或 explanation error message。

### Create、mode 与幂等

- 创建意图只包含 mode 与 baseline/comparison 的 object/snapshot refs；派生分数、证据、版本、quality 或 actor 不得由业务 request 注入。
- request fingerprint 使用 Canonical JSON v1 +完整小写 SHA-256，至少覆盖 workspace、trusted actor、mode、两侧 object/snapshot refs 与 comparison contract identity/version/checksum；外部 ID 原样、case-sensitive，不 trim/重写。
- 同 workspace + idempotency key + 相同 fingerprint 返回既有 Run；不得重新读取来源，不得新建 participant/evidence/assessment，也不得重复已有的 automatic rule Attempt。若核心 Run 已存在但自动 rule explanation 因进程中断缺失，重放可通过事务化 ensure-once 补齐一次；已有 attempt/outcome 不得重复。
- 同 workspace + key + 不同 fingerprint 为受控冲突；跨 workspace 的相同 key 互不影响。创建事务内部必须再次查询 key/fingerprint，覆盖两个连接竞争；不能只靠预查或捕获 UNIQUE 后猜测重放。
- 每次用户明确执行使用新 key 创建新不可变 Run；所有本地业务 ID 使用 `crypto.randomUUID()` 生成并验证为小写 UUID v4。
- mode 合法性在 application 校验：`peer_same_period` 要求两侧 family/objectType 相同、objectId 不同、periodStart/periodEnd 完全相同；`self_cross_period` 要求 family/objectType/objectId 完全相同，且 baseline periodEnd 严格早于 comparison periodStart，禁止重叠。日期必须做真实日历校验，不仅检查字符串格式。

### 来源、质量、计算与核心事务

- 第一次幂等预查/冲突判断后，使用同一个已解析 `PortraitSource` 在写事务外 resolve 两侧不可变 snapshot；两侧 source system 与 source contract version 必须相同，data version 可以不同。
- 严格验证两侧 workspace、object/snapshot identity、family/objectType/displayName、周期、generatedAt、source facts、evidence refs；source facts 与 PLS policy reasons 分离，未知可空元数据保持 `null`。
- 质量 evaluator 的全部实际输入必须来自将要固化的 source/evidence snapshot；返回 `blocked` 时不运行/不持久化成功 Run，Comparison 八表写入为 0，只记录最小 audit/log。`limited|ready` 才可继续。
- 调用 T0038 algorithm，持久化全部候选 assessment（included 与 excluded），缺失 evidence 不建行、不补零；只为真实 evidence 生成 evidence row，assessment FK 精确指向同 Run、同 role 的 evidence。
- 进入 `BEGIN IMMEDIATE` 后：幂等二次复核；插入 Run、恰好 baseline/comparison 两 participant、每 participant 恰好一 source、所有可用 evidence、每个候选恰好一 assessment；任一阶段失败整体 rollback。来源读取、算法执行和 rule summary generation 均不得占用核心写事务。
- transaction 前校验并在持久化投影后交叉复算：两角色基数、participant/source/evidence workspace+ownership、source system/contract 一致、mode 合法性、candidate 全集、evidence dimension/unit/role 绑定、coverage、overall score、normalized values、raw/normalized delta、dimension similarity、weighted contribution；使用 algorithm config 的受控 floating tolerance，不因展示舍入改写数值。
- 固化 algorithm、quality policy、comparison contract 三组 identity/version/full checksum。comparison contract 使用明确 PLS identity 和版本化 Canonical JSON checksum，必须覆盖持久化映射与跨行语义，不得使用 WorkPLS identity。
- source/quality/algorithm/validation/transaction 失败均不得留下 `comparison_*` 核心记录；`audit_event` 可按 S047/S075 记录最小 metadata（workspace、actor、request/run id 如存在、operation/result/reason code），禁止复制原始 snapshot/evidence 或创建第二套 audit。

### Deterministic rule explanation

- 核心 Run commit 后自动生成 T0038 `createRuleSummary` 的 `rule` explanation；不调用 AI，不使用硬编码机会阈值，不冒充预测/推荐。
- explanation 与核心图分离：以独立短事务、`BEGIN IMMEDIATE` 分配 Run 内递增 attempt sequence 并 append Attempt；随后 append 至多一个 Outcome。核心 Run 成功后 explanation 失败不得回滚 Run。
- automatic rule explanation 必须 ensure-once：同 Run + 已批准 rule generator identity/version/contract 已存在时复用，不重复 attempt；崩溃留下 Attempt 无 Outcome 时，读取应表现为 interrupted/pending，不得伪造 failed。显式 explanation 重试才创建下一 sequence；本任务不开放 AI。
- succeeded outcome 保存受控 content object；failed outcome 使用 V005 六类 error code、failure contract、retryable 与脱敏非空 message。manifest 只能引用同 workspace、同 Run 的五类已持久化 deterministic record，保存 canonical array 与完整 checksum；生成前后验证 record 存在、归属和 checksum。
- sequence 分配、存在性检查与插入必须同一事务，覆盖并发；fault injection 要证明 Attempt/Outcome 不会形成违反 contract 的半写状态。

### Repository read model

- list 以 `(created_at, run_id)` 稳定 cursor，排序与边界明确，不使用 offset；默认隐藏当前状态为 archived 的 Run，并支持显式 active/archived/all 筛选。所有查询必须带 workspace。
- detail 在 repository 聚合八表：Run、两 participant/source、evidence、全部 assessments、explanation attempt/outcome 历史、最新 archive state；检查基数、ownership、sequence 和 JSON shape 后转换 DTO，遇到损坏数据 fail closed。
- DTO 分 summary/detail/explanation/archive result；保留未展示舍入数值和必要来源/版本/质量/evidence facts，但隐藏 idempotency key、request fingerprint、原始 DB 列名、SQL/path/rowid 与 provider 内部错误。
- archived Run 默认 list 不可见，但 detail 仍可按 ID 读取；不存在与跨 workspace 必须使用相同受控 not-found 行为，避免 existence leak。

### Archive/restore

- 仅 append `comparison_archive_event`，禁止 UPDATE/DELETE Run 或历史事件。当前状态由最后 sequence 推导；无事件为 active。
- operation 仅 `archived|restored`；只允许 active→archived、archived→restored。调用者提供 expected current state/sequence 作为 optimistic concurrency 条件，过期状态受控冲突。
- operation fingerprint 使用 Canonical JSON 覆盖 workspace、run、trusted actor、operation、reason、expected state/sequence 与 archive contract；同 run + key + 相同 fingerprint 重放既有事件，不新增；不同 fingerprint 冲突。
- 在单个 `BEGIN IMMEDIATE` 中完成 workspace ownership、现态/expected、幂等复核、sequence 分配和 append，覆盖并发；reason 为可空非空字符串，不静默 trim/替换。

## 允许范围

- `apps/server/src/portrait-comparison/application/`
- `apps/server/src/portrait-comparison/repository/`
- `apps/server/src/portrait-comparison/portrait-comparison-application-contract-test.ts`
- `apps/server/src/portrait-comparison/index.ts`（只导出 W05 production public contract；不得导出 test fixtures/绕 gate profile）
- `apps/server/package.json`（仅新增定向 application contract-test script）
- `docs/notes-backend.md`（仅更新 `## 0. 当前状态` 与 W05 验证事实）
- `docs/workpls-absorption-retirement-checklist.md`（handoff 前仅更新 W05 执行事实；completed 由总控 review 后写）

超出范围必须停止并提交 `CONTRACT_CHANGE_REQUEST`。特别是 schema/migration/index/HTTP/shared audit helper 的修改不在本任务授权内；可直接复用现有 `writeAudit`，若真实 contract 不足则先请求变更，不得顺手修改共享层。

## 实施约束

- 先读取 PLS `AGENTS.md`、结构账本、T0037-T0039 handoff/review、backend memory 与上述真实源码；编码前列出 application/repository/transaction/idempotency/read/archive/explanation/failure constraint matrix。
- TypeScript strict，避免 `any`；所有 JSON 在写入/读取时经过权威 validator/canonicalizer，所有时间为注入 clock 产生的 UTC millisecond timestamp。
- 不把 source resolve、算法、规则生成或外部 I/O 放进 SQLite 写事务；事务 helper 必须显式 rollback，rollback/close 错误不得覆盖原始受控错误。
- 多来源取值保持 `undefined|null` 到最终 fallback 解析点，不得提前 `?? {}` 固化。
- contract tests 只使用 `mkdtemp` 临时目录/DB、真实 `BASE_SCHEMA` + V005 DDL/迁移和显式 fake `PortraitSource`；不得打开、复制或修改 `ws_demo` fixture DB。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run portrait-comparison-application:contract-test`
- `cd apps/server && npm run portrait-source:contract-test`
- `cd apps/server && npm run portrait-comparison-algorithm:contract-test`
- `cd apps/server && npm run portrait-comparison-schema:contract-test`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

Application contract tests 至少覆盖：

- production `not_released` gate：create 受控失败，八张 Comparison 表均为 0；internal released fixture 不从 public index 可达。
- 成功图的真实行数/字段/三组版本 checksum/两 role+source/evidence/全候选 assessments；peer/self 合法与非法周期、日期和 identity 矩阵。
- 每个核心 graph 插入阶段的 fault injection 全量 rollback；source/quality/algorithm 失败零 Comparison 写入；audit 仅最小 metadata。
- 幂等首次、同 fingerprint 重放、不同 fingerprint 冲突、跨 workspace 同 key、两个连接竞争与事务内 recheck；重放不重复 child/rule attempt。
- 投影后 score/coverage/contribution/evidence ownership/candidate count tamper 检测；非法 JSON、非有限数、case-sensitive external ID 与 null 元数据。
- list cursor 无重复/漏项、相同 createdAt 用 runId tie-break、archive filter、workspace 隔离；detail 聚合、损坏基数/sequence/ownership fail closed、内部字段不泄漏。
- rule Attempt/Outcome 成功、生成失败、interrupted attempt、显式重试递增 sequence、并发分配、manifest 同 Run/record/checksum、automatic ensure-once。
- archive/restore 合法转换、非法重复转换、同 fingerprint 重放、key 冲突、过期 optimistic concurrency、并发 sequence、跨 workspace与 archived detail 可读。
- 受控错误不包含 SQLite/source/provider 原文；DB connection/transaction 均正确释放。

## Handoff

先执行 `/agentops-handoff-self-audit`，再执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed。
- application/repository/transaction/idempotency/read/archive/explanation/failure constraint matrix。
- V005 每表写入/读取/ownership 映射，以及 T0038/T0039 public contract 使用证据；WorkPLS→PLS identity/contract 差异。
- Validation：逐条命令、exit code、测试数量、关键 rollback/competition/gate 负向证据。
- 明确证明 production policy 仍 `not_released`、正式 create 零 Comparison 写入、无 HTTP/schema/AI/Flywheel 变更。
- 明确证明核心 Run graph 单事务、source/algorithm/explanation 在事务外、automatic rule ensure-once、archive/attempt sequence 事务化。
- Risks / Open Questions / Contract Drift / Protected paths cleanup。
- Memory Used / Memory Candidates。
- 建议下一任务 W06：`/api/v0/portrait-comparisons` readiness、gated create、list/detail/archive 与真实 HTTP contract tests。

发现需要新字段/索引、正式 policy 数值、公共 AI explanation、HTTP 语义或修改共享 audit helper 时，必须停止并提交 `CONTRACT_CHANGE_REQUEST`，不得扩张范围。
