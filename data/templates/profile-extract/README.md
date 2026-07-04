# Profile Extract Package Template

> Owner: D data profile domain  
> Task: D-P4-TOOLS-2  
> Status: P4 tools package template  
> Last updated: 2026-07-04

## Purpose

This template freezes the standard output package for local profile extraction tools. A parser may read user-specified HTML, CSV, XLSX, Markdown, or JSON files from third-party platforms, but the cross-domain output must be a validated `profile-extract` package before A-domain import adapters consume it.

The package keeps source lineage, mapping confidence, unmapped fields, sample size, time window, and quality flags. It does not add taxonomy tags. Source fields that cannot be mapped to `docs/profile-taxonomy-v0.md` must remain in `unmapped_fields.csv` and `AggregateProfile.unmappedFields`.

## Package Structure

```text
profile_extract_package/
  run_manifest.json
  source_manifest.json
  extracted_profiles.jsonl
  aggregate_profile.csv
  aggregate_profile.jsonl
  field_dictionary.csv
  unmapped_fields.csv
  quality_report.json
  report.md
```

## Core Contracts

`ProfileTagScore`:

```json
{
  "tagId": "demo.age_25_34",
  "score": 0.64,
  "sourceField": "audience_age_band",
  "sourceValue": "25-34",
  "confidence": 0.9,
  "mappingRuleId": "profile_extract_age_25_34_v1"
}
```

`AggregateProfile`:

```json
{
  "profileId": "mock_profile_channel_audience_001",
  "platform": "mock_platform",
  "source": "mock_profile_extract_sample",
  "timeWindow": "2026-06-01/2026-06-30",
  "sampleSize": 100,
  "tags": [],
  "unmappedFields": [],
  "qualityFlags": ["mock_sample"]
}
```

## Import Adapter Fields

A-P4-TOOLS-4 can consume these manifest fields without reading parser-specific files:

| Manifest | Field | Purpose |
|---|---|---|
| `run_manifest.json` | `packageType` | Must be `profile-extract`. |
| `run_manifest.json` | `runId` | Tool run identity and confirmText component. |
| `run_manifest.json` | `toolId` | Registry tool identity. |
| `run_manifest.json` | `workspaceId` | Target workspace for import dry run. |
| `run_manifest.json` | `importAdapter.targetTables` | First-phase target is `channel_profile`; later can include `channel_entity`. |
| `run_manifest.json` | `importAdapter.confirmText` | Suggested confirmation text, e.g. `IMPORT TOOL RUN <runId>`. |
| `source_manifest.json` | `sourceBatchId` | Batch id to write into `batch` and target rows. |
| `source_manifest.json` | `dataVersion` | Business data version. |
| `source_manifest.json` | `sourceType` | Usually `user_authorized` or `mock_sample`. |
| `source_manifest.json` | `timeWindows` | Closed profile windows. |
| `source_manifest.json` | `entityCounts` | Expected row counts by object. |

## Relationship To Existing Templates

- `real-sample-ingestion` is a broad local admission and aggregation template for user-provided samples.
- `douyin-account-product-mapping` is a field-category mapping template for one BI source family.
- `profile-extract` is the normalized package contract emitted by concrete parsers after extraction and mapping. Platform-specific parser logic belongs outside this template; this directory only freezes output shape and validation.

## Validation

Run the sample package validator:

```bash
node data/templates/profile-extract/scripts/validate-profile-extract-package.mjs data/templates/profile-extract/sample_package
```

The validator checks required files, manifest counts, tagId whitelist, `source/timeWindow/sampleSize`, unmapped fields, and quality report consistency.

## Not Implemented

This task does not implement concrete parsers for Taobao/Tmall, Shengyicanmou, Douyin, Xiaohongshu, CSV, XLSX, or HTML. Those tools should emit this package shape after parsing user-specified local files.
