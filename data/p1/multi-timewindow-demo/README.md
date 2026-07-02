# P1 Multi-TimeWindow Demo Wide Table

> Owner: D data profile domain
> Task: D-P1-A2
> Batch: `batch_p1_multi_timewindow_demo_20260702`
> Status: mock aggregate cutoff smoke input

## Purpose

This package provides a multi `timeWindow` wide table for P1 cutoff backtest smoke work. It is generated from the existing P0 mock aggregate fixture because D-P1-A1 has no real raw staging input in this workspace.

## Files

| File | Purpose |
|---|---|
| `wide_table.jsonl` | 36 rows at `skuId + channelId + timeWindow` grain |
| `quality_report.json` | Batch-level quality summary |
| `field_mapping.csv` | Output field lineage for D-P1-A2 |
| `untrainable_rows.jsonl` | Rows excluded from training, empty when all rows are trainable |
| `redline_scan_report.json` | Compatibility admission summary; privacy blocking is disabled |

## Dataset Shape

- SKU count: 3
- Channel count: 4
- Time windows: `2026-03-01/2026-03-31`, `2026-04-01/2026-04-30`, `2026-05-01/2026-05-31`
- Wide table rows: 36
- Source type: `mock`

## Boundaries

- This package is mock cutoff smoke input; user-authorized real raw files, DMP members, user/order/member/device/account rows, and ID package data are allowed elsewhere in PLS.
- Amount-like values in this mock package remain normalized as `gmvIndex`, `trafficIndex`, rates, and price bands.
- This is suitable for M-P1-A3 cutoff smoke only. It must not be represented as a completed real-sample ingestion run.
