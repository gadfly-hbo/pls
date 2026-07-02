# PLS Model Baseline

M-P0-B3 runnable baseline for demo-only product profile prediction and product x channel matching.

## Commands

Run from `apps/model/`:

```bash
npm run predict -- --sku mock_sku_101
npm run match -- --sku mock_sku_101
npm run backtest
npm run backtest:cutoff
npm run contract-test
npm run validate-tags
npm run typecheck
```

## Scope

- Reads only `data/demo/*.jsonl` and `docs/profile-taxonomy-v0.md`.
- Emits `ProductProfileDraft` and `ChannelMatchDraft[]` aligned with `docs/p0-integration-review.md §4.1`.
- Uses rule + kNN baseline; LightGBM is intentionally not required for P0 MVP.
- Does not persist results. A domain owns IDs, storage, recommendation mapping, risks, and audit.

## Demo Limitation

The demo wide table has 12 rows and one time window, so `backtest` uses leave-one-SKU-out evaluation and reports `demo_only_leave_one_sku_out` instead of a production time split.

## P1 Cutoff Backtest

`npm run backtest:cutoff` reads `data/p1/multi-timewindow-demo/wide_table.jsonl`, trains on windows earlier than the cutoff, and validates on the cutoff window. The default cutoff is the latest available `timeWindow`; override with:

```bash
npm run backtest -- --mode cutoff --cutoff 2026-05-01/2026-05-31
```

The current D-P1-A2 input is mock aggregate smoke data, so the report must not be represented as real-sample generalization evidence.

## C3 Follow-Up

See `../../docs/model-c3-prep.md` for `unmappedInputTokens` handling, P1 time-split data requirements, and A adapter contract test expectations.
