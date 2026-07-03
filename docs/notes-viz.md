# notes-viz

## 0. 当前状态

最近更新：2026-07-03（V-P1-F4, V-P1-F5 完成）

进度：

- 已产出工作台流程文档 `docs/ui-flow.md`。
- 已产出决策建议与输出字段设计 `docs/decision-output.md`。
- `V-P1-C1` (渠道推荐详情页增强) 已完成：在匹配抽屉中补充展示了 channel profile 的摘要(样本量、窗口期、数据标识)、匹配打分、置信度，并且通过图文展示了 positive/negative drivers 和 risks，坚守了数据红线。
- `V-P1-C2` (批量 SKU 对比视图) 已完成：在 Heatmap 增加了按 recommendation 筛选和点击表头按渠道对多个 SKU 排序的功能；为单元格增加了驱动因素的 Tooltip 摘要。为了优化展示，将所有匹配结果聚合到了前端的 Map 中，减少频繁加载。
- `V-P1-C3` (P1 demo report 导出) 已完成：在 Heatmap 顶部增加了 CSV 导出功能，严格包含只属于 S4 派生的字段 (包含 matchScore, generatedAt, drivers, risks)，去除了原始数据源可能导致越权的内容。已增加 escapeCsvCell 函数处理边界字符。
- `V-P1-C4` (真实后端端到端 Playwright smoke) 已完成：使用 Playwright 实现了端到端的验证 (`apps/web/e2e/smoke.spec.ts`)，覆盖了 Dashboard 的新建、生成预测、进入 Heatmap、点击抽屉、CSV 导出、断言 CSV 白名单及无抛出意外 Error 等核心体验。为保证稳定隔离，Playwright config 已调整为独立启动在 5175 端口的纯 Mock 环境 (`VITE_USE_MOCK=true npm run dev`)，不会与本机真实 5174 服务冲撞，且同时支持在 `VITE_USE_MOCK=false` 下验证真实后端。
- `V-P1-E4` (账号画像基准与款账号对比视图) 已完成：使用纯 React 组件和安全聚合数据源（Mock 或 A-P1-E3 派生后端响应），彻底迁移了抖音 dashboard 核心体验，不再使用 iframe 粗暴嵌套 HTML。针对后端 M-P1-E2 的强类型契约（如 `AccountFitDriver` 和 `AccountFitAdjustmentAdvice`），在前端做了显式的 View Model 扁平化映射生成视图所需基准和对比数据，遵循完全无 `any` 约束。
- `V-P1-F4` (账号画像工作台原生重构) 本地 mock UI 完成，真实 A-P1-F2 联调已通过：彻底移除了原有外链/iframe 和前端内嵌 data.js，使用 React 原生重构了“账号画像基准”与“商品人群罗盘”。数据读取直接对接 A 域 API，UI 复用 PLS 统一组件与 loading/empty 状态。
- `V-P1-F5` (款账号对比与优化清单原生重构) 本地 mock UI 完成，真实 A-P1-F2 联调已通过：重构了“号货匹配诊断”、“维度 TOP1 对比”和“优化调整清单”原生视图。新增并适配了对应的 CSV 导出功能，所有依赖的数据完全通过内部 API 流转，页面可动态响应数据的修改和重新获取。

下一步：

- 回流 X 总控进行 P1-F 产品化重构的总体验收（X-P1-F6）。

阻塞：

- 无。

开放问题：

- 无。

---

## 决策沉淀

- **前端交互深度**：P0 阶段直接基于基础组件库搭建低保真 MVP，不设计高保真视觉和动画，重点走通数据展现和流程。
- **UI Token 化与主题**：采用 `hsl` 中性色（neutral）变量方案建立设计系统；通过切换 `html.dark` class 并持久化至 `localStorage` 来实现跨端深浅色模式切换；状态色的透明度运算统一采用原生 CSS `color-mix`（如 `color-mix(in srgb, var(--destructive) 50%, transparent)`）替代硬编码 rgba，以支持主题自适应。
- **数据导出**：基于运营实际痛点，一期保留浏览器端 CSV 纯文本导出能力；导出仅限热力图和 `MatchResult` 派生结果字段，不导出原始输入、DMP 原始字段值或审计原始 payload。
- **前后端契约与视图映射**：前端严格遵守避免 `any` 的规则。API 边界定义严格与后端 `DiagnosticRow` / `AccountFitAdjustmentAdvice` 对齐。为适配 UI 需要的结构（如基准、对比列表、Checklist），采用前端 `api.ts` 作为接缝层，将深层域模型安全映射（并包含默认 fallback 处理）为扁平化的 View Model。

---

## 前端域原则

- 首屏应是工作台，不做营销落地页。
- 画像输出必须同时展示结论、置信度、依据和风险。
- 匹配热力图必须能解释为什么匹配或不匹配。
- 不用“AI 黑盒建议”替代可执行运营动作。
