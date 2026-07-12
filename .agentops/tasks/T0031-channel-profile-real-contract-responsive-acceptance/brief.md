---
id: "T0031"
slug: "channel-profile-real-contract-responsive-acceptance"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "39f89991ee61324a5e35692e889e161818fcc3d2"
batch: "channel-profile-ux-productization"
sequence: "4"
depends_on: 
  - "T0030"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/e2e/channel-object-library.spec.ts"
  - "apps/web/e2e/smoke-real.spec.ts"
  - "apps/web/src/pages/ChannelObjectLibrary.tsx"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/index.css"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium"
  - "git diff --check"
---

## 目标

为“渠道画像”模块补齐真实 API contract、响应式视觉验收、样例/真实数据状态口径，作为本轮产品化迭代的收口任务。

## 背景

前置任务会分别补 API 支撑、活动/场景详情、导入与批量匹配流程。本任务负责站在 V 域验收角度，确认前端在 mock 和 real API 模式下都不漂移，并检查桌面/移动视觉质量。

## 非目标

- 不新增产品功能。
- 不修复后端 contract 缺口；若发现缺口，记录为阻塞或返修意见。
- 不提交 Playwright 报告产物。
- 不修改 `data/workspaces/ws_demo/db.sqlite`，除非 controller 明确要求，并必须遵守 AGENTS.md 的 fixture DB 基线规则。

## 允许改动范围

- `apps/web/e2e/channel-object-library.spec.ts`
- `apps/web/e2e/smoke-real.spec.ts`
- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/index.css`
- 必要时更新 `docs/notes-viz.md` 的当前状态，作为验收记录。

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 必须包含至少一条 `VITE_USE_MOCK=false` contract 测试，断言真实请求命中目标 route，避免 `USE_MOCK` 短路。
- E2E 拦截响应必须逐字段复制真实 contract / route / schema 的类型形态。
- 测试不得写死仅本地 mock 存在的业务文案；真实 API 测试要使用真实注册的基础数据或动态断言。
- 视觉检查覆盖桌面和 390px 移动端；重点看左侧三段切换、活动/场景详情、导入流程、批量匹配流程。
- 顶部数据状态需要与页面内容一致：真实空态、样例数据、workspace 数据版本不能互相矛盾。

## 验收标准

- Mock 模式下渠道画像完整 smoke 通过。
- `VITE_USE_MOCK=false` contract 测试通过，且明确命中真实 API route 或同构拦截。
- 桌面与 390px 移动端无明显文字重叠、按钮遮挡、卡片横向溢出。
- 页面不再暴露明显英文工程文案，除必要代码/术语外均为简体中文。
- 样例数据口径清楚，不与“真实 API 空态”冲突。

## 验证命令

- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium`
- `git diff --check`

如果真实后端未运行，必须在 handoff 中说明，并用同构 `page.route` contract test 作为替代，同时列出未验证风险。

## Handoff 格式

按 `docs/templates/HANDOFF_BACK.template.md` 回流，至少包含：

- 验收范围。
- Mock 和 real contract 验证结果。
- 桌面/移动视觉检查摘要。
- 是否发现需要返修的前置任务。
- 风险和未覆盖项。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：channel-profile-ux-productization
- 顺序：4
- 依赖：T0030
- 只有依赖任务全部 approved 后才可领取。
