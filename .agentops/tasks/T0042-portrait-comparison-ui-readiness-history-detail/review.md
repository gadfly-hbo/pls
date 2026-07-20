# Review

Decision: approved

## Notes

Approved revision 3. Revision 1 DTO drift and revision 2 archive expectedSequence blockers are closed. Verified actual implementation: frontend DTOs align with T0041 backend ComparisonSummary/ComparisonDetail/ArchiveComparisonOutput; getNextExpectedSequence returns max archiveEvents.eventSequence + 1 and 1 for empty events; archive POST E2E asserts Idempotency-Key, operation, expectedCurrentState, expectedSequence=1, and no runId in body; 409 and 404 error envelope UI tests exist. Validation rerun evidence: cd apps/web && npm run build passed; cd apps/web && npm run lint clean; elevated cd apps/web && npx playwright test e2e/portrait-comparison.spec.ts passed 4/8 with 4 skipped in mock mode; elevated cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/portrait-comparison.spec.ts passed 4/8 with 4 skipped in real-contract mode; npm run guard:worktree passed; git diff --check clean; protected path status/diff clean. Non-blocking risk recorded: test archive success response uses eventSequence expectedSequence+1 although backend returns nextSequence equal to expectedSequence for that request; current UI ignores that response and refreshes detail, so this is not a release blocker for W07. Memory Used: Do not patch around Backend contract drift, Real-contract Playwright intercepts must mirror backend DTO, and Read-model sequence fields must be interpreted as next sequence affected approval decision; metadata updated. W08 should now be created for full acceptance.

## Out Of Scope Diffs

- .mimocode/.cron-lock
- AGENTS.md
- apps/server/package.json
- apps/server/src/db/migrate.ts
- apps/server/src/db/migration-runner.ts
- apps/server/src/db/schema-check.ts
- apps/server/src/db/schema.ts
- apps/server/src/index.ts
- apps/server/src/lib/dangerous-ops.ts
- apps/server/src/routes/admin-database.ts
- docs/notes-backend.md
- docs/notes-infra.md
- docs/notes-model.md
