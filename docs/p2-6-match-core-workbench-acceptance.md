# V-P2-6 人货匹配核心工作台验收报告

## 目的

复核 V-P2-6 是否把人货匹配升级为 PLS 核心决策工作台，支持按商品找实体和按实体找商品，并能展示解释型匹配依据。

## 结论

结论：通过。

V-P2-6 已新增 `MatchCoreWorkbench`，替代旧渠道匹配热力图入口，支持双向查询、策略筛选、得分 / 置信度排序、解释报告和明细 CSV 导出。总控复核中修正了真实 API 模式下的实体来源、模式切换假阳性和空分数防御后，Mock 与真实 API smoke 均通过。

## 验收要点

- 工作台支持“按商品找实体”和“按实体找商品”两个模式。
- 真实 API 模式下，实体列表改为消费 `/api/v0/channels/entities`，以前端 view model 使用 `sourceEntityKey` 对接现有 match result。
- 解释面板展示决策建议、匹配分、置信度、positive drivers、negative drivers、risks / missing tags 说明和 CSV 导出。
- 筛选支持按推荐策略分组，排序支持按得分或置信度。
- P2 初期仍只输出解释型建议，不把结果包装成自动决策。

## 使用方式

用户进入“人货匹配核心工作台”后，可以先选择 SKU 查看可匹配实体列表，也可以切换到“按实体找商品”查看某个店铺 / 账号 / 门店对应的商品匹配列表。点击列表项后，右侧展示解释型匹配诊断，并可导出当前明细。

## 示例

- 按商品找实体：选择 SKU -> 查看匹配实体列表 -> 点击实体 -> 查看正向标签、冲突标签和风险提示。
- 按实体找商品：切换模式 -> 选择实体 -> 查看匹配商品列表 -> 点击商品 -> 查看同一套解释报告。
- 导出：在解释报告中点击“导出报告明细 (CSV)”。

## 总控修正

- `MatchCoreWorkbench` 真实 API 实体来源从旧 `/channels` 改为 `/channels/entities`，并以 `sourceEntityKey` 兼容当前 match result 的 `channelId`。
- 修正模式切换时旧 `selectedSecondaryId` 与新 `mode` 短暂组合导致的 `Match not found` 假阳性请求。
- 真实 API Playwright smoke 不再忽略 `Match not found`，并分别断言两个模式都加载到“匹配决策解释报告”。
- 对历史 `matchScore` / `matchConfidence` 为空的记录增加前端数值防御，避免排序、展示和 CSV 导出异常。

## 验证

- `apps/web npm run lint` 通过。
- `apps/web npm run build` 通过。
- `apps/web npm run smoke -- --project=chromium e2e/smoke.spec.ts` 通过。
- 在 `apps/web` 下执行 `VITE_USE_MOCK=false npm run smoke -- --project=chromium e2e/smoke-real.spec.ts` 通过。
- 已截取 desktop / mobile 的工作台与解释面板截图，未发现明显文字溢出、按钮遮挡或卡片重叠。

## 注意事项

- 当前解释面板消费的是现有 `MatchResult` 的 `positiveDrivers`、`negativeDrivers`、`risks` 和 `qualityFlags` 等等价字段；正式 `ProductChannelFit` API 落地后，应补齐独立 `missingTags` / `lowConfidenceTags` 映射。
- 当前匹配后端仍基于 `channel_profile` 生成 match result；P2 entity-first 展示通过 `channel_entity.sourceEntityKey` 与现有 `channelId` 兼容。后续如需对抖音店铺 / 账号实体直接生成通用 `ProductChannelFit`，需要 A/M 另行补齐后端 contract。
