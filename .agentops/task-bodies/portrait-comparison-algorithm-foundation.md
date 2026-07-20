## 目标

在 PLS 中迁移并收紧 WorkPLS 已验证的纯函数能力，为后续 `PortraitSource` 和 application/persistence 任务提供不依赖 DB、HTTP 或上游 adapter 的稳定算法 contract：

1. 实现 Canonical JSON v1 与 UTF-8 SHA-256 checksum helper。
2. 实现 `pls-portrait-comparison` deterministic Comparison algorithm：候选维度、线性归一化绝对差、exact unit、missing/quality exclusion、coverage 和 included-weight normalized similarity。
3. 实现版本化 quality policy contract shape 与显式 `not_released` 状态；不发布任何未经真实数据校准的 production 数值。
4. 实现 deterministic `rule` summary seam，输出受控 explanation content 与同 Run evidence manifest；不得冒充 AI，也不得迁移 WorkPLS 未经批准的硬编码 80 分机会判断。
5. 提供真实纯函数 contract tests，覆盖确定性、checksum、合法路径和负向边界。

权威决定：`docs/portrait-comparison-structure-decision-ledger.md` S007-S013、S033-S042、S065-S068、S086、S091-S093，以及 `## 4.4`、`## 6`、`## 8`。前置任务 T0037 已批准。

只读参考：

- `/Users/huangbo/Dev/Projects/workpls/apps/server/src/persistence/canonical-json.ts`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/src/persistence/checksum.ts`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/src/comparison-algorithm/`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/src/persistence/quality-policy.ts`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/src/rule-summary/`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/test/comparison-algorithm.test.ts`
- `/Users/huangbo/Dev/Projects/workpls/apps/server/test/formal-run-rule-explanation.test.ts`

WorkPLS 只是证据来源，不能原样复制其产品身份、路径、transport 或未获批准阈值。

## 非目标

- 不实现 `PortraitSource`、AgentHarness/PLS adapter 或 `data_source` 配置解析。
- 不读写 V005 表，不实现 repository、transaction、idempotency、HTTP route 或 UI。
- 不发布真实 candidate dimensions、min/max、weight、coverage threshold 或 quality threshold。
- 不开放 formal Run，不新增 mock Run、fixture 业务数据或 WorkPLS 数据。
- 不实现 AI explanation、`pi-agent` 调用或 Flywheel 集成。
- 不修改 V005 schema、migration runner、既有 API contract 或 ModelEvol artifact。
- 不安装新依赖，不提交或推送代码。

## Contract

### Canonical JSON/checksum

- JSON 只接受 `null|string|boolean|finite number|array|plain object`；拒绝 `undefined`、function、symbol、bigint、非有限数、unsafe integer、循环引用和非 plain object。
- object key 按 UTF-16 code unit 排序；array 保序；compact separators；number 使用 `JSON.stringify` 的 shortest round-trip 表达。
- checksum 为 canonical UTF-8 bytes 的 64 位小写 SHA-256 hex；相同语义/不同 object key 插入顺序必须得到相同 checksum。

### Comparison algorithm

- 产品 identity 必须是 `pls-portrait-comparison`，不得保留 `workpls-*` 产品 identity。
- mode 仅 `peer_same_period|self_cross_period`；两种 mode 共用同一计算公式，本任务不实现 application 合法性校验。
- candidate dimension 必须 key/label/unit 非空、key 唯一、weight 正且有限、normalization min/max 有限且 `min < max`；config checksum 必须覆盖完整计算语义。
- evidence 必须 side 合法、每 side+dimension 唯一、value 有限、unit 非空、质量状态受控；缺失不补零，unit 必须完全一致。
- exclusion reason 固定为 `missing_baseline|missing_comparison|missing_both|unit_mismatch|quality_insufficient`。
- coverage = included weight / all candidate weight × 100；similarity 只在 included weight 内归一化；覆盖不满足注入的测试 config 时 `overallScore=null`，不得伪造分数。
- 不导出 production candidate config；contract test 使用显式 local fixture config，并标记只用于测试。

### Quality policy

- 只实现版本化、可 checksum 的 policy shape、受控 reason taxonomy 与 `not_released` gate。
- 不得把 WorkPLS 测试阈值或当前 PLS mock 数据推导成 released policy。
- 任意调用方查询 production policy 时必须能明确得到 `not_released`，不得返回隐式默认阈值。

### Rule summary

- generator type 固定 `rule`，PLS generator identity/version 明确，不得包含 `workpls-*` identity。
- content 受控为 conclusion、similarities、differences、opportunities、risks、nextSteps；每个 claim 必须引用同一 manifest 中允许的五类 V005 deterministic record。
- 每类数组最多 3 条；unknown/blank/non-finite/invalid checksum/manifest mismatch 必须 fail closed。
- 未发布阈值下不得依据硬编码 score threshold 生成“机会”或推荐；不得用 AI、模型、预测、推荐引擎措辞冒充生成来源。

## 允许范围

- `apps/server/src/portrait-comparison/`（新建纯函数 module；不得包含 DB/HTTP/adapter）
- `apps/server/src/portrait-comparison/portrait-comparison-algorithm-contract-test.ts`
- `apps/server/package.json`（仅新增定向 contract-test script）
- `docs/notes-model.md`（仅更新 `## 0. 当前状态` 与本任务验证事实）
- `docs/workpls-absorption-retirement-checklist.md`（仅在 handoff 前把 W03 执行事实写入备注；状态仍由总控 review 后改为 completed）

