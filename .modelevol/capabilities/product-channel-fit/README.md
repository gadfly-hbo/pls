# PLS Runtime: Product Channel Fit

## Required Env

Formal ModelEvol-backed runtime must set:

```bash
export SINGLE_PRODUCT_PORTRAIT_MODEL_PATH=/Users/huangbo/Dev/ModelEvol/capabilities/product-channel-fit/artifacts/v0.4-2026-07-11-expanded-temporal-holdout/model-v0.4-20260711-expanded-temporal-holdout.json
```

## Rule

- Do not manually update PLS `model-calibrated.json` as the formal model source.
- PLS default model path is fallback / legacy only.
- Missing `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` means the run is not a formal ModelEvol-backed runtime.

## Validate

```bash
cd /Users/huangbo/Dev/Projects/pls/apps/model
SINGLE_PRODUCT_PORTRAIT_MODEL_PATH=/Users/huangbo/Dev/ModelEvol/capabilities/product-channel-fit/artifacts/v0.4-2026-07-11-expanded-temporal-holdout/model-v0.4-20260711-expanded-temporal-holdout.json npm run single-product-portrait-supervised-contract-test
SINGLE_PRODUCT_PORTRAIT_MODEL_PATH=/Users/huangbo/Dev/ModelEvol/capabilities/product-channel-fit/artifacts/v0.4-2026-07-11-expanded-temporal-holdout/model-v0.4-20260711-expanded-temporal-holdout.json npm run single-product-portrait-supervised-smoke
npm run typecheck
```
