# Channel Profile Object Library Package Template

> Owner: D data profile domain  
> Task: D-P6-CHANNEL-1  
> Status: P6 channel profile 2.0 import template  
> Last updated: 2026-07-06

## Purpose

This template freezes the D-domain import package for Channel Profile 2.0 object libraries. It lets tools and offline imports describe platforms, trade areas, stores, accounts, marketing events, and business scenarios with traceable identity, lineage, audience profiles, product-fit profiles, bindings, duplicate risk hints, and dry-run quality reports.

The package is a contract for A-domain import adapters. It does not add DB schema, API routes, taxonomy tags, or automatic duplicate merging.

## Package Structure

```text
channel_profile_object_library_package/
  run_manifest.json
  source_manifest.json
  basic_templates.csv
  channel_objects.jsonl
  bindings.jsonl
  audience_profiles.jsonl
  product_fit_profiles.jsonl
  field_dictionary.csv
  quality_report.json
  report.md
```

## Object Types

| Object type | Target object | Long-lived | Notes |
|---|---|---:|---|
| `platform` | `ChannelEntity` | yes | Online platform such as Tmall, Douyin, JD, WeChat Channels. |
| `trade_area` | `ChannelEntity` | yes | Offline trade area or mall-area catchment. Default radius is 3 km; 1-5 km is configurable. |
| `store` | `ChannelEntity` | yes | Product navigation says store; `storeType` distinguishes `online_shop` and `offline_store`. |
| `account` | `ChannelEntity` | yes | Content, live, or ecommerce account; live/video/graphic capability belongs in `contentFormats`. |
| `marketing_event` | `MarketingEvent` | yes | Platform promotion, holiday, or brand event. It is not a channel entity. |
| `business_scenario` | `BusinessScenario` | yes | Business scenario such as launch, repurchase, clearance, or regional test. It is not a channel entity. |

## Basic Templates

`basic_templates.csv` defines one import target at a time. The file must contain one row per supported `targetObjectType`:

```text
platform | trade_area | store | account | marketing_event | business_scenario
```

Each row declares required identity fields, hierarchy requirements, optional profile support, and expected dry-run quality checks. Basic-template imports can omit unrelated objects, but they must still provide source lineage and key policy fields.

## Advanced Object Package

The advanced package uses the full structure above and can include:

- Multiple object types in one batch.
- Parent-child hierarchy: `platform -> online store -> account` and `trade_area -> offline store`.
- Marketing-event and business-scenario bindings to channel entities.
- `AudienceProfile` rows for channel entities.
- `ProductFitProfile` rows for channel entities.
- Package-level and object-level quality reports.

Marketing events and business scenarios may bind to any channel entity, but they do not change the entity hierarchy and must not be imported as `ChannelEntity` rows.

## Identity And Version Fields

Every object row must carry:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `objectType` | enum | yes | One of the six object types above. |
| `sourceStableKey` | string | yes | Stable source key. Prefer explicit import key, then source system id, then generated slug. |
| `keySource` | enum | yes | `provided`, `source_system_id`, or `generated_from_name`. |
| `canonicalObjectKey` | string | yes | `objectType + ":" + sourceStableKey`. |
| `objectVersionId` | string | yes | `workspaceId + ":" + objectType + ":" + sourceStableKey + ":" + dataVersion`. |
| `dataVersion` | string | yes | Business data version. |
| `sourceBatchId` | string | yes | Import batch id. |
| `timeWindow` | string | conditional | Required for profile/performance snapshots; optional for static metadata. |
| `generatedAt` | string | yes | ISO 8601 timestamp. |
| `qualityFlags` | string[] | yes | Empty array allowed. |

When `keySource = generated_from_name`, dry-run must add `generated_key_needs_review`. Name changes must not automatically change `canonicalObjectKey`.

## AudienceProfile

`audience_profiles.jsonl` imports audience structure for `ChannelEntity` objects only.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `profileId` | string | yes | Stable profile snapshot id. |
| `canonicalObjectKey` | string | yes | Must reference a `platform`, `trade_area`, `store`, or `account` object. |
| `profileStage` | enum | yes | First phase uses `channel_audience`. |
| `source` | string | yes | Source file, tool, or report identity. |
| `sampleSize` | number/null | conditional | Required when source claims aggregate audience distribution. Do not fabricate. |
| `timeWindow` | string | yes | Closed date window for aggregate profiles. |
| `confidence` | number | yes | `0-1` source/mapping confidence. |
| `tags` | `ProfileTagScore[]` | yes | All `tagId` values must exist in `docs/profile-taxonomy-v0.md`. |
| `unmappedFields` | object[] | yes | Source labels that cannot map to taxonomy. |
| `qualityFlags` | string[] | yes | Empty array allowed. |

## ProductFitProfile

