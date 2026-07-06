# Channel Profile Object Library Mock Sample Report

## Purpose

This mock package demonstrates the D-P6-CHANNEL-1 import contract for Channel Profile 2.0 object libraries. It is not real channel evidence and must not be used for product decisions.

## Contents

| Object | Count | Notes |
|---|---:|---|
| Basic templates | 6 | Covers `platform`, `trade_area`, `store`, `account`, `marketing_event`, `business_scenario`. |
| Channel objects | 6 | Includes four `ChannelEntity` rows plus one `MarketingEvent` and one `BusinessScenario`. |
| Bindings | 4 | Covers hierarchy, event binding, and scenario binding. |
| Audience profiles | 3 | All tags use existing taxonomy IDs. |
| Product-fit profiles | 2 | One user-imported mock profile and one manual mock config. |

## Failure Examples

The quality report includes three required dry-run failure examples:

1. `missing_parent_reference`: a store points to an absent trade area.
2. `generated_key_needs_review`: a scenario key is generated from name/type.
3. `possible_duplicate`: an account has duplicate candidates but must not be auto-merged.

## A-Domain Contract

The import adapter should support dry-run, quality report preview, confirm import, workspace isolation, admin token, idempotency key, and audit. Confirm text should be:

```text
IMPORT CHANNEL OBJECT LIBRARY batch_channel_object_library_mock_20260706
```

No DB schema, API route, UI, parser, or taxonomy change is implemented by this sample.
