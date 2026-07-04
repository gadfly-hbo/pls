# P3 UI Quality Plan

## 1. 目的

本方案冻结 PLS 前端 UI 质量专项的总控口径，用于指导后续 V 域串行改造 `apps/web`。本轮目标不是换颜色或做单页补丁，而是建立统一的产品级 AppShell、工作台布局、响应式规则和组件系统，使 PLS 在桌面缩放、平板和移动窄屏下仍保持可演示、可操作、可继续扩展。

适用范围：

- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/pages/AccountProfileWorkbench.tsx`
- `apps/web/src/pages/MatchCoreWorkbench.tsx`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/pages/FlywheelWorkbench.tsx`
- `apps/web/src/pages/DataManagementWorkbench.tsx`

非目标：

- 不修改 A/M/D API contract。
- 不修改 DB schema、migration、Admin API 安全约束或模型 contract。
- 不新增依赖。
- 不重写业务流程。
- 不用 landing page、iframe、静态 BI 页面或截图嵌入替代工作台。

## 2. 现状证据

依据本轮只读复核：

- `apps/web/src/App.tsx`：当前使用单行顶部导航，模块名较长，缺少 workspace / dataVersion 状态区和窄屏折叠菜单。
- `apps/web/src/index.css`：全局 token、旧组件、新组件、页面私有样式混在同一文件中；`card`、`panel`、`toolbar`、`metric-card`、`workbench-sidebar` 等语义已存在但没有统一 layout contract。
- `apps/web/src/pages/MatchCoreWorkbench.tsx`：截图暴露的问题集中在该页，左侧列表为空时仍占固定空间，右侧详情区出现大面积空洞，未选择状态缺少明确下一步动作。
- `apps/web/src/pages/AccountProfileWorkbench.tsx`：已使用 `page-header`、`segmented-control` 和 `workbench-sidebar`，但仍有大量 inline style，分析视图和决策视图布局口径不同。
- `apps/web/src/pages/Dashboard.tsx`：新品录入和预测结果为双栏结构，表单 sticky 与结果区在窄屏下需要统一降级策略。
- `apps/web/src/pages/FlywheelWorkbench.tsx`：与人货匹配类似采用左列表右详情，但状态流转按钮、行动记录和反馈表单缺少统一密度规则。
- `apps/web/src/pages/DataManagementWorkbench.tsx`：复杂表格、操作日志、危险操作弹窗和 README 内容存在大量 inline table style，需要统一 DataTable 与 OperationModal 规则。

问题分级：

- Blocker：导航和主工作台布局在缩放 / 窄屏下没有统一降级策略，影响核心演示路径。
- High：人货匹配工作台空态与详情区比例失衡，用户无法判断是未选择、空库、筛选为空还是加载失败。
- High：组件语义不稳定，页面私有样式过多，后续改造难以复用和验收。
- Medium：暗色模式可用但对比、留白和状态层级偏弱。
- Medium：复杂表格和危险操作弹窗缺少统一横向滚动、长文本和移动端规则。
- Low：部分图标使用 emoji，后续可替换为现有 `lucide-react` 图标，但不作为本轮阻塞。

## 3. UI 原则

1. 工作台优先：第一屏必须服务选择对象、查看状态、筛选、解释诊断和进入下一步，不做营销式 hero。
2. 信息密度克制：PLS 是业务智能 BI 系统，应保持紧凑、可扫描、低装饰的操作界面。
3. 响应式按工作流降级：桌面双栏 / 三栏，平板压缩 toolbar，移动端列表与详情分步展示或抽屉化。
4. 空状态可行动：空库、空筛选、未选择、加载中、失败必须使用不同文案和操作提示。
5. 契约不漂移：UI 只映射现有 API / type，不新增未冻结字段，不伪造业务数据。

## 4. AppShell Contract

后续 `V-P3-UI-QUALITY-1` 应将 `App.tsx` 收敛为统一 AppShell。

布局：

- 顶部固定高度建议 56px 到 64px，允许窄屏变为两行或折叠。
- 左侧为产品标识：`PLS 工作台`。
- 中间为一级模块导航：实体与账号画像、人货匹配、新品预测、经营飞轮、数据管理。
- 右侧为全局状态区：workspace、dataVersion 或数据状态摘要、主题切换。
- 1024px 以下导航必须允许换行、横向滚动或折叠菜单；390px 下不得出现导航文字重叠。

模块命名：

