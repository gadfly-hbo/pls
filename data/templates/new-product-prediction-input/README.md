# New Product Prediction Input Template

> Owner: D data profile domain  
> Task: D-P2-7  
> Status: P2 input template draft, pending X review  
> Last updated: 2026-07-03

## Purpose

This folder freezes the P2 new-product prediction input template before the user provides concrete product master fields. It lets D/M/A proceed on the prediction contract without inventing source IDs, enums, product names, or business default values.

## Files

| File | Purpose |
|---|---|
| `new_product_prediction_input.schema.json` | JSON Schema draft for template structure. Template mode allows `null` values. |
| `new_product_prediction_input.template.json` | Empty template using `null`, `[]`, and `{}` only for user-provided fields. |
| `field_mapping.template.csv` | Source-field to target-field mapping template for D/A import work. |
| `quality_report.template.json` | Quality report template for missing, conflict, unmappable, and low-confidence checks. |
| `scripts/validate-new-product-prediction-template.mjs` | Local validator for files, structure, tag IDs, mapping header, and no fake business values. |

## Field Groups

Required when real input arrives:

- `productMaster.identity`: workspace/product/source identity and lifecycle fields.
- `productMaster.category`: at minimum `categoryLv1` or equivalent mapped category.
- `productMaster.lineage`: `sourceId`, `sourceBatchId`, `dataVersion`, `generatedAt`, `sourceType`.

Optional but model-usable:

- `productMaster.priceAndSeason`: price, price band, season, promotion position.
- `productMaster.sellingPoints`: selling points and copy feature summary.
- `productMaster.material`: material, fabric, color, fit, pattern.
- `productMaster.styleAndScenario`: style, scenario, intent keywords, mapped tags, unmapped fields.
- `productMaster.assets`: image/video/copy asset references and derived image summary.
- `productMaster.similarProducts`: similar SKU/SPU references with method, score, and source in real input.

Enhancement fields:

- `assets.imageFeatureSummary`
- `sellingPoints.copyFeatureSummary`
- `similarProducts.similarProducts`

These improve baseline quality but must not be hard prerequisites for P2 contract work.

## Mapping Boundary

Allowed:

- User-authorized product master fields and values.
- Real product IDs, prices, materials, selling points, and asset references after user provides them.
- Mapping into existing taxonomy namespaces only: `demo`, `style`, `price`, `occasion`, `intent`, `channel`.

Not allowed in this template:

- Fake SKU/SPU/product IDs.
- Fake source enum values or default business values.
- New `tagId` values not present in `docs/profile-taxonomy-v0.md`.
- Post-launch buyer profile labels or sales feedback as required inputs, unless the run is explicitly marked as backtest.

## Quality Rules

Missing:

- `missing_required_identity`
- `missing_required_category`
- `source_lineage_incomplete`
- `asset_reference_missing`
- `similar_product_reference_missing`

Conflict:

- `conflicting_product_identity`
- `conflicting_price_fields`
- `conflicting_category_path`

Unmappable:

- `unmapped_required_field`
- `taxonomy_unmapped_high`
- `unapproved_tag_id`

Low confidence:

- `low_mapping_confidence`
- `low_similar_product_confidence`
- `low_asset_feature_confidence`

## Validate

```bash
node data/templates/new-product-prediction-input/scripts/validate-new-product-prediction-template.mjs
```

The validator ensures:

- Required files exist and parse.
- Template carries all required field groups.
- User-provided business fields are `null`, `[]`, or `{}` in template mode.
- Mapping CSV header is complete.
- Quality report has missing/conflict/unmappable/low-confidence rule groups.
- Any explicit `mappedProductTags[].tagId` exists in `docs/profile-taxonomy-v0.md`.

## Downstream Use

- D can turn user source fields into this object plus `field_mapping` and `quality_report`.
- M can define baseline feature extraction over `ProductMaster` fields, `mappedProductTags`, `similarProducts`, and asset summaries.
- A can expose an input validation API and persist import versions without knowing source-specific field names.
