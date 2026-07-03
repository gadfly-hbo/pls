# D-P2-2 Product Master and Channel Entity Schema Draft

> Owner: D data profile domain  
> Task: D-P2-2  
> Status: P2 schema draft, pending X review  
> Last updated: 2026-07-03

## Purpose

This document freezes the P2 data-domain draft for:

- `ProductMaster`: product master data used by product profiling and new-product prediction.
- `ChannelEntity`: shop, account, livestream, content account, region, trade area, and store entities used as channel-first analysis entries.
- `FieldMapping`: source-field to PLS-field mapping template.
- `DataQualityReport`: batch/object quality report template.

It follows `docs/p2-0-product-ia-freeze.md`: P2 prioritizes store/account/entity-first channel profiles, explainable matching, traceable data, and no automatic decision execution.

## Scope

This card freezes structure only. It does not invent real product fields, enum values, business IDs, product names, store names, account names, or default values that the user has not provided.

User-authorized product master data and channel data can enter PLS in full. Whether a source field is promoted into a model feature, BI display field, `ProfileTagScore`, or `unmappedFields` depends on the mappings below.

## Shared Rules

### Identity And Lineage

All P2 product/channel records must carry traceable import metadata.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `workspaceId` | string | yes | Workspace boundary from A domain. |
| `sourceId` | string | yes | `product_master`, `channel_profile`, or concrete registered data source. |
| `sourceBatchId` | string | yes | Import batch id. |
| `dataVersion` | string | yes | Business data version. |
| `generatedAt` | string | yes | ISO 8601. |
| `timeWindow` | string | conditional | Required for performance/profile snapshots; optional for static master rows. |
| `sourceType` | enum | yes | `user_authorized`, `mock`, `manual_mapping`, `derived`. |
| `qualityFlags` | string[] | yes | Empty array allowed. |
| `upsertKey` | object | yes | `{ fields: string[], hash: string }`; hash must be row-value based. |

### Taxonomy Boundary

No new `tagId` is introduced by D-P2-2. Any mapped profile tag must use `docs/profile-taxonomy-v0.md` only:

- `demo.*`
- `style.*`
- `price.*`
- `occasion.*`
- `intent.*`
- `channel.*`

Source labels that do not map to the current taxonomy must remain in `unmappedFields` with `reason`, `sourceField`, `sourceValue`, `recommendedHandling`, and confidence `0`.

### Field Usage Classes

Field dictionaries and API projections should mark each field with one of:

| Usage | Meaning |
|---|---|
| `identifier` | Business key or system key used to find/upsert rows. |
| `dimension` | Descriptive or categorical attribute for filtering/grouping. |
| `display_metric` | Business value meant for BI display. |
| `calculation_metric` | Numeric value used by model, scoring, ranking, or quality logic. |
| `asset_reference` | URI/path/hash/metadata for image, video, copy, or document assets. |
| `mapping_meta` | Mapping rule, confidence, owner, version, or unmapped reason. |

## ProductMaster

### Object Grain

Recommended grain:

```text
productMasterId = workspaceId + productId + productVariantId + dataVersion
```

`productId` may be SKU, SPU, style code, or another user-provided business key. The chosen key must be recorded in `sourceKeyPolicy`.

### Field Groups

**Identity**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `productMasterId` | string | yes | identifier | Stable PLS product master id. |
| `productId` | string | yes | identifier | Source product key, such as SKU/SPU/style code. |
| `productVariantId` | string | optional | identifier | Color/size/listing variant if provided. |
| `spuId` | string | optional | identifier | SPU or style group id. |
| `skuId` | string | optional | identifier | SKU id if separate from `productId`. |
| `sourceProductKey` | string | yes | identifier | Original source key field value. |
| `sourceKeyPolicy` | enum | yes | mapping_meta | `sku`, `spu`, `style_code`, `listing_id`, `composite_key`, `unknown`. |
| `productLifecycleStatus` | enum | optional | dimension | `new`, `active`, `seasonal_active`, `clearance`, `discontinued`, `unknown`. |
| `launchDate` | string | optional | dimension | Date if source provides it. |

