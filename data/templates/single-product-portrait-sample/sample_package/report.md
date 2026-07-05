# Mock Single Product Portrait Sample Package

## Purpose

This package is a contract-only `mock_sample` for D-P5-PORTRAIT-3. It demonstrates how future real single-product portrait samples should bind product attributes to platform portrait rows.

## Contents

- Product attribute rows: 1
- Platform portrait rows: 6
- Label types: `预测性别`, `预测年龄段`, `八大消费群体`, `预测消费能力`, `城市等级`, `抖音视频观看兴趣分类`
- Time window: `2026-06-01/2026-06-30`
- Source type: `mock_sample`

## Consumption By M-P5-PORTRAIT-7

M-P5-PORTRAIT-7 should join `product_attributes.jsonl` and `platform_portrait.csv` by `skuId + sourceProductKey`. Product attributes are rule features; platform portrait rows are calibration targets.

## Readiness

This package has 1 valid mock product sample. Small-sample rule calibration still needs at least 5 real valid product samples, so 4 additional real samples are still required before claiming small-sample calibration readiness.

## Boundaries

This sample does not represent real business conclusions, does not add taxonomy tags, does not include platform benchmark truth, and must not be imported into the main workspace.
