---
id: "T0016"
slug: "simulated-market-workbench"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "simulated-market-v1"
sequence: "3"
depends_on: 
  - "T0015"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "docs/prd-simulated-market.md"
  - "apps/web/src"
  - "apps/web/e2e"
  - "apps/web/package.json"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts"
---

## Objective

在 `apps/web` 中新增一级模块「模拟市场」工作台，消费 `T0015` 后端 API，完成策略输入、目标 agent 选择、市场场景配置、运行模拟和结果回看。

UI 必须以「策略压力测试报告」为主输出，不做 pi-xanthil 复刻，不做聊天式实验室。多 agent 反馈可作为证据摘要，但页面主结构应服务于运营决策。

## Context

- 上游任务：`T0015` 必须 approved 后才能领取。
- 产品口径：`docs/prd-simulated-market.md`。
- API 口径：`docs/api-contract.md` 中 `T0015` 新增的模拟市场章节，以及真实 route/schema。
- 一期入口是一级导航「模拟市场」。
- 新品预测、人货匹配、经营飞轮中的跳转入口本轮不实现，只可在代码中留清晰 TODO 或在 handoff 记录后续任务建议。

## Deliverables

- AppShell 一级导航新增「模拟市场」。
- 新增模拟市场页面或工作台组件。
- 前端 API adapter 新增：
  - 获取 agent templates。
  - 创建 simulation run。
  - 查询 run list。
  - 查询 run detail。
- 页面至少包含四区：
  - 策略输入区：手动粘贴策略文本；sourceRef 可选，不要求接旧模块。
  - 目标用户区：展示三大人群 agent，可勾选；支持临时手写 persona。
  - 市场场景区：填写渠道/活动/业务场景文本或选择后端已支持对象。
  - 结果区：整体评分、分 agent 反馈、风险、建议、qualityFlags、provider/modelVersion。
- Mock 数据必须与真实后端 shape 同构。
- 新增 Playwright E2E：
  - mock 模式完成一次模拟。
  - 390px 窄屏无页面级横向溢出。
  - `VITE_USE_MOCK=false` contract test，断言真实请求命中 `/api/v0/simulated-market/*`，不能被 `USE_MOCK` 短路。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- Do not commit, push, install dependencies, or run destructive cleanup.
- 不实现新品预测结果页「送入模拟市场」。
- 不实现人货匹配结果页「模拟目标用户反馈」。
- 不实现经营飞轮「从模拟结果创建决策」。
- 不修改后端 API、DB schema 或模型算法。
- 不安装新依赖。
- 不做营销落地页。

## Allowed Files

- `apps/web/src/**`
- `apps/web/e2e/**`
- `apps/web/package.json`
- `docs/prd-simulated-market.md` 仅允许做 UI 术语层面的最小澄清。

## Frontend Constraints

- 使用现有组件和样式体系：AppShell、panel、segmented-control、metric-card、alert-banner、data-table-wrapper 等。
- 按项目规则，写 adapter 前必须读取真实 API route/schema，不能凭 mock 猜。
- API adapter 必须精准解包 `{ code, data }`。
- Mock 与 E2E 拦截响应必须同构。
- 390px 移动端必须避免文本、按钮、卡片、工具栏重叠。
- 不使用 `any`。

## Validation Required

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts`

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions
- Contract Drift or Change Requests

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：simulated-market-v1
- 顺序：3
- 依赖：T0015
- 只有依赖任务全部 approved 后才可领取。
