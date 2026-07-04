# P3 Overview Module Plan

## 1. 目的

本文冻结 PLS 顶层总览模块的信息架构、数据来源、导航位置和验收口径，供 `V-P3-OVERVIEW-1` 实现使用。

总览模块是 PLS 顶层一级模块和默认首页，不是 `DataManagementWorkbench` 内部的数据库总览 Tab。它的职责是让经营、商品、渠道、投放和数据负责人进入系统后先判断：

- 当前 workspace 是否有可用业务数据。
- 数据、画像、匹配、预测和经营飞轮哪些模块可继续操作。
- 下一步应进入哪个工作台。

本卡只冻结方案，不修改 `apps/web` 前端代码，不修改 A/M/D API contract、DB schema、模型 contract 或数据准入口径。

## 2. 使用方式

- V 域实现 `V-P3-OVERVIEW-1` 时，以本文作为总览模块口径来源。
- 若本文与 `docs/wiki.html` 任务卡冲突，以 `docs/wiki.html` 当前任务卡为派发真源，并回流 X 总控修订本文。
- 若现有 API 不提供某个指标，V 域必须显示“暂无数据”或省略该指标，不得伪造业务数据、标签、ID、商品、账号或匹配结果。
- 总览仅使用现有前端 adapter 读取数据；需要新增聚合 API 时另开 A 域任务，不阻塞第一版总览。

## 3. 现状依据

依据本轮只读复核：

- `apps/web/src/App.tsx` 当前导航顺序为：实体与账号画像、人货匹配核心工作台、新品预测工作台、经营飞轮、数据管理；默认 `currentView` 为 `account-workbench`。
- `apps/web/src/services/api.ts` 已提供 `getDbOverview`、`getMatchEntities`、`getAccountProfiles`、`getProducts`、`getHeatmap`、`getDecisions`、`getDbVersions`、`getDbImportJobs`、`getDbAuditEvents`。
- `apps/web/src/services/api.ts` 只有 `createPrediction`，没有预测列表读取 adapter；总览不得展示“预测数”作为确定指标。
- `apps/web/src/types/index.ts` 已定义 `DbOverview`、`ChannelProfile`、`HeatmapData`、`DecisionRecord`、`DbDataVersion`、`DbImportJob`、`DbAuditEvent` 等可用于总览的类型。
- `docs/notes-infra.md` 记录当前真实 `ws_demo` 的 `/api/v0/channels/entities` 与 `/api/v0/matches/heatmap` 返回空数组；总览必须覆盖真实空业务数据状态。

## 4. 模块定位

总览模块定位为“业务状态摘要 + 模块入口 + 下一步动作”，不是分析报表大屏。

第一屏需要回答：

- 数据底座是否可用：数据库在线、migration 是否失败、是否有用户授权数据、最近是否导入。
- 业务对象是否存在：是否有渠道实体、商品或经营决策。
- 决策链路是否可走：是否已有匹配结果、是否存在待执行或待复盘决策。
- 用户下一步应做什么：导入数据、查看实体画像、进入人货匹配、新建预测、复盘经营动作。

## 5. 导航位置

`V-P3-OVERVIEW-1` 应修改 AppShell 导航为：

1. 总览
2. 实体与账号画像
3. 人货匹配
4. 新品预测
5. 经营飞轮
6. 数据管理

实现要求：

- 新增 `overview` view，并把默认 `currentView` 改为 `overview`。
- 顶部导航标签建议使用短名：`总览`、`实体与账号画像`、`人货匹配`、`新品预测`、`经营飞轮`、`数据管理`。
- 390px 移动端必须通过现有折叠菜单或等效策略避免导航文字重叠。

## 6. 信息架构

### 6.1 顶部状态区

展示 workspace 和数据底座状态。

数据来源：

| UI 字段 | 来源 | 缺失处理 |
|---|---|---|
| workspace | `api.getDbOverview().data.workspaceId` | 显示 `ws_demo` 或 `未知 workspace` |
| databaseStatus | `DbOverview.databaseStatus` | 显示 `unknown` |
| schemaVersion | `DbOverview.schemaVersion` | 显示 `暂无 Schema 版本` |
| migrationStatus | `DbOverview.migrationStatus` | 缺失时按 `0 / 0` 展示 |
| lastImportTime | `DbOverview.lastImportTime` | 显示 `暂无导入记录` |
| 数据标识 | `hasMockData` / `hasSmokeData` / `hasE2eData` / `hasUserAuthorizedData` | 全 false 时显示 `空业务库或未标记数据` |

