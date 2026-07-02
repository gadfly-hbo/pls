# notes-data

## 0. 当前状态

最近更新：2026-07-03（session 收尾：D-P1-F1 抖音 BI 数据资产化本地实现完成，等待 X 总控终审；未标 done）

进度：

- D-P0-1 已完成，产出为 `docs/data-spec.md`。
- 已定义历史 SKU 训练宽表，粒度为 `skuId + channelId + timeWindow`。
- 已定义 DMP 聚合画像导入格式、商品基础属性字典、渠道画像字段、数据质量检查规则。
- 已明确 P0 主监督标签使用 `buyerProfileTags`，浏览和加购画像作为可选辅助标签。
- 最新项目口径：用户给到 PLS 系统并要求导入或产品化的数据全部放行，可进入仓库、prompt、fixture、API、CSV、audit、前端展示和后续 agent 协作。
- 本次已同步 `data/templates/real-sample-ingestion/redline_scan_config.json`：隐私 blocked fields / patterns 清空，scan report 仅作为历史兼容和质量摘要。
- 本次已同步 data 校验脚本：保留结构、必填字段、tagId、质量字段校验；不再因手机号、邮箱、身份证、长数字 ID、订单/会员/DMP 字段名等形态失败。
- D-P0-B1 已完成并通过 X 总控审核，产出 `data/demo/` mock 数据包。
- X-P0-B5 已完成端到端验收；历史 redline scan 结论保留为归档信息，不再作为当前数据准入门槛。
- D-P0-C4 已完成并通过总控终审，产出 `data/templates/real-sample-ingestion/` 真实样例本地处理模板，以及 `data/local/.gitignore` 本地 staging 隔离规则。
- D-P1-A1 已做本地 preflight：当前工作区没有 `data/local/raw_staging/<batchId>/` 真实样例输入，因此未生成真实 sanitized / aggregate 输出；本地记录写入 `data/local/aggregate_output/batch_p1_a1_no_input_20260702/`，`shareable = false`。
- D-P1-A1 已经 X 总控审核标记 done；归档口径仅限 no-input preflight，不代表真实样例本地脱敏聚合试跑完成。
- D-P1-A2 已产出 mock aggregate 多 `timeWindow` cutoff smoke 输入：`data/p1/multi-timewindow-demo/`，包含 3 个连续窗口、36 行 `skuId + channelId + timeWindow` 宽表、字段映射、质量报告和 redline scan 摘要。
- D-P1-A2 已经 X 总控审核标记 done；当前产物仅作为 M-P1-A3 cutoff 管线 smoke 输入。
- D-P1-A5 在 wiki 已改为“真实样例本地资产化试跑”：用户确认导入的数据默认全量放行，验收重点改为结构化、mapping、quality report 和建模可用性。
- X-P1-A4 历史准入结论保留为旧口径归档；当前项目级准入口径已被用户更新为全量放行。
- D-P1-E1 已产出抖音账号与商品画像字段映射模板：`data/templates/douyin-account-product-mapping/`，包含字段类别、placeholder bucket、mapping rule、unmapped reason 和 quality report 模板。
- D-P1-F1 抖音 BI 数据资产化本地实现已完成，等待 X 总控终审后再改 wiki 状态为 done。产出目录 `data/p1/douyin-bi/`，覆盖 8 个 PLS 数据对象共 692 行（`accounts=13`、`account_benchmark_tags=26`、`account_reports=12`、`products=73`、`product_account_fits=73`、`comparison_dimensions=365`、`adjustment_advice=105`、`summary_metrics=25`）。每行携带 `sourceBatchId=batch_douyin_bi_20260703`、`dataVersion=v1_20260703`、`generatedAt`、`upsertKey`；`upsertKey.hash` 为行级 SHA1 前 16 位，同对象内唯一。
- D-P1-F1 附带 `field_dictionary.csv`、`unmapped_fields.csv`、`quality_report.json`、`source_manifest.json`、`sqlite_import_manifest.json`、README；生成脚本 `data/scripts/generate-p1-douyin-bi.mjs`，校验脚本 `data/scripts/validate-p1-douyin-bi.mjs`。

下一步：

- 如接入用户确认导入的数据，可直接按 PLS 数据对象落地；脱敏、聚合、抽样只在用户明确要求或模型/图表建模需要时执行。
- M-P1-A3 可使用 `data/p1/multi-timewindow-demo/wide_table.jsonl` 做 cutoff smoke；不得把它声明为真实样例回测数据。
- P1-F 后续 A/M/V 必须消费 PLS 数据对象，不再让前端直接依赖原 dashboard `data.js` 全局变量。
- D-P1-A5 / D-P1-A2 后续如继续执行，验收重点改为结构、字段映射、质量报告和建模可用性，不再做隐私红线拦截。
- D-P1-F1 数据包本地实现和校验已通过；等 X 总控终审后由总控把 wiki 中 D-P1-F1 状态改为 done。A-P1-F2 可直接消费 `sqlite_import_manifest.json` 定义的目标表、businessKey、upsertKey。