**Category**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `categoryLv1` | string | yes | dimension | Source or mapped first-level category. |
| `categoryLv2` | string | optional | dimension | Source or mapped second-level category. |
| `categoryLv3` | string | optional | dimension | Source or mapped third-level category. |
| `categoryPath` | string[] | optional | dimension | Full source category path. |
| `brandName` | string | optional | dimension | User-authorized brand field. |
| `seriesName` | string | optional | dimension | Product line/series if provided. |
| `genderScope` | string | optional | dimension | Source business field; map to `demo.female`/`demo.male` only when semantically valid. |
| `ageScope` | string | optional | dimension | Source business field; map to `demo.*` only when semantically valid. |

**Price And Season**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `listPrice` | number | optional | display_metric | Real price may be retained if user-authorized. |
| `salePrice` | number | optional | display_metric | Real sale price may be retained. |
| `priceCurrency` | string | optional | dimension | Currency code if provided. |
| `priceBand` | enum | optional | calculation_metric | `value`, `mid`, `premium`, `unknown`; maps to `price.*` if used as tag. |
| `season` | string | optional | dimension | Source season value; do not invent enum. |
| `seasonBand` | enum | optional | dimension | `spring`, `summer`, `autumn`, `winter`, `all_season`, `unknown` when mapping is explicit. |
| `promotionPosition` | string | optional | dimension | Source promotion or launch position. |

**Selling Points, Material, Style, Scenario**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `sellingPoints` | string[] | optional | dimension | User-provided selling points. |
| `materialComposition` | object | optional | dimension | Preserve source composition fields. |
| `fabricType` | string | optional | dimension | Source or mapped material bucket. |
| `colorFamily` | string | optional | dimension | Source or mapped color family. |
| `fitType` | string | optional | dimension | Source fit/shape/版型. |
| `patternType` | string | optional | dimension | Source pattern bucket. |
| `styleKeywords` | string[] | optional | dimension | May map to `style.*` with confidence. |
| `scenarioKeywords` | string[] | optional | dimension | May map to `occasion.*` with confidence. |
| `intentKeywords` | string[] | optional | dimension | May map to `intent.*` with confidence. |
| `mappedProductTags` | `ProfileTagScore[]` | yes | calculation_metric | Empty array allowed; all tagIds must exist in taxonomy. |
| `unmappedProductFields` | object[] | yes | mapping_meta | Preserve source labels that cannot map to taxonomy. |

**Image, Copy, And Similar SKU Assets**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `assetRefs` | object[] | optional | asset_reference | Product image/video/copy references, with URI/path/hash/type/source. |
| `imageFeatureSummary` | object | optional | calculation_metric | Derived image features; no model-specific schema frozen here. |
| `copyFeatureSummary` | object | optional | calculation_metric | Derived copy/title features. |
| `similarProducts` | object[] | optional | calculation_metric | Similar SKU/SPU references with method, score, and source. |
| `rawBusinessFields` | object | optional | display_metric | Pass-through user-authorized source fields not modeled yet. |

### Minimal ProductMaster JSON Shape

```json
{
  "productMasterId": "<workspaceId>:<productId>:<productVariantId>:<dataVersion>",
  "workspaceId": "<workspaceId>",
  "productId": "<source product key>",
  "productVariantId": null,
  "sourceProductKey": "<source product key>",
  "sourceKeyPolicy": "sku",
  "categoryLv1": "<source or mapped category>",
  "priceBand": "unknown",
  "mappedProductTags": [],
  "unmappedProductFields": [],
  "assetRefs": [],
  "similarProducts": [],
  "rawBusinessFields": {},
  "sourceId": "product_master",
  "sourceBatchId": "<batch id>",
  "dataVersion": "<data version>",
  "generatedAt": "<iso timestamp>",
  "sourceType": "user_authorized",
  "qualityFlags": [],
  "upsertKey": { "fields": ["productMasterId", "dataVersion"], "hash": "<row-value-hash>" }
}
```

