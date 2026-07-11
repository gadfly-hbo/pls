# Handoff: T0013-single-portrait-model-info-responsive-ui

## What Changed

修复了 `单品画像预测` 工作台中 `模型说明` 模块的响应式 UI 问题，并新增展开/收起交互：

1. `模型说明` 面板现在默认展开，宽度从 360px 提升到 400px，避免在 v0.4 metadata（sampleCount=83）下 `trainedAt/generatedAt` 与 `支持版型` 等长文本发生重叠。
2. 面板支持手动收起/展开：桌面端收起为 44px 宽的垂直入口按钮，移动端/平板端收起为仅保留标题与展开按钮的横条。
3. `metricsSummary` 表格移除了固定 `min-width: 760px`，改用 `table-layout: fixed` 与百分比列宽，使 `LOO Top1` / `LOO Top3` 在桌面展开态默认可见，窄屏下由 `data-table-wrapper` 承载横向滚动，避免页面级溢出。
4. 模型信息网格改为 `repeat(auto-fit, minmax(150px, 1fr))`，每个 grid item 使用 `min-width: 0` + `overflow-wrap: anywhere` + `word-break: break-word`，确保长文本不溢出、不重叠。
5. 响应式断点覆盖 390px / 768px / 1024px / 1440px，主操作区与模型说明区在折叠/展开时不发生突兀跳动。

## Files Changed

- `apps/web/src/components/SingleProductPortrait.tsx`
  - 为 `SinglePortraitModelInfo` 增加 `collapsed` / `onToggleCollapse` props。
  - 展开态：header 增加 `收起模型说明` 按钮；模型信息网格项增加 `single-portrait-model-grid__item/label/value` 类名。
  - 收起态：渲染轻量入口，桌面端为垂直 `展开模型说明` 按钮，移动端隐藏内容并保留标题。
- `apps/web/src/pages/Dashboard.tsx`
  - 增加 `modelInfoCollapsed` state。
  - 向 `SinglePortraitModelInfo` 传递状态与切换回调。
  - 在 `single-portrait-layout` 与 `single-portrait-side` 上根据状态追加 `*-model-collapsed` / `*-collapsed` 类名。
- `apps/web/src/index.css`
  - 更新 `.single-portrait-layout` 为 `minmax(0, 1fr) minmax(280px, 400px)`，新增 `.single-portrait-layout--model-collapsed`。
  - `.single-portrait-side` 增加 `sticky` 定位，`.single-portrait-side--collapsed` 在桌面端为 44px，在移动端恢复 100% 宽度。
  - `.single-portrait-model-grid` 改为 `auto-fit`，`.single-portrait-model-grid__label/value` 增加防御性换行样式。
  - `.single-portrait-table` 移除 `min-width: 760px`，改为 `width: 100%`、`table-layout: fixed`、列宽百分比、`LOO Top1`/`LOO Top3` 右对齐。
  - 增加 `@media (max-width: 390px)` 针对表格与 header 按钮的窄屏样式。
- `apps/web/e2e/portrait-workbench.spec.ts`
  - 增加 `sampleCount=73`、`LOO Top1` / `LOO Top3` 可见断言。
  - 增加 `收起模型说明` / `展开模型说明` 按钮交互与内容显隐断言。
- `apps/web/e2e/portrait-workbench-real.spec.ts`
  - 增加 `sampleCount`、`LOO Top1` / `LOO Top3` 可见断言，以及展开/收起交互断言。
- `apps/web/e2e/product-channel-fit-real-ui-smoke.spec.ts`
  - 增加 `LOO Top1` / `LOO Top3` 可见断言，以及展开/收起交互断言。

## Validation

运行了 brief 要求的全部验证命令：

- `cd apps/web && npm run lint` ✅
- `cd apps/web && npm run build` ✅
- `cd apps/web && npm run smoke` ✅（28 passed, 7 skipped）
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-workbench-real.spec.ts` ✅

测试覆盖：
- mock 与真实 API 分支均验证 `sampleCount`、`LOO Top1`、`LOO Top3` 可见。
- 展开/收起按钮可用，且收起后表格内容隐藏，展开后恢复。
- 现有窄屏横向溢出检查（mock 测试 390px viewport）仍通过。

## Risks

- 当前 E2E 真实 API 分支（`portrait-workbench-real.spec.ts`、`product-channel-fit-real-ui-smoke.spec.ts`）使用的是拦截响应或真实后端。若后端真实 metadata 返回的 `sampleCount` 与测试断言中的可见文本不一致（例如字段名变更），测试会失败；但 brief 已确认当前 runtime 返回 `sampleCount=83` 且字段名不变，因此只验证了 UI 展示能力而非具体数值。
- 桌面端 400px 的展开宽度在 1440px 屏宽下主操作区仍保持足够宽度；在 1024px 以下自动切换为单列布局，未在 1024px 与 768px 之间实测复杂内容下的表格可读性，需通过真实数据进一步确认。
- 使用 `writing-mode: vertical-rl` 的收起按钮依赖现代浏览器支持，目标运行环境为 Chromium/Playwright，已验证通过。
- 未引入新依赖，未触碰模型、后端 route、ModelEvov artifact 或 `.modelevol` marker。

## Open Questions

- 是否需要在 1440px 与 768px 视口下增加额外的 Playwright 断言，以补充当前只覆盖 390px 的横向溢出检查？
- 是否将本次模型说明展开/收起的状态持久化到 localStorage，还是保持当前按页面刷新重置的默认行为？

## Memory Candidates

- 响应式侧栏布局时，将展开宽度、收起宽度、移动端行为三种状态在 CSS 中分别显式声明，比仅依赖 grid 自动布局更稳定，可减少后续侧栏相关重叠类回归风险。
- 对表格类组件，优先移除固定 `min-width` 并使用 `table-layout: fixed` + 百分比列宽，可有效避免窄屏下必须滚动才能看到关键列的问题。
