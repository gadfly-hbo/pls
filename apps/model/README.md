# PLS Model Baseline

M-P0-B3 runnable baseline for demo-only product profile prediction and product x channel matching.

## Commands

Run from `apps/model/`:

```bash
npm run predict -- --sku mock_sku_101
npm run match -- --sku mock_sku_101
npm run backtest
npm run backtest:cutoff
npm run backtest:panel
npm run segment-calibration
npm run token-governance
npm run contract-test
npm run account-fit-contract-test
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

`npm run backtest:panel` emits the same cutoff report with stratified slices for `categoryLv2`, `channelType`, and `sampleSizeBucket`.

## P1 Model Quality Reports

- `npm run segment-calibration` reports whether current segment template weights should change. With the current mock, low-SKU input it keeps the existing X-approved weights.
- `npm run token-governance` classifies structural tokens, D/X review candidates, and unknown business tokens without expanding taxonomy.

## P1-E Account Fit Adapter

`src/account-fit.ts` defines the stable `AccountFitAdapterInput` / `AccountFitDiagnostic` interface for Douyin account-product fit. Until the user provides the formal fit formula, `diagnoseAccountFit` uses an explainable rule baseline and always emits `algorithm_pending_user_formula`.

Replacement point after the formula is provided: keep exported input/output interfaces stable and replace only the scoring internals inside `diagnoseAccountFit`.

Contract test:

```bash
npm run account-fit-contract-test
```

## P2 Product Channel Fit Contract

`src/product-channel-fit.ts` defines `ProductChannelFit` and `FitExplanation` for entity-first product x channel explanation panels. It freezes matched/conflict/missing/low-confidence tag explanations, risk flags, confidence, and legacy score handling. Until the formal fit formula is provided, it always emits `algorithm_pending_user_formula`.

Contract coverage is included in:

```bash
npm run contract-test
```

## P2 New Product Prediction Contract

`src/new-product-prediction.ts` defines `PredictedProductProfile` for D-P2-7 `ProductMaster` inputs. The baseline uses only pre-launch mapped product tags, similar products, lineage, and quality metadata. It is not a trained model and always emits `baseline_not_trained_model`.

`toProductChannelFitProfile()` bridges the prediction output into the P2 `ProductChannelFit` chain.

## C3 Follow-Up

See `../../docs/model-c3-prep.md` for `unmappedInputTokens` handling, P1 time-split data requirements, and A adapter contract test expectations.
