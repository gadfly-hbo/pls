// Portrait Comparison HTTP transport — /api/v0/portrait-comparisons
// Maps application contract to Hono HTTP endpoints with standard response envelope.
// Production gate: quality policy is not_released, so formal create returns 424.

import { Hono, type Context } from "hono";
import { ok, err, notFound, invalidInput, conflict, dependencyFailed, internalError } from "../lib/response.js";
import { openDb } from "../db/connection.js";
import {
  createProductionComparisonApplication,
  PLS_COMPARISON_CONTRACT_VERSION,
  PLS_COMPARISON_ALGORITHM_IDENTITY,
  ComparisonValidationError,
  ComparisonIdempotencyConflictError,
  ComparisonQualityGateError,
  ComparisonSourceError,
  ComparisonConcurrencyError,
  ComparisonStateError,
  ComparisonNotFoundError,
  getProductionQualityPolicy,
  type ComparisonAlgorithmConfig,
  type CreateComparisonInput,
  type ListComparisonsInput,
  type ArchiveComparisonInput,
  type ComparisonApplication,
} from "../portrait-comparison/index.js";
import { resolveActivePortraitSource } from "../portrait-comparison/portrait-source/resolver.js";
import { PortraitSourceResolverError, PortraitSourceNotReadyError, PortraitSourceError } from "../portrait-comparison/portrait-source/errors.js";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { PortraitSource } from "../portrait-comparison/portrait-source/index.js";

// ---------------------------------------------------------------------------
// HTTP-layer algorithm config — must match the approved T0038/T0040 runtime
// contract for persisted-run validation. Defined here (not in application
// layer) to stay within T0041 allowed_paths.
// ---------------------------------------------------------------------------
export const PORTRAIT_COMPARISON_ALGORITHM_CONFIG: ComparisonAlgorithmConfig = {
  algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
  algorithmVersion: "pls-v1",
  candidateDimensions: [
    {
      dimensionKey: "audience_age_distribution",
      dimensionLabel: "Audience Age Distribution",
      expectedUnit: "percent",
      weight: 0.5,
      normalization: { kind: "linear_0_100", min: 0, max: 100, clamp: true },
    },
    {
      dimensionKey: "audience_gender_distribution",
      dimensionLabel: "Audience Gender Distribution",
      expectedUnit: "percent",
      weight: 0.5,
      normalization: { kind: "linear_0_100", min: 0, max: 100, clamp: true },
    },
  ],
  floatingTolerance: 1e-9,
  overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 50 },
};

const portraitComparisons = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceId(c: Context): string {
  return c.get("workspaceId") as string;
}

function openWorkspaceDb(c: Context): DatabaseSync {
  return openDb(getWorkspaceId(c));
}

function resolvePortraitSource(c: Context, db: DatabaseSync): PortraitSource {
  const workspaceId = getWorkspaceId(c);
  const plsWorkspaceDbPath = resolve(import.meta.dirname, "../../../../data/workspaces", workspaceId, "db.sqlite");
  const resolvedSource = resolveActivePortraitSource({ db, workspaceId, plsWorkspaceDbPath });
  return resolvedSource.source;
}

function createApp(c: Context, db: DatabaseSync, portraitSource: PortraitSource): ComparisonApplication {
  return createProductionComparisonApplication({
    db,
    workspaceId: getWorkspaceId(c),
    trustedActor: "http-api",
    portraitSource,
    algorithmConfig: PORTRAIT_COMPARISON_ALGORITHM_CONFIG,
  });
}

function mapApplicationError(c: Context, error: unknown): Response {
  if (error instanceof ComparisonValidationError) {
    return invalidInput(c, error.message, error.issues[0]?.path);
  }
  if (error instanceof ComparisonQualityGateError) {
    return dependencyFailed(c, error.message);
  }
  if (error instanceof ComparisonIdempotencyConflictError) {
    return conflict(c, error.message);
  }
  if (error instanceof ComparisonConcurrencyError) {
    return conflict(c, error.message);
  }
  if (error instanceof ComparisonNotFoundError) {
    return notFound(c, error.message);
  }
  if (error instanceof ComparisonSourceError) {
    return dependencyFailed(c, error.message);
  }
  if (error instanceof ComparisonStateError) {
    return internalError(c, "internal state violation");
  }
  if (error instanceof PortraitSourceResolverError || error instanceof PortraitSourceNotReadyError) {
    return dependencyFailed(c, "portrait source not available");
  }
  if (error instanceof PortraitSourceError) {
    return dependencyFailed(c, "portrait source error");
  }
  return internalError(c, "unexpected error");
}