阻塞：

- D-P1-A5 阻塞于真实样例输入缺失；当前 D-P1-A1 只能代表 no-input preflight 归档。
- `data/p1/multi-timewindow-demo/` 为 mock aggregate cutoff smoke 数据，仅用于 M-P1-A3 开发验证。
- P1-F 的抖音 BI 数据已获用户确认放行；`data/p1/douyin-bi/` 数据包已生成并保留真实账号名、款号、销售额、legacy 号货匹配度、业务明细字段和值。A-P1-F2 需按 `sqlite_import_manifest.json` 冻结 SQLite schema；总控终审前 D-P1-F1 在 wiki 中仍保持 todo。

开放问题：

- 不同平台 DMP 聚合字段样例尚未提供，当前映射规则只定义通用结构。
- 历史 SKU 商品字段样例尚未提供，当前商品 DNA 字典以服装 demo 场景为准。
- 训练集过滤阈值当前为 P0 建议值，后续需要 M 域用回测结果校准。
- D-P1-A2 目前只有 3 个 mock SKU，低于 `docs/model-c3-prep.md` 的 P1 smoke 建议 5 个 SKU；可用于 cutoff 管线 smoke，不足以声明正式模型质量。
- D-P1-E1 中设备信息、八大消费群体、平台自由文本兴趣字段进入 `unmapped_fields.template.csv`；是否扩展 taxonomy 需 X 总控评审。

验证：

- `node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs data/templates/real-sample-ingestion` 通过。
- `node data/templates/douyin-account-product-mapping/scripts/validate-douyin-mapping-template.mjs` 通过。
- `node data/scripts/validate-p1-multi-timewindow-demo.mjs data/p1/multi-timewindow-demo` 通过。
- `node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi` 通过（0 error / 0 warning）。

---

## 数据域原则

- 用户授权数据默认全量放行；先结构化、映射、质量校验，再进入模型、API 和前端。
- 宽表必须保留来源、时间窗口、平台、样本量。
- 所有标签映射都要可追溯，不能只留黑盒结果。
- P0 主监督标签使用 `buyerProfileTags`；浏览和加购画像有聚合数据就保留，不作为训练宽表准入硬门槛。
- 真实金额、销量、排名、互动等业务字段可按产品需要保留；如建模需要再派生 index、band 或 rankBucket。

## D-P0-1 沉淀

- 宽表主粒度定为 `skuId + channelId + timeWindow`；全渠道汇总可额外使用 `channelId = "all_channels"`。
- DMP、用户列表、设备列表、订单列表或人群包成员若由用户确认导入 PLS，默认放行；是否聚合取决于产品对象和模型需求。
- 所有真实聚合画像必须保留 `source`、`timeWindow`、`sampleSize`，并映射到 `docs/profile-taxonomy-v0.md` 的 `tagId`。
- 低置信度或无法解释的 DMP 字段进入 `unmappedTags`，不得强行映射。
- 当前最大风险是缺少平台 DMP 字段样例和历史 SKU 字段样例，后续接入样例后需要补充具体 mapping rule。

## D-P0-B1 沉淀

- demo 数据目录固定为 `data/demo/`。
- 已产出 3 个 SKU、4 个渠道、12 个 SKU × channel 宽表组合。
- 已提供 `dmp_aggregate.csv` 与 `dmp_aggregate.jsonl` 两种导入样例。
- 已提供 `batch_quality_report.json` 和 `expected_scenarios.md`，覆盖 `priority_launch`、`test_launch`、`observe`、`avoid` 四类场景。
- 既有 demo 数据仍为 mock aggregate；新接入数据按用户授权口径直接使用。

## D-P0-C4 沉淀

- 真实样例 raw staging 可继续使用本地路径 `data/local/raw_staging/<batchId>/` 作为导入暂存；是否进入 docs、API 响应或 LLM 上下文按用户授权和产品需要决定。
- 模板目录为 `data/templates/real-sample-ingestion/`，包含 aggregate profile、unmapped fields、mapping rules、quality report、redline scan report 和校验脚本。
- 聚合输出必须先通过 `node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs <aggregateOutputDir>`，再进入 M/A/V 消费链路。
- redline scan 配置已改为隐私红线关闭；模板中的 scan report 仅作为历史兼容和质量摘要，不再拦截字段名或值形态。

## D-P1-A1 / D-P1-A2 沉淀

- D-P1-A1 已按 no-input preflight 归档；真实样例试跑改由 D-P1-A5 承接。
- D-P1-A2 当前输出为 `data/p1/multi-timewindow-demo/`，来源是 `data/demo/wide_table.jsonl` 的 mock aggregate 机械扩展。
- D-P1-A2 宽表覆盖 3 个闭合连续窗口：`2026-03-01/2026-03-31`、`2026-04-01/2026-04-30`、`2026-05-01/2026-05-31`。
- D-P1-A2 校验命令：`node data/scripts/validate-p1-multi-timewindow-demo.mjs data/p1/multi-timewindow-demo`。
- 真实样例到位后，需要重新执行 D-P1-A1，再基于真实聚合结果重做 D-P1-A2；当前 mock cutoff smoke 数据不能替代正式 P1 样本。

