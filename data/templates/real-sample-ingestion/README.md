# Real Sample Ingestion Template

> Owner: D data profile domain  
> Task: D-P0-C4  
> Status: P0-C template  
> Last updated: 2026-07-02

## Purpose

This template defines how real platform samples must be handled before they enter PLS. It is a local processing contract, not a place to store real data.

The only cross-domain outputs are S3 aggregate artifacts:

- mapped aggregate profile rows
- unmapped aggregate field summaries
- batch quality reports
- redline scan reports without raw values

S0/S1 raw records must never be copied into docs, API responses, prompts, notes, or LLM context.

## Local Directory Boundary

Use these local paths when real samples are provided:

| Path | Data class | Git policy | LLM visibility | Owner |
|---|---|---|---|---|
| `data/local/raw_staging/<batchId>/` | S0/S1 raw files | ignored by `data/local/.gitignore` | forbidden | D local tool only |
| `data/local/sanitized_staging/<batchId>/` | local sanitized intermediate | ignored by `data/local/.gitignore` | forbidden by default | D local tool only |
| `data/local/aggregate_output/<batchId>/` | S3 aggregate output candidate | ignored until redline scan passes | allowed after review | D to M/A/V |
| `data/templates/real-sample-ingestion/` | template and validation logic | tracked | allowed | D |

Rules:

1. Raw files stay under `data/local/raw_staging/<batchId>/`.
2. Raw file names must not contain brand, account, platform open id, date-level campaign names, or user identifiers.
3. Sanitized intermediate files may contain hashed join keys only for local aggregation. They must not be shared cross-domain.
4. Aggregate outputs must use sanitized IDs such as `sku_<hash8>` and `channel_<hash8>`.
5. Only aggregate outputs that pass redline scan and quality checks may be copied into a shareable workspace or API import path.

## Processing Steps

1. Create a `batchId`, for example `batch_real_YYYYMMDD_001`.
2. Put raw files in `data/local/raw_staging/<batchId>/`.
3. Run local sanitize logic outside LLM context:
   - drop direct identifiers
   - drop raw user, member, order, device, and account rows after aggregation
   - hash join keys if a temporary local join is required
   - convert amount metrics to indexes or bands
4. Aggregate to the PLS grains:
   - DMP profile: `entityType + entityId + profileStage + mappedTagId + timeWindow`
   - training wide table: `skuId + channelId + timeWindow`
   - channel profile: `channelId + timeWindow`
5. Map platform fields to `docs/profile-taxonomy-v0.md` tagIds using `mapping_rules.template.csv`.
6. Write aggregate candidate files using `aggregate_profile.template.csv` and `quality_report.template.json`.
7. Run:

```bash
node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs data/local/aggregate_output/<batchId>
```

8. Share only files that pass validation and contain no S0/S1 fields or values.

## Required Output Files

For each real sample batch, produce these files under `data/local/aggregate_output/<batchId>/`:

| File | Required | Purpose |
|---|---:|---|
| `aggregate_profile.csv` | yes | mapped aggregate tag distribution |
| `unmapped_fields.csv` | yes | unmapped aggregate field summary, no raw members |
| `quality_report.json` | yes | batch quality report |
| `redline_scan_report.json` | yes | blocked field and pattern counts without raw values |
| `wide_table.jsonl` | conditional | required when the batch includes historical SKU sales aggregation |
| `channel_profiles.jsonl` | conditional | required when the batch includes channel profile aggregation |

## Redline Scan Fields

The redline scan report must include only counts and field names:

| Field | Type | Required | Description |
|---|---|---:|---|
| `batchId` | string | yes | sanitized batch ID |
| `scannedAt` | string | yes | ISO 8601 timestamp |
| `inputScope` | string | yes | path label, not raw filename |
| `blockedFieldHits` | object[] | yes | `fieldName`, `hitCount`, `severity` |
| `blockedPatternHits` | object[] | yes | `patternId`, `hitCount`, `severity` |
| `rawValueSamplesIncluded` | boolean | yes | must be `false` |
| `status` | enum | yes | `pass` or `fail` |

Forbidden output keys include:

```text
phone, mobile, address, orderId, memberId, openId, unionId, advertisingId, deviceId,
buyerName, receiverName, idCard, email, rawUserId, rawAccountId, rawPayload
```

## Quality Report Fields

The quality report must include:

| Field | Description |
|---|---|
| `batchId` | sanitized batch ID |
| `sourceType` | `sanitized_aggregate` |
| `timeWindows` | closed date windows used by the batch |
| `rowCount` | aggregate row count |
| `skuCount` | sanitized SKU count |
| `channelCount` | sanitized channel count |
| `profileStageCoverage` | row count by `viewer`, `cart`, `buyer`, `channel_audience` |
| `mappingCoverageRate` | mapped aggregate fields / total aggregate fields |
| `unmappedFieldCount` | unmapped aggregate field count |
| `lowConfidenceMappingCount` | mappings with `confidence < 0.55` |
| `minSampleSize` | minimum aggregate `sampleSize` |
| `avgSampleSize` | average aggregate `sampleSize` |
| `blockedFieldHitCount` | redline blocked key count |
| `blockedPatternHitCount` | redline pattern hit count |
| `qualityFlags` | batch-level flags |
| `shareable` | true only when redline status is pass |

## Mapping Rules

Each mapping rule must be explainable:

- Direct equivalent fields should use confidence `0.85-1.00`.
- Semantic mappings should use confidence `0.55-0.80`.
- Mixed labels should split into multiple rows.
- Unknown or low-confidence fields go to `unmapped_fields.csv`.

New tagIds are not allowed in this template. Taxonomy additions must go back to X.

## Safety Checklist

- No S0/S1 raw file is committed.
- No raw DMP member, user list, audience package, ID package, order row, member row, device row, or account row is copied into shareable outputs.
- No real price, GMV amount, cost, ad budget, or launch volume is copied into shareable outputs.
- All amount-like metrics are converted to `gmvIndex`, `trafficIndex`, `conversionRate`, or `avgSellingPriceBand`.
- All `mappedTagId` values exist in `docs/profile-taxonomy-v0.md`.
- All `score`, `confidence`, rate, and index values are in `0-1`.
