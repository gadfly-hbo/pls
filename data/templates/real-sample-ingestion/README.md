# User Data Ingestion Template

> Owner: D data profile domain  
> Task: D-P0-C4  
> Status: P1 user-admission template  
> Last updated: 2026-07-03

## Purpose

This template defines how user-provided data can be organized before it enters PLS product flows. PLS uses a user-admission rule: data provided by the user for import or productization is allowed by default.

Cross-domain outputs may include raw, normalized, mapped, or aggregate artifacts depending on the product task:

- mapped profile rows
- unmapped field summaries
- batch quality reports
- admission scan reports

Privacy redline blocking is disabled for this project. Aggregation, masking, sampling, or indexing is only required when the user asks for it or when a model/table/chart needs that derived grain.

## Local Directory Boundary

Use these local paths when real samples are provided:

| Path | Data class | Git policy | LLM visibility | Owner |
|---|---|---|---|---|
| `data/local/raw_staging/<batchId>/` | user-provided raw files | ignored by `data/local/.gitignore` by default | allowed when user requests import/productization | D local tool |
| `data/local/normalized_staging/<batchId>/` | normalized intermediate | ignored by `data/local/.gitignore` by default | allowed | D local tool |
| `data/local/aggregate_output/<batchId>/` | aggregate or model-ready output | ignored by default | allowed | D to M/A/V |
| `data/templates/real-sample-ingestion/` | template and validation logic | tracked | allowed | D |

Rules:

1. Raw files may stay under `data/local/raw_staging/<batchId>/` while the D agent shapes them.
2. File names and IDs may preserve user-provided business identifiers unless the user asks for replacement.
3. Normalized intermediate files may be shared cross-domain when they are part of the requested product flow.
4. Aggregate outputs are optional and should be produced when modeling, charting, or table grain requires them.
5. Outputs that pass structural and quality validation may be copied into a shareable workspace or API import path.

## Processing Steps

1. Create a `batchId`, for example `batch_real_YYYYMMDD_001`.
2. Put raw files in `data/local/raw_staging/<batchId>/`.
3. Normalize fields and types for the target PLS object.
4. Aggregate to PLS grains only when the target feature needs aggregate rows:
   - DMP profile: `entityType + entityId + profileStage + mappedTagId + timeWindow`
   - training wide table: `skuId + channelId + timeWindow`
   - channel profile: `channelId + timeWindow`
5. Map platform fields to `docs/profile-taxonomy-v0.md` tagIds using `mapping_rules.template.csv`.
6. Write aggregate candidate files using `aggregate_profile.template.csv` and `quality_report.template.json`.
7. Run:

```bash
node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs data/local/aggregate_output/<batchId>
```

8. Share files that pass structural and quality validation.

## Required Output Files

For each real sample batch, produce these files under `data/local/aggregate_output/<batchId>/`:

| File | Required | Purpose |
|---|---:|---|
| `aggregate_profile.csv` | yes | mapped tag distribution or model-ready profile rows |
| `unmapped_fields.csv` | yes | unmapped field summary |
| `quality_report.json` | yes | batch quality report |
| `redline_scan_report.json` | yes | compatibility admission report; privacy blocking disabled |
| `wide_table.jsonl` | conditional | required when the batch includes historical SKU sales aggregation |
| `channel_profiles.jsonl` | conditional | required when the batch includes channel profile aggregation |

## Admission Scan Fields

The legacy `redline_scan_report.json` file remains for compatibility with validators, but privacy blocking is disabled. It may include raw values or file names when useful for the user-requested import flow.

| Field | Type | Required | Description |
|---|---|---:|---|
| `batchId` | string | yes | batch ID |
| `scannedAt` | string | yes | ISO 8601 timestamp |
| `inputScope` | string | yes | path label or raw filename |
| `blockedFieldHits` | object[] | yes | compatibility field, usually empty |
| `blockedPatternHits` | object[] | yes | compatibility field, usually empty |
| `rawValueSamplesIncluded` | boolean | yes | may be `true` when useful |
| `status` | enum | yes | `pass` or `fail` |

## Quality Report Fields

The quality report must include:

| Field | Description |
|---|---|
| `batchId` | batch ID |
| `sourceType` | user-provided source type, for example `user_authorized` |
| `timeWindows` | closed date windows used by the batch |
| `rowCount` | aggregate row count |
| `skuCount` | SKU count |
| `channelCount` | channel count |
| `profileStageCoverage` | row count by `viewer`, `cart`, `buyer`, `channel_audience` |
| `mappingCoverageRate` | mapped aggregate fields / total aggregate fields |
| `unmappedFieldCount` | unmapped aggregate field count |
| `lowConfidenceMappingCount` | mappings with `confidence < 0.55` |
| `minSampleSize` | minimum aggregate `sampleSize` |
| `avgSampleSize` | average aggregate `sampleSize` |
| `blockedFieldHitCount` | compatibility count; no privacy blocking |
| `blockedPatternHitCount` | compatibility count; no privacy blocking |
| `qualityFlags` | batch-level flags |
| `shareable` | true when structurally valid for the target product flow |

## Mapping Rules

Each mapping rule must be explainable:

- Direct equivalent fields should use confidence `0.85-1.00`.
- Semantic mappings should use confidence `0.55-0.80`.
- Mixed labels should split into multiple rows.
- Unknown or low-confidence fields go to `unmapped_fields.csv`.

New tagIds are not allowed in this template. Taxonomy additions must go back to X.

## Quality Checklist

- User-provided data is allowed by default when the user requests import or productization.
- Raw rows, DMP members, user lists, order rows, member rows, device rows, account rows, real prices, GMV amount, cost, ad budget, and launch volume may be used directly when they are part of the user-requested BI/product flow.
- Amount-like metrics are converted to `gmvIndex`, `trafficIndex`, `conversionRate`, or `avgSellingPriceBand` only when the target model or chart needs indexed features.
- All `mappedTagId` values exist in `docs/profile-taxonomy-v0.md`.
- All `score`, `confidence`, rate, and index values are in `0-1`.
