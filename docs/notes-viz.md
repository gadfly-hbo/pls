# notes-viz

## 0. 当前状态

最近更新：2026-07-04（X-P3-UI-QUALITY-5 前端 UI 总体验收通过，MatchCoreWorkbench 空状态已复验）

进度：

- `V-P3-UI-QUALITY-1` 已完成：重构 `App.tsx` 为统一 AppShell（品牌、导航、workspace badge、主题切换），桌面导航支持 flex-wrap，768px 以下切换 hamburger 展开面板，390px 隐藏 env-badge 防止文字重叠。重写 `index.css` 为统一 Design Token 结构（`--header-height`, `--page-padding`, `--sidebar-width` 等布局 token），合并为 1024/768/390 三档断点。
- `V-P3-UI-QUALITY-2` 已完成：`MatchCoreWorkbench` 采用 WorkbenchShell 模式（toolbar + segmented-control + sidebar/detail 双栏），收敛内联样式为 CSS class（`match-entity-item`, `driver-card`, `section-divider` 等），空状态增加引导文案。
- `V-P3-UI-QUALITY-3` 已完成：`AccountProfileWorkbench` 和 `Dashboard` 统一为 `workbench-sidebar` + `workbench-detail` 布局，表格包裹 `data-table-wrapper`，空状态引导、metric-grid 密度一致。
- `V-P3-UI-QUALITY-4` 已完成：`FlywheelWorkbench` 和 `DataManagementWorkbench` 收敛为 panel + data-table + segmented-control 统一组件模式，operation modal 密度优化，tabs 改用 segmented-control。
- X 总控复核已通过：`apps/web npm run lint`、`npm run build`、`npm run smoke` 通过；`VITE_USE_MOCK=false npx playwright test e2e/smoke-real.spec.ts -g "Data Management Workbench - Real Backend Smoke Test"` 通过。总控修复了真实后端数据管理 smoke 中 `ws_demo` strict mode selector，避免 AppShell workspace badge 与总览 metric 重复文本导致误判。
- 真实端到端匹配 smoke 当前不作为通过项：当前 `ws_demo` 的 `/api/v0/channels/entities` 与 `/api/v0/matches/heatmap` 返回空数组，缺少业务数据前置；如需复验真实人货匹配链路，需先通过受控导入 / 同步生成 channel entities 与 match 数据。
- X-P3-UI-QUALITY-5 总体验收已通过，`docs/p3-ui-quality-acceptance.md` 已更新为最终版。通过项：`apps/web lint / build / smoke`、真实后端数据管理定向 Playwright、多宽度截图和 DOM 溢出检查；MatchCoreWorkbench 空列表右侧状态已修复并复验，`empty-list` 与 `not-selected` 不再混用。剩余风险：当前真实人货匹配详情链路因 `ws_demo` 的 `/api/v0/channels/entities` 与 `/api/v0/matches/heatmap` 为空未覆盖。
- `X-P3-DB-MGMT-4` 总体验收已通过：`DataManagementWorkbench` 已作为受控数据库管理工作台接入 Admin API；前端支持导入、版本删除、表清空 / 删除、apply migrations、rebuild 的 dry run -> confirmText -> execute -> audit 结果展示链路。
- `V-P3-DB-MGMT-2` (数据管理前端操作化) 问题修复与 E2E 补齐：修复了总控复核提出的阻断问题：将所有 Playwright 拦截响应结构更新至与真实后端同构的顶层数据返回；补充了导入包 `demo` / `douyin-bi`、版本删除、Apply Migrations 的 UI 测试流，并增加了对操作日志执行成功状态及 Audit ID 的显式断言。修复了 `USE_MOCK=true` 模式下 `DELETE_VERSION` 与 `DROP_TABLE` 的 mock confirmText 组装回退逻辑错误以及相关路由匹配漏洞。
- 总体验收中修复了前端其他问题：`api.ts` 缺失 `DbOperationExecuteResult` type import 导致 build 失败；`data-management.spec.ts` import dry-run 拦截路径未覆盖真实 `/import-jobs/dry-run`；真实后端数据下导入 / 版本 / audit 列表空 id 触发 React duplicate key console error。
- 验证通过：`apps/web npm run lint`、`npm run build`、`npm run smoke`。
- `V-P3-DB-7` (危险操作前端与操作日志闭环) 已完成：在数据管理前端支持清空表、删除表、删除版本、重建 workspace 的受控入口。所有操作均需先进行 dry run（展示影响表、行数、是否含用户授权数据及审计记录），并强制要求用户输入诸如 `RESET ws_demo` 的文本进行确认。操作完成后自动刷新当前数据。操作日志页现在展示完整快照（JSON 缩略视图）。
- `V-P3-DB-5` (数据管理前端只读工作台) 已完成：新增 `DataManagementWorkbench`，提供总览、库表、导入、版本、Schema、操作日志、危险操作七个 Tab。由于 A 域 Admin API 尚未就绪，已在前端 `api.ts` 中完成了 mock 联调，并定义了 `DbOverview` 等 8 个相关 TS 类型。坚守了数据红线（不直接访问 SQLite、不实现单元格编辑、危险操作仅展示禁用态），已通过 lint、build 及 Playwright smoke 测试，截图检查确认表格、按钮和长表名无重叠。
- `V-P2-UI-1` 至 `V-P2-UI-4`（PLS 工作台 UI 改造二阶段）已完成并通过 X 总控复核：应用导航顺序已调整为“实体与账号画像 -> 人货匹配核心工作台 -> 新品预测工作台 -> 经营飞轮”，默认入口改为 `AccountProfileWorkbench`。四个工作台统一接入 PageHeader、SegmentedControl、MetricCard、StatusBadge、EntityListItem、EmptyState、AlertBanner、Toolbar、Panel 等轻量 UI 样式；清理旧 `App.css` starter 样式，并收敛工作台 spacing、radius、shadow、状态色和响应式布局。总控复验 `npm run lint`、`npm run build`、`npm run smoke` 通过，并补做 1440px desktop 与 375px mobile 四模块截图检查，未发现明显遮挡、错位或 console/page error。
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

