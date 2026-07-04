# P3 UI Quality Acceptance

## 1. 目的

本文记录 `X-P3-UI-QUALITY-5` 的总体验收结果，验收对象为 PLS 前端 UI 质量专项：AppShell、全局 Design Tokens、实体画像、人货匹配、新品预测、经营飞轮和数据管理五个模块。

验收结论：**通过**。

依据：

- `docs/p3-ui-quality-plan.md` 中冻结的 AppShell、组件体系、断点策略和空状态规则已在主要工作台落地。
- 前端 `lint` / `build` / mock smoke 通过。
- 真实 API 数据管理主流程通过。
- 1440、1280、1024、768、390 五档截图和 DOM 溢出检查未发现页面级横向溢出、导航重叠或 console/page error。
- 人货匹配真实空数据状态已复验：左侧无记录时，右侧展示 `empty-list` 语义，不再提示选择左侧项目。

保留风险：

- 当前 `ws_demo` 的 `/api/v0/channels/entities` 与 `/api/v0/matches/heatmap` 返回空数组，因此真实 API 人货匹配详情链路未覆盖。该问题属于数据前置缺失，不作为本轮 UI 质量阻断；如需演示真实匹配详情，需要单独确认受控导入 / 同步口径后复验。

## 2. 验收范围

已复核文件：

- `docs/p3-ui-quality-plan.md`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/pages/AccountProfileWorkbench.tsx`
- `apps/web/src/pages/MatchCoreWorkbench.tsx`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/pages/FlywheelWorkbench.tsx`
- `apps/web/src/pages/DataManagementWorkbench.tsx`
- `apps/web/e2e/smoke-real.spec.ts`

已覆盖模块：

- 实体与账号画像
- 人货匹配核心工作台
- 新品预测工作台
- 经营飞轮
- 数据管理
- 数据管理危险操作弹窗

## 3. 验证命令

通过：

```bash
cd apps/web
npm run lint
npm run build
npm run smoke
```

结果摘要：

- `npm run lint`：通过。
- `npm run build`：通过，`tsc -b && vite build` 成功。
- `npm run smoke`：通过，2 passed / 2 skipped。两个 skipped 为 `VITE_USE_MOCK=false` 才运行的真实后端用例。

真实 API 数据管理主流程通过：

```bash
cd apps/web
VITE_USE_MOCK=false npx playwright test e2e/smoke-real.spec.ts -g "Data Management Workbench - Real Backend Smoke Test"
```

结果：1 passed。

真实 API 人货匹配前置检查：

```bash
curl -sS \
  -H 'Authorization: Bearer pls-p0-demo-token' \
  -H 'X-PLS-Workspace: ws_demo' \
  http://127.0.0.1:3100/api/v0/channels/entities

curl -sS \
  -H 'Authorization: Bearer pls-p0-demo-token' \
  -H 'X-PLS-Workspace: ws_demo' \
  http://127.0.0.1:3100/api/v0/matches/heatmap
```

结果：

- `/api/v0/channels/entities` 返回 `items: []`。
- `/api/v0/matches/heatmap` 返回 `rows: []`。

结论：当前库可验证真实 API 空态，但不能支撑真实 API 匹配详情链路。

## 4. 响应式截图检查

截图输出目录：

```text
/tmp/pls-ui-quality-acceptance
```

已生成：

- `1440-account.png`、`1440-match.png`、`1440-dashboard.png`、`1440-flywheel.png`、`1440-data.png`、`1440-data-operation-modal.png`
- `1280-account.png`、`1280-match.png`、`1280-dashboard.png`、`1280-flywheel.png`、`1280-data.png`、`1280-data-operation-modal.png`
- `1024-account.png`、`1024-match.png`、`1024-dashboard.png`、`1024-flywheel.png`、`1024-data.png`、`1024-data-operation-modal.png`
- `768-account.png`、`768-match.png`、`768-dashboard.png`、`768-flywheel.png`、`768-data.png`、`768-data-operation-modal.png`
- `390-account.png`、`390-match.png`、`390-dashboard.png`、`390-flywheel.png`、`390-data.png`、`390-data-operation-modal.png`
- `summary.json`