## ChannelEntity

### Object Grain

Recommended grain:

```text
channelEntityId = workspaceId + entityType + sourceEntityKey + dataVersion
```

`ChannelEntity` is the first-class channel anchor for P2. Platform is metadata; it must not be the only analysis axis.

### Entity Types

| `entityType` | Meaning | Example Coverage |
|---|---|---|
| `platform` | Platform-level rollup when source only provides platform data | Douyin, Tmall, JD, offline aggregate. |
| `shop` | Online shop or marketplace store | Tmall shop, Douyin shop, WeChat shop. |
| `account` | Social/content/ecommerce account | Douyin account, Xiaohongshu account. |
| `livestream_room` | Live room or live account entity | Douyin live room. |
| `content_account` | Content account distinct from shop | Short-video account, creator account. |
| `province` | Province-level offline/region entity | Province rollup. |
| `city` | City-level offline/region entity | City rollup. |
| `trade_area` | Business district/trade area | Mall/trade area. |
| `store` | Offline store | Physical store. |

### Field Groups

**Identity And Hierarchy**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `channelEntityId` | string | yes | identifier | Stable PLS channel entity id. |
| `entityType` | enum | yes | dimension | See entity types above. |
| `sourceEntityKey` | string | yes | identifier | Original source key or composite key. |
| `displayName` | string | optional | display_metric | User-authorized business display name. |
| `platformType` | enum | optional | dimension | `shelf_ecommerce`, `content_ecommerce`, `social_content`, `offline_retail`, `private_domain`, `other`, `unknown`. |
| `platformName` | string | optional | dimension | Source platform name. |
| `parentEntityId` | string | optional | identifier | For account -> shop, store -> trade area, city -> province. |
| `entityPath` | object[] | optional | dimension | Ordered hierarchy path. |
| `entityStatus` | enum | optional | dimension | `active`, `inactive`, `test`, `closed`, `unknown`. |

**Online Fields**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `shopId` | string | optional | identifier | Online shop/store id if provided. |
| `accountId` | string | optional | identifier | Account id if provided. |
| `accountKind` | string | optional | dimension | Source account type; do not force into taxonomy. |
| `contentFormat` | string[] | optional | dimension | Short video, live, shelf, notes, etc. |
| `channelTouchpointTags` | `ProfileTagScore[]` | yes | calculation_metric | Use existing `channel.*` only. Empty array allowed. |

**Offline Region And Store Fields**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `country` | string | optional | dimension | Usually source-provided. |
| `province` | string | optional | dimension | Required for province/city/store when available. |
| `city` | string | optional | dimension | Required for city/store when available. |
| `district` | string | optional | dimension | District/county if available. |
| `tradeArea` | string | optional | dimension | Business district. |
| `mallName` | string | optional | dimension | Mall/plaza name if provided. |
| `storeId` | string | optional | identifier | Offline store id. |
| `storeFormat` | string | optional | dimension | Source store format. |
| `geoLocation` | object | optional | dimension | Latitude/longitude/address fields if user provides them. |

**Profile And Performance Attachments**

| Field | Type | Required | Usage | Notes |
|---|---|---:|---|---|
| `profileTags` | `ProfileTagScore[]` | yes | calculation_metric | Channel/entity audience tags; all tagIds must exist in taxonomy. |
| `benchmarkTags` | object[] | optional | calculation_metric | Source top tags, gaps, benchmark deltas. |
| `performanceMetrics` | object | optional | display_metric | Sales, traffic, conversion, follower, interaction metrics; source values may be retained. |
| `unmappedProfileFields` | object[] | yes | mapping_meta | Source profile fields that cannot map to taxonomy. |
| `rawBusinessFields` | object | optional | display_metric | Pass-through user-authorized fields not modeled yet. |

### Minimal ChannelEntity JSON Shape

