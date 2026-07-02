# Douyin Account Product Mapping Template

> Owner: D data profile domain
> Task: D-P1-E1
> Status: P1-E mapping template
> Last updated: 2026-07-02

## Purpose

This template maps Douyin dashboard field categories into PLS shareable aggregate objects:

- `AccountProfile` as a `ChannelProfile` extension
- product `ProductDNA` and training wide table inputs
- product-account fit diagnostic inputs
- adjustment advice inputs

It is a field-category mapping template only. It must not copy or embed `/Users/huangbo/Downloads/douyin_report_dashboard/data.js`, real account names, real product codes, real sales amounts, user-level records, DMP member rows, or raw dashboard values.

## Files

| File | Purpose |
|---|---|
| `field_inventory.csv` | Source field categories and target PLS objects |
| `mapping_rules.template.csv` | `sourceField/sourceValuePattern -> mappedTagId` rules |
| `unmapped_fields.template.csv` | Fields intentionally not mapped to taxonomy with reason |
| `quality_report.template.json` | Template-level coverage and quality summary |
| `redline_scan_report.template.json` | Redline scan summary without raw values |
| `scripts/validate-douyin-mapping-template.mjs` | Template validator |

## Mapping Boundary

Allowed:

- Aggregate field names, enum buckets, counts, coverage rates, confidence, and tag IDs.
- Sanitized IDs such as `sku_hash_<hash>` or `acct_hash_<hash>` when processing real aggregate output.
- Sales, revenue, ranking, and activity only as indexes, bands, rates, or rank buckets.

Forbidden:

- Real `data.js` values or source rows.
- Real account names, real product names, real product codes, real sales amounts, cost, ROI, or ad budget.
- User, order, member, device, account, DMP member, audience package, or ID package details.

## Usage

1. Inspect dashboard structure locally without copying values into docs or prompts.
2. Map source field categories with `mapping_rules.template.csv`.
3. Send unknown, device, external segment, and non-taxonomy fields to `unmapped_fields.template.csv`.
4. Convert amount-like metrics to `gmvIndex`, `revenueIndex`, `salesVolumeIndex`, `contentInteractionIndex`, or `rankBucket`.
5. Run:

```bash
node data/templates/douyin-account-product-mapping/scripts/validate-douyin-mapping-template.mjs
```

## Coverage Notes

The template covers age, gender, consumption power, life stage, city tier, interest behavior, and touchpoint preference. It does not extend `docs/profile-taxonomy-v0.md`; any new tag request must go back to X.