/** Dummy portrait source for endpoints that don't need source resolution (list/detail/archive). */
function createDummyPortraitSource(): PortraitSource {
  return {
    getCapabilities() {
      return {
        sourceSystem: "pls_workspace",
        sourceContractVersion: "0",
        readiness: "not_ready" as const,
        objectDiscoveryAvailable: false,
        snapshotDiscoveryAvailable: false,
        evidenceResolutionAvailable: false,
        blockingReasonCodes: ["http_endpoint_does_not_use_portrait_source"],
        notes: ["dummy source for non-create HTTP endpoints"],
      };
    },
    listPortraitObjects() { return []; },
    listPortraitSnapshots() { return []; },
    resolvePortraitSnapshot() { throw new PortraitSourceNotReadyError("dummy source does not resolve snapshots"); },
  };
}

// ---------------------------------------------------------------------------
// GET /readiness
// ---------------------------------------------------------------------------

portraitComparisons.get("/readiness", (c) => {
  const policy = getProductionQualityPolicy();
  const isReleased = policy.releaseStatus !== "not_released";
  return ok(c, {
    status: isReleased ? "ready" : "not_released",
    contractVersion: PLS_COMPARISON_CONTRACT_VERSION,
    productionPolicyStatus: policy.releaseStatus,
    capabilities: {
      create: isReleased,
      list: true,
      detail: true,
      archive: true,
      explanation: true,
    },
    blockers: isReleased ? [] : [policy.message],
  });
});

// ---------------------------------------------------------------------------
// POST / — create comparison (gated by production policy)
// ---------------------------------------------------------------------------

