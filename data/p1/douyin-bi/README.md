# D-P1-F1 Douyin BI Data Package

- Owner: D data profile domain
- Task: D-P1-F1
- Source: `/Users/huangbo/Downloads/douyin_report_dashboard/data.js` (user-authorized BI snapshot)
- Batch: `batch_douyin_bi_20260703`
- Data version: `v1_20260703`
- Time window: `2026-05-01/2026-05-31`

## Purpose

Assetize the Douyin BI dashboard into PLS data objects that A domain can import
into SQLite. Downstream domains must consume the objects listed below rather
than the original HTML / `data.js` snapshot.

## Data admission

User-authorized BI data is passed through without privacy blocking. Real
account names, product codes, sales amounts, ranks and legacy fit scores are
retained inside PLS. Downstream code still consumes PLS objects (not raw HTML)
per D-P1-E1 mapping rules.

## Objects

| Object (JSONL) | Row count | Page-level module | Business key | Upsert key |
|---|---:|---|---|---|
| `accounts.jsonl` | 13 | Account catalog + baseline | `channelId` | `channelId + sourceBatchId + dataVersion` |
| `account_benchmark_tags.jsonl` | 26 | 账号画像基准 | `channelId + dimension + optionLabel` | `channelId + dimension + optionLabel + sourceBatchId + dataVersion` |
| `account_reports.jsonl` | 12 | 账号画像基准 · 月度对比报告 | `channelId + reportKind` | `channelId + reportKind + sourceBatchId + dataVersion` |
| `products.jsonl` | 73 | 商品人群罗盘 | `skuId` | `skuId + sourceBatchId + dataVersion` |
| `product_account_fits.jsonl` | 73 | 号货匹配度 · 款账号对比 | `fitId` | `skuId + accountChannelId + sourceBatchId + dataVersion` |
| `comparison_dimensions.jsonl` | 365 | 款账号对比 · 五维差异 | `fitId + dimension` | `fitId + dimension + sourceBatchId + dataVersion` |
| `adjustment_advice.jsonl` | 105 | 优化调整清单 | `adviceId` | `skuId + accountChannelId + dimension + orderIndex + sourceBatchId + dataVersion` |
| `summary_metrics.jsonl` | 25 | 优化清单 · KPI 汇总 | `metricName + orderIndex` | `metricName + orderIndex + sourceBatchId + dataVersion` |

Row totals: 692. `summary_metrics` filters dashboard `insightsSheet4` 空指标行（`metricName=null`），并把 `orderIndex` 纳入 business/upsert key 以避免同名指标或空行相互 upsert 覆盖。

`upsertKey.hash` 是行级 SHA1(fields + row values) 前 16 位，同对象内严格唯一；validator 会同时校验 `upsertKey.hash` 与 `sqlite_import_manifest.tables[*].businessKey / upsertKey` 组合行值的唯一性。

## Meta files

| File | Purpose |
|---|---|
| `field_dictionary.csv` | Field-level `object / field / usage / jsType` inventory. `usage` uses `identifier / dimension / display_metric / calculation_metric` per task brief. |
| `unmapped_fields.csv` | Rows outside the current PLS taxonomy (device brand, 八大消费群体, 人生阶段, external interest buckets, etc.) with reason. |
| `quality_report.json` | Batch metadata, source hash, object counts, coverage rates, quality flags, admission policy, reproduce command. |
| `source_manifest.json` | Source snapshot manifest (file, bytes, sha256, mapping template pointer). |
| `sqlite_import_manifest.json` | Target SQLite table names, JSONL files, business keys and upsert keys for A domain migration. Schema itself is owned by X orchestrator (A-P1-F2). |

## Reproduce

Regenerate from the local source (default path resolves to the user-authorized
dashboard snapshot):

```bash
node data/scripts/generate-p1-douyin-bi.mjs \
  --source /Users/huangbo/Downloads/douyin_report_dashboard/data.js \
  --batchId batch_douyin_bi_20260703 \
  --dataVersion v1_20260703
```

Optional flags: `--generatedAt`, `--timeWindow`.

## Validate

```bash
node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi
```

Checks:

- All required JSONL / JSON / CSV files exist and parse.
- Every row carries `sourceBatchId`, `dataVersion`, `generatedAt`, `upsertKey`.
- `upsertKey` shape is `{ fields: string[], hash: string }` and `hash` is unique inside each JSONL object.
- Manifest-declared `businessKey` and `upsertKey` composites are unique across actual row values.
- Referential integrity: `account_benchmark_tags / account_reports / product_account_fits / adjustment_advice` -> `accounts`; `product_account_fits / comparison_dimensions` -> `products`; `comparison_dimensions` -> `product_account_fits`.
- Mapped `tagId` values fall inside the PLS taxonomy whitelist actually used here (age, gender, city tier, price power).
- `quality_report.objectCounts` matches actual row counts.
- `sqlite_import_manifest.tables[*].file` all exist inside the package.

## Assumptions and gaps

- Only one baseline account (`森马官方旗舰店(基准)`, `channelId = douyin_account_semir_official_flagship_baseline`) is materialized because `insightsSheet1 / insightsSheet2 / insightsSheet3` describe the baseline vs product comparison. The 12 accounts from `multiAccountInsightsRawHTML` are registered as separate `ChannelProfile` rows and carry monthly trend reports but no benchmark tag rows yet.
- `legacyFitScore` from dashboard is kept for reference only. `qualityFlags` include `algorithm_pending_user_formula` on fits and advices.
- Non-taxonomy dimensions (八大消费群体, 预测人生阶段, 兴趣行为长尾) live inside `products.unmappedProfileFields` / `unmapped_fields.csv`; they are not silently forced into PLS `tagId`.
- Report HTML is kept only as `plainTextExcerpt` + `rawHtmlBytes` + `rawHtmlHash`; A-P1-F2 can decide whether to also store the full plain text.

## Downstream contract pointers

- Mapping rules: `data/templates/douyin-account-product-mapping/`
- Shared object contract: `docs/p1-e0-douyin-account-fit-contract.md`
- Data spec: `docs/data-spec.md`
- Taxonomy: `docs/profile-taxonomy-v0.md`