状态语义：

- `danger`：`databaseStatus` 非 online，或 `migrationStatus.failed > 0`。
- `warning`：无用户授权数据且只有 mock/smoke/e2e 标记，或 `totalRows === 0`。
- `success`：数据库 online、migration 无失败且存在用户授权数据。
- `neutral`：信息不足但无明确失败。

### 6.2 关键指标区

第一版只展示现有 API 可证实的指标。

| 指标 | 来源 | 计算方式 |
|---|---|---|
| 渠道实体数 | `api.getMatchEntities()` | `data.items.length` |
| 匹配 SKU 数 | `api.getHeatmap()` | `data.rows.length` |
| 匹配 cell 数 | `api.getHeatmap()` | `rows.flatMap(row => row.cells).length` |
| 经营决策数 | `api.getDecisions()` | `data.items.length` |
| 待复盘 / 需调整数 | `api.getDecisions()` | status 为 `pending_review` 或 `needs_adjustment` 的数量 |
| 数据版本数 | `api.getDbVersions()` | `data.items.length` |
| 导入任务数 | `api.getDbImportJobs()` | `data.items.length` |
| 操作日志数 | `api.getDbAuditEvents()` | `data.items.length` |

不得展示为确定指标：

- 预测总数：当前只有 `createPrediction`，没有预测列表读取 adapter。
- 商品总数：当前真实 adapter `getProducts()` 使用 `/bi/douyin/products?pageSize=1`，只能证明是否存在样例，不适合作为商品总量。
- 正式 fit formula 结果：当前仍保留 `algorithm_pending_user_formula` 限制。

### 6.3 模块健康区

模块健康区按 PLS 主链路展示五个模块，每项包含状态、原因和入口。

| 模块 | 状态规则 | 入口 |
|---|---|---|
| 数据管理 | `DbOverview.databaseStatus` online 且 migration 无失败为可用；无导入记录为 warning | 数据管理 |
| 渠道人群 | `getMatchEntities().items.length > 0` 为可用；为空时提示导入并同步 channel entities | 实体与账号画像 |
| 人货匹配 | heatmap cell 数大于 0 为可用；有实体但无匹配为 warning | 人货匹配 |
| 新品预测 | 不展示总数；显示“可创建预测”，若无商品输入则提示进入新品预测录入 | 新品预测 |
| 经营飞轮 | 有决策记录为可用；有 pending_review / needs_adjustment 时 warning | 经营飞轮 |

### 6.4 推荐下一步

推荐下一步按优先级只突出 1 到 3 条，不做长列表。

优先级：

1. 数据库不可用或 migration failed：进入数据管理查看 Schema / 操作日志。
2. `totalRows === 0` 或无导入记录：进入数据管理导入用户授权数据包。
3. 无渠道实体：进入数据管理导入并同步渠道实体。
4. 有渠道实体但无 heatmap cell：进入人货匹配生成或查看匹配。
5. 有匹配但无经营决策：进入人货匹配，选择匹配结果并创建经营决策。
6. 有 `pending_review` 或 `needs_adjustment` 决策：进入经营飞轮复盘。
7. 无阻塞：进入实体与账号画像或人货匹配继续分析。

### 6.5 最近动态

最近动态只展示摘要，不展示原始 payload。

来源：

- 最近导入任务：`api.getDbImportJobs()`，按 `startedAt` 或 `completedAt` 倒序展示前 3 条。
- 最近数据版本：`api.getDbVersions()`，按 `createdAt` 倒序展示前 3 条。
- 最近操作日志：`api.getDbAuditEvents()`，按 `createdAt` 倒序展示前 3 条，显示 operation、target、status、createdAt。
- 最近经营决策：`api.getDecisions()`，按 `updatedAt` 或 `createdAt` 倒序展示前 3 条。

禁止展示：

