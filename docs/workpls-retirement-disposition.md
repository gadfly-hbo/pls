# WorkPLS 退役逐项 Disposition 表

> 任务：T0044 / W09（`portrait-comparison-v1`）。本表是 `docs/workpls-retirement-audit.md` 的逐项明细附件。
> WorkPLS 路径：`/Users/huangbo/Dev/Projects/workpls`（HEAD `d0da4152d239215dbb791b4750c01fe04c4f4de1`）。
> 状态枚举：`migrated | intentionally_deferred | retained_reference | obsolete | unknown/blocker`。
> 本任务不删除任何 WorkPLS 文件；所有 WorkPLS 侧检查均为只读（`rg` / `git -C` / `find`）。

## 1. 状态计数

| 状态 | 计数 |
| --- | ---: |
| migrated | 24 |
| intentionally_deferred | 6 |
| retained_reference | 14 |
| obsolete | 14 |
| unknown/blocker | 0 |
| **合计** | **58** |

## 2. 后端源码（apps/server/src）

| WorkPLS path | 状态 | PLS 落位证据 | 决定理由 |
| --- | --- | --- | --- |
| `apps/server/src/persistence/migrations/runner.ts` | migrated | T0036 approved；PLS `apps/server/src/db/migration-runner.ts`；runner contract 16/16 | Runner 加固后在 PLS 重新落位（漂移拒绝、事务、备份恢复、checksum 升级），非逐行搬运 |
| `apps/server/src/persistence/migrations/registry.ts` / `types.ts` / `0001_initial_comparison.sql` | migrated | T0037 approved；PLS `V005_portrait_comparison`（`apps/server/src/db/migrations` + `schema.ts` `COMPARISON_DDL` 单一真源）；schema contract 30/30 | 物理结构按结构账本 S017-S050 重新设计为 8 张规范化表，不沿用 WorkPLS 单迁移 DDL |
| `apps/server/src/persistence/canonical-json.ts` | migrated | T0038 approved；PLS `apps/server/src/portrait-comparison/canonical-json.ts`；algorithm contract 15/15 | Canonical JSON v1 + UTF-8 SHA-256 语义迁移并收紧（sparse array 拒绝） |
| `apps/server/src/persistence/checksum.ts` | migrated | T0038 approved；同上 | checksum 语义随 canonical JSON 一并迁移 |
| `apps/server/src/persistence/quality-policy.ts` | migrated | T0038 approved；PLS `apps/server/src/portrait-comparison/quality-policy.ts`（`not_released`） | 迁移的是版本化 policy contract 与 reason code 体系；WorkPLS 文件同样不含已校准数值（只读确认无 threshold 常量），数值发布属延期项 D2 |
| `apps/server/src/persistence/comparison/contract.ts` / `repository.ts` / `service.ts` | migrated | T0040 approved；PLS `apps/server/src/portrait-comparison/repository/comparison-run-repository.ts` + `application/comparison-application.ts`；application contract 113/113 | 聚合事务、幂等 Run、detail 校验在 PLS 按 S045/S062 重新落位并大幅加固（36 轮 review） |
| `apps/server/src/persistence/explanation/repository.ts` / `service.ts` | migrated | T0040 approved；PLS `apps/server/src/portrait-comparison/repository/explanation-repository.ts` + application explanation 路径 | Attempt/Outcome 追加式持久化迁移；WorkPLS 仅实现 rule generator，无 AI generator 代码（见 D3） |
| `apps/server/src/persistence/archive/repository.ts` / `service.ts` | migrated | T0040 approved；PLS `apps/server/src/portrait-comparison/repository/archive-repository.ts` | 追加式 archive event + 乐观并发迁移 |
| `apps/server/src/persistence/json-contracts.ts` | migrated | T0038/T0040 approved；evidence manifest 与 explanation content 校验进入 PLS application/algorithm contract | manifest/checksum 与受控 content 校验迁移（S039/S041/S093） |
| `apps/server/src/persistence/format.ts` / `database.ts` / `db-path.ts` / `inspector.ts` / `schema-identity.ts` | obsolete | PLS `apps/server/src/db/*` 已有等效基础设施工具 | WorkPLS 专属基础设施；PLS 架构下无逐项保留价值 |
| `apps/server/src/config.ts` / `errors.ts` | obsolete | PLS server 自有 config 与 error 体系 | 同上 |
| `apps/server/src/comparison-algorithm/contract.ts` / `index.ts` / `similarity-stability.ts` | migrated | T0038 approved；PLS `apps/server/src/portrait-comparison/algorithm.ts`；algorithm identity `pls-portrait-comparison` | 线性归一化绝对差公式迁移（S067/S068），算法身份按账本改名 |
| `apps/server/src/comparison-readiness/contract.ts` / `service.ts` | migrated | T0041 approved；PLS `POST /api/v0/portrait-comparisons/readiness`；HTTP contract 32/32 | readiness 语义迁入 PLS `/api/v0` transport |
| `apps/server/src/formal-comparison-run/contract.ts` / `index.ts` / `service.ts` | migrated | T0040/T0041 approved；PLS application + `apps/server/src/routes/portrait-comparisons.ts` gated create | 正式 Run 创建在 PLS 保持 `not_released` gate（S058），HTTP contract 32/32 证明受控失败零写入 |
| `apps/server/src/portrait-source/contract.ts` / `index.ts` / `errors.ts` / `schema-gate.ts` / `sqlite-adapter.ts` | migrated | T0039 approved；PLS `apps/server/src/portrait-comparison/portrait-source/`（`pls-workspace-adapter.ts`、`agentharness-adapter.ts`、`schema-gate.ts`、`resolver.ts`）；source contract 70/70 | 四能力 interface + 双 adapter 迁移；AgentHarness adapter 保留显式绝对路径、只读连接、精确 schema gate（S083） |
| `apps/server/src/rule-summary/contract.ts` / `index.ts` / `readiness-rule-summary.ts` / `formal-run-rule-explanation.ts` | migrated | T0038 approved；PLS `apps/server/src/portrait-comparison/rule-summary.ts` | 确定性规则摘要迁移；WorkPLS 硬编码 80 分阈值判断按 S092 显式不迁移（见 obsolete 行） |
| `apps/server/src/http/dto.ts` / `routes.ts` | migrated | T0041 approved；PLS `apps/server/src/routes/portrait-comparisons.ts` + PLS 统一 envelope | HTTP 命名与 envelope 按 S046 使用 PLS `/api/v0`，不迁入第二套 transport |
| `apps/server/src/index.ts` | obsolete | PLS `apps/server/src/index.ts` 自有入口 | WorkPLS server 装配入口，无迁移价值 |

