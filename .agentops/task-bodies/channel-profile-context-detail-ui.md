## 目标

把“渠道画像”模块中的活动和场景详情页产品化，让它们作为可单独存在的业务对象被浏览和理解，而不是只作为匹配弹窗里的附属选项。

## 背景

当前前端已完成第一版结构：

- 左侧三段视图：`渠道实体 / 活动 / 场景`。
- 渠道实体详情：`概览 / 人群画像 / 商品适配 / 发起匹配`。
- 活动/场景详情：目前只有基础概览和关联渠道，仍较粗糙。

## 非目标

- 不改后端 schema 或 API 路由；如发现真实 API 缺字段，在 handoff 中列出，不擅自造字段。
- 不实现活动/场景 CRUD。
- 不实现跨模块跳转。
- 不重构整个 `ChannelObjectLibrary`。

## 允许改动范围

- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/src/index.css`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/e2e/channel-object-library.spec.ts`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 默认中文界面；代码、变量、API 字段名保留英文。
- 活动和场景必须可单独浏览；不要把它们重新混回渠道实体列表。
- 活动详情应展示：活动类型、活动标签、活动周期、关联渠道数量、作为匹配上下文的说明。
- 场景详情应展示：场景类型、场景说明、业务目标或适用条件、关联渠道数量、作为匹配上下文的说明。
- 关联渠道视图要业务化展示渠道名称、对象类型、绑定类型、版本；避免主要展示 raw key。
- 保持现有 AppShell / panel / metric-card / data-table-wrapper / segmented-control 风格。
- 移动端和窄屏不得出现文字、按钮、卡片、工具栏重叠。

## 验收标准

- `渠道实体 / 活动 / 场景` 三段均可切换并看到对象列表。
- 活动对象详情有活动专属信息，不再像渠道实体画像详情。
- 场景对象详情有场景专属信息，不再像渠道实体画像详情。
- 关联渠道视图可读，不主要依赖 raw canonical key。
- 390px 宽度无页面级横向溢出。

## 验证命令

- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
- `git diff --check`

如果 Playwright 受本机权限影响，handoff 中说明并给出已执行的替代 DOM / screenshot 检查。

## Handoff 格式

按 `docs/templates/HANDOFF_BACK.template.md` 回流，至少包含：

- 改了什么。
- 活动/场景各自的页面行为。
- 验证命令与关键结果。
- 截图或 DOM 检查摘要。
- 风险和未覆盖项。
