---
id: "T0003"
slug: "single-product-portrait-dashboard-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "b09951dccbdb1fad97661bcbb4a0652d41d9da8d"
batch: "single-product-portrait-frontend"
sequence: "3"
depends_on: 
  - "T0002"
allowed_paths: 
  - "apps/web/src/pages/Dashboard.tsx"
  - "apps/web/src/components/"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/types/index.ts"
  - "apps/web/e2e/"
  - "apps/web/src/index.css"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run lint"
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke"
  - "VITE_USE_MOCK=false npx playwright test"
---

## 目标

在现有 `Dashboard` 所在“新品预测工作台”内落地 `单品画像预测`，支持单款预测、批量 preview、批量 execute、结果展示、风险说明、下载和 mock/real E2E。

## 背景依据

- 产品 PRD：`docs/prd-single-product-portrait-frontend.md`
- 依赖任务：`A-PORTRAIT-FE-2` / Task Bus `T0002`
- 当前前端状态：`docs/notes-viz.md`
- API 契约纪律：`AGENTS.md` §五

## 允许范围

- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/components/`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/e2e/`
- `apps/web/src/index.css`
- `docs/notes-viz.md`

如需修改其他前端文件，必须在 handoff 中说明原因和影响。

## 非目标

- 不新增一级导航。
- 不浏览器端解析 CSV/XLSX。
- 不触发人货匹配。
- 不进入经营飞轮。
- 不写入 `prediction` 表。
- 不使用 Tools artifact 路由。
- 不做拖拽上传、多文件队列、失败行在线编辑。

## 页面结构

在现有“新品预测工作台”内新增 `单品画像预测` 区域。

文案：

- 模块标题：`单品画像预测`
- 模式：`单款预测` / `批量预测`
- 单款按钮：`预测单款画像`
- 批量 preview 按钮：`校验批量文件`
- 批量 execute 按钮：
  - 无失败行：`执行批量预测`
  - 有失败行但有有效行：`预测有效行`
- 结果标题：
  - `单款画像结果`
  - `批量画像结果`

建议组件：

- `SinglePortraitForm`
- `SinglePortraitBatchUpload`
- `SinglePortraitResult`
- `SinglePortraitBatchResults`
- `SinglePortraitModelInfo`

## 功能要求

1. 页面加载时调用 metadata。
2. metadata `modelAvailable: false` 时禁用单款和批量预测按钮，展示“模型文件未生成，请先训练模型”。
3. 单款表单包含 `款号`、`版型`、`面料`、`FAB`。
4. `版型` 选项来自 metadata `fitTypes`，前端不硬编码。
5. 单款表单提供 `填入示例`，示例 `fitType` 必须来自 metadata。
6. 批量模式提供“下载模板”按钮，前端基于 metadata 生成 CSV 模板。
7. 批量模式不在浏览器端解析文件，只上传给后端 preview。
8. preview 展示总行数、有效行、失败行、warnings、文件级错误、行级错误、额外列。
9. valid rows 为 0 或存在 fileErrors 时，execute 按钮禁用。
10. execute 展示批量摘要表；点击行后复用单款结果组件展示完整详情。
11. 下载：
    - 预测结果 CSV。
    - 错误报告 CSV。
    - 完整 JSON。
12. 模型说明区展示 risk flags、modelVersion、sampleCount、trainedAt/generatedAt、metricsSummary、支持版型列表。
13. UI 百分比保留 1 位小数；下载保留原始 share 数值。

## Mock 要求

`VITE_USE_MOCK=true` 必须模拟真实 API shape：

- metadata。
- 单款预测。
- 批量 preview。
- 批量 execute。
- 文件级错误。
- 行级错误。
- warnings。

Mock 不得绕过 metadata 流程。

## 验证

至少运行：

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke`
- `VITE_USE_MOCK=false npx playwright test` 的定向用例，覆盖 metadata、单款预测、批量 preview/execute、风险标记可见，并断言真实请求被命中。

Playwright 覆盖：

- mock 单款成功。
- mock 批量成功和部分失败。
- 下载按钮存在且内容字段符合 PRD。
- real metadata 加载。
- real 单款预测成功。
- real 批量上传小型 CSV 或 XLSX，覆盖成功行、失败行、重复款号和额外列。
- 390px 窄屏无横向溢出、按钮文字不重叠。

## Handoff 格式

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

额外说明：

- 新增组件结构。
- API adapter 解包方式。
- Mock 与真实 API shape 对齐点。
- 未覆盖的真实后端风险。

## 执行顺序与依赖

- 批次：single-product-portrait-frontend
- 顺序：3
- 依赖：T0002
- 只有依赖任务全部 approved 后才可领取。
