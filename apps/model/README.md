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

## P5-PORTRAIT Single Product Portrait Mapping Baseline

`src/single-product-portrait.ts` implements a rule-driven, explainable baseline that maps a single product's attributes (gender, category, fit, fabric, FAB, IP/collaboration, function) to a platform-style portrait table with `labelType / label / share / TGI`.

Input truth (user-provided local files):

- `/Users/huangbo/Downloads/单款信息表.xlsx` — 103 product rows, 25 attribute fields.
- `/Users/huangbo/Downloads/10A326100109画像数据（单款商品人群画像）.csv` — single-anchor platform portrait, 25 dimensions.

Run smoke:

```bash
npm run single-product-portrait-smoke
```

Run contract tests:

```bash
npm run single-product-portrait-contract-test
npm run single-product-portrait-calibration-contract-test
```

CLI:

```bash
# all 103 products
npm run single-product-portrait

# single SKU
npm run single-product-portrait -- --sku 101524108206

# custom paths
npm run single-product-portrait -- --xlsx /path/to/单款信息表.xlsx --csv /path/to/10A326100109画像数据.csv --output /tmp/portrait.json
```

Output:

- `SingleProductPortraitPrediction` with `platformPortraitRows`, `dimensionSummaries`, `explanationSources`, `riskFlags`.
- Fixed risk flags: `baseline_not_trained_model`, `single_anchor_only`, `manual_rule_weight`.
- `csv_source_row_anomaly` is reported because the source CSV has one malformed 6-field row.
- Optional `plsBridge` maps whitelisted platform labels to existing PLS `profile-taxonomy-v0.md` tagIds; unmapped labels are reported explicitly.

Limitations:

- Only one product (`10A326100109`) has a real platform portrait, so this is a single-anchor rule baseline, not a trained model.
- TGI values are `null` when no platform population benchmark is available.
- PLS bridge coverage is intentionally low because most platform long-tail labels are not mapped to the P0 taxonomy.
- The anchor SKU is not present in the 103-row product table, so the run reports `anchor_product_attributes_missing`.

## M-P5-PORTRAIT-7 Rule Weight Calibration Framework

`src/single-product-portrait-calibration.ts` implements a small-sample, leave-one-out validation framework for rule weights. It consumes the D-P5-PORTRAIT-3 sample package format (`source_manifest.json`, `product_attributes.jsonl`, `platform_portrait.csv`, `quality_report.json`) and reports per-dimension metrics.

Run calibration:

```bash
# default mock/sample package (will report not_enough_labeled_samples)
npm run single-product-portrait-calibrate

# synthetic 5-sample fixture (exercises the framework)
npm run single-product-portrait-calibrate -- --package ../../data/demo/single-product-portrait-calibration-synthetic-5sample
```

Run smoke:

```bash
npm run single-product-portrait-calibration-smoke
```

Weight config:

- `src/single-product-portrait-weights.ts` exposes `SingleProductPortraitRuleWeights` and `defaultSingleProductPortraitRuleWeights()`.
- All baseline scalar weights are configurable without changing rule logic:
  - gender prior (`femalePrior`, `neutralPrior`) and evidence weight
  - age / spending / city / consumer-group / life-stage base distributions and boosts
  - interest mapping weights
  - IP/function rule weights
  - fit->age rule weights (`fitToAgeRules`)
  - anchor weak-prior multiplier
- Pass custom weights via `SingleProductPortraitInput.options.weights` or `runSmallSampleRuleCalibration({ weights })`.

Metrics:

- `anchorTopLabelOverlap@3`: held-out top-3 actual vs predicted label overlap per dimension.
- `dimensionCoverageRate`: predicted dimensions / actual dimensions.
- `closedDimensionMassError`: deviation of closed-dimension share sums from 1.
- `evidenceCoverageRate`: fraction of predicted rows with evidence.
- `bridgeCoverageRate`: fraction of platform labels mapped to PLS taxonomy.

Gating:

- If fewer than 5 valid samples are available, the framework returns `status: "not_enough_labeled_samples"` and does **not** emit aggregate metrics.
- `mock_sample` packages are explicitly flagged and never treated as real calibration evidence.
- `baseline_not_trained_model` is preserved; the framework does not train neural networks.

## P5-PORTRAIT Supervised Phase (Q2 真实样本)

`src/single-product-portrait-supervised.ts` trains per-dimension Ridge regressions from `版型 / 面料 / FAB` to platform portrait label shares, using the 73 Q2 labeled products.

Data preparation:

```bash
npm run single-product-portrait-train
```

This reads the user-provided files and writes a standard sample package plus `model.json` to `data/local/single-product-portrait-q2-73sample/`.

Train + evaluate (LOO):

```bash
npm run single-product-portrait-train
npm run single-product-portrait-eval
```

Train with per-dimension temperature calibration (recommended):

```bash
npm run single-product-portrait-train-calibrated
# outputs model-calibrated.json with learned temperatures
```

