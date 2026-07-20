## 目标

对 `portrait-comparison-v1` 的前端集成做 W08 全链路验收，验证 T0041 HTTP contract 与 T0042 UI 在真实/近真实场景下可用，并收口响应式、E2E、临时 workspace、worktree guard 与验收文档。

重点不是新增功能，而是 acceptance hardening：

1. 复核 Portrait Comparison UI 使用的 DTO、请求路径、headers、body 与 T0041 后端 contract 一致。
2. 扩展或补强 Playwright / browser smoke，覆盖 readiness、history、detail、archive/restore、404/409、responsive。
3. 尽量用真实后端或 backend-shaped intercept 做可复现验收；如无法使用真实 DB 种子，必须说明限制并证明 contract hit。
4. 验证运行后没有 `ws_demo`、Playwright 报告、test-results 或临时 workspace 污染进入 diff。
5. 更新 app notes 与批次清单执行事实；completed 由 controller review 后写。

## 必须先读的权威证据

- `apps/server/src/routes/portrait-comparisons.ts`
- `apps/server/src/portrait-comparison/application/types.ts`
- `apps/server/src/portrait-comparison/portrait-comparison-http-contract-test.ts`
- `apps/web/src/pages/PortraitComparisonWorkbench.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/e2e/portrait-comparison.spec.ts`
- `apps/web/playwright.config.ts`
- `docs/workpls-absorption-retirement-checklist.md`
- `docs/notes-app.md`

## 验收要求

必须覆盖：

- `not_released` readiness 明确禁用 create，不存在 fake create success path。
- History list 使用真实 `{ data: { items, page } }` envelope 解包。
- Detail 使用真实 `ComparisonDetail` 字段：nested participant `source`、`dimensionEvidence`、`dimensionAssessments`、`archiveEvents`、`comparisonContractVersion`。
- Archive/restore：
  - `POST /api/v0/portrait-comparisons/:runId/archive`
  - `Idempotency-Key` header 必填
  - body 只包含 `{ operation, expectedCurrentState, expectedSequence, reason? }`
  - 不重复 `runId`
  - `expectedSequence` 是 next sequence：空 archiveEvents => 1；已有 event max+1
- Error envelope：
  - detail/archive 404 显示稳定错误 UI
  - archive 409 / concurrency conflict 显示稳定错误 UI
  - 不展示 SQL、stack、DB path、source/provider 原文
- Responsive：
  - 至少 desktop + mobile viewport
  - 无横向溢出；长 run id / checksum / source text 不撑破容器
- Worktree：
  - 不污染 `data/workspaces/ws_demo/db.sqlite`
  - 不保留 `apps/web/playwright-report/`
  - 不保留 `apps/web/test-results/`
  - 如创建临时 workspace，必须清理并检查对应路径

## 允许范围

- `apps/web/src/App.tsx`
- `apps/web/src/pages/**`
- `apps/web/src/components/**`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/index.css`
- `apps/web/e2e/**`
- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `docs/notes-app.md`
- `docs/workpls-absorption-retirement-checklist.md`

不允许修改 backend、DB schema、algorithm、model、source adapter。若验收发现后端 contract 问题，提交 blocker / CONTRACT_CHANGE_REQUEST，不要越界修。

## 验证

至少运行：

- `cd apps/web && npm run build`
- `cd apps/web && npm run lint`
- `cd apps/web && npx playwright test e2e/portrait-comparison.spec.ts`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-comparison.spec.ts`
- `npm run guard:worktree`
- `git diff --check`
- `git status --short -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html apps/web/playwright-report apps/web/test-results`

如新增定向 acceptance spec 或 script，必须在 handoff 中列出测试数量和关键断言。

## Handoff

先执行 `/agentops-handoff-self-audit`，再执行 `/agentops-task-handoff`。`handoff.md` 必须包含：

- What Changed / Files Changed。
- Acceptance matrix：需求项、测试/命令、证据。
- Real contract evidence：真实 backend-shaped DTO / request hit / archive body assertions。
- Responsive evidence：viewport、断言或截图说明。
- Validation：逐条命令、exit code、测试数量。
- Protected paths cleanup。
- Risks / Open Questions。
- Memory Used / Memory Candidates。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。

## 执行顺序与依赖

- 批次：portrait-comparison-v1
- 顺序：8
- 依赖：T0042
- 只有依赖任务全部 approved 后才可领取。
