# Handoff Back: Frontend

## Completed

- `T0029-channel-profile-context-detail-ui`: 产品化渠道画像模块中的活动和场景详情页，使活动/场景可作为独立业务对象浏览。

## What Changed

- 左侧对象列表新增 `渠道实体 / 活动 / 场景` 三段切换，切换时重置对象类型/平台筛选并自动选择当前视图内对象。
- 活动对象详情使用活动专属总览：活动类型、活动标签、活动周期、关联渠道数量、匹配上下文说明、来源信息。
- 场景对象详情使用场景专属总览：场景类型、场景说明、业务目标、适用条件、关联渠道数量、匹配上下文说明。
- 活动/场景详情 tab 收敛为 `总览 / 关联渠道或适用渠道 / 编辑`，不再暴露渠道实体的人群画像、商品适配、匹配分析和三大人群 tab。
- 绑定关系表改为业务化展示：优先展示关联对象名称、对象类型、绑定类型中文文案和版本，raw canonical key 仅作为辅助信息。
- 新增 E2E 覆盖活动/场景三段切换、专属详情字段和关联渠道可读展示。
- Revision: 按 controller review 清理测试生成的 `apps/web/playwright-report/index.html` 工作区变更，该报告文件已不再出现在 `git status --short` 中。

## Activity / Scenario Page Behavior

- 活动视图：点击左侧 `活动` 后只显示 `marketing_event` 对象；选择 `2026 年 618 大促` 后展示 `活动类型`、`活动周期`、`关联渠道数量`、`活动标签` 和 `匹配上下文`；`关联渠道` tab 展示 `森马抖音官方旗舰店` 与 `活动关联渠道`。
- 场景视图：点击左侧 `场景` 后只显示 `business_scenario` 对象；选择 `Q3 新品首发` 后展示 `场景类型`、`适用周期`、`关联渠道数量`、`场景说明`、`业务目标`、`适用条件` 和 `匹配上下文`；`适用渠道` tab 展示 `森马官方直播间` 与 `场景适用渠道`。

## Files Changed

- `apps/web/src/pages/ChannelObjectLibrary.tsx`: 新增三段视图、活动/场景总览、对象类型感知 tab、业务化绑定表展示。
- `apps/web/e2e/channel-object-library.spec.ts`: 新增活动/场景独立详情与关联渠道展示的 Playwright smoke 覆盖。

## Validation

| Check | Result | Notes |
|---|---|---|
| `cd apps/web && npm run build` | passed | `tsc -b && vite build` 成功。 |
| `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts` | passed | 8 passed, 1 skipped；skipped 为既有 `VITE_USE_MOCK=false` real API contract 条件测试。 |
| `git diff --check` | passed | 无输出。 |
| Revision `git diff --check` | passed | 清理 Playwright report 后复跑，无输出。 |

## Screenshot / DOM Check Summary

- Playwright DOM 断言验证了活动三段切换、活动专属字段、活动关联渠道名称和中文绑定类型。
- Playwright DOM 断言验证了场景三段切换、场景专属字段、场景适用渠道名称和中文绑定类型。
- 既有 mobile smoke 保持通过：390px viewport 下 `document.body.scrollWidth <= window.innerWidth`。
- 未额外保存截图；本次以定向 Playwright DOM 和 390px overflow 检查作为视觉回归证据。

## Contract Drift

- Original contract: `brief.md` 要求不改后端 schema/API，若真实 API 缺字段则列出。
- Actual implementation: 未改后端 schema/API；仅消费现有 `ChannelObject.entityAttributes`、`ChannelObjectBinding.fromObject/toObject` 和列表内对象信息。`businessGoal`、`applicableCondition` 目前不是类型化字段，前端只在 `entityAttributes` 中存在时展示，否则显示业务化兜底文案。
- Recommendation: 接受当前前端适配；如后续要让场景业务目标/适用条件可追溯，建议后端/导入数据为 `entityAttributes.businessGoal` 和 `entityAttributes.applicableCondition` 提供明确字段口径。

## Risks

- 当前 `git status` 中存在本任务以外的既有变更：`apps/server/scripts/smoke-channel-object-library.mjs`、`apps/server/src/routes/channel-objects.ts`、`apps/web/src/services/api.ts`、`apps/web/src/types/index.ts`、多个 `.agentops/task-bodies` 与其他 Task Bus 目录；本任务未修改这些文件。
- `apps/web/playwright-report/index.html` 已按 review 要求恢复到 `HEAD`，不再出现在工作区变更中。
- 活动/场景类型翻译只覆盖当前已知枚举；未知值会按原值展示。
- 场景的 `businessGoal` / `applicableCondition` 缺少正式 typed contract，只能从 `entityAttributes` 读取或显示前端兜底说明。

## Open Questions

- 控制器是否需要后续任务补齐活动/场景 `entityAttributes` 的字段字典与真实导入样例，尤其是 `businessGoal` 和 `applicableCondition`。

## Memory Used

- `Kilo Frontend Memory / Working Rules`: 影响实现与验证决策，保持既有 AppShell/panel/metric-card/data-table-wrapper/segmented-control 风格，并用 Playwright DOM 与 390px overflow 检查验证可视 UI 变化。
