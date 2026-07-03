# P3 DB Current Inventory

## 目的

本文是 `D-P3-DB-1` 的只读盘点产物，用于记录当前 `ws_demo` SQLite 数据库在 P3 重构前的库表结构、数据来源、版本分布和清库重建影响。

盘点对象：

```text
data/workspaces/ws_demo/db.sqlite
```

执行口径：只读查询 `sqlite_master`、表行数和来源字段；未修改数据库、未删除数据、未做脱敏或抽样。

## 总览

| 项 | 结果 |
|---|---:|
| workspace | `ws_demo` |
| table | 28 |
| view | 10 |
| index | 80 |
| base table rows | 5669 |
| latest/view rows | 793 |

当前主库混合存在：

| 数据分类 | 当前表现 | 清库影响 |
|---|---|---|
| mock | `data/demo` 对应的 SKU、channel、wide table、DMP aggregate 及大量 smoke SKU import 残留 | 可重放核心 demo；非核心 smoke 残留可丢弃 |
| smoke / e2e | prediction、match、task、audit、idempotency 中大量本地 smoke 运行记录 | 运行历史会丢失；可重新跑 smoke 生成新记录 |
| temporary acceptance | `douyin_*` 的 `v2_20260704_xp1f6`、部分 P2 新品预测和经营飞轮验收记录 | 需快照保留；仓库不含完整 v2 真源 |
| user_authorized | `douyin_*` 的抖音 BI 数据，`source_type=user_authorized` | `v1_20260703` 可从 `data/p1/douyin-bi` 重放；v2 需快照或重新构造 |
| system runtime | workspace、data_source、schema_migration、db_admin_audit、data_import_job、task、audit_event、idempotency_key、flywheel 操作历史 | 初始化配置可重建；运行时历史清库后丢失 |

收尾复核说明：初次盘点时当前库为 25 tables / 10 views / 73 indexes；收尾复核时发现库已变为 28 tables / 10 views / 80 indexes，并新增 P3 system tables：`schema_migration`、`db_admin_audit`、`data_import_job`。本任务未执行任何写库命令，新增对象和运行时行数增长应视为并行任务或用户操作产生的当前库变更。本文以下表格已按收尾复核时点更新。

## SQLite 对象清单

### Tables