- 以 `docs/wiki.html` v0.45 为当前 UI 专项任务状态真源；V-P3-UI-QUALITY-1 至 V-P3-UI-QUALITY-4 与 `X-P3-UI-QUALITY-5` 均已完成并通过 X 复核。
- MatchCoreWorkbench 空列表时右侧 InspectorPane 状态语义已关闭：无匹配记录时展示“当前无匹配数据”，仅列表有数据但未选中时提示选择左侧项目。
- P3-DB-MGMT 前端闭环已通过总控验收；后续增强需另开卡。
- 若后端新增数据包列表接口，前端应移除固定 `demo` / `douyin-bi` 枚举，改为消费后端受支持数据包列表。

阻塞：

- 当前 `ws_demo` 的 `/api/v0/channels/entities` 与 `/api/v0/matches/heatmap` 返回空数组；真实后端人货匹配全链路 smoke 需要先恢复演示数据前置，不作为 V-P3-UI-QUALITY-1~4 通过阻塞。

开放问题：

- 是否为 X-P3-UI-QUALITY-5 总体验收重放 demo / douyin-bi 并执行 channel entities / match 数据同步，需由总控单独确认。

---

## 决策沉淀

- **前端交互深度**：P0 阶段直接基于基础组件库搭建低保真 MVP，不设计高保真视觉和动画，重点走通数据展现和流程。后续迭代已按照 `product-ui-redesign` 流程翻新为现代卡片化 UI。
- **UI Token 化与主题**：采用 `hsl` 中性色（neutral）变量方案建立设计系统；通过切换 `html.dark` class 并持久化至 `localStorage` 来实现跨端深浅色模式切换；状态色的透明度运算统一采用原生 CSS `color-mix`（如 `color-mix(in srgb, var(--destructive) 50%, transparent)`）替代硬编码 rgba，以支持主题自适应。
- **数据导出**：基于运营实际痛点，一期保留浏览器端 CSV 纯文本导出能力；导出仅限热力图和 `MatchResult` 派生结果字段，不导出原始输入、DMP 原始字段值或审计原始 payload。
- **前后端契约与视图映射**：前端严格遵守避免 `any` 的规则。API 边界定义严格与后端 `DiagnosticRow` / `AccountFitAdjustmentAdvice` 对齐。为适配 UI 需要的结构（如基准、对比列表、Checklist），采用前端 `api.ts` 作为接缝层，将深层域模型安全映射（并包含默认 fallback 处理）为扁平化的 View Model。
- **全链路中文化与非技术人员友好**：为了让非技术人员（运营、产品）易于理解，前端页面全面禁止英文占位符和文案；对后端 API 或 Mock 返回的英文特征标识（如 `channelId`，`tagId`），通过前端公共翻译模块 (`utils/translate.ts`) 实施拦截和翻译。
- **“半盲开发”与契约对齐的血泪教训**：在 V-P3-DB-5 和 V-P3-DB-7 的数据管理开发中，因为过度依赖纯前端 Mock 的理想化结构，未前置阅读后端的真实路由文件（`apps/server/src/routes/`）和响应 Schema，导致真实联调时出现 401（漏鉴权 Header）、404（硬编造路径）、渲染崩溃（扁平化对象直接透传）及字段对不齐（`truncatable` 被误认为 `isClearable`）等阻断问题，被迫经历了多次返工。今后立下铁律：
  1. **无契约不动手**：写代码前必须利用工具读取后端源码，严禁仅凭猜测或旧 Mock 开始编写对接逻辑。
  2. **强制 Adapter 隔离层对齐**：Header（如 `Idempotency-Key`, `X-PLS-Admin-Token`）、Method、URL、Body 和 Response（包括数组清洗、布尔值及多形态状态的推导）必须在 `api.ts` 过一遍严格映射和沙盘推演。
  3. **Mock 必须反映真实形态**：E2E 的 Mock 响应必须与后端真实返回结构的字段及层级完全一致，杜绝“自欺欺人”的脱节测试。
