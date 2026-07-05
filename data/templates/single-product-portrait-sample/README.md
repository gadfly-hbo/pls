# Single Product Portrait Sample Package Template

> Owner: D data profile domain  
> Task: D-P5-PORTRAIT-3  
> Status: P5 portrait sample package template  
> Last updated: 2026-07-05

## Purpose

This template freezes the standard package shape for adding 5-20 real single-product portrait samples. The goal is to make M-P5-PORTRAIT-7 rule calibration consume validated package data instead of scattered local Downloads files.

The package keeps product attributes and platform portrait rows together. A portrait sample without traceable `skuId` or `sourceProductKey` and product attributes is invalid.

## Package Structure

```text
single_product_portrait_sample_package/
  source_manifest.json
  product_attributes.jsonl
  platform_portrait.csv
  field_mapping.csv
  quality_report.json
  report.md
```

## Core Objects

`ProductAttributes` keeps the minimum input required by `docs/single-product-portrait-algorithm-contract.md`:

```json
{
  "skuId": "mock_sku_portrait_001",
  "sourceProductKey": "mock_style_001",
  "gender": "女",
  "category": "长袖T恤",
  "source": "mock_single_product_portrait_sample",
  "sourceType": "mock_sample",
  "sourceBatchId": "mock_portrait_sample_batch_20260705",
  "dataVersion": "v_mock_20260705",
  "timeWindow": "2026-06-01/2026-06-30",
  "qualityFlags": ["mock_sample"]
}
```

`platform_portrait.csv` keeps the platform-returned portrait shape:

```csv
skuId,sourceProductKey,labelType,label,share,tgi,source,sourceType,sourceBatchId,dataVersion,timeWindow,qualityFlags
mock_sku_portrait_001,mock_style_001,预测性别,女,0.72,128.4,mock_single_product_portrait_sample,mock_sample,mock_portrait_sample_batch_20260705,v_mock_20260705,2026-06-01/2026-06-30,mock_sample
```

`share` uses a 0-1 decimal. `tgi` may be blank when platform benchmark is unavailable; it must not be replaced by `0`.

## Label Type Set

The package-level allowed platform label types are declared in `source_manifest.json.allowedLabelTypes`. The sample uses the first-phase core display dimensions from `docs/p5-portrait-baseline-acceptance.md`:

- `预测性别`
- `预测年龄段`
- `八大消费群体`
- `预测消费能力`
- `城市等级`
- `抖音视频观看兴趣分类`

Future real packages may include additional long-tail platform dimensions only after adding them to `allowedLabelTypes` and documenting display handling in `report.md`. This does not create PLS taxonomy `tagId`.

## Validation

Run:

```bash
node data/templates/single-product-portrait-sample/scripts/validate-single-product-portrait-sample.mjs data/templates/single-product-portrait-sample/sample_package
```

The validator checks required files, product required fields, portrait CSV row structure, label type set, abnormal row counts, sample counts, `source/timeWindow` lineage, and quality report consistency.

## M-P5-PORTRAIT-7 Consumption

M-P5-PORTRAIT-7 should consume this package as calibration input:

- Join `platform_portrait.csv` to `product_attributes.jsonl` by `skuId + sourceProductKey`.
- Use product fields as rule features and platform portrait rows as calibration targets.
- Treat `qualityFlags` and `quality_report.json` as gating metadata.
- Require at least 5 valid product samples with portrait rows before claiming small-sample calibration readiness.

## Not Implemented

This template does not connect to production platforms or SQL, does not import into `ws_demo`, does not add taxonomy tags, and does not invent real portraits, product attributes, or platform benchmark data.
