# notes-viz

## 0. 当前状态

最近更新：2026-07-03（V-P2-11 经营飞轮最小闭环视图验收通过）

进度：

- `V-P2-11` (经营飞轮最小闭环视图) 已完成：新增 `FlywheelWorkbench`，并在核心匹配面板中打通“创建经营决策”入口。实现了包含创建决策、添加行动记录（如铺货、调价等操作描述）、追踪复盘状态（如待执行、执行中、待复盘、已验证）及录入最终业务反馈（效果判定、核心指标摘要、偏差提示及后续调整事项）的全流转。该看板确保与匹配数据强关联，并坚守了“前端仅记录与归因闭环，不擅自自动化执行”的红线。已成功集成 E2E 验证。
- `V-P2-6` (人货匹配核心工作台) 已完成并通过 X 总控复核：把人货匹配升级为核心决策工作台，支持「按商品找实体」和「按实体找商品」双向匹配查询模式。用详细的白盒卡片展示综合得分、置信度、决策建议、正负向驱动和风险提示，支持按策略分组、排序和明细 CSV 导出。总控复核中已把真实 API 实体来源改为 `/api/v0/channels/entities`，修正模式切换 `Match not found` 假阳性和真实 smoke 断言缺口。
- `V-P2-4` (店铺 / 账号优先的渠道人群工作台) 已完成：新建 `AccountProfileWorkbench`，实现左侧实体列表（按平台分组），右侧区分“分析视图（账号画像与基准数据）”和“决策视图（结合指定 SKU 生成号货匹配诊断）”。替换了原有的单点对比页，提升了实体视角的分析广度，同时更新了 e2e tests 并在 Mock 与真实 API 模式下跑通。
- X 总控已完成 V-P2-4 复核：真实 API 主流程已切换到 A-P2-3 的 `/api/v0/channels/entities`，并修正默认真实 SKU、低置信度 boolean 判断和重复 tag key。验收报告见 `docs/p2-4-channel-entity-workbench-acceptance.md`。

- 已产出工作台流程文档 `docs/ui-flow.md`。
- 已产出决策建议与输出字段设计 `docs/decision-output.md`。
- `V-P1-C1` (渠道推荐详情页增强) 已完成：在匹配抽屉中补充展示了 channel profile 的摘要(样本量、窗口期、数据标识)、匹配打分、置信度，并且通过图文展示了 positive/negative drivers 和 risks，坚守了数据红线。
- `V-P1-C2` (批量 SKU 对比视图) 已完成：在 Heatmap 增加了按 recommendation 筛选和点击表头按渠道对多个 SKU 排序的功能；为单元格增加了驱动因素的 Tooltip 摘要。为了优化展示，将所有匹配结果聚合到了前端的 Map 中，减少频繁加载。
- `V-P1-C3` (P1 demo report 导出) 已完成：在 Heatmap 顶部增加了 CSV 导出功能，严格包含只属于 S4 派生的字段 (包含 matchScore, generatedAt, drivers, risks)，去除了原始数据源可能导致越权的内容。已增加 escapeCsvCell 函数处理边界字符。
- `V-P1-C4` (真实后端端到端 Playwright smoke) 已完成：使用 Playwright 实现了端到端的验证 (`apps/web/e2e/smoke.spec.ts`)，覆盖了 Dashboard 的新建、生成预测、进入 Heatmap、点击抽屉、CSV 导出、断言 CSV 白名单及无抛出意外 Error 等核心体验。为保证稳定隔离，Playwright config 已调整为独立启动在 5175 端口的纯 Mock 环境 (`VITE_USE_MOCK=true npm run dev`)，不会与本机真实 5174 服务冲撞，且同时支持在 `VITE_USE_MOCK=false` 下验证真实后端。
- `V-P1-E4` (账号画像基准与款账号对比视图) 已完成：使用纯 React 组件和安全聚合数据源（Mock 或 A-P1-E3 派生后端响应），彻底迁移了抖音 dashboard 核心体验，不再使用 iframe 粗暴嵌套 HTML。针对后端 M-P1-E2 的强类型契约（如 `AccountFitDriver` 和 `AccountFitAdjustmentAdvice`），在前端做了显式的 View Model 扁平化映射生成视图所需基准和对比数据，遵循完全无 `any` 约束。
- `V-P1-F4` / `V-P1-F5` (UI 体验升级与中文化) 已完成：
  1. 执行了 `product-ui-redesign` 流程，通过 `index.css` 提供一致的 Design Tokens，将页面全面翻新为现代化的卡片化视觉效果（优质留白、阴影、层级）。
  2. 移除了前端所有的英文界面文案，将其完全转化为对非技术人员更加友好的简体中文。
  3. 为动态获取的系统标识（如 channelId 和 taxonomy tags）增加了 `utils/translate.ts` 翻译字典，对 API 响应或 Mock 生成的英文字符串做了自动拦截转换。
  4. 修复了受中文化影响的 End-to-End Playwright Smoke Tests。