- **本地 Mock 与 E2E 拦截的坑（USE_MOCK 陷阱）**：在补齐 V-P3-DB-MGMT-2 的 E2E 覆盖时深刻体会到：前端 `api.ts` 的 `USE_MOCK=true` 会导致不发起真实网络请求，致使 Playwright 的 `page.route` 网络拦截完全失效。另外，Playwright 的 `page.route` 路由匹配不能包含 HTTP Method（不能写成 `**/versions/*/delete*`），只能用精确的 URL glob 匹配。这要求我们在修改任何拦截内容时，必须同步修正 `api.ts` 本地短路的 fallback 验证逻辑，防止因前端代码库“Mock 漂移”导致的 CI 流程断链。
- **以实体为视角的双轨视图**：为适应 P2 阶段需求，账号画像由单一的“比对模式”升级为“实体优先”模式。通过划分“画像分析”与“决策诊断”两个 Tab，前者展示本实体的 Benchmark 和基盘特征，后者可自由挂载不同的 SKU 进行针对性投流或货品铺发测试，兼顾业务的纵览与深钻。
- **决策飞轮边界与人工审核机制**：在引入 `FlywheelWorkbench` 时，严守了“不自动执行策略”红线。尽管工具串联了从匹配诊断到后续决策流转（如“铺货”或“调价”）的动作记录与归因反馈环节，但在 P2 及可见阶段，所有的行动执行仍依赖业务人员在外部系统或人工完成；前端看板仅用于跟踪、状态校验及记录复盘偏差。
- **数据管理红线**：P3-DB-MGMT 后 `DataManagementWorkbench` 已允许通过受控 Admin API 执行数据库运维操作，但仍禁止前端直接访问 SQLite 文件、通用 SQL console、单元格级在线编辑和绕过 confirmText / admin token / Idempotency-Key / audit 的写操作。

---

## 前端域原则

- 首屏应是工作台，不做营销落地页。
- 画像输出必须同时展示结论、置信度、依据和风险。
- 匹配热力图必须能解释为什么匹配或不匹配。
- 不用“AI 黑盒建议”替代可执行运营动作。
