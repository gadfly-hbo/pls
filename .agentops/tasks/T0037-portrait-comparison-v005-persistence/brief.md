---
id: "T0037"
slug: "portrait-comparison-v005-persistence"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "098e538ba8bd7ebc93bddbf4f0e8c95ff9dac945"
batch: "portrait-comparison-v1"
sequence: "2"
depends_on: 
  - "T0036"
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/src/db/migrations/V005_portrait_comparison.ts"
  - "apps/server/src/db/schema.ts"
  - "apps/server/src/db/migrate.ts"
  - "apps/server/src/db/schema-check.ts"
  - "apps/server/src/db/portrait-comparison-schema-contract-test.ts"
  - "apps/server/src/lib/dangerous-ops.ts"
  - "apps/server/src/routes/admin-database.ts"
  - "apps/server/package.json"
  - "docs/notes-backend.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run portrait-comparison-schema:contract-test"
  - "npm run guard:worktree"
  - "git diff --check"
  - "git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
---

## 目标

实施已批准的 Portrait Comparison V005 持久化模型，为后续 algorithm、PortraitSource、application/API 任务提供稳定 durable contract：

1. 新增 `V005_portrait_comparison`，创建 8 张规范化表：
   - `comparison_run`
   - `comparison_participant`
   - `comparison_portrait_source`
   - `comparison_dimension_evidence`
   - `comparison_dimension_assessment`
   - `comparison_explanation_attempt`
   - `comparison_explanation_outcome`
   - `comparison_archive_event`
2. V005 持有单一 DDL 真源；fresh schema、`migrate.ts`、rebuild 与 `schema:check` 必须消费同一 DDL，禁止复制第二份表定义。
3. 把 8 张表全部加入 Admin protected/immutable table contract，truncate/drop 必须 fail closed。
4. 提供结构 contract tests，验证 migration、fresh schema、约束、索引、删除保护和 Admin 分类。

权威决定：`docs/portrait-comparison-structure-decision-ledger.md` S001-S055、S069-S090，尤其 S017-S050、S051-S055、S076-S090。前置任务 T0036 已批准。

## 非目标

- 不实现 Comparison algorithm、quality policy、canonical JSON helper、rule summary。
- 不实现 `PortraitSource`、repository/application service、HTTP route 或前端。
- 不创建正式 Dimension Evidence 上游数据结构，不发布真实 policy 数值。
- 不修改 Flywheel schema 或 `decision_record`。
- 不写 `data_source` 配置，不回填 PLS 旧结果，不导入 WorkPLS fixture。
- 不写入或迁移 `ws_demo` 真身，不提交或推送代码，不安装新依赖。

## 持久化 Contract

### 全局约束

- 所有记录均有独立小写 UUID v4 ID，均显式保存 `workspace_id`。
- 父子引用使用 `(workspace_id, id)` 组合外键；被引用表必须提供对应组合唯一键。所有业务外键使用 `ON DELETE RESTRICT`。
- UTC 系统时间保存毫秒精度文本；业务周期保存闭合 `YYYY-MM-DD` start/end。DB 只校验稳定格式和顺序，真实日历合法性留给 application。
- canonical JSON 集合字段 `NOT NULL DEFAULT '[]'`；对象字段按 contract 使用非空 canonical JSON。不得以 NULL 和空数组表达同一状态。
- 外部 object/snapshot/data ID 原样、大小写敏感；不得在 migration 中规范化或补造。
- CHECK 必须覆盖已批准枚举、0/1 boolean、有限范围、条件字段组合；SQLite 结构能保护的约束不得只留给未来 application。

### `comparison_run`

- 主身份、workspace、`mode`（仅 `peer_same_period|self_cross_period`）。
- `similarity_score`、`coverage`、`quality_status`（仅 `ready|limited`）、`quality_reasons`。
- algorithm、quality policy、comparison contract 的 identity/version/full SHA-256 checksum。
- `idempotency_key`、canonical `request_fingerprint`，workspace 内幂等键唯一；fingerprint 使用 64 位小写 hex CHECK。
- `created_at`、不透明 `created_by`、可空 `created_by_display_name`。
- Run 记录不可更新语义由后续 repository 负责；本任务不加未经批准的 trigger。

### `comparison_participant` 与 `comparison_portrait_source`

- Participant 保存 run、`role`（baseline/comparison）、`family`（channel/product）、首期受控 `object_type`（channel family 使用现有 channel object 类型；product family 首期仅 `sku`）、原样 `object_id`、非空 `display_name` 快照；每 Run/role 唯一。
- Source 与 participant 一对一；`source_system` 仅 `pls_workspace|agentharness`，保存 source contract version、snapshot/data version、period start/end、source generatedAt。
- source batch/sample size/confidence 可空；质量状态仅 `ready|limited`；source flags 与 policy reasons 分开保存为非空 JSON 数组。
- 同一 Run 两侧 source system/contract 同版、每 Run 恰好两侧等跨行约束留给 application，不用 trigger 猜测。

### `comparison_dimension_evidence` 与 `comparison_dimension_assessment`

- Evidence 每 participant/dimension 最多一行；保存 key/label、有限数值、非空 unit、`ready|limited`、source flags、policy reasons、非空受控 evidence refs。
- Assessment 每 Run/dimension 恰好一行；保存 key/label/expected unit、正权重、`included|excluded`、受控 exclusion reason：`missing_baseline|missing_comparison|missing_both|unit_mismatch|quality_insufficient`。
- included 时必须有同 workspace/run 两侧 evidence 引用及 normalized values、delta、similarity、contribution，exclusion reason 必须 NULL；excluded 时 evidence 引用和全部派生数值必须 NULL，exclusion reason 必填。
- score/coverage/contribution 的跨行汇总校验留给 application；DB 保护数值范围和 included/excluded 条件形态。

