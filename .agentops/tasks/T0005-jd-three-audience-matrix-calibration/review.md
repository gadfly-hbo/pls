# Review

Decision: approved

## Notes

Approved T0005 after revision. Reviewed the latest diff and handoff against allowed paths. The requested fixes are complete: deriveJdTargetCalibratedMatrix deterministically derives the matrix from portable fixtures, normalized business targets, fixed priors/adjustable rows, and a documented minimum-L2 tie-break; the reusable module no longer depends on Downloads paths; the order test now uses a real reverse; docs distinguish business-target calibration from accuracy validation and disclose non-identifiability. Controller reran apps/model typecheck and jd-three-audience-calibration-contract-test (4 fixtures, failures=[]), and independently verified repeat derivation/frozen matrix delta=0, all weights in [0,1], 2025 max target delta≈1.34e-13, 2026 max target delta≈4.02e-14. 2024 remains unvalidated because source ten-segment data is absent and is accepted only as a documented risk. Existing out-of-scope dirty diffs are not accepted as T0005 deliverables. Memory Candidate was reviewed but not promoted; memory maintenance was not requested.

## Out Of Scope Diffs

- CONTEXT.md
- apps/model/README.md
- apps/model/src/cli.ts
- apps/model/src/single-product-portrait-supervised.ts
- apps/web/playwright-report/index.html
- apps/web/src/services/api.ts
- data/workspaces/ws_demo/db.sqlite
- docs/README.md