空列表修复复验截图：

- `1440-match-empty-state-fixed.png`
- `390-match-empty-state-fixed.png`

DOM 检查摘要：

- 1440 / 1280 / 1024 / 768 / 390 五档均无页面级横向溢出。
- 所有截图流程无 console error / page error。
- 390px 数据管理表格存在表格元素宽于视口，但 `document` 与 `body` 无横向溢出；该情况由 `data-table-wrapper` 内部横向滚动承接，符合 `docs/p3-ui-quality-plan.md` 的 DataTable 规则。
- 390px 危险操作弹窗可读，影响表、warnings、确认文本和执行入口在弹窗滚动区域内呈现。
- 人货匹配空库复验中，1440px 与 390px 均出现“当前无匹配数据”，旧提示“请在左侧列表中选择一项”未出现，且无页面级横向溢出。

## 5. 结果与风险

### 5.1 已关闭：人货匹配空状态语义

修复后：

- 当 `listItems.length === 0` 时，右侧 InspectorPane 展示“当前无匹配数据”和业务原因说明。
- 仅当 `listItems.length > 0 && !selectedSecondaryId` 时，右侧才展示“请在左侧列表中选择一项”。

复验：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run smoke` 通过。
- 1440px 与 390px 真实空数据截图 / DOM 检查通过。

### 5.2 剩余风险：真实人货匹配详情缺数据前置

当前真实后端：

- `/api/v0/channels/entities` 返回空列表。
- `/api/v0/matches/heatmap` 返回空 rows。

影响：

- `smoke-real.spec.ts` 的真实端到端匹配详情主流程无法选择真实账号 / 实体。
- 人货匹配详情面板无法以真实 API 数据完成覆盖。

处理建议：

- 不在本卡擅自重放或写入 `ws_demo`。
- 如需演示真实匹配详情，应单独确认重放口径，通过受控导入 / sync 生成 channel entities 与 match heatmap 数据后再复验。

### 5.3 中风险：移动端数据管理表格可用但密度偏高

390px 数据管理表格通过 `data-table-wrapper` 横向滚动承接，没有页面级溢出。

风险：

- 只展示前两列时用户需要主动横向滚动才能看到操作列。

处理建议：

- 后续可为移动端数据管理增加 compact list 模式，优先展示表名、类型、行数和详情入口。

### 5.4 中风险：部分页面仍保留 inline style

`MatchCoreWorkbench`、`DataManagementWorkbench`、`FlywheelWorkbench` 等页面仍有局部 inline style，用于动态宽度、动态颜色或局部布局。

结论：

- 当前不阻断验收，因为主要 layout contract 已落地，且 lint/build/smoke 通过。
- 后续 polish 可继续把稳定样式下沉为 class。

## 6. 使用方式

后续 V 域 UI 改造和新页面必须复用本轮冻结口径：

1. 以 `docs/p3-ui-quality-plan.md` 作为 AppShell、组件系统、断点和空状态真源。
2. 新增或修改工作台时，至少复验 1440、1280、1024、768、390 宽度。
3. 表格必须通过 `data-table-wrapper` 或等价容器承接内部横向滚动，不能造成页面级横向溢出。
4. 空库、空筛选、未选择、加载中、失败必须给出业务原因和下一步动作。
5. 真实 API 验收必须记录数据前置；缺数据时只能声明空态覆盖，不能声称详情链路已通过。

## 7. 注意事项

- 本轮未执行 `ws_demo` 的破坏性正式操作。
- 本轮未通过手工修改 SQLite 文件完成验收。
- 本轮未使用 iframe、静态 BI 页面或截图嵌入作为验收主流程。
- 当前报告保留 `/tmp/pls-ui-quality-acceptance` 截图路径作为本机验收证据；该目录不是仓库真源。
- 未覆盖浏览器：Safari、Firefox、移动端真机浏览器。当前截图验证基于 Playwright Chromium。
