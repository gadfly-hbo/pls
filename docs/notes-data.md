# notes-data

## 0. 当前状态

最近更新：2026-07-02（session 收尾校验完成）

进度：

- D-P0-1 已完成，产出为 `docs/data-spec.md`。
- 已定义历史 SKU 训练宽表，粒度为 `skuId + channelId + timeWindow`。
- 已定义 DMP 聚合画像导入格式、商品基础属性字典、渠道画像字段、数据质量检查规则。
- 已明确 P0 主监督标签使用 `buyerProfileTags`，浏览和加购画像作为可选辅助标签。
- 已明确跨域和 LLM 可见层使用 `gmvIndex` 与 `avgSellingPriceBand`，不暴露真实聚合金额。
- D-P0-B1 已完成并通过 X 总控审核，产出 `data/demo/` mock 数据包。
- X-P0-B5 已完成端到端验收，`data/demo/` 红线扫描通过，未发现 blocked key/value。
- D-P0-C4 已完成并通过总控终审，产出 `data/templates/real-sample-ingestion/` 真实样例本地脱敏、聚合、tag mapping 模板，以及 `data/local/.gitignore` 本地 staging 隔离规则。
- 本次收尾已重跑 data 域校验：`data/demo/` 结构、tagId 白名单、3×4 覆盖、recommendation 覆盖、真实样例模板校验和敏感值形态扫描均通过。

下一步：

- 配合 X 总控做 P0-C 总体验收或归档。
- 后续如接入真实平台样例，必须在 `data/local/raw_staging/<batchId>/` 本地处理，并生成聚合输出、红线扫描报告和质量报告后再跨域共享。

阻塞：

- 暂无 data 域 P0-C 阻塞；当前 demo 数据为 mock aggregate，仅用于本地 MVP smoke。

开放问题：

- 不同平台 DMP 聚合字段样例尚未提供，当前映射规则只定义通用结构。
- 历史 SKU 商品字段样例尚未提供，当前商品 DNA 字典以服装 demo 场景为准。
- 训练集过滤阈值当前为 P0 建议值，后续需要 M 域用回测结果校准。

---

## 数据域原则

- 先聚合、脱敏，再进入模型和 LLM。
- 宽表必须保留来源、时间窗口、平台、样本量。
- 所有标签映射都要可追溯，不能只留黑盒结果。
- P0 主监督标签使用 `buyerProfileTags`；浏览和加购画像有聚合数据就保留，不作为训练宽表准入硬门槛。
- 跨域和 LLM 可见层使用 GMV 指数与价格区间，不暴露真实聚合金额。

## D-P0-1 沉淀

- 宽表主粒度定为 `skuId + channelId + timeWindow`；全渠道汇总可额外使用 `channelId = "all_channels"`。
- DMP 画像导入只接受聚合标签分布，不接受用户列表、设备列表、订单列表或人群包成员。
- 所有真实聚合画像必须保留 `source`、`timeWindow`、`sampleSize`，并映射到 `docs/profile-taxonomy-v0.md` 的 `tagId`。
- 低置信度或无法解释的 DMP 字段进入 `unmappedTags`，不得强行映射。
- 当前最大风险是缺少平台 DMP 字段样例和历史 SKU 字段样例，后续接入样例后需要补充具体 mapping rule。

## D-P0-B1 沉淀

- demo 数据目录固定为 `data/demo/`。
- 已产出 3 个 SKU、4 个渠道、12 个 SKU × channel 宽表组合。
- 已提供 `dmp_aggregate.csv` 与 `dmp_aggregate.jsonl` 两种导入样例。
- 已提供 `batch_quality_report.json` 和 `expected_scenarios.md`，覆盖 `priority_launch`、`test_launch`、`observe`、`avoid` 四类场景。
- 所有样例均为 mock aggregate，不包含用户级、订单级、会员级、设备级、账号级记录。

## D-P0-C4 沉淀

- 真实样例 raw staging 固定为本地路径 `data/local/raw_staging/<batchId>/`，该目录由 `data/local/.gitignore` 忽略，不允许进入 docs、API 响应或 LLM 上下文。
- 模板目录为 `data/templates/real-sample-ingestion/`，包含 aggregate profile、unmapped fields、mapping rules、quality report、redline scan report 和校验脚本。
- 聚合输出必须先通过 `node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs <aggregateOutputDir>`，再进入 M/A/V 消费链路。
- 红线报告只允许输出 blocked field/pattern 的字段名和计数，不允许输出 raw value sample 或原始文件名。