### 2.1 显式不迁移的 WorkPLS 行为

| WorkPLS path / 行为 | 状态 | 依据 |
| --- | --- | --- |
| 规则摘要中的硬编码 80 分阈值判断 | obsolete | 结构账本 S092：未校准阈值不能包装成业务机会；PLS 仅使用已发布配置 |

## 3. 后端脚本与测试

| WorkPLS path | 状态 | PLS 落位证据 | 决定理由 |
| --- | --- | --- | --- |
| `apps/server/scripts/schema-check.ts` | migrated | T0037 approved；PLS `apps/server/src/db/schema-check.ts`（含 viewExtra 回归修复与负向测试） | schema check 迁移并加固 |
| `apps/server/scripts/comparison-readiness-smoke.ts` / `portrait-source-smoke.ts` / `internal-preview-acceptance-smoke.ts` | obsolete | PLS 以 contract test 套件（16/30/15/70/113/32）+ T0043 E2E 验收替代 | WorkPLS 一次性 smoke 脚本；PLS 验收口径更强且已 approved |
| `apps/server/test/*.test.ts`（16 个测试文件） | migrated | PLS 六套 contract test 全部通过（本任务复跑：16/30/15/70/113/32，见 audit §5） | 测试意图按 PLS 架构重写为 contract test；不逐行搬运 |
| `apps/server/package.json` / `package-lock.json` / `tsconfig.json` | obsolete | PLS `apps/server` 自有 toolchain | 不迁移依赖清单 |

