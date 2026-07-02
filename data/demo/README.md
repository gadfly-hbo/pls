# PLS Demo Data

> Owner: D data profile domain  
> Batch: `batch_demo_20260702`  
> Status: P0-B mock fixture

## Purpose

This directory provides a runnable mock clothing data package for the P0 MVP loop:

```text
demo SKU -> ProductProfile -> MatchResult -> heatmap -> recommendation
```

All files are mock or mock aggregate data. They do not contain raw customer, order, member, device, account, DMP member, audience package, or ID package records.

## Files

| File | Content | Main consumer |
|---|---|---|
| `skus.jsonl` | 3 mock apparel SKUs with ProductDNA and `mappedProductTags` | A/M/V |
| `channel_profiles.jsonl` | 4 mock channel-level aggregate profiles | A/M/V |
| `wide_table.jsonl` | 12 rows at `skuId + channelId + timeWindow` grain | M |
| `dmp_aggregate.csv` | CSV sample for DMP aggregate tag import | A/D |
| `dmp_aggregate.jsonl` | JSONL equivalent of the DMP aggregate import sample | A/D |
| `batch_quality_report.json` | Batch-level data quality report | X/D/M |
| `expected_scenarios.md` | Expected `priority_launch`, `test_launch`, `observe`, and `avoid` scenarios | X/M/V |

## Dataset Shape

- SKU count: 3
- Channel count: 4
- Wide table rows: 12
- Time window: `2026-05-01/2026-06-30`
- Workspace: `ws_demo`
- Source type: `mock`

## Consumption

M domain:

- Use `wide_table.jsonl` as the training and smoke-test input.
- Use `buyerProfileTags` as the P0 main supervised label.
- Use `mappedProductTags` as precomputed ProductDNA tag features.
- Ignore `demoExpectedMatch` for model training; it is only a fixture assertion.

A domain:

- Load `skus.jsonl` into product fixtures.
- Load `channel_profiles.jsonl` into channel fixtures.
- Use `dmp_aggregate.csv` or `dmp_aggregate.jsonl` to test import validation.
- Use `batch_quality_report.json` as the batch summary fixture.

V domain:

- Use `expected_scenarios.md` and `demoExpectedMatch` to verify heatmap states.
- Export only derived S4 fields such as `skuId`, `channelId`, `matchScore`, `matchConfidence`, `recommendation`, drivers, risks, and `generatedAt`.

## Field Notes

- All profile tags use `tagId` values from `docs/profile-taxonomy-v0.md`.
- Sales and traffic values are mock aggregate values. `gmvIndex`, `trafficIndex`, and `conversionIndex` are normalized indexes in `0-1`.
- `avgSellingPriceBand` uses `value`, `mid`, or `premium`; no real prices are included.
- `sampleSize` values are aggregate fixture counts and do not identify individual users or orders.
- `demoExpectedMatch` is a demo-only helper object for P0-B smoke tests. It is not part of the data-spec training contract.

## Safety Boundary

The package intentionally excludes:

- Phone, name, address, order number, member ID, platform open ID, advertising ID, device ID.
- Raw DMP exports, audience package members, user lists, or ID packages.
- Real GMV, real prices, cost, launch volume, ad budget, or unpublished price strategy.

## Validation Checklist

- `skus.jsonl` has 3 rows.
- `channel_profiles.jsonl` has 4 rows.
- `wide_table.jsonl` has 12 rows and covers all 3 SKU x 4 channel combinations.
- All `tagId` and `mappedTagId` values exist in `docs/profile-taxonomy-v0.md`.
- All `score`, `confidence`, index, rate, and coverage values are within `0-1`.
- `expected_scenarios.md` covers `priority_launch`, `test_launch`, `observe`, and `avoid`.
