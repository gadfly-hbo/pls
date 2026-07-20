---
id: "T0042"
slug: "portrait-comparison-ui-readiness-history-detail"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "098e538ba8bd7ebc93bddbf4f0e8c95ff9dac945"
batch: "portrait-comparison-v1"
sequence: "7"
depends_on: 
  - "T0041"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/App.tsx"
  - "apps/web/src/pages/**"
  - "apps/web/src/components/**"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/types/index.ts"
  - "apps/web/src/index.css"
  - "apps/web/e2e/**"
  - "apps/web/package.json"
  - "docs/notes-app.md"
  - "docs/workpls-absorption-retirement-checklist.md"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run smoke -- <新增或相关 e2e spec>"
  - "cd apps/web && VITE_USE_MOCK=false npm run smoke -- <新增 real-contract e2e spec>"
  - "npm run guard:worktree"
  - "git diff --check"
  - "git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
  - "git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results"
---

## 目标

在 T0041 已批准的 `/api/v0/portrait-comparisons` HTTP contract 之上，实现 PLS 前端的 Portrait Comparison 首版 UI：

1. 新增或接入一个 React 工作台入口，展示三步 readiness 状态：`source`、`algorithm`、`productionPolicy`。
2. 展示 comparison run 历史列表，支持 active / archived / all 过滤。
3. 展示 run detail，包含 baseline/comparison participant、overall score、dimension assessments、evidence、quality/exclusion reason、algorithm/contract identity。
4. 支持 archive / restore 操作，并正确处理 `expectedCurrentState`、`expectedSequence`、`Idempotency-Key`。
5. 当前 production policy 仍是 `not_released`：UI 不得伪造正式 create 可用，不得提供会让用户误以为已能创建正式 Run 的成功路径。

## 必须先读的权威证据

- `apps/server/src/routes/portrait-comparisons.ts`
- `apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/App.tsx`
- 现有相近页面：`apps/web/src/pages/SimulatedMarketWorkbench.tsx`、`apps/web/src/pages/MatchCoreWorkbench.tsx`、`apps/web/src/pages/DataManagementWorkbench.tsx`
- `apps/web/e2e/simulated-market.spec.ts` 中 `VITE_USE_MOCK=false` contract request hit 断言模式
- `docs/workpls-absorption-retirement-checklist.md`
- `docs/notes-app.md`

## HTTP Contract

所有真实请求必须通过 `/api/v0/portrait-comparisons`，并遵守 T0041 后端 envelope：

- 成功：`{ code, requestId, generatedAt, data }`
- 错误：`{ code, requestId, generatedAt, error }`
- 现有 `fetchApi<T>()` 已返回 envelope，adapter 必须从 `res.data` 精确取值，不得自造 `.items` 外层。

请求矩阵：

| UI 能力 | Method | Path | Headers | Body / Query | 期望 |
| --- | --- | --- | --- | --- | --- |
| Readiness | GET | `/portrait-comparisons/readiness` | 现有 auth/workspace headers | none | 展示 `status`、`contractVersion`、`productionPolicyStatus`、`capabilities`、`blockers`；`not_released` 时创建入口禁用 |
| History | GET | `/portrait-comparisons` | 现有 auth/workspace headers | `limit`、可选 cursor、`archiveFilter=active|archived|all` | 展示 `items` 与 `page`，默认 active |
| Detail | GET | `/portrait-comparisons/:runId` | 现有 auth/workspace headers | none | 展示 detail DTO；404 显示稳定空状态，不泄露跨 workspace 存在性 |
| Archive/Restore | POST | `/portrait-comparisons/:runId/archive` | `Idempotency-Key` 必填 | `{ operation: "archived"|"restored", expectedCurrentState, expectedSequence, reason? }` | 成功后刷新 list/detail；409 显示并发/状态已变化提示 |

## 约束

- 不修改 backend route、schema、algorithm、source adapter、application/repository。
- 不修改 `docs/wiki.html`。
- 不新增依赖。
- 不让本地 `USE_MOCK=true` 与真实 contract 漂移：如果新增 mock adapter，形态必须与 T0041 route/test 的真实 envelope/data 同构，并标明仅用于本地 UI 体验。
- Real API E2E 拦截必须设置或依赖 `VITE_USE_MOCK=false`，并断言真实 request 被命中；不能被 `USE_MOCK` 短路。
- Playwright `page.route` 只能按真实 URL path 匹配，不能把 HTTP method 写进 path glob。
- 不依赖 `ws_demo` 里的特定业务行；E2E 使用拦截的真实 contract-shaped 响应，或使用独立临时 workspace 的真实后端数据。若只做拦截测试，需在 handoff 说明不覆盖真实 DB 种子。
- 正式 create 当前只允许展示 disabled / unavailable / blocker 状态；不要实现 fake successful create，也不要把 `not_released` 当成可忽略 warning。

## 允许范围

- `apps/web/src/App.tsx`
- `apps/web/src/pages/**`
- `apps/web/src/components/**`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/index.css`
- `apps/web/e2e/**`
- `apps/web/package.json`（仅新增定向 smoke script，如需要）
- `docs/notes-app.md`
- `docs/workpls-absorption-retirement-checklist.md`（handoff 前仅更新 W07 执行事实；completed 由总控 review 后写）

如需修改后端、共享 DB、模型、算法、route contract 或 Task Bus 外的全局工程配置，必须停止并提交 `CONTRACT_CHANGE_REQUEST`。

## 验证

至少运行：

- `cd apps/web && npm run build`
- `cd apps/web && npm run lint`
- `cd apps/web && npm run smoke -- <新增或相关 e2e spec>`
- `cd apps/web && VITE_USE_MOCK=false npm run smoke -- <新增 real-contract e2e spec>`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/test-results`

E2E 至少覆盖：

- `not_released` readiness 明确禁用 create，并展示 blocker/capability。
- History list 解包真实 `{ data: { items, page } }`，默认 active，能切换 archived/all。
- Detail 解包真实 detail DTO，不因缺少可选 evidence/explanation 字段崩溃。
- Archive/restore 发出 `POST /api/v0/portrait-comparisons/:runId/archive`，带 `Idempotency-Key`，body 不重复 `runId`。
- 409 / 404 / not_released 错误 envelope 有可读 UI，不展示 stack/SQL/source/provider 原文。
- 一条 `VITE_USE_MOCK=false` contract test 断言目标 `/api/v0/portrait-comparisons*` request 确实发出，证明没有被 `USE_MOCK` 短路。

## Handoff

先执行 `/agentops-handoff-self-audit`，再执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed。
- UI route/entrypoint 与用户流程。
- API adapter mapping：每个 method/path、headers、request body/query、envelope 解包位置。
- Mock 与真实 contract 同构说明。
- Validation：逐条命令、exit code、E2E 数量、`VITE_USE_MOCK=false` request hit 证据。
- 明确说明 create 仍因 production `not_released` 不可用，UI 没有伪造正式 Run。
- Protected paths cleanup / Risks / Open Questions。
- Memory Used / Memory Candidates。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：7
- 依赖：T0041
- 只有依赖任务全部 approved 后才可领取。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：7
- 依赖：T0041
- 只有依赖任务全部 approved 后才可领取。
