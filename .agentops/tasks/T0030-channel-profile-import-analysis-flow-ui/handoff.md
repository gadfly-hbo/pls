# Handoff Back: Frontend

## Completed

- `T0030-channel-profile-import-analysis-flow-ui`: 将渠道画像模块的导入流程和批量货渠匹配分析流程产品化为步骤式业务路径，并增加到正式货渠匹配模块的最小 prefill 跳转。

## What Changed

- 导入弹窗改为五步向导：选择导入目标 -> 选择模板/数据包 -> 导入前检查 -> 输入确认文本 -> 导入结果。
- 导入流程仍使用原 `api.dryRunDbOperation('IMPORT', target)` 和 `api.executeDbOperation('IMPORT', target, confirmText)`，没有绕过 dry-run、confirmText、Idempotency-Key、Admin Token 或 audit 语义。
- 批量匹配分析弹窗改为四步路径：选择渠道实体 -> 选择活动/场景上下文 -> 输入商品 SKU -> 生成结果。
- 批量分析结果表展示活动/场景上下文，并说明结果仅用于业务预判，不自动执行投放。
- 渠道实体详情页的 `匹配分析` tab 保留当前模块内分析，同时新增 `去货渠匹配模块` 入口。
- 新增 `MatchCorePrefill` 类型，并通过 `App.tsx` 将 `ChannelObjectLibrary` 的 prefill 传给 `MatchCoreWorkbench`。
- `MatchCoreWorkbench` 接收 prefill 后尝试选择匹配数据；若正式货渠匹配数据未包含对应记录，显示明确提示，不伪装成功。
- 更新 `channel-object-library.spec.ts` 覆盖导入向导和批量分析步骤路径。

## User Paths

- 导入流程：点击 `导入` -> 选择 `按对象模板导入` 或 `导入完整对象包` -> 输入/确认 `数据包路径 / 模板` -> 点击 `执行导入前检查` -> 查看影响表、影响行数、授权数据、审计风险、警告 -> 输入后端返回的确认文本 -> 点击 `确认导入` -> 查看导入结果和 audit ID。
- 批量匹配流程：点击 `分析` -> 选择一个或多个渠道实体 -> 选择活动和/或场景作为上下文 -> 输入 SKU 列表 -> 点击 `生成匹配分析` -> 查看含上下文的匹配结果 -> 可点击 `去货渠匹配模块查看` 带入首个渠道实体与 SKU。

## Cross-Module Prefill

- Added: yes.
- `apps/web/src/types/index.ts`: 新增 `MatchCorePrefill`，字段为 `channelId`、`skuId`、`sourceLabel`。
- `apps/web/src/App.tsx`: 增加 `matchCorePrefill` 状态，通过 `navigateTo('match-core', { matchCorePrefill })` 传递。
- `apps/web/src/pages/MatchCoreWorkbench.tsx`: 新增 `initialPrefill` prop，按 channel 或 SKU 尝试选择现有匹配数据；找不到匹配记录时显示 `当前货渠匹配数据暂未包含可直接打开的匹配记录`。

## Files Changed

- `apps/web/src/pages/ChannelObjectLibrary.tsx`: 导入向导、批量分析步骤化、上下文结果展示、货渠匹配 prefill 入口。
- `apps/web/src/App.tsx`: 增加 `matchCorePrefill` 状态和 props 传递。
- `apps/web/src/pages/MatchCoreWorkbench.tsx`: 接收并展示 prefill 结果/不可用提示。
- `apps/web/src/types/index.ts`: 新增 `MatchCorePrefill` 类型。
- `apps/web/e2e/channel-object-library.spec.ts`: 更新导入与批量分析 smoke 断言。

## Validation

| Check | Result | Notes |
|---|---|---|
| `cd apps/web && npm run build` | passed | `tsc -b && vite build` 成功。 |
| `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts` | passed | 8 passed, 1 skipped；skipped 为既有 `VITE_USE_MOCK=false` real API contract 条件测试。 |
| `git diff --check` | passed | 无输出；Playwright 生成的 `apps/web/playwright-report/index.html` 已恢复到 `HEAD`。 |

## Contract Drift

- Original contract: 不新增后端 API，不降低 Admin Import 安全语义，Mock 与真实 API contract 同构，真实 API 未开放能力需禁用或明确说明。
- Actual implementation: 未新增 API；导入仍走现有 Admin Import adapter；批量分析在真实 API 模式下沿用 `api.analyzeChannelObjects` 的既有错误语义，不伪造成功；跨模块 prefill 仅选择已有匹配数据或展示不可用提示。
- Recommendation: 接受当前前端产品化；后续如需正式跨模块落地，应由后端提供渠道对象 canonical key 与货渠匹配 channelId 的稳定映射。

## Risks

- 当前 `git status` 中仍存在本任务以外的既有变更：`apps/server/scripts/smoke-channel-object-library.mjs`、`apps/server/src/routes/channel-objects.ts`、`apps/web/src/services/api.ts`、T0028/T0029/T0031 相关 Task Bus 文件；本任务未修改这些 out-of-scope 文件。
- `ChannelObjectLibrary.tsx` diff 仍包含 T0029 的三段对象视图与活动/场景详情改动，因为当前工作区尚未合并/提交 T0029 基线；T0030 基于该状态继续开发。
- 跨模块 prefill 目前只带 `channelId`/`skuId`，不会创建匹配记录；当货渠匹配模块的 channelId 与渠道画像 canonical key 不一致时，会显示不可直接打开的提示。
- 导入结果只展示当前 adapter 返回的 audit ID；真实后端若返回更多 import job 信息，后续可增强展示。

## Open Questions

- 是否需要后续任务定义渠道画像 canonical key 与正式货渠匹配 `channelId` 的映射契约，以提升 prefill 命中率。
- 是否需要后续任务把批量分析结果中的活动/场景上下文写入正式 match result contract，而不只是前端展示上下文。

## Memory Used

- `Kilo Frontend Memory / Working Rules`: 影响实现与验证决策，保持现有 AppShell/panel/metric-card/data-table-wrapper/segmented-control 风格，并通过 Playwright DOM 和 390px overflow smoke 验证可视流程变化。
