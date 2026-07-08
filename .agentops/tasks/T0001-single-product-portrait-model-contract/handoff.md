# What Changed

- Added server-importable supervised portrait metadata contract in `apps/model/src/single-product-portrait-supervised.ts`.
- Added `buildSingleProductPortraitModelMetadata()` returning stable metadata fields: `modelAvailable`, `fitTypes`, `requiredColumns`, `maxBatchRows`, `maxFileBytes`, `modelVersion`, `trainedAt`, `sampleCount`, `riskFlags`, and `metricsSummary`.
- Added `predictSingleProductPortraitFromCleanInput()` for single-row clean input prediction with `{ skuId, fitType, fabric, fab }`.
- Added `SingleProductPortraitModelUnavailableError` with `code = "model_not_available"` for A-domain prediction error mapping.
- Added default model path resolution and env override: default `data/local/single-product-portrait-q2-73sample/model.json`, override `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`.
- Added `fitTypes` to the trained model object, sourced from training samples and available to metadata from the model artifact.
- Kept `SingleProductPortraitPrediction` output on the supervised model version, 6 target dimensions, top labels, evidence, risk flags, and closed dimension top-N renormalization.
- Expanded the supervised contract test to cover metadata, `fitTypes`, missing model boundary, clean input prediction service, 6-dimension prediction structure, top labels, evidence, risk flags, and `modelVersion`.
- Documented the server import contract and metadata field sources in `apps/model/README.md` and `docs/notes-model.md`.

# Files Changed

- `apps/model/src/single-product-portrait-supervised.ts`
- `apps/model/src/single-product-portrait-supervised-contract-test.ts`
- `apps/model/README.md`
- `docs/notes-model.md`
- `.agentops/tasks/T0001-single-product-portrait-model-contract/handoff.md`

# Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run single-product-portrait-supervised-contract-test` passed with `ok: true` and `failures: []`.
- `cd apps/model && npm run single-product-portrait-supervised-smoke` passed. Smoke loaded 73 samples, trained `single-product-portrait-supervised-ridge-0.1`, ran 73 LOO folds, and emitted prediction summaries for all 6 target dimensions.

# Risks

- `metricsSummary` is the frozen Q2 73-sample LOO summary from the current model module, not recomputed on every metadata call. This avoids heavy metadata requests but means it must be updated if the model is retrained with materially different data or metrics.
- Existing `model.json` files generated before this change may not contain `fitTypes`; the helper falls back to model feature names in that case. Newly trained models write `fitTypes` directly.
- The default path resolves from the model source file to repo-root `data/local/single-product-portrait-q2-73sample/model.json`. A domain can override with `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`; API requests should not expose arbitrary path input.
- Current model evidence and metrics remain bounded by 73-sample LOO validation only; no time-split generalization claim.

# Open Questions

- None for this task. A domain should import `buildSingleProductPortraitModelMetadata`, `predictSingleProductPortraitFromCleanInput`, `SingleProductPortraitModelUnavailableError`, `CleanSingleProductPortraitInput`, and `SingleProductPortraitModelMetadata` from `apps/model/src/single-product-portrait-supervised.ts`.