## 4. 前端（apps/web）

| WorkPLS path | 状态 | PLS 落位证据 | 决定理由 |
| --- | --- | --- | --- |
| `apps/web/src/components/wizard/step1.js` / `step2.js` / `step3.js` / `wizard.js` | migrated | T0042/T0043 approved；PLS `apps/web/src/pages/PortraitComparisonWorkbench.tsx`（React 三步 readiness 流程） | 三步任务流语义迁移，技术栈从 vanilla JS 换为 PLS React |
| `apps/web/src/components/result/readiness-result.js` / `formal-run-history.js` / `error-state.js` | migrated | T0042/T0043 approved；PLS PortraitComparisonWorkbench 历史/详情/错误态 + archive/restore | 历史、详情、409/404 error envelope UI 已迁移并经真实 contract E2E 验收 |
| `apps/web/src/api/adapter.js` / `contract.js` | migrated | T0042 approved；前端 DTO 与 T0041 后端 contract 对齐（review 已核） | DTO 边界按 S069 重新落位 |
| `apps/web/src/components/app.js` / `nav.js` / `startup-shell.js` / `main.js` / `styles/main.css` / `index.html` | obsolete | PLS `apps/web` React 应用自有 shell/nav/styles | WorkPLS 专属外壳，无迁移价值 |
| `apps/web/scripts/browser-visual-smoke.mjs` / `static-smoke.mjs` | obsolete | PLS Playwright e2e（T0043：mock 4 passed/6 skipped；`VITE_USE_MOCK=false` 6 passed/4 skipped） | 被 PLS E2E 体系替代 |

## 5. 文档与契约

| WorkPLS path | 状态 | PLS 落位证据 | 决定理由 |
| --- | --- | --- | --- |
| `docs/contracts/application-structure-decision-ledger.md` / `portrait-comparison-application-contract.md` / `formal-comparison-run-readiness-gate.md` | migrated + retained_reference | PLS `docs/portrait-comparison-structure-decision-ledger.md`（S001-S093 用户整体批准） | 结构决定已被 PLS 账本吸收并取代；原文作为设计历史保留在归档 bundle |
| `docs/contracts/harness-portrait-consumption-contract.md` / `harness-portrait-ccr-decision-ledger.md` | retained_reference | T0039 AgentHarness adapter 以其为输入；PLS 侧决定记录于结构账本与 T0039 review | 跨项目契约历史，保留供溯源 |
| `docs/research/portrait-consumption-evidence.md` | retained_reference | T0038/T0039 设计依据之一 | 研究证据，保留 |
| `docs/adr/0001-0003` / `docs/adr/README.md` | retained_reference | PLS 信息架构决定已体现在 PLS AGENTS.md 与结构账本 | ADR 历史，保留 |
| `docs/PRD.md` / `CONTEXT.md` / `README.md` / `Orchestration.md` / `AGENTS.md` | retained_reference | — | 产品定位与统一语言历史；其中预测画像/模拟运行/经营飞轮为 WorkPLS 未实现的规划能力（见 §7 说明） |
| `docs/notes-application-backend.md` / `notes-controller.md` / `notes-infra.md` / `notes-intelligence-engine.md` / `notes-product-ui.md` | retained_reference | — | 过程笔记，保留于 bundle |
| `docs/development-route.md` / `internal-preview-runbook.md` / `internal-preview-startup-experience.md` / `launch-readiness.md` | retained_reference | — | WorkPLS 过程文档；保留于 bundle |
| `docs/cross-project/agentharness-*.md`（2 个 prompt） | retained_reference | AgentHarness 协调历史 | 跨项目 intake 记录，保留 |
| `docs/templates/*.md`（4 个模板） | obsolete | coding-system 与 PLS 已有等效模板 | 通用模板副本 |
| `docs/contracts/README.md` / `docs/README.md` | retained_reference | — | 索引文档，随 bundle 保留 |