`product_fit_profiles.jsonl` imports the product types a channel entity is suitable for. It does not create product facts or match results.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `profileId` | string | yes | Stable product-fit snapshot id. |
| `canonicalObjectKey` | string | yes | Must reference a `ChannelEntity` object. |
| `source` | enum/string | yes | Prefer `user_imported`, then `derived_from_performance`, then `manual_config`. |
| `sampleSize` | number/null | conditional | Required for performance-derived fits; may be null for manual config. |
| `timeWindow` | string | conditional | Required for aggregate/performance-derived fits. |
| `confidence` | number | yes | `0-1`. Manual config should not claim high statistical confidence without evidence. |
| `fitCategories` | string[] | yes | Source or mapped product categories. |
| `fitPriceBands` | string[] | yes | Source/mapped price bands. |
| `fitStyles` | string[] | yes | Source/mapped styles; map to taxonomy tags only when explicit. |
| `fitOccasions` | string[] | yes | Source/mapped occasions. |
| `fitLaunchTypes` | string[] | yes | New-product, replenishment, clearance, hero boost, etc. |
| `evidence` | object[] | yes | Source rows, metrics, manual reason, or mapping evidence. |
| `qualityFlags` | string[] | yes | Empty array allowed. |

Multiple `ProductFitProfile` sources can be imported, but A/M must choose one `activeProductFitProfile` for matching at runtime.

## Duplicate Risk Fields

Duplicate governance is advisory in P6 first phase. Import must not auto-merge suspected duplicates.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `possibleDuplicate` | boolean | yes | True when name, source key, platform, or parent suggests overlap. |
| `duplicateCandidateKeys` | string[] | yes | Candidate `canonicalObjectKey` values. Empty array allowed. |
| `manualReviewStatus` | enum | yes | `unreviewed`, `confirmed_duplicate`, `confirmed_distinct`, or `needs_more_data`. |

Dry-run may warn on `possible_duplicate`, but confirm import remains idempotent only by `sourceStableKey` / `canonicalObjectKey` and must not merge rows.

## Dry-Run Quality Rules

`quality_report.json` must cover these rule IDs:

| Rule ID | Blocking | Trigger | Required handling |
|---|---:|---|---|
| `missing_parent_reference` | yes | Store/account binding references a parent object absent from package and target workspace. | Block confirm import until parent is provided or binding is removed. |
| `generated_key_needs_review` | no | `keySource = generated_from_name`. | Warn and require manual review status. |
| `manual_entity_without_profile` | no | Manual platform/trade_area/store/account row has no `AudienceProfile`. | Warn; do not fabricate profile. |
| `possible_duplicate` | no | Duplicate candidate found. | Warn with `duplicateCandidateKeys`; do not auto-merge. |
| `unapproved_tag_id` | yes | Any profile tag is absent from taxonomy. | Move to unmapped or block import. |
| `invalid_object_type` | yes | Object type is not one of the six P6 types. | Block import. |
| `event_or_scenario_as_channel_entity` | yes | Marketing event or scenario is encoded as `ChannelEntity`. | Block import. |
| `missing_profile_lineage` | yes | Profile lacks source, sampleSize when required, timeWindow, confidence, or sourceBatchId. | Block profile import. |

The sample package includes at least three failure examples in `quality_report.failureExamples`: missing parent, generated key review, and possible duplicate.

## A-Domain Import Contract Needed

A-P6-CHANNEL-3 should implement a package adapter for `channel-profile-object-library` with:

| Step | Contract |
|---|---|
| Dry-run | Read package files, validate object types, hierarchy references, taxonomy tags, duplicate hints, profile lineage, and row counts. Return `quality_report.json` plus normalized impact preview. |
| Confirm import | Require `X-PLS-Admin-Token`, `Idempotency-Key`, `X-PLS-Workspace`, and `confirmText = IMPORT CHANNEL OBJECT LIBRARY <sourceBatchId>`. |
| Write targets | Persist or stage `ChannelEntity`, `MarketingEvent`, `BusinessScenario`, bindings, `AudienceProfile`, `ProductFitProfile`, data version, and quality report once X/A schema is frozen. |
| Audit | Write `data_import_job` and `db_admin_audit`; do not bypass workspace isolation. |
| Compatibility | Do not break existing `/channels` and `/channels/entities` read paths. |

Smoke tests that write workspace data must use a temporary workspace, not `ws_demo`.

## Validation

Run:

```bash
node data/templates/channel-profile-object-library/scripts/validate-channel-profile-object-library-package.mjs data/templates/channel-profile-object-library/sample_package
```

The validator checks required files, basic-template coverage for all six object types, advanced package row presence, object key formulas, parent/binding references, profile lineage, taxonomy whitelist, row-count consistency, and required quality-rule/failure-example coverage.

## Not Implemented

This task does not implement concrete parsers, DB migrations, API routes, UI flows, duplicate merge workflows, or production SQL connections. It only freezes the D-domain package contract and mock sample package.
