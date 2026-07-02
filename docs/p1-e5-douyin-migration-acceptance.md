# X-P1-E5 Douyin Migration Acceptance

最近更新：2026-07-03（用户授权准入口径修订）

## 目的

本报告用于归档抖音号货匹配迁移的总控验收结论，覆盖 D-P1-E1、M-P1-E2、A-P1-E3、V-P1-E4 的输出一致性、数据准入、算法状态和后续准入条件。

2026-07-03 修订：PLS 是业务 BI 系统。用户给到 PLS、要求导入或要求产品化的数据默认全量放行，可进入仓库、代码、prompt、fixture、API、CSV、audit、前端展示和后续 agent 协作；不再对用户级明细、订单/会员行级数据、DMP 成员包或个人敏感标识设置隐私红线。

## 使用方式

- X 总控以本报告作为 P1-E 当前阶段的验收记录。
- D/M/A/V 后续接入真实业务样例、替换正式算法或进入产品主线前，必须复核本文的准入条件。
- 本报告确认用户授权业务数据可作为 PLS 产品视图透出；算法 adapter 的正式业务公式仍需单独验收。

## 结论

**迁移通过；允许将抖音静态 dashboard 和用户授权业务数据作为 PLS 业务 BI 视图完整复刻。**

原因：

- 业务 BI 视图允许透出用户授权数据，`/Users/huangbo/Downloads/douyin_report_dashboard` 可作为 PLS 前端复刻源。
- 迁移接缝已成立：D 映射模板、M adapter、A API 存储读取、V 对比视图已按同一契约连通。
- 生产化限制仅保留在算法侧：号货匹配正式算法公式仍未冻结，当前 M 输出固定带 `algorithm_pending_user_formula`，不得将该分数包装成正式投放算法。

因此，P1-E 的 BI 复刻可进入产品主线；M/A 侧算法链路仍是 baseline，需在正式公式到位后再升级。

## 验收证据

| 范围 | 结论 | 依据 |
|---|---|---|
| D-P1-E1 | 通过接缝验收 | `data/templates/douyin-account-product-mapping/` 包含字段映射、quality report 和兼容 admission report 模板；`validate-douyin-mapping-template.mjs` 通过，rowCount 25、mappingRuleCount 32、unmappedFieldCount 6、warnings 0。 |
| 真实样例 | 暂缓 | `data/local/aggregate_output/batch_p1_a1_no_input_20260702/` 仅为 no-input preflight；D-P1-A5 仍阻塞于真实 raw staging 输入缺失。 |
| M-P1-E2 | 通过 adapter 验收 | `npm run account-fit-contract-test` 通过，覆盖 matched、partial_mismatch、high_priority_adjustment、low_confidence；所有场景保留 `algorithm_pending_user_formula`。 |
| A-P1-E3 | 通过 API 验收 | `npm run typecheck`、`npm run migrate`、`npm run smoke` 通过；server smoke 为 24/24，通过账号匹配写入、查询、heatmap、用户数据准入放行和 taxonomy 违规断言。 |
| V-P1-E4 | 通过视图验收 | `npm run lint`、`npm run build`、`npm run smoke` 通过；Playwright smoke 1/1 通过，覆盖工作台核心页面链路。 |
| 数据准入 | 通过修订口径 | 静态 dashboard 和用户授权业务数据允许入仓和透出；后续检查重点为契约一致性、算法公式状态、来源可追溯和 UI/API 可用性。 |

补充校验：

- `apps/model npm run typecheck` 通过。
- `apps/model npm run contract-test` 通过。
- `apps/model npm run validate-tags` 通过。
- `data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs data/templates/real-sample-ingestion` 通过。

## 契约一致性

账号画像基准、款账号对比、优化清单与号货匹配解释当前保持一致：

- D 模板将账号画像、商品画像和款账号对比字段压到可映射 tagId、placeholder bucket、质量元数据和 unmapped reason。
- M `diagnoseAccountFit()` 输出 `fitScore`、`fitConfidence`、`matchedDimensions`、`mismatchedDimensions`、drivers、`adjustmentAdvice` 和 `qualityFlags`。
- A `/account-matches` 将 M 输出落入 `match_result` 及 latest view，V 可按 accountId、skuId、timeWindow 查询。
- V 将 `adjustmentAdvice` 投影为 checklist，将 mismatched dimensions 和 drivers 用于基准、对比和解释展示。

限制：

- 当前契约可解释性来自 tagId、dimension、driver 和 advice 字段，不来自用户正式算法公式。
- 若后续真实 API 增加 baseline、comparison 或 advice 结构字段，必须保持 A/V 类型映射和 smoke 覆盖。

## 算法记录

- 来源：`apps/model/src/account-fit.ts` 的 `diagnoseAccountFit()`。
- 当前版本：`account-fit-rule-baseline-0.1`。
- 当前性质：rule-based baseline，仅用于 contract test 和接口联调；不影响静态 BI 复刻页展示用户授权业务数据。
- 质量标记：所有正常账号 fit 场景必须带 `algorithm_pending_user_formula`；低置信场景还会带 coverage/sample/confidence 相关 quality flags。
- 适用边界：适用于 mock、demo、字段映射模板和用户授权业务样例的工程链路验证。
- 不适用边界：不得用于生产投放决策、真实账号招商决策、真实销售归因或对外业务承诺。
- 待校准项：用户正式号货匹配公式、权重来源、分层阈值、置信度定义、真实业务样例 backtest、timeWindow 稳定性、账号样本量阈值。

## 后续准入

BI 复刻进入产品主线必须同时满足：

1. 静态 dashboard 文件完整进入 PLS 前端资源，页面可在 PLS 导航内打开。
2. 用户确认该数据可导入或产品化；系统不做隐私字段拦截。
3. 前端 lint、build、smoke 通过，且 smoke 覆盖嵌入 dashboard 的核心导航。
4. dashboard 业务数据可透出；导出能力沿用原 BI 页面行为或用户指定口径。

算法链路进入正式投放决策必须同时满足：

- 正式号货匹配公式由用户或业务侧提供，记录公式来源、版本、适用范围，并替换 M adapter 内部实现。
- M contract test、A smoke、V smoke 在正式公式和真实业务样例口径下重新通过。
- UI 和 API 移除或替换 `algorithm_pending_user_formula` 前必须完成 X 总控复核。

禁止进入生产化的触发条件：

- 用户未确认数据可导入或可产品化。
- 数据来源、算法公式版本、适用边界或关键字段契约无法追溯。
- 移除 `algorithm_pending_user_formula` 但未完成正式公式验收。

## 注意事项

- 当前 X-P1-E5 完成的是总控验收结论，并修订了用户授权业务数据可透出的口径。
- 原静态 dashboard 复刻页可用于业务演示；算法 adapter 输出仍需说明 `algorithm_pending_user_formula`。
