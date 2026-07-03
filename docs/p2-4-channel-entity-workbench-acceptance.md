# V-P2-4 店铺 / 账号优先的渠道人群工作台验收报告

## 目的

复核 V-P2-4 是否把渠道人群前端主流程从旧的账号单点对比页，调整为店铺 / 账号优先的实体聚合工作台，并确认其真实 API 模式消费 A-P2-3 冻结的 `ChannelEntity` 读取层。

## 结论

结论：通过。

V-P2-4 已完成 `AccountProfileWorkbench`，支持按 `platformType` 分组的实体列表、名称 / 来源标识搜索、画像分析视图和号货匹配决策视图。验收中已修正真实 API 接入点，前端列表与详情主流程现在消费 `/api/v0/channels/entities`，平台只作为分组维度，不再把旧 `/api/v0/bi/douyin/accounts` 作为 P2 渠道人群入口。

## 验收要点

- 工作台入口以店铺 / 账号 / 内容账号 / 直播间实体为第一对象，`platformType` 只用于列表分组。
- 画像分析视图展示样本量、时间窗口、来源、质量标记、benchmark tags、触点偏好和低置信度提示。
- 决策视图支持输入 SKU 做沙盘匹配，并保留匹配诊断、策略建议和 CSV 导出。
- `apps/web/src/services/api.ts` 已把 `ChannelEntity` 响应映射为前端 `AccountProfile` view model，并保留 `sourceEntityKey` 与 `sourceId` 以支撑旧匹配 API 兼容调用。
- 默认真实 SKU 已调整为当前 demo 数据存在的 `109326100005`，避免真实模式下用 mock SKU 造成匹配链路不可用。
- 低置信度判断已修正为严格 boolean，避免 React 渲染 stray `0`。
- core tag 渲染 key 已修正，避免重复 tagId 触发 React key 冲突。

## 使用方式

前端进入账号画像工作台后，用户先在左侧实体列表选择店铺 / 账号 / 内容账号 / 直播间，再在右侧切换“人群画像分析”和“号货匹配决策”。真实 API 模式下，实体列表来自 `/api/v0/channels/entities`；决策视图仍复用现有匹配接口，并优先使用 `sourceEntityKey` 调用兼容的账号匹配链路。

## 示例

- 分析路径：进入工作台 -> 搜索或按平台分组选择实体 -> 查看样本量、benchmark tags、触点偏好和质量提示。
- 决策路径：选择实体 -> 切换到决策视图 -> 输入 SKU `109326100005` -> 运行匹配诊断 -> 查看策略建议或导出 CSV。

## 验证

- `apps/web npm run lint` 通过。
- `apps/web npm run build` 通过。
- `apps/web npm run smoke -- --project=chromium apps/web/e2e/smoke.spec.ts` 通过。
- 在 `apps/web` 下执行 `VITE_USE_MOCK=false npm run smoke -- --project=chromium apps/web/e2e/smoke-real.spec.ts` 通过。
- 真实 API smoke 前已执行 `apps/server npm run migrate`、`npm run seed:data-sources`、`npm run sync:channel-entities`。
- 已做 desktop、mobile 和 mobile decision view 截图检查，未发现明显文字溢出、按钮遮挡或卡片重叠。

## 注意事项

- 当前决策视图仍通过 `sourceEntityKey` 兼容旧账号匹配 API；后续 M-P2-5 / V-P2-6 应冻结正式 `ProductChannelFit` 后再迁移为通用实体匹配入口。
- `ChannelEntity.profileTags` 当前仍受 A-P2-3 投影能力限制，抖音账号级 mapped profile tags 为空时前端只能展示 benchmark 与基盘指标。
- 移动端长页面截图中 sticky header 会因 full-page capture 出现在中段，这是截图方式导致的视觉现象，不影响实际滚动使用。