- `实体与账号画像`
- `人货匹配`
- `新品预测`
- `经营飞轮`
- `数据管理`

AppShell 禁止事项：

- 不把主导航做成会撑破页面的单行按钮组。
- 不在顶部塞入页面级筛选器。
- 不使用渐变 logo、装饰背景或大阴影提升“质感”。

## 5. Component Contract

以下组件为后续 V 域改造共享口径。可以先用 CSS class 实现，不要求抽成 React 组件；但命名和行为必须一致。

### 5.1 PageHeader

用途：页面标题、当前对象、数据版本、质量状态和主操作。

结构：

- title：模块或对象名称。
- subtitle/meta：workspace、dataVersion、timeWindow、sampleSize、qualityFlags。
- actions：导出、刷新、创建决策等主操作。

规则：

- title 不超过 20px。
- meta 自动换行。
- actions 在 768px 以下换到下一行，按钮可换行但不可重叠。

### 5.2 WorkbenchToolbar

用途：模式切换、搜索、筛选、排序、对象选择。

规则：

- 桌面横向排列，使用 `gap` 和 `flex-wrap`。
- 平板宽度下控件分组换行。
- 移动端 select / input 默认 100% 宽度。
- 不使用 inline width 控制核心响应式。

### 5.3 ObjectListPane

用途：实体列表、商品列表、决策列表、版本列表。

规则：

- 桌面宽度建议 300px 到 360px。
- 1280px 以下可收窄到 280px。
- 768px 以下变为顶部列表区或抽屉入口。
- 列表项必须支持长 ID 换行或截断展示，完整 ID 可在 title 或详情区展示。

### 5.4 InspectorPane

用途：解释诊断、画像详情、预测结果、决策详情、表详情。

规则：

- 不允许未选择时出现大面积空白。
- 未选择状态显示当前工作流下一步，例如“选择左侧实体查看匹配解释”。
- 详情内容按“结论 -> 关键指标 -> 解释 -> 风险 -> 操作”排序。
- 滚动区域必须受控，不撑破页面。

### 5.5 EmptyState

五类空状态必须区分：

- `empty-database`：当前 workspace 无业务数据，提示去数据管理导入。
- `empty-filter`：筛选无结果，提示清空筛选或调整条件。
- `not-selected`：尚未选择对象，提示选择列表项。
- `loading`：正在加载，不能显示错误或空库文案。
- `error`：请求失败，展示错误摘要和重试入口。

禁止只显示“暂无记录”而不说明原因。

### 5.6 StatusBadge

用途：质量、状态、风险、推荐策略。

统一语义：

- success：已完成、可用、通过、强匹配。
- warning：低置信度、样本不足、待复盘、需注意。
- danger：失败、拦截、破坏性、严重冲突。
- neutral：未知、未开始、普通状态。

### 5.7 MetricCard

用途：关键指标摘要。

规则：

- 卡片只用于重复指标，不用于包裹整个页面区域。
- 桌面最多 4 列，平板 2 列，移动端 1 列。
- 标题、值、辅助说明必须固定层级，避免每页自定义字号。

### 5.8 DataTable

用途：库表、版本、导入任务、操作日志、维度对比。

规则：

- 外层统一 `overflow-x: auto`。
- 表格最小宽度由列数决定，不挤压文字到不可读。
- 长 ID、checksum、JSON snapshot 使用 monospace + 截断或受控展开。
- 移动端优先横向滚动，不把多列表格强行压成重叠文本。

### 5.9 OperationModal

用途：导入、清空、删除版本、apply migrations、rebuild 等受控操作。

规则：

- 必须展示 operation、target、affectedRows、affectedTables、warnings、requiredConfirmText、admin token、execute result、auditId。
- 移动端 modal 顶部对齐并限制最大高度。
- 不隐藏 user_authorized、audit、task、import history 影响提示。
- 不放宽 dry run、confirmText、admin token、Idempotency-Key、db_admin_audit。

## 6. Breakpoint Contract

验收宽度：

- 1440px：主桌面演示尺寸。
- 1280px：常见笔记本宽度。
- 1024px：平板横向 / 缩放后工作台。
- 768px：平板纵向和窄屏临界。
- 390px：移动端最小验收宽度。

布局规则：

