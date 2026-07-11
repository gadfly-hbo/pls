# Review

Decision: approved

## Notes

Approved after revision. The prior sourceRef fallback bug is fixed: flywheel.ts now preserves omitted body.sourceRef until resolving against simulation_run.inputSnapshot.sourceRef, and smoke-simulated-market-decision asserts both detail and list fallback plus explicit sourceRef override. Controller reran validation: npm run typecheck passed; npm run schema:check valid; npm run smoke:simulated-market-decision passed 27/27; npm run smoke:simulated-market passed 26/26; npm run smoke:p2-api passed after sandbox escalation for localhost connection. Changed files are within T0017 allowed backend/docs paths; broader dirty worktree and generated temp workspaces were not reverted. Memory candidates were not accepted because they lack lifecycle metadata.

## Out Of Scope Diffs

- AGENTS.md
- CONTEXT.md
- apps/model/README.md
- apps/model/package.json
- apps/model/src/single-product-portrait-supervised.ts
- apps/model/src/three-audience-share-contract-test.ts
- apps/model/src/three-audience-share.ts
- apps/server/src/index.ts
- apps/web/e2e/portrait-workbench-real.spec.ts
- apps/web/e2e/portrait-workbench.spec.ts
- apps/web/e2e/three-audience-local-estimator.spec.ts
- apps/web/playwright-report/index.html
- apps/web/src/App.tsx
- apps/web/src/components/SingleProductPortrait.tsx
- apps/web/src/index.css
- apps/web/src/pages/ChannelObjectLibrary.tsx
- apps/web/src/pages/Dashboard.tsx
- apps/web/src/services/api.ts
- apps/web/src/types/index.ts
- apps/web/src/utils/three-audience-local-parser.ts
- data/workspaces/ws_demo/db.sqlite
- docs/README.md
- docs/model-three-audience-share-contract.md
- docs/notes-model.md
- docs/notes-viz.md
- docs/prd-three-audience-local-estimator-ui.md
