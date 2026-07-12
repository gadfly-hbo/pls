# Handoff Back: Backend

## What Changed

- Enriched `GET /channel-objects/:canonicalObjectKey` so marketing events and business scenarios expose their business-specific fields directly:
  - `marketing_event`: `eventType`, `customTags`
  - `business_scenario`: `scenarioType`, `description`
- Enriched `GET /channel-objects/:canonicalObjectKey/bindings` with companion object metadata (`objectType`, `displayName`, `dataVersion`) for both the `from` and `to` sides of each binding.
- Added `POST /channel-objects/analysis` to establish the batch-analysis request contract; it returns `501 not_implemented` with a clear message rather than faking model results. The `501` response is inlined in the route; no shared `notImplemented` helper was added.
- Updated shared frontend type `ChannelObjectBinding` in `apps/web/src/types/index.ts` to match the enriched binding response.
- Updated `apps/web/src/services/api.ts` mock `ChannelObjectBinding` data so the local `USE_MOCK` path stays isomorphic with the real API response shape.
- Updated `apps/server/scripts/smoke-channel-object-library.mjs` to assert the new fields, enriched bindings, and the analysis endpoint.
- Removed out-of-scope validation artifacts (temporary smoke workspaces, SQLite WAL/SHM files) and restored `data/workspaces/ws_demo/db.sqlite` to `HEAD`.

## Files Changed

- `apps/server/src/routes/channel-objects.ts`:
  - `buildContextFields()` extracts `eventType`/`customTags` for `marketing_event` and `scenarioType`/`description` for `business_scenario` from `entityAttributes` and merges them into the detail response.
  - `enrichBindings()` joins `channel_object_latest` to provide `fromObject` and `toObject` companions on each binding.
  - `POST /channel-objects/analysis` accepts `{ selectedChannelEntityIds, selectedMarketingEventId?, selectedBusinessScenarioId?, skuIds }` and returns `501 not_implemented` using the existing `err()` helper.
- `apps/web/src/types/index.ts`: Updated `ChannelObjectBinding` with `fromObject`/`toObject` companions.
- `apps/web/src/services/api.ts`: Updated `mockChannelObjectBindings` to include `fromObject`/`toObject` companions so the local `USE_MOCK` path stays isomorphic with the real API.
- `apps/server/scripts/smoke-channel-object-library.mjs`: Added assertions for event/scenario detail fields, enriched binding companions, and the analysis endpoint; added `testAnalysisApi()` called in both smoke modes.

## Out-of-Scope Files Reverted

- `apps/server/src/lib/response.ts`: Previously added a `notImplemented` helper; reverted to avoid expanding the allowed scope. The route now uses `err(c, "not_implemented", ..., 501, "analysis")` directly.
- `apps/web/src/index.css`, `apps/web/src/pages/ChannelObjectLibrary.tsx`, `AGENTS.md`, `.mimocode/.cron-lock`: Reverted to `HEAD`; these belong to other tasks or are system artifacts.
- `data/workspaces/ws_demo/db.sqlite`: Restored to `HEAD` after validation; temporary smoke workspaces and SQLite WAL/SHM files were removed.

## Validation

| Check | Result | Notes |
|---|---|---|
| `cd apps/server && npm run typecheck` | passed | No TypeScript errors. |
| `cd apps/server && npm run smoke:channel-object-library` (dry-run) | passed | 22/22 assertions passed against `ws_demo`. |
| `PLS_ADMIN_SMOKE_MODE=imported cd apps/server && npm run smoke:channel-object-library` | passed | 60/60 assertions passed in a temporary workspace. |
| `cd apps/web && npm run build` | passed | TypeScript and Vite build succeeded. |
| `git diff --check` | passed | No whitespace or trailing-newline issues. |

## Real API Paths and Response Shapes

- `GET /api/v0/channel-objects/:canonicalObjectKey`
  - For `objectType = marketing_event`, response now includes `eventType` and `customTags`.
  - For `objectType = business_scenario`, response now includes `scenarioType` and `description`.
  - `entityAttributes` remains unchanged for backward compatibility.
- `GET /api/v0/channel-objects/:canonicalObjectKey/bindings`
  - Each item now includes `fromObject` and `toObject` companions:
    ```json
    {
      "canonicalObjectKey": "...",
      "objectType": "store",
      "displayName": "...",
      "dataVersion": "..."
    }
    ```
  - If the referenced object is not present in `channel_object_latest`, companion fields are `null`.
