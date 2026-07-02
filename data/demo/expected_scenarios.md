# PLS Demo Expected Scenarios

> Batch: `batch_demo_20260702`  
> Scope: mock aggregate data for P0-B local MVP smoke only.

## Purpose

This file gives M/A/V a stable set of expected recommendation scenarios for local smoke tests. The source values are mock aggregate signals from `wide_table.jsonl`; they are not real sales, audience, user, or DMP member data.

## Scenario Matrix

| Scenario | SKU | Channel | Expected recommendation | Expected score band | Main positive drivers | Main negative drivers |
|---|---|---|---|---|---|---|
| High match | `mock_sku_101` | `mock_channel_shelf_001` | `priority_launch` | `>= 0.70` | `style.minimal`, `occasion.work`, `price.mid` | none |
| Medium match | `mock_sku_102` | `mock_channel_live_001` | `test_launch` | `[0.50, 0.70)` | `price.value`, `price.promo_sensitive`, `intent.try_new` | `style.basic` |
| Observe | `mock_sku_103` | `mock_channel_short_video_001` | `observe` | `[0.35, 0.50)` | `intent.try_new` | `style.trendy`, `demo.age_18_24` |
| Avoid | `mock_sku_103` | `mock_channel_live_001` | `avoid` | `< 0.35` | none | `price.value`, `price.promo_sensitive`, `demo.city_lower_tier` |

## Notes for Consumers

- M can use `buyerProfileTags` from `wide_table.jsonl` as the P0 supervised label target.
- A can use `demoExpectedMatch` in `wide_table.jsonl` as a fixture assertion, but production API responses should compute `recommendation` from `api-contract.md`.
- V can use this file to verify the heatmap contains all four visual states.
- The `demoExpectedMatch` object is a demo-only helper. It is not part of the training wide-table contract in `docs/data-spec.md`.

## Safety Boundary

- No raw DMP export, user list, audience package member, ID package, order detail, member detail, phone, address, account ID, platform open ID, advertising ID, or device ID is present.
- All commercial performance values are mock aggregate indexes or bands, such as `gmvIndex`, `trafficIndex`, and `avgSellingPriceBand`.