portraitComparisons.post("/", async (c) => {
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    return err(c, "invalid_input", "Idempotency-Key header is required for create", 400, "Idempotency-Key");
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await c.req.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalidInput(c, "request body must be a JSON object", "body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return invalidInput(c, "request body must be valid JSON", "body");
  }

  // Reject body-injected derived fields
  const forbiddenFields = ["trustedActor", "idempotencyKey", "runId", "score", "coverage", "quality", "algorithmChecksum", "contractChecksum", "sourceFacts", "evidence", "actor", "createdAt"];
  for (const field of forbiddenFields) {
    if (field in body) {
      return err(c, "invalid_input", `field "${field}" must not be provided in request body`, 400, field);
    }
  }

  const mode = body.mode as string | undefined;
  if (!mode || (mode !== "peer_same_period" && mode !== "self_cross_period")) {
    return invalidInput(c, 'mode must be "peer_same_period" or "self_cross_period"', "mode");
  }

  const baseline = body.baseline as Record<string, unknown> | undefined;
  const comparisonSide = body.comparison as Record<string, unknown> | undefined;
  if (!baseline || !comparisonSide) {
    return invalidInput(c, "baseline and comparison are required", "baseline");
  }

  function parseSide(side: Record<string, unknown>, sideName: string) {
    const object = side.object as Record<string, unknown> | undefined;
    const snapshot = side.snapshot as Record<string, unknown> | undefined;
    if (!object || !snapshot) {
      throw new ComparisonValidationError([{ path: sideName, message: "object and snapshot are required" }]);
    }
    return {
      object: {
        family: object.family as "channel" | "product",
        objectType: String(object.objectType ?? ""),
        objectId: String(object.objectId ?? ""),
        displayName: String(object.displayName ?? ""),
      },
      snapshot: {
        snapshotId: String(snapshot.snapshotId ?? ""),
        dataVersion: String(snapshot.dataVersion ?? ""),
        periodStart: String(snapshot.periodStart ?? ""),
        periodEnd: String(snapshot.periodEnd ?? ""),
      },
    };
  }

  let parsedBaseline: CreateComparisonInput["baseline"];
  let parsedComparison: CreateComparisonInput["comparison"];
  try {
    parsedBaseline = parseSide(baseline, "baseline");
    parsedComparison = parseSide(comparisonSide, "comparison");
  } catch (error) {
    return mapApplicationError(c, error);
  }

  const input: CreateComparisonInput = {
    mode: mode as CreateComparisonInput["mode"],
    idempotencyKey,
    baseline: parsedBaseline,
    comparison: parsedComparison,
  };

  try {
    // Create endpoint resolves real portrait source
    const db = openWorkspaceDb(c);
    const portraitSource = resolvePortraitSource(c, db);
    const app = createApp(c, db, portraitSource);
    const result = app.create(input);
    return ok(c, result, result.replayed ? 200 : 201);
  } catch (error) {
    return mapApplicationError(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET / — list comparisons
// ---------------------------------------------------------------------------

portraitComparisons.get("/", (c) => {
  const limitParam = c.req.query("limit");
  const afterCreatedAt = c.req.query("afterCreatedAt");
  const afterRunId = c.req.query("afterRunId");
  const archiveFilter = c.req.query("archiveFilter") as "active" | "archived" | "all" | undefined;

  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return invalidInput(c, "limit must be an integer between 1 and 100", "limit");
    }
  }

  if (archiveFilter !== undefined && archiveFilter !== "active" && archiveFilter !== "archived" && archiveFilter !== "all") {
    return invalidInput(c, 'archiveFilter must be "active", "archived", or "all"', "archiveFilter");
  }

  const input: ListComparisonsInput = {
    ...(limitParam !== undefined ? { limit: Number(limitParam) } : {}),
    ...(afterCreatedAt ? { afterCreatedAt } : {}),
    ...(afterRunId ? { afterRunId } : {}),
    ...(archiveFilter ? { archiveFilter } : {}),
  };

  try {
    // List uses dummy portrait source — not needed for listing
    const db = openWorkspaceDb(c);
    const app = createApp(c, db, createDummyPortraitSource());
    const result = app.list(input);
    return ok(c, {
      items: result.items,
      page: {
        cursor: null,
        nextCursor: result.nextCursor,
        pageSize: result.items.length,
        hasMore: result.nextCursor !== null,
      },
    });
  } catch (error) {
    return mapApplicationError(c, error);
  }
});

// ---------------------------------------------------------------------------
// GET /:runId — detail
// ---------------------------------------------------------------------------

portraitComparisons.get("/:runId", (c) => {
  const runId = c.req.param("runId");
  if (!runId) {
    return invalidInput(c, "runId is required", "runId");
  }

  try {
    // Detail uses dummy portrait source — not needed for reading
    const db = openWorkspaceDb(c);
    const app = createApp(c, db, createDummyPortraitSource());
    const detail = app.detail(runId);
    if (detail === null) {
      return notFound(c, `comparison run ${runId} not found`);
    }
    return ok(c, detail);
  } catch (error) {
    return mapApplicationError(c, error);
  }
});

// ---------------------------------------------------------------------------
// POST /:runId/archive — archive or restore
// ---------------------------------------------------------------------------

portraitComparisons.post("/:runId/archive", async (c) => {
  const runId = c.req.param("runId");
  if (!runId) {
    return invalidInput(c, "runId is required", "runId");
  }

  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    return err(c, "invalid_input", "Idempotency-Key header is required for archive", 400, "Idempotency-Key");
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await c.req.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalidInput(c, "request body must be a JSON object", "body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return invalidInput(c, "request body must be valid JSON", "body");
  }

  const operation = body.operation as string | undefined;
  if (!operation || (operation !== "archived" && operation !== "restored")) {
    return invalidInput(c, 'operation must be "archived" or "restored"', "operation");
  }

  const expectedCurrentState = body.expectedCurrentState as string | undefined;
  if (!expectedCurrentState || (expectedCurrentState !== "active" && expectedCurrentState !== "archived")) {
    return invalidInput(c, 'expectedCurrentState must be "active" or "archived"', "expectedCurrentState");
  }

  const expectedSequence = body.expectedSequence;
  if (expectedSequence === undefined || typeof expectedSequence !== "number" || !Number.isInteger(expectedSequence)) {
    return invalidInput(c, "expectedSequence must be an integer", "expectedSequence");
  }

  const reason = body.reason as string | null | undefined;

  const input: ArchiveComparisonInput = {
    runId,
    operation: operation as "archived" | "restored",
    reason: reason ?? null,
    idempotencyKey,
    expectedCurrentState: expectedCurrentState as "active" | "archived",
    expectedSequence,
  };

  try {
    // Archive uses dummy portrait source — not needed for archiving
    const db = openWorkspaceDb(c);
    const app = createApp(c, db, createDummyPortraitSource());
    const result = app.archive(input);
    return ok(c, result);
  } catch (error) {
    return mapApplicationError(c, error);
  }
});

export default portraitComparisons;