```json
{
  "channelEntityId": "<workspaceId>:<entityType>:<sourceEntityKey>:<dataVersion>",
  "workspaceId": "<workspaceId>",
  "entityType": "shop",
  "sourceEntityKey": "<source entity key>",
  "displayName": null,
  "platformType": "unknown",
  "platformName": null,
  "parentEntityId": null,
  "entityPath": [],
  "profileTags": [],
  "benchmarkTags": [],
  "performanceMetrics": {},
  "unmappedProfileFields": [],
  "rawBusinessFields": {},
  "sourceId": "channel_profile",
  "sourceBatchId": "<batch id>",
  "dataVersion": "<data version>",
  "generatedAt": "<iso timestamp>",
  "sourceType": "user_authorized",
  "qualityFlags": [],
  "upsertKey": { "fields": ["channelEntityId", "dataVersion"], "hash": "<row-value-hash>" }
}
```

## FieldMapping Template

`FieldMapping` records how source fields become PLS target fields. It supports both direct structural mapping and taxonomy mapping.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `mappingId` | string | yes | Stable mapping id. |
| `sourceId` | string | yes | Registered data source id. |
| `sourceBatchId` | string | yes | Batch id. |
| `dataVersion` | string | yes | Data version. |
| `sourceObject` | string | yes | Source table/sheet/file section. |
| `sourceField` | string | yes | Source field name. |
| `sourceValuePattern` | string | optional | Value pattern, bucket, regex, or enum. |
| `targetObject` | enum | yes | `ProductMaster`, `ChannelEntity`, `ProductProfile`, `PredictedProductProfile`, `ChannelProfile`, `DataQualityReport`. |
| `targetField` | string | yes | Target field path. |
| `targetUsage` | enum | yes | One of the field usage classes. |
| `mappingRule` | enum | yes | `direct`, `rename`, `derive`, `bucketize`, `taxonomy_map`, `passthrough`, `unmapped`. |
| `mappedTagId` | string | optional | Only when `mappingRule=taxonomy_map`; must exist in taxonomy. |
| `confidence` | number | yes | `0-1`. `unmapped` uses `0`. |
| `requiredFor` | string[] | yes | e.g. `api_read`, `model_prediction`, `matching`, `frontend_display`, `quality_report`. |
| `unmappedReason` | string | optional | Required when `mappingRule=unmapped`. |
| `recommendedHandling` | string | optional | Keep, review, map later, exclude from model, etc. |
| `owner` | string | yes | `D`, `X`, `A`, `M`, or `V`. |
| `version` | string | yes | Mapping version. |
| `notes` | string | optional | Additional context. |

CSV header:

```csv
mappingId,sourceId,sourceBatchId,dataVersion,sourceObject,sourceField,sourceValuePattern,targetObject,targetField,targetUsage,mappingRule,mappedTagId,confidence,requiredFor,unmappedReason,recommendedHandling,owner,version,notes
```

## DataQualityReport Template

`DataQualityReport` can be batch-level or object-level. P2 data management APIs should be able to display it without knowing source-specific internals.

```json
{
  "reportId": "<sourceId>:<sourceBatchId>:<dataVersion>:<scope>",
  "sourceId": "product_master",
  "sourceBatchId": "<batch id>",
  "dataVersion": "<data version>",
  "generatedAt": "<iso timestamp>",
  "scope": "batch",
  "objects": {
    "ProductMaster": { "rowCount": 0, "validRowCount": 0, "invalidRowCount": 0 },
    "ChannelEntity": { "rowCount": 0, "validRowCount": 0, "invalidRowCount": 0 }
  },
  "fieldCoverage": [
    {
      "object": "ProductMaster",
      "field": "productId",
      "required": true,
      "presentCount": 0,
      "missingCount": 0,
      "coverageRate": 0,
      "confidence": 0
    }
  ],
  "mappingCoverage": {
    "totalSourceFields": 0,
    "mappedFieldCount": 0,
    "unmappedFieldCount": 0,
    "taxonomyMappedFieldCount": 0,
    "coverageRate": 0,
    "averageMappingConfidence": 0
  },
  "qualityFlags": [],
  "blockingIssues": [],
  "warnings": [],
  "admissionPolicy": "user_authorized_full_passthrough"
}
```