| Table | Rows | 领域 | 数据分类 | 主要来源 / 版本判断 | 可重放性 |
|---|---:|---|---|---|---|
| `action_record` | 19 | 经营飞轮行动 | system runtime / temporary acceptance | 本地飞轮工作台操作，含 pending runtime 记录 | 不可从数据包重放；只能重新操作生成 |
| `audit_event` | 2250 | 审计 | system runtime | 主要为 BI 查询、prediction/match/task/batch/admin import 事件 | 不可重放；清库前需快照保留历史审计 |
| `batch` | 63 | 导入版本 | mock / smoke / user_authorized | 含 demo、douyin BI、DMP aggregate、smoke/manual 导入批次 | demo / douyin 可重放；历史批次记录本身不可完整重放 |
| `channel_entity` | 17 | 渠道实体 | mock / user_authorized | `douyin_bi v2_20260704_xp1f6=13`、`batch_demo_20260702 latest=4` | demo 4 条可重放；douyin v2 需快照或重构 |
| `channel_profile` | 4 | 渠道画像 | mock | `mock_channel_aggregate` | 可从 `data/demo/channel_profiles.jsonl` 重放 |
| `data_import_job` | 17 | 导入任务 | system runtime / mock | P3 admin import job，`import_type=demo`、`source=demo_seed`、`source_type=mock`、`status=succeeded` | 系统任务历史；可重新 dry run/import 生成新记录 |
| `data_source` | 4 | 系统配置 | system runtime | `channel_profile`、`douyin_bi` active；`product_master`、`action_feedback` stub | 应由新 schema seed 重建 |
| `db_admin_audit` | 17 | Admin 操作审计 | system runtime / mock | P3 admin audit，`operation=import`、`target=package:demo`、`status=success` | 不可从数据包重放；清库前需快照保留 admin 操作历史 |
| `decision_record` | 5 | 经营飞轮决策 | system runtime / temporary acceptance | launch 决策运行记录 | 不可从数据包重放；需重新操作生成 |
| `douyin_account` | 26 | 抖音 BI 账号 | user_authorized / temporary acceptance | `v1_20260703=13`、`v2_20260704_xp1f6=13` | v1 可从 `data/p1/douyin-bi/accounts.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_account_benchmark_tag` | 52 | 抖音 BI 账号画像标签 | user_authorized / temporary acceptance | `v1=26`、`v2=26` | v1 可从 `data/p1/douyin-bi/account_benchmark_tags.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_account_report` | 24 | 抖音 BI 账号报告 | user_authorized / temporary acceptance | `v1=12`、`v2=12` | v1 可从 `data/p1/douyin-bi/account_reports.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_adjustment_advice` | 210 | 抖音 BI 优化建议 | user_authorized / temporary acceptance | `v1=105`、`v2=105` | v1 可从 `data/p1/douyin-bi/adjustment_advice.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_comparison_dimension` | 730 | 抖音 BI 维度对比 | user_authorized / temporary acceptance | `v1=365`、`v2=365` | v1 可从 `data/p1/douyin-bi/comparison_dimensions.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_product` | 146 | 抖音 BI 商品 | user_authorized / temporary acceptance | `v1=73`、`v2=73` | v1 可从 `data/p1/douyin-bi/products.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_product_account_fit` | 146 | 抖音 BI 号货匹配 | user_authorized / temporary acceptance | `v1=73`、`v2=73` | v1 可从 `data/p1/douyin-bi/product_account_fits.jsonl` 重放；v2 需快照或重新构造 |
| `douyin_summary_metric` | 50 | 抖音 BI 摘要指标 | user_authorized / temporary acceptance | `v1=25`、`v2=25` | v1 可从 `data/p1/douyin-bi/summary_metrics.jsonl` 重放；v2 需快照或重新构造 |
| `feedback_record` | 18 | 经营飞轮反馈 | system runtime / temporary acceptance | 含 flywheel/user input/API 反馈运行记录 | 不可从数据包重放；需快照或重新录入 |
| `idempotency_key` | 179 | 幂等缓存 | system runtime / smoke | `/matches`、`/batches`、`/predictions` 等创建型接口缓存 | 运行缓存，可清理；不应作为长期资产 |
| `match_result` | 874 | 匹配结果 | smoke / e2e / derived runtime | P0/P1/P2 smoke、account fit 和新品匹配派生结果 | 可通过重新跑模型 / smoke 再生成；历史结果会丢失 |
| `new_product_prediction` | 16 | 新品预测结果 | temporary acceptance / derived runtime | `new_product_prediction_baseline`，contract `new-product-prediction-contract-0.1` | 不可从 data 包直接重放；可用 API 和模板重新生成 |
| `prediction` | 221 | 商品画像预测 | smoke / e2e / derived runtime | 主要为 `m-p0-baseline-0.1` / derived 预测历史 | 可重新跑预测生成；历史 predictionId 会丢失 |
| `schema_migration` | 1 | Schema 迁移 | system runtime | P3 schema migration，`version=1`、`create_admin_tables`、`status=applied` | 应由新 schema migration 机制重建 |
| `sku` | 27 | 商品主数据 | mock / smoke | demo 真源仅 3 SKU；当前 27 行来自多次 smoke / import 残留 | `data/demo/skus.jsonl` 可重放 3 条；其余 smoke SKU 可丢弃或需快照 |
| `strategy_review` | 21 | 经营飞轮复盘 | system runtime / temporary acceptance | 经营复盘状态运行记录 | 不可从数据包重放；需快照或重新操作 |
| `task` | 519 | 异步任务 | system runtime / smoke | prediction、match、batch_import、account_match 等异步任务历史 | 运行历史会丢失；可重新跑任务生成新历史 |
| `wide_table_row` | 12 | 训练宽表 | mock | `batch_demo_20260702` | 可从 `data/demo/wide_table.jsonl` 重放 |
| `workspace` | 1 | 系统配置 | system runtime | `ws_demo` / `Demo Workspace` | 应由新 schema 初始化重建 |