下一步：

- 等待 D-P2-7 新品主数据预测输入模板或后续正式 `ProductChannelFit` API；若后端新增独立 `missingTags` / `lowConfidenceTags`，前端需补齐映射。

阻塞：

- 无。

开放问题：

- 无。

---

## 决策沉淀

- **前端交互深度**：P0 阶段直接基于基础组件库搭建低保真 MVP，不设计高保真视觉和动画，重点走通数据展现和流程。后续迭代已按照 `product-ui-redesign` 流程翻新为现代卡片化 UI。
- **UI Token 化与主题**：采用 `hsl` 中性色（neutral）变量方案建立设计系统；通过切换 `html.dark` class 并持久化至 `localStorage` 来实现跨端深浅色模式切换；状态色的透明度运算统一采用原生 CSS `color-mix`（如 `color-mix(in srgb, var(--destructive) 50%, transparent)`）替代硬编码 rgba，以支持主题自适应。
- **数据导出**：基于运营实际痛点，一期保留浏览器端 CSV 纯文本导出能力；导出仅限热力图和 `MatchResult` 派生结果字段，不导出原始输入、DMP 原始字段值或审计原始 payload。
- **前后端契约与视图映射**：前端严格遵守避免 `any` 的规则。API 边界定义严格与后端 `DiagnosticRow` / `AccountFitAdjustmentAdvice` 对齐。为适配 UI 需要的结构（如基准、对比列表、Checklist），采用前端 `api.ts` 作为接缝层，将深层域模型安全映射（并包含默认 fallback 处理）为扁平化的 View Model。
- **全链路中文化与非技术人员友好**：为了让非技术人员（运营、产品）易于理解，前端页面全面禁止英文占位符和文案；对后端 API 或 Mock 返回的英文特征标识（如 `channelId`，`tagId`），通过前端公共翻译模块 (`utils/translate.ts`) 实施拦截和翻译。
- **以实体为视角的双轨视图**：为适应 P2 阶段需求，账号画像由单一的“比对模式”升级为“实体优先”模式。通过划分“画像分析”与“决策诊断”两个 Tab，前者展示本实体的 Benchmark 和基盘特征，后者可自由挂载不同的 SKU 进行针对性投流或货品铺发测试，兼顾业务的纵览与深钻。
- **决策飞轮边界与人工审核机制**：在引入 `FlywheelWorkbench` 时，严守了“不自动执行策略”红线。尽管工具串联了从匹配诊断到后续决策流转（如“铺货”或“调价”）的动作记录与归因反馈环节，但在 P2 及可见阶段，所有的行动执行仍依赖业务人员在外部系统或人工完成；前端看板仅用于跟踪、状态校验及记录复盘偏差。

---

## 前端域原则

- 首屏应是工作台，不做营销落地页。
- 画像输出必须同时展示结论、置信度、依据和风险。
- 匹配热力图必须能解释为什么匹配或不匹配。
- 不用“AI 黑盒建议”替代可执行运营动作。
