# Business Aggregate Sample Report

## Purpose

This report documents the minimal `business-aggregate` sample package for D-P4-TOOLS-3. It is a mock/sample contract artifact, not a real business performance conclusion.

## Usage

Run:

```bash
node data/templates/business-aggregate/scripts/validate-business-aggregate-package.mjs data/templates/business-aggregate/sample_package
```

## Aggregation Grain

- `product_aggregate`: `productId/skuId + timeWindow + dataVersion`
- `channel_aggregate`: `channelId + timeWindow + dataVersion`
- `sku_channel_wide_table`: `skuId + channelId + timeWindow`

## Existing Import Direction

- `product_master` can feed existing `sku` fields and JSON attributes until physical `ProductMaster` is approved.
- `channel_entity` can feed existing `channel_profile` fields until physical `ChannelEntity` is approved.
- `sku_channel_wide_table` can feed `wide_table_row.full_row` directly.

## Notes

No production SQL database was connected. Concrete SQL export parsers, XLSX/CSV readers, import adapters, and DB migrations are not implemented by this template task.