### Explanation 与 Archive

- Attempt：Run 内 `sequence` 唯一递增、generator type 仅 `rule|ai`，保存 generator identity/version、explanation contract、canonical evidence manifest 与完整 checksum、started_at、actor。
- Outcome：每 Attempt 最多一行；status 仅 `succeeded|failed`。成功时保存受控 content 且失败字段为空；失败时保存受控六类 error code、failure contract、0/1 retryable、脱敏 message，成功 content 为空。六类 code 必须从账本/WorkPLS 权威实现核对，不得自行新增近似枚举；如证据无法唯一确定，停止并提交 contract change request。
- Archive Event：Run 内 sequence 唯一，operation 仅 `archived|restored`，保存 operation fingerprint、idempotency key、可空 reason、actor、occurred_at；workspace+run+idempotency key 唯一。当前状态由最后事件推导，不在 Run 增加 mutable archived 字段。

### 索引

只建立已批准查询与完整性所需索引：workspace + createdAt/runId 稳定历史查询、父子访问、participant/evidence/assessment 唯一性、attempt/archive sequence、幂等键。不得增加无查询证据的宽泛索引或 View。

## 允许范围

- `apps/server/src/db/migrations/V005_portrait_comparison.ts`（新建；单一 DDL 真源）
- `apps/server/src/db/schema.ts`（仅接入/导出 V005 DDL 到 fresh schema）
- `apps/server/src/db/migrate.ts`（仅同步执行 V005 DDL）
- `apps/server/src/db/schema-check.ts`（仅纳入 V005 DDL）
- `apps/server/src/db/portrait-comparison-schema-contract-test.ts`（新建）
- `apps/server/src/lib/dangerous-ops.ts`（仅 8 表 Admin protection 与 rebuild fresh schema 接入）
- `apps/server/src/routes/admin-database.ts`（仅 table catalog/classification 与 8 表 immutable protection）
- `apps/server/package.json`（仅新增定向 contract-test script）
- `docs/notes-backend.md`（仅更新 `## 0. 当前状态` 与本任务验证事实）

超出范围必须停止并提交 contract change request。不得修改 T0036 runner、V001-V004、fixture DB、API schema、算法或前端。

## 实施约束

- 先读取 PLS `AGENTS.md`、结构账本、T0036 handoff/review、现有 V001-V004、`schema.ts`、`migrate.ts`、`schema-check.ts`、`dangerous-ops.ts` 和 `admin-database.ts`。
- 先列出 8 表 constraint matrix，再写 DDL；每张表逐项核对 grain、identity、workspace FK、unique、enum/CHECK、NULL 条件、delete action、索引。
- V005 必须 export 可复用 DDL 常量并由 `up()` 执行；fresh/rebuild/check 不得复制字符串。
- 不以 `CREATE TRIGGER` 实现未批准的 application 生命周期约束。
- 不运行根 `npm run migrate` 或任何会写 `data/workspaces/ws_demo/db.sqlite` 的命令。测试只使用 `/tmp` DB 或按项目规则创建的临时 workspace。
- Admin protection 必须同时覆盖 `PROTECTED_TABLES`、route catalog/immutable 判断和 rebuild fresh schema；不得只改其中一处。
- 发现账本没有唯一确定某个持久字段、六类 error code 或约束时，不得猜测；在 handoff 提交 `CONTRACT_CHANGE_REQUEST` 并停止扩张。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run portrait-comparison-schema:contract-test`
- 在 `/tmp` DB 分别验证：fresh V001-V005、已有 V001-V004 升 V005、repeat no-op、V005 checksum 64 位、8 表/索引/组合 FK/CHECK/UNIQUE/RESTRICT。
- 验证 migration 路径与 fresh schema 路径生成的 8 表 `sqlite_master.sql` 规范化后一致。
- 负向测试至少覆盖：跨 workspace FK、重复 role/source/dimension/sequence/idempotency、非法 enum、非法 checksum、included/excluded 条件矛盾、删除父记录受 RESTRICT 阻止。
- 验证 8 表对 Admin truncate/drop 均为 protected，且 table overview 不把它们暴露为 droppable/truncatable。
- `cd apps/server && npm run schema:check` 只允许在明确的 `/tmp`/临时 workspace 运行；不得写 `ws_demo`。如现有 CLI 不支持安全注入，使用 contract test 直接调用 checker，不得为方便修改 fixture。
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

## Handoff

使用 `/agentops-task-handoff`，必须包含：

- What Changed
- Files Changed
- 8 表 constraint matrix 与单一 DDL 真源说明
- Validation（逐条命令、结果与测试数量）
- Admin protection 覆盖证据
- Risks / Open Questions
- Contract Drift（无则明确写“无”）
- `ws_demo`、backup、临时 workspace 和生成产物清理复核
- Memory Used / Memory Candidates

任何新持久化结构决定都必须停止并回到结构确认流程；不得在 worker handoff 中自行批准。

## 执行顺序与依赖

- batch：`portrait-comparison-v1`
- sequence：2
- depends_on：`T0036`
- claim 条件：只有 T0036 状态为 `approved` 时可领取；当前条件已满足。

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：2
- 依赖：T0036
- 只有依赖任务全部 approved 后才可领取。