| 宽度 | AppShell | 工作台布局 | Toolbar | 表格 |
|---|---|---|---|---|
| >= 1280px | 单行导航 | 双栏 / 三栏 | 横向 | 正常表格 |
| 1024-1279px | 单行或横向滚动导航 | 左栏收窄，详情优先 | 允许换行 | 横向滚动 |
| 768-1023px | 导航换行或折叠 | 列表上方，详情下方 | 控件分组换行 | 横向滚动 |
| < 768px | 折叠菜单优先 | 列表与详情分步或抽屉 | 控件 100% 宽 | 横向滚动 |

禁止事项：

- 禁止用 `vw` 缩放字体。
- 禁止按钮文字相互覆盖。
- 禁止主内容出现页面级横向滚动；表格容器内部横向滚动允许。
- 禁止固定高度导致内容被裁切且无滚动。

## 7. Page Family Plan

### 7.1 第一优先级：人货匹配

目标页面：`MatchCoreWorkbench.tsx`

必须解决：

- 空列表、未选择和详情加载失败状态分离。
- 左侧列表和右侧详情比例在 1440、1024、768、390 宽度下稳定。
- 详情区按结论、得分、相似标签、冲突标签、风险、操作排序。
- 按商品找实体与按实体找商品两个模式共享同一布局。

### 7.2 第二优先级：实体画像与新品预测

目标页面：

- `AccountProfileWorkbench.tsx`
- `Dashboard.tsx`

必须解决：

- 统一实体画像分析和号货匹配决策的 PageHeader / Toolbar。
- 新品录入表单在移动端变为单列，不使用 sticky 造成内容遮挡。
- 预测结果、qualityFlags、drivers 和标签分布使用统一 MetricCard / StatusBadge / EmptyState。

### 7.3 第三优先级：经营飞轮与数据管理

目标页面：

- `FlywheelWorkbench.tsx`
- `DataManagementWorkbench.tsx`

必须解决：

- 经营飞轮左列表右详情复用 ObjectListPane / InspectorPane。
- 数据管理所有表格切换为统一 DataTable 容器。
- 危险操作弹窗收敛为 OperationModal。
- README、JSON snapshot、schema SQL 使用受控滚动。

## 8. 验证方式

每张 V 域实现卡至少运行：

```bash
cd apps/web
npm run lint
npm run build
npm run smoke
```

涉及真实 API 的页面，应补充真实模式定向验证：

```bash
cd apps/web
VITE_USE_MOCK=false npx playwright test e2e/smoke-real.spec.ts
```

数据管理危险操作验证必须遵守项目规则：

- 破坏性 execute 必须拦截或使用临时 workspace。
- 不对 `ws_demo` 执行未确认的正式 rebuild、drop、truncate 或 delete version。
- `USE_MOCK=true` 时 Playwright `page.route` 不会拦截真实请求；若要验证真实 contract，必须显式使用 `VITE_USE_MOCK=false`。

截图验收：

- 1440px desktop。
- 1280px notebook。
- 1024px tablet landscape。
- 768px tablet portrait。
- 390px mobile。

每个宽度至少检查：

- 导航无重叠。
- 页面主区域无无意义大空洞。
- 按钮和输入框不重叠。
- 长 ID、长标签、长风险文案不遮挡其他内容。
- 空状态文案与当前业务状态一致。

## 9. 使用方式

V 域 agent 开工时应按以下顺序使用本方案：

1. 先读本文件和对应 wiki 任务卡。
2. 只处理当前任务卡指定页面族。
3. 保持 API、type、Mock contract 不变。
4. 优先复用本文件冻结的组件语义。
5. 完成后回流：改动文件、验证命令、截图检查、风险和未覆盖项。

示例回流格式：

```text
任务：V-P3-UI-QUALITY-2
改动：MatchCoreWorkbench 布局收敛为 WorkbenchShell，补齐五类空状态。
验证：npm run lint / build / smoke 通过。
截图：1440、1024、768、390 检查通过，无导航重叠和详情区空洞。
风险：真实 API 空库状态仅通过 Mock 复现，待 X 总体验收补真实后端复验。
```

## 10. 注意事项

- 本文件是 UI 质量专项的总控口径，低于 `AGENTS.md` 和 `Orchestration.md`，高于单个 V 域实现卡的自由发挥。
- 若实现中发现必须新增字段、API、DB schema 或模型输出，必须回流总控另开 A/M/D/X 任务，不得在 V 域自行扩展。
- 若某个组件只服务单页，先用页面内 class 实现；只有服务两个以上页面时再抽成通用 React 组件。
- 若视觉验收失败，不允许只调色通过；必须回到信息层级、布局约束和状态语义修复。
