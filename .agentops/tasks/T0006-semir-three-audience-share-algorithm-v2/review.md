# Review

Decision: approved

## Notes

Approved T0006 after revision. Reviewed latest handoff, actual allowed-path implementation, and controller-rerun validations: apps/model typecheck passed; JD calibration contract test passed (4 fixtures, failures=[]); unified seven-channel contract test passed (failures=[]). Independent checks confirm a tolerated 1.0000005 input with expertPrior now returns coverage=1, uncovered=0, and non-negative shares; all four JD portable fixtures now pass the unified entry with coverage/uncovered in [0,1] and shares summing to 1. The revision adds real partial_coverage coverage. Controller also synchronized the controller-owned model contract with the non-JD 1e-6 and jd_ten 1e-4 source-rounding tolerance plus required pre-mapping normalization, so downstream adapters have one authoritative boundary. Existing dirty files outside the task plus this controller-owned contract synchronization are not accepted as T0006 worker deliverables.

## Out Of Scope Diffs

- CONTEXT.md
- apps/model/README.md
- apps/model/src/cli.ts
- apps/model/src/single-product-portrait-supervised.ts
- apps/web/playwright-report/index.html
- apps/web/src/services/api.ts
- data/workspaces/ws_demo/db.sqlite
- docs/README.md
