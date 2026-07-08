# What Changed

- Implemented dedicated single-product portrait prediction API routes under `/api/v0/single-product-portrait/*` in `apps/server/src/routes/single-product-portrait.ts`.
- Added `GET /api/v0/single-product-portrait/metadata` returning `modelAvailable`, `fitTypes`, `requiredColumns`, `maxBatchRows`, `maxFileBytes`, `modelVersion`, `trainedAt`, `sampleCount`, `riskFlags`, and `metricsSummary`; returns 200 with `modelAvailable: false` and `error.code = "model_not_available"` when the model file is missing.
- Added `POST /api/v0/single-product-portrait/predict` for single-row clean input; returns `400` with `code: "bad_request"` and inner `error.code`/`field`/`rawValue` for validation errors or `model_not_available`.
- Added `POST /api/v0/single-product-portrait/predict/batch/preview` and `POST /api/v0/single-product-portrait/predict/batch` for `.xlsx` and `.csv` batch preview/execute; preview and execute share the same parsing/validation logic.
- Added batch file parsing and validation in `apps/server/src/lib/single-product-portrait/batch.ts`: file type, size (2 MB), required columns, empty file, 100-row limit, extra columns, duplicate SKU warnings, and row-level required/length/unknown-fit-type errors.
- Added prediction service wrapper in `apps/server/src/lib/single-product-portrait/prediction.ts` importing `buildSingleProductPortraitModelMetadata`, `predictSingleProductPortraitFromCleanInput`, and error types from `apps/model/src/single-product-portrait-supervised.ts` and `SingleProductPortraitPrediction` from `apps/model/src/single-product-portrait.ts`.
- Registered the new router in `apps/server/src/index.ts` at `/api/v0/single-product-portrait`.
- Added `xlsx: ^0.18.5` to `apps/server/package.json` to match `apps/model` version.
- Renamed existing tool smoke to `smoke:single-product-portrait-tool` and made `smoke:single-product-portrait` point to the new API smoke test.
- Added self-contained API smoke test `apps/server/scripts/smoke-single-product-portrait-api.mjs` that starts its own server instances, tests model-available and model-unavailable states, single prediction, `.xlsx`/`.csv` batch preview/execute, file-level errors, row-level errors, warnings, and 0-valid-row execute.
- Fixed review item: batch preview now surfaces `model_not_available` in `fileErrors` when the model file is missing, so the caller receives an actionable error even though the file itself parses successfully.
- Fixed review item: batch execute response shape now includes `fileErrors`; model-unavailable execute returns `fileErrors` containing `model_not_available` alongside `successCount: 0` and `failureCount: <totalRows>`.
- Expanded API smoke test to cover batch preview and execute under `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` missing.
- Fixed a cross-package `noUncheckedIndexedAccess` type error in `apps/model/src/single-product-portrait-supervised.ts` by adding a non-null assertion on `matrix[0]` in `transpose()`.
- Updated `docs/notes-app.md` with T0002 status and validation results.

# Files Changed

- `apps/server/src/routes/single-product-portrait.ts` (new)
- `apps/server/src/lib/single-product-portrait/prediction.ts` (new)
- `apps/server/src/lib/single-product-portrait/batch.ts` (new)
- `apps/server/src/index.ts`
- `apps/server/package.json`
- `apps/server/scripts/smoke-single-product-portrait-api.mjs` (new)
- `apps/server/scripts/smoke-single-product-portrait-tool.mjs` (renamed from `smoke-single-product-portrait.mjs`)
- `apps/server/tsconfig.json`
- `apps/model/src/single-product-portrait-supervised.ts`
- `docs/notes-app.md`
- `.agentops/tasks/T0002-single-product-portrait-api/handoff.md` (this file)

# Validation

- `cd apps/server && npm run typecheck` passed.
- `cd apps/server && npm run smoke:single-product-portrait` passed 70/70.
- `cd apps/server && npm run smoke:single-product-portrait-tool` passed 39/39 against a running server (regression check for the existing tool route).
- `cd apps/model && npm run typecheck` passed.

# Risks

- The API smoke test spawns its own server via `node --import tsx src/index.ts` on a random port and polls `/health`; it assumes the default `npm start` start-up time is within ~30 seconds. If the environment is slower or port collisions occur, the smoke may need a longer timeout or an explicit port check.
- Batch file type detection is based on filename extension (`.xlsx` / `.csv`); files with mismatched extensions or malformed content produce `file_parse_failed` rather than `unsupported_file_type`.
- The `.xlsx` parser reads the first sheet only, as required. Extra sheets are silently ignored.
- Duplicate SKU warnings are stored on the duplicate row only; both rows are still considered valid and predicted in execute.
- The model path is resolved from the server environment (`SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`) or the default repo path; API requests cannot pass an arbitrary model path, preventing local file traversal.
- No database writes or admin operations are performed; this matches the first-phase scope.

# Open Questions

- None for this task. V-domain should now consume the dedicated API endpoints (not the tool route) for the single-product-portrait UI and align mock data to the documented metadata/predict/batch response shapes.