### Views

| View | Rows | 来源表 | 说明 |
|---|---:|---|---|
| `channel_entity_latest` | 17 | `channel_entity` | 每个 channel entity 最新投影 |
| `douyin_account_benchmark_tag_latest` | 26 | `douyin_account_benchmark_tag` | 抖音账号 benchmark tag 最新投影 |
| `douyin_account_latest` | 13 | `douyin_account` | 抖音账号最新投影 |
| `douyin_account_report_latest` | 12 | `douyin_account_report` | 抖音账号报告最新投影 |
| `douyin_adjustment_advice_latest` | 105 | `douyin_adjustment_advice` | 抖音优化建议最新投影 |
| `douyin_comparison_dimension_latest` | 365 | `douyin_comparison_dimension` | 抖音维度对比最新投影 |
| `douyin_product_account_fit_latest` | 73 | `douyin_product_account_fit` | 抖音号货匹配最新投影 |
| `douyin_product_latest` | 73 | `douyin_product` | 抖音商品最新投影 |
| `douyin_summary_metric_latest` | 25 | `douyin_summary_metric` | 抖音摘要指标最新投影 |
| `match_result_latest` | 84 | `match_result` | `workspace_id + sku_id + channel_id` 最新匹配结果 |

### Indexes

当前共有 80 个 index，包含显式业务索引和 SQLite 自动主键索引。

| 表 | Index 数 |
|---|---:|
| `action_record` | 3 |
| `audit_event` | 4 |
| `batch` | 2 |
| `channel_entity` | 5 |
| `channel_profile` | 2 |
| `data_import_job` | 4 |
| `data_source` | 3 |
| `db_admin_audit` | 3 |
| `decision_record` | 4 |
| `douyin_account` | 3 |
| `douyin_account_benchmark_tag` | 2 |
| `douyin_account_report` | 2 |
| `douyin_adjustment_advice` | 4 |
| `douyin_comparison_dimension` | 3 |
| `douyin_product` | 2 |
| `douyin_product_account_fit` | 4 |
| `douyin_summary_metric` | 2 |
| `feedback_record` | 3 |
| `idempotency_key` | 2 |
| `match_result` | 5 |
| `new_product_prediction` | 4 |
| `prediction` | 3 |
| `schema_migration` | 0 |
| `sku` | 2 |
| `strategy_review` | 3 |
| `task` | 3 |
| `wide_table_row` | 2 |
| `workspace` | 1 |

## 来源与版本分布

### Batch

| batch_type | source | source_type | rows | declared_rows |
|---|---|---|---:|---:|
| `sku_import` | `smoke-test` | `mock` | 27 | 0 |
| `douyin_bi_import` | `douyin_report_dashboard` | `user_authorized` | 3 | 2076 |
| `dmp_aggregate` | `mock_dmp_aggregate` | `mock` | 1 | 12 |
| `sku_import` | `manual-batch-json` | `mock` | 1 | 0 |
| `sku_import` | `smoke` | `mock` | 1 | 0 |

### Douyin BI

`douyin_*` base tables 当前合计 1384 行，来自同一个 `source_batch_id=batch_douyin_bi_20260703` 的两个版本：

| data_version | 说明 | base rows | latest rows | 重放判断 |
|---|---|---:|---:|---|
| `v1_20260703` | 仓库数据包真源 | 692 | 被 v2 覆盖为历史版本 | 可从 `data/p1/douyin-bi/` 重放 |
| `v2_20260704_xp1f6` | X-P1-F6 本地临时验收版本 | 692 | 692 | 仓库不含完整真源；需快照或重新构造 |

`v2_20260704_xp1f6` 的来源判断依据为 `docs/p1-f6-douyin-bi-productization-acceptance.md`：该版本为本地临时数据更新验收，用于证明 latest projection 与历史版本查询可并存；源数据包仍以 `data/p1/douyin-bi/` 的 `v1_20260703` 为仓库真源。

