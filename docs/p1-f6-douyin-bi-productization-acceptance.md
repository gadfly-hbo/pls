# X-P1-F6 抖音 BI 产品化重构验收报告

## 目的

验收 D-P1-F1 / A-P1-F2 / M-P1-F3 / V-P1-F4 / V-P1-F5 是否把抖音 BI 从外链、iframe、静态整页或截图复刻，重构为 PLS 原生数据资产、SQLite/API 查询、诊断对象和 React 工作台。

## 结论

结论：通过。

P1-F 主流程已满足产品化准入：数据真源为 `data/p1/douyin-bi/` 与 SQLite，后端通过 `/api/v0/bi/douyin/*` 提供查询投影，模型层输出诊断对象，前端在 `VITE_USE_MOCK=false` 下通过真实 API 完成账号画像、商品罗盘、款账号对比、优化清单和 CSV 导出。静态 dashboard、`data.js`、iframe 和“打开完整 BI”不再承担验收主流程。

## 验收证据

- 数据资产：`node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi` 通过，8 类对象共 692 行，`errorCount=0`、`warningCount=0`。
- 后端入库与查询：`apps/server npm run typecheck`、`npm run migrate`、`npm run import:douyin-bi`、`npm run smoke:douyin-bi`、`npm run smoke` 均通过；现有 smoke 为 24/24。
- 模型诊断：`apps/model npm run typecheck`、`npm run account-fit-contract-test`、`npm run validate-tags`、`npm run contract-test`、`npm run backtest`、`npm run backtest:cutoff` 均通过；contract 场景覆盖 matched、partial mismatch、high priority adjustment、low confidence、unmapped external dimension。
- 前端真实联调：`apps/web npm run lint`、`npm run build`、`VITE_USE_MOCK=false npm run smoke` 均通过；真实 smoke 为 2/2，并覆盖原生页面渲染与 CSV 下载。
- 红线检查：运行时主流程未发现 iframe、静态整页 dashboard 或前端内嵌 `data.js` 承担数据层；`douyin_report_dashboard` 只保留为来源记录、参考说明或 manifest。
- 数据更新验收：构造本地临时 `v2_20260704_xp1f6` 数据包并导入 `ws_demo` 后，8 类 base table 行数从 692 增至 1384，latest view 仍保持 692；`/api/v0/bi/douyin/versions` 同时返回 `v1_20260703` 与 `v2_20260704_xp1f6`。
- 版本查询验收：latest 产品接口返回带 `X-P1-F6验收` 标记的 v2 商品名；显式 `?dataVersion=v1_20260703` 仍返回原 v1 商品名，证明历史快照与 latest projection 可并存。
- 更新后前端验收：导入 v2 后重新运行 `VITE_USE_MOCK=false npm run smoke` 仍为 2/2，通过 API 读取最新数据，无需重新构建前端。

## P2 加固清单

- A 域：当前导入能力为 CLI，若产品需要在线上传或批次管理，应新增 HTTP import endpoint、版本回滚和导入审计查询。
- A / V 域：抖音账号未同步登记进 `channel_profile`；如后续要复用既有 `/account-matches` 或跨渠道热力图，需要新增同步策略。
- M 域：正式号货匹配公式仍未冻结，`legacyFitScore` 继续作为 `diagnostic_reference_only`，相关记录保留 `algorithm_pending_user_formula`。
- D / X 域：当前只有一个基线账号具备 benchmark tags，其余 12 个抖音账号仅有月度报告摘要；后续需要补齐映射或明确产品展示口径。
- A / V 域：API response 目前保留较多 JSON passthrough，P2 应补充响应 schema、分页、字段级契约测试和更细的错误状态。
- V 域：真实 smoke 已通过，但 P2 仍需补充移动端截图验收、empty / error / low confidence / unmapped 的视觉回归。
- X 域：本次验收在本地 `ws_demo` 中保留临时 `v2_20260704_xp1f6` 数据用于验证多版本投影；源数据包仍以 `data/p1/douyin-bi/` 的 v1 为仓库真源。

## 归档口径

`docs/wiki.html` 中 D-P1-F1、A-P1-F2、M-P1-F3、V-P1-F4、V-P1-F5、X-P1-F6 均可标记为 `done`。P1-F 后续不再以 iframe、外链、截图或静态 BI 页面作为完成标准；如需扩展，应按 P2 加固清单拆新任务。
