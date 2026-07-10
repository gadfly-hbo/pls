# Handoff

## What Changed

- 新增京东十大靶群三大人群校准模块，冻结推荐矩阵 `JD_RECOMMENDED_CALIBRATED_MATRIX` 与版本 `semir_three_audience_v2.1.0-jd-calibrated`。
- 推荐矩阵十行均满足 `A+B+C=1`，合法十大靶群输入合计为 1 时输出 `coverage=1`，不再保留京东 uncovered 池。
- 用户确认京东目标口径后，推荐矩阵已改为目标校准矩阵：2024 年 `22.5/32.6/44.8`、2025 年 `22.1/32.9/45.0`、2026 年 `21.1/34.7/44.1`。2024 年未找到原始十大靶群文件，未参与拟合；2025/2026 使用模块内 portable fixture 按年均约束拟合，2026 目标合计 `99.9%`，拟合前归一化为 `21.12/34.73/44.14`。
- 新增 `deriveJdTargetCalibratedMatrix()`，按固定先验、可调行集合、目标归一化和最小 L2 偏移 tie-break 确定性推导推荐矩阵，避免不可复算的硬编码拟合 decimals。
- 新增 contract test，覆盖十行 row sum、四份 portable fixture 输入合计容差、四份结果 A/B/C 合计、coverage、非负性、真实 reversed-order 确定性和 2025/2026 年均归一化目标对齐。
- 新增校准报告，记录 v2.0.2 baseline uncovered 来源、两个候选矩阵、推荐选择、fixture before/after、年均目标对齐、可复算目标函数、不可识别性限制与风险。
- 更新三大人群算法契约、PRD 和模型 notes，京东段升级为 v2.1.0 校准口径。

最终矩阵已按用户确认目标达到可供后续七渠道算法实现直接消费的冻结候选状态。

## Files Changed

- `apps/model/src/jd-three-audience-calibration.ts`
- `apps/model/src/jd-three-audience-calibration-contract-test.ts`
- `apps/model/package.json`
- `docs/model-jd-three-audience-calibration.md`
- `docs/model-three-audience-share-contract.md`
- `docs/prd-three-audience-share-algorithm.md`
- `docs/notes-model.md`

## Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run jd-three-audience-calibration-contract-test` passed with `ok: true`, `workbookCount: 4`, `failures: []`.

## Risks

- 项目内 brief 指向的 `agentops/memory/opencode-algorithm.md` 缺失；已读取 canonical source `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md` 后继续执行。
- 2024 年未找到原始十大靶群 XLSX，当前只能记录用户确认目标，不能验证 2024 输出。
- 2025/2026 目标来自用户确认口径；若目标口径未来变化，需升级版本并重新冻结矩阵。
- 推荐矩阵是目标校准结果，不应额外声明预测准确率。
- 两年年均 A/B 约束无法唯一识别 10 行矩阵；当前唯一性来自固定先验、可调行集合和最小 L2 偏移 tie-break。
- 工作区存在多处非本任务既有改动或未跟踪文件；本任务未回滚、未修改这些无关改动。

## Open Questions

- controller 是否批准 `semir_three_audience_v2.1.0-jd-calibrated` 作为后续七渠道算法实现的冻结版本？
- 是否需要补充 2024 年京东十大靶群原始 XLSX 后再对 2024 目标做可复算验证？

## Memory Candidates

- lesson_type: rule
- evidence: `T0005` implementation and `docs/model-jd-three-audience-calibration.md`
- created_at: 2026-07-10
- last_used_at: 2026-07-10
- use_count: 1
- expires_at: 2026-10-08
- status: candidate
- lesson: 当业务目标约束不足以唯一识别算法矩阵时，必须实现和记录确定性目标函数、约束、归一化、regularization/tie-break，并把原始来源抽取为 portable fixture，不能只提交硬编码拟合 decimals。