### Derived Runtime

| 表 | 主要分布 | 判断 |
|---|---|---|
| `prediction` | 221 行，主要为 `m-p0-baseline-0.1` / `derived` | smoke/e2e 预测历史，不是源数据 |
| `match_result` | 874 行，主要为 P0/P1/P2 smoke、account fit 和新品匹配派生结果 | smoke/e2e 和验收派生结果，不是源数据 |
| `task` | 519 行，prediction、match、batch_import、account_match 等 | 异步任务运行历史 |
| `audit_event` | 2250 行，BI query、prediction、match、batch、admin import、flywheel 等事件 | 审计历史，清库前需快照 |
| `idempotency_key` | 179 行，创建型接口缓存 | 24h 幂等缓存，可清理 |
| `schema_migration` / `db_admin_audit` / `data_import_job` | 1 / 17 / 17 行 | P3 admin/migration 系统表运行历史 |

## 清库重建影响清单

### 会丢失的内容

| 类型 | 影响 |
|---|---|
| 运行时审计 | `audit_event` 2250 行和 `db_admin_audit` 17 行会丢失，包含 BI query、prediction/match succeed、batch import、admin import、flywheel 操作记录 |
| 任务历史 | `task` 519 行和 `data_import_job` 17 行会丢失，历史 taskId、import job、状态、开始/结束时间不可恢复 |
| 幂等缓存 | `idempotency_key` 179 行会丢失；这是预期可清理缓存 |
| 历史预测与匹配 ID | `prediction`、`match_result`、`new_product_prediction` 的历史 ID 和结果会丢失 |
| 经营飞轮操作历史 | `decision_record`、`action_record`、`feedback_record`、`strategy_review` 会丢失 |
| 本地临时验收版本 | `v2_20260704_xp1f6` 及 P2/P1 验收残留如果未快照，会丢失 |

### 可从仓库数据包重放的内容

| 数据包 | 可重放对象 | 说明 |
|---|---|---|
| `data/demo/` | 3 个 mock SKU、4 个 channel profile、12 行 wide table、DMP aggregate 样例 | 对应 P0 demo 主路径；当前 `sku` 表额外 24 行 smoke 残留不属于 demo 真源 |
| `data/p1/douyin-bi/` | 抖音 BI v1 的 8 类对象，共 692 行 | 可重放 `v1_20260703`；不包含 `v2_20260704_xp1f6` |
| `data/templates/new-product-prediction-input/` | 新品预测输入模板 | 模板可用于重新提交预测，但不能重放当前 5 条预测运行结果 |

### 需要快照或用户确认的内容

| 内容 | 建议 |
|---|---|
| `douyin_*` v2 临时版本 | 如果仍需保留 latest 验收状态，清库前必须快照或重新构造 v2 数据包 |
| audit/task/flywheel 历史 | 如果需要复盘本地验收过程，清库前必须快照 `db.sqlite` |
| smoke/e2e 派生结果 | 通常可丢弃；如需比对旧结果，清库前导出或快照 |

## 结论

当前 `ws_demo` 不是干净生产库，而是混合了 mock demo、smoke/e2e、P1/P2/P3 临时验收、user_authorized 抖音 BI 和运行时历史的工作区库。

后续 `X-P3-DB-8` 执行清库重建前，必须至少完成：

1. 创建 `data/workspaces/ws_demo/db.sqlite` 快照，或由用户明确确认跳过快照。
2. 明确是否重放 `data/demo/`。
3. 明确是否重放 `data/p1/douyin-bi/` 的 `v1_20260703`。
4. 明确是否保留或重构本地临时 `v2_20260704_xp1f6`。
5. 接受 audit、task、idempotency、flywheel 操作历史清库后不可从数据包自动恢复。

## 验证记录

只读查询已完成：

```text
sqlite_master table / view / index 清单读取完成
28 tables / 10 views / 80 indexes
base table rows = 5669
latest/view rows = 793
```

未执行 `DROP`、`DELETE`、`UPDATE`、`INSERT`、`VACUUM`、migration 或任何写入命令。
