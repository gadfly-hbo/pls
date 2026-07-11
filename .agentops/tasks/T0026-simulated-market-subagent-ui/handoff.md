# Handoff: T0026 simulated-market-subagent-ui

## What Changed

- Revision: removed the generated `apps/web/playwright-report/index.html` diff requested by controller review, preserving the feature changes.
- Added frontend subagent types and API adapter methods for list/create/update/delete/from-channel-object.
- Updated simulated market agent templates adapter to consume real `data.agents` + `data.subagents` wrapper shape and merge enabled subagents into the workbench candidate pool.
- Added a `subagent 管理` tab inside the simulated market page with subagent list, create/edit form, enabled toggle, delete confirmation, and channel-object-derived creation.
- Preserved existing workbench/history behavior and kept temporary handwritten persona as per-run only.
- Added source labels to target Agent cards: `三大人群`, `已保存 subagent`, `渠道画像派生`, `临时 persona`.
- Added responsive CSS for the management view and form controls.
- Extended `simulated-market.spec.ts` to cover mock subagent management flow and `VITE_USE_MOCK=false` contract requests for subagent list/create/update/delete/from-channel-object.

## Files Changed

- `apps/web/src/types/index.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/pages/SimulatedMarketWorkbench.tsx`
- `apps/web/src/index.css`
- `apps/web/e2e/simulated-market.spec.ts`
- `.agentops/tasks/T0026-simulated-market-subagent-ui/handoff.md`

Note: `docs/prd-simulated-market.md` had pre-existing uncommitted subagent contract edits before this worker started; I did not modify it.

## UX Notes

- The simulated market header now has page-local tabs: `工作台`, `subagent 管理`, `历史记录`.
- Disabled subagents remain visible in management but are removed from the workbench candidate pool after refresh.
- Delete uses a browser confirmation dialog and only exists on saved subagent rows, not default ABC templates.
- Channel-derived creation shows the backend/mock error if the selected object has no available `AudienceProfile`; it does not fabricate a profile.

## API Contract Usage

- `GET /api/v0/simulated-market/agent-templates` is decoded as `{ data: { agents, subagents } }`.
- `GET /api/v0/simulated-market/subagents` is decoded as `{ data: { items } }`.
- `POST /api/v0/simulated-market/subagents`, `PATCH /api/v0/simulated-market/subagents/:agentId`, `DELETE /api/v0/simulated-market/subagents/:agentId`, and `POST /api/v0/simulated-market/subagents/from-channel-object` all send `Idempotency-Key` in the frontend adapter.
- `sourceRef: null` from backend subagent responses is allowed in the frontend type.

## Validation

- Revision validation: `git status --short` no longer lists `apps/web/playwright-report/index.html`.
- Revision validation: `git diff --check` passed after removing the generated report diff.
- `cd apps/web && npm run lint` passed.
- `cd apps/web && npm run build` passed.
- `cd apps/web && npm run smoke` passed: 34 passed, 10 skipped.
- `cd apps/web && VITE_USE_MOCK=false npx playwright test e2e/simulated-market.spec.ts` passed: 2 passed, 3 skipped.
- `git diff --check` passed.

## Risks

- Visual verification was via Playwright smoke/mobile overflow checks, not manual screenshot review.
- The channel-object select lists all `ChannelEntity` objects; objects without an `AudienceProfile` rely on backend/mock error handling to explain the failure.
- The worktree had many pre-existing backend/data/doc/task changes; I only edited the frontend files above plus this handoff.

## Open Questions

- None for this bounded frontend task.

## Screenshots / Responsive Notes

- Existing 390px Playwright overflow smoke passed after adding the management tab and CSS.
- New management layout switches to one column below tablet width and stacks form/derive controls on narrow screens.

## Memory Used

- `Scope mock edits to the task-relevant sections`: affected the final diff review; I checked task-scope diff and avoided changing unrelated mock data/docs already present in the worktree.
- `Avoid any when the brief forbids it, including test helpers`: used as a guardrail for new Playwright route helper data; new test helper structures use explicit `TestSubagent` types instead of adding new `any`.

## Memory Candidates

- None.

## Whether Controller Review Is Needed

- Yes. This task is ready for controller review.