## D-P1-E1 沉淀

- 模板目录固定为 `data/templates/douyin-account-product-mapping/`。
- 字段梳理覆盖 `product_basic`、`product_performance`、`account_profile`、`fit_comparison`、`adjustment_advice` 五类 source area。
- mapping rules 覆盖年龄、性别、消费能力、人生阶段、城市等级、兴趣行为、触点偏好等主要维度，所有 `mappedTagId` 必须来自 `docs/profile-taxonomy-v0.md`。
- 销售额、销量、活跃度、legacy fit score 可保留原始业务字段和值；如模型需要可额外派生 index、rate、band 或 rank bucket。
- 设备信息、八大消费群体和不可解释平台兴趣字段默认不映射，进入 `unmapped_fields.template.csv` 并保留 reason。
- 校验命令：`node data/templates/douyin-account-product-mapping/scripts/validate-douyin-mapping-template.mjs`。

## D-P1-F1 沉淀

- 数据包目录固定为 `data/p1/douyin-bi/`，8 个 JSONL 数据对象 + 2 个 CSV（`field_dictionary.csv`、`unmapped_fields.csv`）+ 3 个 JSON manifest（`quality_report.json`、`source_manifest.json`、`sqlite_import_manifest.json`）+ README。
- 数据源为用户授权 dashboard 快照：`/Users/huangbo/Downloads/douyin_report_dashboard/data.js`；快照 `sha256`、`bytes`、`mappingTemplate` 指向记录在 `source_manifest.json`。
- 行数：`accounts=13`、`account_benchmark_tags=26`、`account_reports=12`、`products=73`、`product_account_fits=73`、`comparison_dimensions=365`、`adjustment_advice=105`、`summary_metrics=25`，合计 692 行。`summary_metrics` 已过滤 dashboard `insightsSheet4` 中 `metricName=null` 的 4 条分节留白行。
- 每条记录都带 `sourceBatchId`、`dataVersion`、`generatedAt`、`timeWindow`、`upsertKey`；`upsertKey.hash` 为 `SHA1(fields.join(",") + "::" + row values.join("|"))` 前 16 位，行级唯一，可支撑 A-P1-F2 幂等 upsert。
- upsert key 设计与 manifest 同步：`accounts` 用 `channelId+sourceBatchId+dataVersion`；`products` 用 `skuId+sourceBatchId+dataVersion`；`product_account_fits` 用 `skuId+accountChannelId+sourceBatchId+dataVersion`；`comparison_dimensions` 用 `fitId+dimension+sourceBatchId+dataVersion`；`adjustment_advice` 用 `skuId+accountChannelId+dimension+orderIndex+sourceBatchId+dataVersion`；`summary_metrics` 用 `metricName+orderIndex+sourceBatchId+dataVersion`（business key 也是 `metricName+orderIndex`）。
- 页面级模块与 PLS 数据对象一一对应：商品人群罗盘=`products`，账号画像基准=`accounts`+`account_benchmark_tags`+`account_reports`，款账号对比=`product_account_fits`+`comparison_dimensions`，优化清单=`adjustment_advice`+`summary_metrics`。
- 只有基线账号（`森马官方旗舰店(基准)`, `channelId = douyin_account_semir_official_flagship_baseline`）当前带 benchmark tags；其余 12 个抖音账号来自 `multiAccountInsightsRawHTML`，作为独立 `ChannelProfile` 落地并附月度报告纯文本摘要。
- `legacyFitScore` 保留但标记 `usage = diagnostic_reference_only`；`product_account_fits` 与 `adjustment_advice` 携带 `qualityFlags: ["algorithm_pending_user_formula"]`，等待 M-P1-F3 正式号货匹配度算法。
- 非 taxonomy 维度（八大消费群体、预测人生阶段、兴趣行为长尾、设备信息、地域城市等）写入 `unmapped_fields.csv` 或 `products.unmappedProfileFields`，不强行映射为 PLS `tagId`。
- 生成脚本 `data/scripts/generate-p1-douyin-bi.mjs`：可传 `--source`、`--batchId`、`--dataVersion`、`--generatedAt`、`--timeWindow`；输出汇总 JSON 到 stdout。
- 校验脚本 `data/scripts/validate-p1-douyin-bi.mjs`：结构、meta、`upsertKey.hash` 行级唯一性、manifest 声明的 `businessKey / upsertKey` 组合值唯一性、引用完整性、tagId 白名单、manifest ↔ 数据对象计数、`tables.file` 存在性；非零错误退出。
- 校验命令：`node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi`。