The backend now loads `model-calibrated.json` by default. The baseline `model.json` is still produced by `single-product-portrait-train` if you need it.

Predict a new product:

```bash
npm run single-product-portrait-predict-supervised -- \
  --sku NEW_SKU \
  --fit 修身型 \
  --fabric 全棉 \
  --fab "修身显瘦通勤T恤，舒适亲肤"
```

Server import contract:

- Import `buildSingleProductPortraitModelMetadata()` to serve metadata. It returns `modelAvailable: false` with `error.code = "model_not_available"` when `model.json` is missing or unreadable.
- Import `predictSingleProductPortraitFromCleanInput()` for single-row clean input prediction with `{ skuId, fitType, fabric, fab }`. It throws `SingleProductPortraitModelUnavailableError` with `code = "model_not_available"` when the model cannot be loaded.
- Default model path is `data/local/single-product-portrait-q2-73sample/model.json`, resolved from the repo root by the model module.
- Server-side override uses `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`; API requests must not pass arbitrary local model paths.
- Metadata includes `modelAvailable`, `fitTypes`, `requiredColumns`, `maxBatchRows`, `maxFileBytes`, `modelVersion`, `trainedAt`, `sampleCount`, `riskFlags`, and `metricsSummary`.

Batch predict from an Excel with `款号 / 版型 / 面料 / FAB` columns:

```bash
# baseline model
npm run single-product-portrait-predict-batch -- \
  --input /Users/huangbo/Downloads/Q1商品信息.xlsx \
  --output /tmp/q1_portrait_predictions.json \
  --topN 3

# calibrated model
npm run single-product-portrait-predict-batch -- \
  --input /Users/huangbo/Downloads/Q1商品信息.xlsx \
  --model ../../data/local/single-product-portrait-q2-73sample/model-calibrated.json \
  --output /tmp/q1_portrait_predictions_calibrated.json \
  --topN 3
```

Input fields:

- `fitType`: 版型. Missing values are imputed as `X型`.
- `fabric`: 面料.
- `fab`: FAB 综合描述.

First-phase target dimensions:

- `预测性别`
- `预测年龄段`
- `预测消费能力`
- `城市等级`
- `八大消费群体`
- `预测人生阶段`

Feature engineering:

- `版型` is one-hot encoded after category normalization (`修身/紧身/收腰/X型` -> slim, `宽松/阔腿/直筒` -> loose, etc.).
- `面料` and `FAB` are keyword-matched against fabric, style, function, and scene dictionaries.
- Cross-field combination features are generated for frequent pairs (`fit_xxx × style_xxx`, `fit_xxx × func_xxx`, `fabric_xxx × style_xxx`, etc.), filtered by minimum frequency to control dimensionality.

Model:

- Closed-form Ridge regression per label per dimension.
- Feature standardization before fitting; intercept computed on original scale.
- Closed dimensions renormalize to sum 1 after top-N slicing.

Evaluation uses leave-one-out on the 73 samples and reports:

- `top1OverlapMean` / `top3OverlapMean`
- `closedDimensionMassErrorMean`
- Per-dimension `top1Overlap`, `top3Overlap`, `massError`

Current LOO results (after keyword expansion + temperature calibration + combination features):

| Dimension | top1 overlap | top3 overlap |
|---|---|---|
| 预测性别 | 95.9% | 100.0% |
| 预测人生阶段 | 87.7% | 100.0% |
| 预测年龄段 | 72.6% | 79.0% |
| 预测消费能力 | 71.2% | 100.0% |
| 城市等级 | 41.1% | 74.0% |
| 八大消费群体 | 31.5% | 81.7% |

Risk flags:

- `baseline_not_trained_model`
- `small_sample_supervised_model`
- `no_temporal_validation`

Limitations:

- 73 samples with LOO validation only; no time-split or holdout generalization claim.
- TGI is `null` because no platform population benchmark is available.
- The model is interpretable but high-cardinality dimensions (城市等级, 八大消费群体) are noisy with this sample size.

Run tests:

```bash
npm run single-product-portrait-supervised-contract-test
npm run single-product-portrait-supervised-smoke
```

Evaluate against real held-out portraits (Q1 10-sample example):

```bash
npm run single-product-portrait-predict-batch -- \
  --input /Users/huangbo/Downloads/Q1商品信息.xlsx \
  --output /Users/huangbo/Desktop/Q1画像预测结果.json \
  --topN 3

npm run single-product-portrait-q1-eval -- \
  --predictions /Users/huangbo/Desktop/Q1画像预测结果.json
```

Suggest keyword dictionary expansions from Q1/Q2 corpus:

```bash
npm run single-product-portrait-keyword-suggest
```

## C3 Follow-Up

See `../../docs/model-c3-prep.md` for `unmappedInputTokens` handling, P1 time-split data requirements, and A adapter contract test expectations.
