# CSV Ingestion Sample Templates

> Owner: D 数据画像域  
> Task: D-P7-INGEST-1  
> Status: P7 第一期示例  
> Last updated: 2026-07-06

## Purpose

This directory holds sample CSV files for the P7 first-phase "CSV import into existing SQLite table" feature. They are `mock_sample` contracts only; they do not represent real business data.

## Files

| File | Target table | Notes |
|---|---|---|
| `sample_sku.csv` | `sku` | Minimal mock rows aligned with `apps/server/src/db/schema.ts` |
| `sample_channel_profile.csv` | `channel_profile` | Minimal mock rows aligned with `apps/server/src/db/schema.ts` |

## Usage

1. Upload the CSV in the Data Management workbench.
2. Select the target table.
3. Run dry-run.
4. Review the quality report for missing columns, extra columns, type errors, and blocking errors.
5. Enter the required confirm text (`IMPORT CSV <tableName>`) to execute.

## Field notes

- Headers are case-insensitive and normalized: spaces/hyphens become underscores.
- JSON columns (`attributes`, `assets`, `mapped_product_tags`, `tags`, `quality_flags`) must contain valid JSON.
- `workspace_id`, `created_at`, `updated_at` can be omitted; the backend injects them from request context and defaults.
- Extra columns not present in the target table are ignored by default (relaxed mode).

## Manual validation

To check that a sample CSV header matches the target table schema, run:

```bash
node -e "
const fs = require('fs');
function norm(h){ return h.trim().toLowerCase().replace(/[-\s.]+/g,'_').replace(/_+/g,'_'); }
const header = fs.readFileSync('data/templates/csv-ingestion/sample_sku.csv','utf8').split(/\r?\n/)[0].split(',').map(norm);
const required = ['sku_id','spu_id','category_lv1','category_lv2','season','title','attributes','assets','mapped_product_tags'];
const optional = ['workspace_id','created_at','updated_at'];
console.log('missing required:', required.filter(c=>!header.includes(c)));
console.log('missing optional:', optional.filter(c=>!header.includes(c)));
console.log('extra:', header.filter(c=>![...required,...optional].includes(c)));
"
```

Replace `sample_sku.csv` and the field lists with the channel_profile fields as needed.

## Not implemented

- CSV-driven table creation.
- XLSX upload.
- Business database / API connectors.
- Automatic taxonomy mapping.