- audit `snapshot` 原始 JSON。
- 用户上传原始文件内容。
- 未经映射的业务原始字段值。

## 7. 空状态口径

### 7.1 空业务库

触发条件：

- `DbOverview.totalRows === 0`，或
- 渠道实体数为 0 且 heatmap rows 为 0 且经营决策数为 0。

首页文案：

- 标题：`当前 workspace 还没有可用业务数据`
- 说明：`请先在数据管理中导入用户授权数据包，或确认是否需要重放 demo / douyin-bi 数据。`
- 主动作：`进入数据管理`
- 次动作：`查看导入与版本状态`

### 7.2 Demo / Smoke / E2E 数据

触发条件：

- `hasMockData`、`hasSmokeData` 或 `hasE2eData` 为 true，且 `hasUserAuthorizedData` 为 false。

展示口径：

- 用 `warning` 状态提示：`当前主要是演示或测试数据`
- 不阻止用户进入模块，但所有经营结论应提示“仅用于演示 / smoke 验证”。

### 7.3 用户授权数据

触发条件：

- `hasUserAuthorizedData === true`。

展示口径：

- 用 `success` 状态提示：`已检测到用户授权数据`
- 可展示最近导入时间、数据版本和导入任务摘要。

### 7.4 局部空状态

- 无渠道实体：提示进入数据管理导入渠道 / 店铺 / 账号数据。
- 无匹配结果：提示进入人货匹配生成或查看匹配。
- 无经营决策：提示从匹配结果创建经营决策。
- 预测指标缺失：显示 `暂无预测列表数据`，不得显示 `0` 造成“确认无预测”的误导。

## 8. 响应式验收

验收宽度：

- 1440px：桌面主演示尺寸。
- 1024px：笔记本缩放 / 平板横向。
- 768px：平板纵向。
- 390px：移动端最小验收宽度。

布局规则：

- 顶部状态区和推荐下一步必须允许换行。
- 指标卡使用已有 `metric-grid` 或等效 CSS grid，桌面最多 4 列，移动端 1 列。
- 模块健康区桌面可双列或三列，移动端单列。
- 最近动态列表长 ID、jobId、dataVersion、audit eventId 必须换行、截断或使用受控滚动。
- 页面级不得出现横向滚动；表格或代码容器内部横向滚动允许。

## 9. 验收标准

`V-P3-OVERVIEW-1` 回流后，`X-P3-OVERVIEW-2` 按以下口径验收：

- 默认进入总览页，导航顺序符合本文。
- 总览每个指标可追溯到现有前端 adapter；缺失指标显示“暂无数据”或不展示。
- 真实 `ws_demo` 空业务数据状态下，总览可加载并给出进入数据管理的下一步动作。
- Mock/demo 状态下，总览能显示模块健康、最近动态和入口跳转。
- 模块入口能切换到实体与账号画像、人货匹配、新品预测、经营飞轮、数据管理。
- `apps/web npm run lint`、`apps/web npm run build`、`apps/web npm run smoke` 通过。
- 真实 API 模式下至少覆盖总览加载和空业务库状态，无 console/page error。
- 1440、1024、768、390 宽度截图或 DOM 检查无重叠、无页面级横向溢出。

## 10. 示例

空业务库时，总览首屏应表达：

```text
当前 workspace 还没有可用业务数据

数据库 online，Schema 已初始化，但尚未检测到渠道实体、匹配结果或经营决策。
请先在数据管理中导入用户授权数据包，或确认是否需要重放 demo / douyin-bi 数据。

[进入数据管理] [查看导入与版本状态]
```

有数据但无匹配时，总览推荐下一步应表达：

```text
已检测到渠道实体，但还没有匹配结果

可以进入人货匹配工作台，按商品找实体或按实体找商品，生成解释型匹配建议。

[进入人货匹配]
```

## 11. 注意事项

- 总览不能替代各模块详情页，不展示复杂热力图、画像详情或危险操作表单。
- 总览不能绕过 Admin API 触发导入、清空、删除版本、rebuild 等写操作。
- 总览不承担真实 fit formula、真实新品字段或真实行动反馈字段的冻结职责。
- 若后续需要后端聚合 Overview API，应另开 A 域任务；第一版总览必须能用现有 adapter 落地。