## 6. AgentOps / 工具状态

| WorkPLS path | 状态 | 决定理由 |
| --- | --- | --- |
| `.agentops/tasks/**`（T0001-T0029 任务目录） | retained_reference | WorkPLS 自身任务史，全部包含在 `--all` bundle 中，可溯源 |
| `agentops/memory/mimo-backend.md` | retained_reference | 域记忆副本；canonical source 在 coding-system（`/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`），删除 WorkPLS 不丢失记忆 |
| `.mimocode/**`（`.cron-lock`、`.gitignore`、`package.json`、`package-lock.json`） | obsolete | agent 本地运行状态，无业务价值 |
| `.gitignore` / `.DS_Store` / `docs/.DS_Store` / `.agentops/.DS_Store` | obsolete | 环境文件 |

## 7. 延期与非迁移范围 disposition（清单 §3 逐项）

| 延期项 | 状态 | WorkPLS 侧只读事实 | 恢复入口 / 后续任务建议 |
| --- | --- | --- | --- |
| D1 正式 Dimension Evidence 新 schema、taxonomy、单位和数据管线 | intentionally_deferred | WorkPLS 同样不存在该管线：dimension evidence 仅作为 comparison 内部持久化（`0001_initial_comparison.sql`、`json-contracts.ts`），无独立 taxonomy/单位目录/导入管线 | 结构账本 §6.1、S059：独立 Data task 建设；不以 WorkPLS 代码为依据 |
| D2 基于真实样本发布的 quality policy 数值 | intentionally_deferred | WorkPLS `quality-policy.ts` 只有 reason code 体系，无数值阈值（只读 grep 无 threshold 常量）；PLS policy `not_released` | 结构账本 §6.2、S065：真实样本校准后发布版本化 TS 配置 |
| D3 AI explanation 的 `pi-agent` generator 与公共 HTTP 入口 | intentionally_deferred | WorkPLS 仅实现 rule generator（`FORMAL_RUN_RULE_GENERATOR_ID`）；`GENERATOR_TYPES` 含 `ai` 但全仓无 AI generator 实现、无 pi-agent 调用代码 | 结构账本 S038/S091、§6.3：按 AGENTS.md §四必须先查真实 pi-agent contract 再建 adapter |
| D4 Flywheel schema / `decision_record` 来源模型升级 | intentionally_deferred | WorkPLS 无 flywheel 实现代码（仅 PRD/CONTEXT/launch-readiness 文档提及）；PLS `decision_record` 按 S084 本轮不改 | 结构账本 §6.4、S016/S084：后续独立升级任务 |
| D5 WorkPLS fixture 或历史业务数据导入 | obsolete（无可导入对象） | WorkPLS 仓内不存在 `data/` 目录、fixture 目录或任何 `.sqlite`/`.db` 文件（`find` 只读确认）；S052 明确 V005 不回填 | 如未来发现仓外 WorkPLS 数据，须另立导入任务并经数据准入口径确认 |
| D6 AgentHarness source 配置 UI | intentionally_deferred | WorkPLS 亦无该 UI；PLS 首期保留 adapter + `data_source` 受控配置入口（S064/S085） | 结构账本 §6.5：后续前端/Admin 任务 |

## 8. 结论

- 全部 58 个 inventory 项均有 disposition，无 `unknown/blocker`。
- WorkPLS 中由 PLS 已吸收能力覆盖的代码路径全部有 PLS 侧 approved 证据（T0036-T0043）。
- 六项延期/非迁移范围均有恢复入口；其中 D5 经只读核实为"无可导入对象"，按 obsolete 记录。
- WorkPLS 规划但未实现的预测画像、模拟运行、经营飞轮能力不属于 `portrait-comparison-v1` 批次吸收范围；PLS 已有独立的对应产品模块（`Predictions`、`SimulatedMarketWorkbench`、`FlywheelWorkbench`），WorkPLS 文档仅作历史参考保留。
