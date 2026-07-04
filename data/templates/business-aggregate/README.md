# Business Aggregate Package Template

> Owner: D data profile domain  
> Task: D-P4-TOOLS-3  
> Status: P4 tools package template  
> Last updated: 2026-07-04

## Purpose

This template freezes the standard output package for tools that transform offline business exports into PLS aggregate objects. The first phase handles user-specified order, product, and channel export files only. It does not connect to production SQL databases and does not add physical DB schema.

The package is the boundary between local business-data processing and A-domain import adapters. It preserves source lineage, aggregation grain, field mapping, unmapped fields, quality rules, and upsert keys.

## Package Structure

```text
business_aggregate_package/
  run_manifest.json
  source_manifest.json
  product_master.jsonl
  channel_entity.jsonl
  product_aggregate.jsonl
  channel_aggregate.jsonl
  sku_channel_wide_table.jsonl
  field_mapping.csv
  unmapped_fields.csv
  quality_report.json
  report.md
```

## Input Field Classes

| Input class | Examples | Handling |
|---|---|---|
| `order_detail` | order id, product key, channel key, paid amount, quantity, paid time | Aggregate into product/channel/wide-table metrics; keep raw identifiers only when target package needs lineage. |
| `product_detail` | SKU/SPU/style code, category, brand, price, season, selling points | Map to `product_master`; use `mappedProductTags` only when taxonomy mapping is explicit. |
| `channel_detail` | shop/account/store id, platform, hierarchy, display name | Map to `channel_entity`; use `profileTags` only when taxonomy mapping is explicit. |
| `profile_export` | DMP/profile aggregate fields joined to product or channel | Map to `ProfileTagScore`; unknown fields go to `unmapped_fields.csv`. |

## Aggregation Grain

| Object | Grain | First-phase import direction |
|---|---|---|
| `product_aggregate` | `productId/skuId + timeWindow + dataVersion` | Existing `sku` plus batch/full-row adapter. |
| `channel_aggregate` | `channelId + timeWindow + dataVersion` | Existing `channel_profile`. |
| `sku_channel_wide_table` | `skuId + channelId + timeWindow` | Existing `wide_table_row`. |
| `product_master` | `workspaceId + productId + productVariantId + dataVersion` | Waiting for X decision on physical `product_master`; can be adapter input before schema exists. |
| `channel_entity` | `workspaceId + entityType + sourceEntityKey + dataVersion` | Existing `channel_profile` first; fuller `channel_entity` physical schema needs X decision. |

## Quality Rules

The package-level quality report must cover:

- `missing_primary_key`
- `missing_time_window`
- `unrecognized_channel`
- `unrecognized_product`
- `invalid_amount_or_quantity`
- `low_profile_mapping_coverage`
- `unapproved_tag_id`

Rows should keep `qualityFlags` even when the package is shareable.

## Existing DB Mapping

First-phase adapters can consume this package without schema changes:

| Package object | Existing table/object | Notes |
|---|---|---|
| `product_master` | `sku` | `sku_id`, `spu_id`, category, season, attributes, assets, `mapped_product_tags`; fuller master fields remain in JSON attributes/full-row until X freezes physical schema. |
| `channel_entity` | `channel_profile` | `channel_id`, name/type/platform, profile tags, source, time window, sample size; entity hierarchy waits for physical `channel_entity`. |
| `product_aggregate` | `sku` or `batch`/full-row import adapter | Performance metrics can remain in package/full-row until target schema exists. |
| `channel_aggregate` | `channel_profile` | Profile tags and indexed metrics map directly where fields exist. |
| `sku_channel_wide_table` | `wide_table_row` | Full row maps to `full_row` by `skuId + channelId + timeWindow`. |

## X Decisions Needed

- Whether `ProductMaster` becomes a physical SQLite top-level table.
- Whether `ChannelEntity` becomes a physical SQLite top-level table or remains projected through `channel_profile` initially.
- Whether global enum sets for `priceBand`, `seasonBand`, and `platformType` should be frozen before import adapters enforce them.

## Validation

Run:

```bash
node data/templates/business-aggregate/scripts/validate-business-aggregate-package.mjs data/templates/business-aggregate/sample_package
```

The validator checks required files, manifest counts, references, upsert key uniqueness, tagId whitelist, row counts, and quality report consistency.

## Not Implemented

This task does not implement SQL connectors, production DB readers, concrete XLSX/CSV parsers, DB migrations, or UI adapters. It only freezes the package contract and sample validation.