超出范围必须停止并提交 `CONTRACT_CHANGE_REQUEST`。

## 实施约束

- 先读取 PLS `AGENTS.md`、结构账本、T0037 handoff/review、V005 字段与上述 WorkPLS 权威实现/测试。
- 先列出 config/evidence/assessment/explanation constraint matrix，再实现；不得靠逐轮 review 补漏。
- 使用 TypeScript strict 类型，避免 `any`；错误类型和 validation issues 必须显式。
- 所有纯函数不得打开 SQLite、读取 env/filesystem、调用网络或依赖当前时间。
- 不得用 `as unknown as JsonValue` 绕过 JSON contract；构造 checksum 输入时必须由类型或权威 validator 证明 JSON-safe。
- 不得把 WorkPLS 的 `workpls-portrait-comparison`、`workpls-formal-run-rule-summary` 等 identity 原样迁入 PLS。

## 验证

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run portrait-comparison-algorithm:contract-test`
- `cd apps/server && npm run portrait-comparison-schema:contract-test`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

Contract test 至少覆盖：

- canonical key order/checksum stability、array order sensitivity、非法 JSON/非有限值/unsafe integer/cycle 拒绝。
- exact unit included、五类 exclusion、duplicate evidence、empty/duplicate/invalid config、normalization clamp、coverage 与 contribution 复算、两种 mode 共用公式。
- config checksum 对语义字段变化敏感，对 object insertion order 稳定。
- production policy 为 `not_released`，无 production numeric defaults。
- rule summary manifest 去重/排序/同 Run引用、每类最多三条、invalid checksum/空 ID/非有限数/unknown enum 拒绝、无 AI masquerade、无硬编码 score opportunity。

## Handoff

使用 `/agentops-handoff-self-audit` 后执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed
- Constraint matrix 与 WorkPLS→PLS identity/contract 差异
- Validation（逐条命令、退出码、测试数量）
- 明确证明 production quality policy 仍为 `not_released`
- 明确证明没有 DB/HTTP/adapter/filesystem/network side effect
- Risks / Open Questions / Contract Drift
- 受保护路径与生成产物清理复核
- Memory Used / Memory Candidates
- 建议下一任务 W04：`PortraitSource` interface/adapters

任何新持久化字段、正式 policy 数值或新 explanation contract 决定必须停止并回到总控确认。
