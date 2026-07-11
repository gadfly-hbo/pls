---
id: "T0013"
slug: "single-portrait-model-info-responsive-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "single-product-portrait-ui-polish"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/components/SingleProductPortrait.tsx"
  - "apps/web/src/pages/Dashboard.tsx"
  - "apps/web/src/index.css"
  - "apps/web/e2e/portrait-workbench.spec.ts"
  - "apps/web/e2e/portrait-workbench-real.spec.ts"
  - "apps/web/e2e/product-channel-fit-real-ui-smoke.spec.ts"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
  - "cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-workbench-real.spec.ts"
---

## 目标

修复 `单品画像预测` 工作台中 `模型说明` 模块的响应式 UI 问题。当前真实 v0.4 metadata 下，用户截图显示：

- `trainedAt/generatedAt` 与 `支持版型` 标题在模型说明 grid 内发生文字重叠。
- `metricsSummary` 表格的 `LOO Top1` / `LOO Top3` 列需要向右滚动才能看到，默认可读性差。
- 模型说明侧栏宽度偏小，但直接放大会挤压主操作界面。

实现一个更稳的布局：模型说明模块在桌面端可以占用更合理宽度，并支持用户手动向右侧收起/展开；收起后不影响左侧单款/批量预测主操作。窄屏下必须避免文字、按钮、标题、表格互相重叠。

## 背景依据

- 用户反馈截图：`模型说明` 模块在 `sampleCount=83` 的 v0.4 metadata 下出现标题重叠，`LOO Top1` 和 `LOO Top3` 不易直接看到。
- 当前实现位置：
  - `apps/web/src/pages/Dashboard.tsx` 中 `<aside className="single-portrait-side">`
  - `apps/web/src/components/SingleProductPortrait.tsx` 中 `SinglePortraitModelInfo`
  - `apps/web/src/index.css` 中 `.single-portrait-layout` / `.single-portrait-side` / `.single-portrait-model-grid` / `.single-portrait-table`
- 当前真实 runtime 已由总控确认：`SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` 指向 ModelEvol v0.4 locked artifact，metadata 正常返回 `sampleCount=83`。

## 允许范围

- `apps/web/src/components/SingleProductPortrait.tsx`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/index.css`
- `apps/web/e2e/portrait-workbench.spec.ts`
- `apps/web/e2e/portrait-workbench-real.spec.ts`
- `apps/web/e2e/product-channel-fit-real-ui-smoke.spec.ts`
- `docs/notes-viz.md`

如需修改其他文件，必须先在 handoff 中说明原因；不得触碰模型、后端 route、ModelEvol artifact 或 `.modelevol` marker。

## 功能要求

1. `SinglePortraitModelInfo` 不再出现标题或字段值重叠：
   - `modelVersion`、`trainedAt/generatedAt`、`支持版型` 等长文本必须可换行。
   - grid item 必须有稳定最小宽度与 `min-width: 0` / `overflow-wrap` 等防御性 CSS。
2. `metricsSummary` 的三列默认可读：
   - 桌面端尽量直接展示 `维度`、`LOO Top1`、`LOO Top3`。
   - 窄屏若需要横向滚动，表格外层必须清楚承载滚动，不得让整个页面产生横向溢出。
   - 百分比列建议右对齐，列宽稳定。
3. 模型说明模块支持手动收起/展开：
   - 默认展开。
   - 提供清晰按钮，例如 `收起模型说明` / `展开模型说明`，或使用项目已有按钮样式。
   - 收起态仍保留一个轻量入口，不遮挡主操作界面。
   - 展开态可以比当前侧栏更宽，但不得导致主操作区被压到不可用。
4. 响应式要求：
   - 390px / 768px / 1440px 下无页面级横向溢出。
   - 文字、按钮、卡片、表格 header 不重叠。
   - 左侧主操作区和右侧模型说明区在折叠/展开时不发生突兀布局跳动。
5. 保持现有设计系统：
   - 复用 `panel`、`btn`、`data-table-wrapper`、现有 `single-portrait-*` class 风格。
   - 不引入新依赖。

## 非目标

- 不修改 `single-product-portrait` API、metadata schema、mock 字段含义或模型逻辑。
- 不改 ModelEvol artifact、PLS fallback model 或 `.modelevol` marker。
- 不新增一级导航。
- 不重构整个 Dashboard 或全局布局系统。
- 不处理与本截图无关的其他 UI 问题。
- 不 commit、不 push、不安装依赖、不做破坏性清理。

## 验证

至少运行：

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-workbench-real.spec.ts`

测试或手工验证必须覆盖：

- `sampleCount=83` 的 metadata 可见。
- `trainedAt/generatedAt` 与 `支持版型` 不重叠。
- `LOO Top1` 和 `LOO Top3` 在桌面展开态默认可见，窄屏不造成页面级横向溢出。
- 模型说明展开 / 收起按钮可用。
- 390px 窄屏无横向溢出和按钮文字重叠。

如果本地 Playwright 浏览器不可用，必须在 handoff 中说明，并至少补充可执行的替代验证证据（例如 `npm run build`、现有 E2E、DOM 宽度检查脚本或截图）。

## Handoff Format

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

额外说明：

- 展开 / 收起交互的状态放在哪里。
- 响应式断点和防重叠 CSS 的关键点。
- 是否更新了 E2E 断言，以及真实 API / Mock 分支分别覆盖了什么。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。
