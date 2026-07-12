---
id: "T0033"
slug: "ws-demo-playwright-isolation-frontend"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "39f89991ee61324a5e35692e889e161818fcc3d2"
batch: "ws-demo-fixture-isolation"
sequence: "2"
depends_on: 
  - "T0032"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/e2e/**/*.ts"
  - "apps/web/playwright.config.*"
  - "apps/web/package.json"
  - "apps/web/src/services/api.ts"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium"
  - "git diff --check"
  - "git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html"
---

## 目标

从前端 Playwright / real contract 测试层面阻断 `ws_demo` fixture DB 和 Playwright report 产物反复污染工作区。

## 背景

渠道画像 T0031 暴露了两个重复问题：

- `VITE_USE_MOCK=false` 或 live backend 验证容易间接触碰默认 `ws_demo`。
- Playwright 每次运行都会改动 `apps/web/playwright-report/index.html`，导致任务 handoff 反复出现生成产物。

本任务在后端写型隔离任务之后执行，负责前端测试层面的隔离和产物防护。

## 非目标

- 不新增产品功能。
- 不修改后端 API。
- 不删除已有 e2e 覆盖。
- 不修改 `data/workspaces/ws_demo/db.sqlite`。
- 不提交 Playwright 报告产物。

## 允许改动范围

- `apps/web/e2e/**/*.ts`
- `apps/web/playwright.config.*`
- `apps/web/package.json`
- `apps/web/src/services/api.ts`
- `docs/notes-viz.md`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- `VITE_USE_MOCK=false` contract test 必须继续断言真实请求或同构 `page.route` 命中，不能退化为 local mock。
- 如果真实后端未运行，允许使用同构 route interception，但必须避免任何默认写入 `ws_demo` 的路径。
- Playwright report / test-results 等生成产物不得出现在 `git status --short` 或 `git diff --name-only` 中。
- 不允许用“测试后手动恢复”作为唯一方案；优先从 Playwright 配置、输出目录或脚本层面避免污染 tracked 文件。
- 不得修改 `.gitignore`，除非 controller 另行明确批准。

## 建议实现方向

- 检查 `apps/web/playwright.config.*` 的 reporter/output 配置，避免写入 tracked `apps/web/playwright-report/index.html`。
- 必要时把报告输出导向临时目录或未跟踪目录，并更新 npm script。
- 为 real contract 测试添加明确 workspace/header 口径或 route-only 保护，避免误触 live write。
- 在 e2e 结束前或 npm script 后增加轻量检查，确保 `ws_demo/db.sqlite` 和 Playwright report 没有进入 diff。

## 验收标准

- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts` 通过后，不会修改 `apps/web/playwright-report/index.html`。
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium` 通过或按本机权限说明替代验证后，不会修改 `data/workspaces/ws_demo/db.sqlite`。
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html` 无输出。

## 验证命令

- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/channel-object-library.spec.ts --project=chromium`
- `git diff --check`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite apps/web/playwright-report/index.html`

## Handoff 格式

- What Changed
- Files Changed
- Playwright artifact isolation behavior
- Real API / route contract behavior
- Validation
- Risks
- Open Questions

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：ws-demo-fixture-isolation
- 顺序：2
- 依赖：T0032
- 只有依赖任务全部 approved 后才可领取。