- `POST /api/v0/channel-objects/analysis`
  - Request body:
    ```json
    {
      "selectedChannelEntityIds": ["account:..."],
      "selectedMarketingEventId": "marketing_event:...",
      "selectedBusinessScenarioId": "business_scenario:...",
      "skuIds": ["mock_sku_101"]
    }
    ```
  - Response: `501 not_implemented` with `code: "not_implemented"` and an error message stating that analysis is not implemented.

## Contract Drift

- Original contract: `docs/api-contract.md` §10.5 and `docs/channel-profile-2.0-plan.md` §2.2 define `ChannelObject` fields and event/scenario attributes stored in `entityAttributes`.
- Actual implementation: Detail response now flattens the four business fields out of `entityAttributes` for direct consumption; `entityAttributes` is still present for backward compatibility. Bindings response adds `fromObject`/`toObject` companions without removing old fields.
- Recommendation: Accept. This is additive and preserves existing consumers.

## Cross-Domain Impact

| Domain | Impact | Required Action |
|---|---|---|
| frontend (kilo) | Can rely on `ChannelObjectBinding.fromObject`/`toObject` for display. | Update any UI code that previously parsed `entityAttributes` manually for event/scenario fields. Ensure the analysis UI handles the `501 not_implemented` response when `VITE_USE_MOCK=false`. |
| V/controller | `POST /channel-objects/analysis` is a real endpoint with a 501 placeholder. | Decide when to implement real analysis computation; until then, UI must handle the 501 response gracefully. |

## Risks

- `POST /channel-objects/analysis` is intentionally not implemented; any frontend code that expects real match results will not work against the real API until the computation domain implements it.
- The binding companion objects are looked up from `channel_object_latest`; if a binding references an object that has been deleted or not imported, the companion fields will be `null` rather than failing the request. This matches the additive-enrichment contract but may surprise callers who expect a strict join.
- `eventType`/`customTags`/`scenarioType`/`description` are read from `entityAttributes` (JSON column). If future import runners store them elsewhere, the detail response will need updating.
- `apps/web/src/services/api.ts` is outside the explicit allowed-path list. The change is limited to updating the `mockChannelObjectBindings` shape to match the new `ChannelObjectBinding` type, required by the `Mock 与真实 response shape 必须同构` rule in `AGENTS.md`. If the controller rejects this, the alternative is to make `fromObject`/`toObject` optional in the type and revert the `api.ts` change, which would weaken the contract.

## Unverified Areas

- Playwright E2E tests (`apps/web/e2e/channel-object-library.spec.ts`) were not run. The existing spec has an analysis-view test that currently relies on `USE_MOCK` local data; it may need adjustment when real API is enabled.
- Real analysis computation with event/scenario context weights is not implemented; the 501 placeholder is the intended behavior for this task.

## Open Questions

- Should `POST /channel-objects/analysis` be guarded by `Idempotency-Key` when implemented?
- Should the analysis endpoint accept a list of `channelEntityIds` or `canonicalObjectKey`s (current), or switch to `channelEntityId` identifiers from `/channels/entities`?
- Should `fromObject`/`toObject` on `ChannelObjectBinding` be optional, or is the controller OK with keeping them required and updating `api.ts` mock data?

## Memory Used

- Domain boundary from `agentops/memory/mimo-backend.md`: backend owns API handlers, persistence, integration contracts, and backend smoke checks. No UI component changes were made; only the shared type and mock-data shape were updated to keep the mock path isomorphic.

## Memory Candidates

- Lesson: when backend changes shared types that have `USE_MOCK` companions, the local mock data must be updated immediately to keep the mock path isomorphic with the real API. Otherwise the frontend build breaks even before real API integration.
- Lesson: SQLite fixture DB cleanup must distinguish between smoke-generated audit events and fixture/demo rows. Restoring the tracked fixture to `HEAD` and re-running migrations is the recommended baseline reset, but it still leaves the file modified by DDL migrations; final cleanup must happen after validation.
- Lesson: out-of-scope helper utilities should be inlined rather than added to shared files, to keep the diff within the allowed paths.