Recommended quality flags:

| Flag | Meaning |
|---|---|
| `missing_required_identity` | Required identity key missing. |
| `duplicate_business_key` | Upsert/business key collision in one data version. |
| `low_field_coverage` | Required or important fields have low coverage. |
| `low_mapping_confidence` | Average mapping confidence below accepted threshold. |
| `taxonomy_unmapped_high` | Too many fields cannot map to current taxonomy. |
| `asset_reference_missing` | Product assets expected but absent. |
| `insufficient_profile_sample` | Profile sample size too low for model/matching. |
| `source_lineage_incomplete` | Missing source/batch/version/generatedAt lineage. |

## Input Boundaries

### ProductProfile

`ProductProfile` is the observed audience profile for a historical, active, or imported product. Its inputs may include:

- `ProductMaster` identity/category/style/material/price/asset fields.
- Buyer/viewer/cart profile tags from DMP or BI sources.
- Historical performance metrics by product/channel/timeWindow.
- `mappedProductTags` derived from product master fields.

It must not require predicted tags. It should preserve source lineage and unmapped fields.

### PredictedProductProfile

`PredictedProductProfile` is M domain output for a new or insufficient-history product. Its inputs are restricted to:

- `ProductMaster` fields available before launch.
- Optional similar-products references with source and confidence.
- Optional image/copy feature summaries.
- Existing taxonomy tags derived from ProductMaster.

It must not depend on post-launch buyer profile labels unless the product is explicitly being backtested.

### ChannelProfile

`ChannelProfile` is the audience/profile view for a `ChannelEntity`. Its inputs may include:

- `ChannelEntity` identity/hierarchy/platform/store/account fields.
- Account/shop/store/channel audience profile tags.
- Benchmark tags, performance metrics, and quality flags.
- Existing `douyin_*` BI assets if A-P2-3 decides to project them into generic channel profiles.

It should be entity-first: shop/account/store is the primary key, platform is only a dimension.

## Cross-Domain Handoff

| Domain | Can Use From This Draft | Must Not Do |
|---|---|---|
| D | Build import packages, mapping rules, quality reports, and taxonomy mapping. | Invent real product fields, source IDs, or unapproved tagIds. |
| A | Design source adapters, read APIs, upsert keys, import validation, and data-management projections. | Freeze DB schema without X review. |
| M | Define product/channel profile feature requirements and missing-field behavior. | Treat unmapped source labels as taxonomy tags. |
| V | Plan product master forms, channel entity drilldown, mapping/quality status displays. | Treat platform as the only channel axis. |

## Validation Checklist

- `ProductMaster` can represent SKU/SPU/style/listing variants and image/copy/similar-product references.
- `ChannelEntity` can represent online platform, shop, account, livestream/content account, and offline province/city/trade-area/store.
- All mapped tags use `docs/profile-taxonomy-v0.md`; no new `tagId` appears here.
- Field mapping records source field, target field, mapping rule, confidence, unmapped reason, owner, and version.
- Quality report records row counts, field coverage, mapping coverage, confidence, blocking issues, warnings, and lineage.
- D/M/A/V can distinguish `ProductMaster` inputs, observed `ProductProfile`, predicted `PredictedProductProfile`, and entity-first `ChannelProfile` inputs.

## Open Questions For X Review

- Whether `ProductMaster` and `ChannelEntity` should become physical top-level SQLite tables in A-P2-3/A-P2-9, or remain adapter projections over source-specific tables initially.
- Whether region hierarchy (`province` / `city` / `trade_area` / `store`) needs a controlled location dictionary before real offline data arrives.
- Whether `priceBand`, `seasonBand`, and channel `platformType` enums should be frozen globally by X or remain D-domain mapping outputs until real source samples arrive.
