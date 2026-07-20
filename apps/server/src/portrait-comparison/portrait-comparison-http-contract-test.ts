// HTTP contract tests for portrait-comparisons route.
// Uses mkdtemp for workspace cleanup, seeds real runs via application layer,
// and verifies response envelope, error mapping, production gate, and
// list/detail/archive against persisted runs.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";
import { requestId } from "../middleware/request-id.js";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_DDL } from "../db/schema.js";
import { COMPARISON_DDL } from "../db/migrations/V005_portrait_comparison.js";
import portraitComparisons from "../routes/portrait-comparisons.js";

import {
  createComparison,
  archiveComparison,
  type CreateComparisonInput,
  type ArchiveComparisonInput,
} from "../portrait-comparison/index.js";
import { PORTRAIT_COMPARISON_ALGORITHM_CONFIG } from "../routes/portrait-comparisons.js";
import type { ComparisonApplicationContext } from "../portrait-comparison/application/comparison-application.js";
import type {
  PortraitSource,
  PortraitSourceCapability,
  PortraitObject,
  PortraitSnapshot,
  DimensionEvidenceRecord,
  ResolvedPortraitSnapshot,
} from "../portrait-comparison/portrait-source/index.js";
import { PortraitSourceNotReadyError } from "../portrait-comparison/portrait-source/index.js";

// ---------------------------------------------------------------------------
// Test fixtures — same as T0040 application tests
// ---------------------------------------------------------------------------

function makeBaselineEvidence(): DimensionEvidenceRecord[] {
  return [
    {
      dimensionKey: "audience_age_distribution",
      dimensionLabel: "Audience Age Distribution",
      value: 30,
      unit: "percent",
      metricName: "age_18_24",
      metricAggregation: "sum",
      sourceBatchId: "batch_1",
      sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_1" }],
    },
    {
      dimensionKey: "audience_gender_distribution",
      dimensionLabel: "Audience Gender Distribution",
      value: 55,
      unit: "percent",
      metricName: "female_ratio",
      metricAggregation: "sum",
      sourceBatchId: "batch_1",
      sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_1" }],
    },
  ];
}

function makeComparisonEvidence(): DimensionEvidenceRecord[] {
  return [
    {
      dimensionKey: "audience_age_distribution",
      dimensionLabel: "Audience Age Distribution",
      value: 35,
      unit: "percent",
      metricName: "age_18_24",
      metricAggregation: "sum",
      sourceBatchId: "batch_2",
      sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_2" }],
    },
    {
      dimensionKey: "audience_gender_distribution",
      dimensionLabel: "Audience Gender Distribution",
      value: 50,
      unit: "percent",
      metricName: "female_ratio",
      metricAggregation: "sum",
      sourceBatchId: "batch_2",
      sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_2" }],
    },
  ];
}

function makeFakePortraitSource(): PortraitSource {
  const snapshotA: PortraitSnapshot = {
    sourceSystem: "pls_workspace",
    sourceContractVersion: "1",
    snapshotId: "snap_a",
    dataVersion: "v1",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    sourceGeneratedAt: "2026-02-01T00:00:00.000Z",
    sourceBatchId: "batch_1",
    sampleSize: 1000,
    confidence: 0.95,
    sourceQualityFlags: [],
  };
  const snapshotB: PortraitSnapshot = {
    sourceSystem: "pls_workspace",
    sourceContractVersion: "1",
    snapshotId: "snap_b",
    dataVersion: "v2",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    sourceGeneratedAt: "2026-02-01T00:00:00.000Z",
    sourceBatchId: "batch_2",
    sampleSize: 1200,
    confidence: 0.92,
    sourceQualityFlags: [],
  };
  return {
    getCapabilities(): PortraitSourceCapability {
      return {
        sourceSystem: "pls_workspace",
        sourceContractVersion: "1",
        readiness: "ready",
        objectDiscoveryAvailable: true,
        snapshotDiscoveryAvailable: true,
        evidenceResolutionAvailable: true,
        blockingReasonCodes: [],
        notes: [],
      };
    },
    listPortraitObjects(): readonly PortraitObject[] {
      return [
        { workspaceId: "ws_http_test", family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
        { workspaceId: "ws_http_test", family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
      ];
    },
    listPortraitSnapshots(): readonly PortraitSnapshot[] {
      return [snapshotA, snapshotB];
    },
    resolvePortraitSnapshot(_workspaceId: string, objectId: string, snapshotId: string): ResolvedPortraitSnapshot {
      const isBaseline = objectId === "obj_a";
      const snapshot = isBaseline ? snapshotA : snapshotB;
      if (snapshot.snapshotId !== snapshotId) {
        throw new PortraitSourceNotReadyError(`snapshot ${snapshotId} not found for ${objectId}`);
      }
      return {
        sourceSystem: "pls_workspace",
        sourceContractVersion: "1",
        workspaceId: "ws_http_test",
        objectId,
        snapshot,
        dimensionEvidence: isBaseline ? makeBaselineEvidence() : makeComparisonEvidence(),
      };
    },
  };
}

function makeReleasedQualityPolicy() {
  return {
    policyId: "pls-portrait-comparison-quality-policy",
    policyVersion: "released-test@1",
    releaseStatus: "released",
    configChecksum: "a".repeat(64),
    reasonTaxonomy: [] as readonly string[],
    message: "test released policy",
  };
}

// ---------------------------------------------------------------------------
// Test setup — mkdtemp workspace, seed real runs
// ---------------------------------------------------------------------------

let testDir: string;
let server: ReturnType<typeof serve>;
let baseUrl: string;
let seededRunId: string;
let seededArchiveKey: string;

function countComparisonRows(db: DatabaseSync): Record<string, number> {
  const tables = [
    "comparison_run", "comparison_participant", "comparison_portrait_source",
    "comparison_dimension_evidence", "comparison_dimension_assessment",
    "comparison_explanation_attempt", "comparison_explanation_outcome",
    "comparison_archive_event",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    counts[table] = row.c;
  }
  return counts;
}

async function setup() {
  // Create temp directory for test workspace
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "pls-http-test-"));
  const wsDir = path.join(testDir, "ws_http_test");
  fs.mkdirSync(wsDir, { recursive: true });

  // Create test database with schema
  const db = new DatabaseSync(path.join(wsDir, "db.sqlite"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_DDL);
  db.exec(COMPARISON_DDL);
  db.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_http_test", "Test Workspace");

  // Create ws_other for cross-workspace tests
  const otherDir = path.join(testDir, "ws_http_test_other");
  fs.mkdirSync(otherDir, { recursive: true });
  const dbOther = new DatabaseSync(path.join(otherDir, "db.sqlite"));
  dbOther.exec("PRAGMA foreign_keys = ON");
  dbOther.exec(SCHEMA_DDL);
  dbOther.exec(COMPARISON_DDL);
  dbOther.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_http_test_other", "Other Workspace");
  dbOther.close();

  // Seed a real run via application layer with released quality policy
  let uuidCounter = 0;
  const ctx: ComparisonApplicationContext = {
    db,
    workspaceId: "ws_http_test",
    trustedActor: "test-actor",
    trustedActorDisplayName: "Test Actor",
    portraitSource: makeFakePortraitSource(),
    algorithmConfig: PORTRAIT_COMPARISON_ALGORITHM_CONFIG,
    _qualityPolicy: makeReleasedQualityPolicy(),
    clock: () => "2026-07-19T12:00:00.000Z",
    uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
  };

  const createInput: CreateComparisonInput = {
    mode: "peer_same_period",
    idempotencyKey: "seed-key-1",
    baseline: {
      object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
      snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
    comparison: {
      object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
      snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
  };

  const result = createComparison(ctx, createInput);
  seededRunId = result.runId;
  seededArchiveKey = "seed-archive-key-1";

  // Seed a second run (active) for list filtering tests
  uuidCounter = 100; // Reset to avoid collision
  const createInput2: CreateComparisonInput = {
    mode: "peer_same_period",
    idempotencyKey: "seed-key-2",
    baseline: {
      object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
      snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
    comparison: {
      object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
      snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
  };
  const result2 = createComparison(ctx, createInput2);
  // result2.runId is the active run

  db.close();

  // Create a minimal Hono app with the route and middleware
  const app = new Hono();
  const api = new Hono();
  api.use("*", requestId);
  api.use("*", auth);
  api.use("*", workspace);
  api.route("/portrait-comparisons", portraitComparisons);
  app.route("/api/v0", api);

  // Start server — override openDb path by setting env or using symlink
  // Since openDb uses hardcoded path, we need to create the workspace at the real path
  // OR override the data directory. We'll create symlinks.
  const realDataDir = path.resolve(import.meta.dirname, "../../../../data/workspaces");
  fs.mkdirSync(realDataDir, { recursive: true });
  // Create symlinks from real path to temp dirs
  try { fs.unlinkSync(path.join(realDataDir, "ws_http_test")); } catch {}
  try { fs.unlinkSync(path.join(realDataDir, "ws_http_test_other")); } catch {}
  fs.symlinkSync(wsDir, path.join(realDataDir, "ws_http_test"));
  fs.symlinkSync(otherDir, path.join(realDataDir, "ws_http_test_other"));

  server = serve({ fetch: app.fetch, port: 0 });
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    }, 100);
  });
}

function teardown() {
  if (server) server.close();
  // Clean up symlinks
  const realDataDir = path.resolve(import.meta.dirname, "../../../../data/workspaces");
  try { fs.unlinkSync(path.join(realDataDir, "ws_http_test")); } catch {}
  try { fs.unlinkSync(path.join(realDataDir, "ws_http_test_other")); } catch {}
  // Clean up temp dir
  if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
}

async function makeRequest(
  method: string,
  urlPath: string,
  options?: { headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "Authorization": "Bearer pls-p0-demo-token",
    "X-PLS-Workspace": "ws_http_test",
    ...options?.headers,
  };
  if (options?.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method, headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json() as Record<string, unknown>;
  return { status: response.status, body };
}

test.before(async () => { await setup(); });
test.after(() => { teardown(); });

// ---------------------------------------------------------------------------
// Auth & workspace middleware contract
// ---------------------------------------------------------------------------

test("auth: missing Authorization header returns 401", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness", {
    headers: { "Authorization": "" },
  });
  assert.equal(status, 401);
  assert.equal(body.code, "unauthorized");
});

test("auth: invalid token returns 401", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness", {
    headers: { "Authorization": "Bearer wrong-token" },
  });
  assert.equal(status, 401);
  assert.equal(body.code, "unauthorized");
});

test("workspace: missing X-PLS-Workspace header returns 400", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness", {
    headers: { "X-PLS-Workspace": "" },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
  assert.ok(/workspace/i.test((body.error as { message: string }).message));
});

// ---------------------------------------------------------------------------
// Response envelope contract
// ---------------------------------------------------------------------------

test("response envelope: success has code, requestId, generatedAt, data", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness");
  assert.equal(status, 200);
  assert.equal(body.code, "ok");
  assert.ok(typeof body.requestId === "string");
  assert.ok(typeof body.generatedAt === "string");
  assert.ok(body.data !== undefined);
  assert.equal(body.error, undefined);
});

test("response envelope: error has code, requestId, generatedAt, error", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness", {
    headers: { "Authorization": "Bearer wrong" },
  });
  assert.equal(status, 401);
  assert.equal(body.code, "unauthorized");
  assert.ok(typeof body.requestId === "string");
  assert.ok(typeof body.generatedAt === "string");
  assert.ok(body.error !== undefined);
  assert.equal(body.data, undefined);
});

// ---------------------------------------------------------------------------
// GET /readiness
// ---------------------------------------------------------------------------

test("readiness: returns not_released status with blockers", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/readiness");
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal(data.status, "not_released");
  assert.equal(data.contractVersion, "1");
  assert.equal(data.productionPolicyStatus, "not_released");
  assert.equal((data.capabilities as Record<string, boolean>).create, false);
  assert.ok(Array.isArray(data.blockers));
  assert.ok((data.blockers as string[]).length > 0);
});

// ---------------------------------------------------------------------------
// POST / — create (gated, zero Comparison writes)
// ---------------------------------------------------------------------------

test("create: missing Idempotency-Key returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    body: {
      mode: "peer_same_period",
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("create: invalid JSON body returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-json" },
    body: "not-json",
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("create: body injection of trustedActor returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-ta" },
    body: {
      mode: "peer_same_period",
      trustedActor: "injected",
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
  assert.ok(/trustedActor/.test((body.error as { message: string }).message));
});

test("create: body injection of runId returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-rid" },
    body: {
      mode: "peer_same_period",
      runId: "injected",
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("create: body injection of score returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-sc" },
    body: {
      mode: "peer_same_period",
      score: 0.95,
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("create: invalid mode returns 400", async () => {
  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-md" },
    body: {
      mode: "invalid_mode",
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("create: not_released gate returns 424 with zero Comparison table writes", async () => {
  // Count rows before
  const wsDir = path.join(testDir, "ws_http_test");
  const dbBefore = new DatabaseSync(path.join(wsDir, "db.sqlite"));
  const countsBefore = countComparisonRows(dbBefore);
  dbBefore.close();

  const { status, body } = await makeRequest("POST", "/api/v0/portrait-comparisons", {
    headers: { "Idempotency-Key": "test-key-gate" },
    body: {
      mode: "peer_same_period",
      baseline: { object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" }, snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
      comparison: { object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" }, snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" } },
    },
  });

  assert.equal(status, 424);
  assert.equal(body.code, "dependency_failed");
  assert.ok(body.error !== undefined);

  // Count rows after — must be identical (zero new writes)
  const dbAfter = new DatabaseSync(path.join(wsDir, "db.sqlite"));
  const countsAfter = countComparisonRows(dbAfter);
  dbAfter.close();

  for (const table of Object.keys(countsBefore)) {
    assert.equal(countsAfter[table], countsBefore[table],
      `Table ${table} should have same row count after not_released create (${countsBefore[table]} → ${countsAfter[table]})`);
  }
});

// ---------------------------------------------------------------------------
// GET / — list (with persisted runs)
// ---------------------------------------------------------------------------

test("list: returns items when runs exist", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons");
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.ok(Array.isArray(data.items));
  // We seeded 2 active runs. Default filter is "active", so both visible.
  assert.equal((data.items as unknown[]).length, 2);
  const page = data.page as Record<string, unknown>;
  assert.equal(page.hasMore, false);
});

test("list: archiveFilter=all returns all runs after archiving one", async () => {
  // Archive seededRunId via HTTP (uses same key as archive tests to avoid conflict)
  await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": seededArchiveKey },
    body: { operation: "archived", expectedCurrentState: "active", expectedSequence: 1, reason: "test archive" },
  });

  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons?archiveFilter=all");
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal((data.items as unknown[]).length, 2);
});

test("list: archiveFilter=archived returns only archived runs", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons?archiveFilter=archived");
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal((data.items as unknown[]).length, 1);
});

test("list: invalid limit returns 400", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons?limit=0");
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("list: invalid archiveFilter returns 400", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons?archiveFilter=invalid");
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

// ---------------------------------------------------------------------------
// GET /:runId — detail (with persisted run)
// ---------------------------------------------------------------------------

test("detail: returns detail for existing run", async () => {
  const { status, body } = await makeRequest("GET", `/api/v0/portrait-comparisons/${seededRunId}`);
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal(data.id, seededRunId);
  assert.equal(data.mode, "peer_same_period");
  assert.ok(typeof data.similarityScore === "number");
  assert.ok(typeof data.coverage === "number");
  assert.ok(data.baseline !== undefined);
  assert.ok(data.comparison !== undefined);
  assert.ok(Array.isArray(data.dimensionAssessments));
  assert.ok(data.dimensionAssessments.length > 0);
  // seededRunId was archived in the list test
  assert.equal(data.archiveState, "archived");
});

test("detail: not found returns 404", async () => {
  const fakeUuid = "00000000-0000-4000-8000-000000000099";
  const { status, body } = await makeRequest("GET", `/api/v0/portrait-comparisons/${fakeUuid}`);
  assert.equal(status, 404);
  assert.equal(body.code, "not_found");
});

test("detail: invalid runId returns 400", async () => {
  const { status, body } = await makeRequest("GET", "/api/v0/portrait-comparisons/not-a-uuid");
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

// ---------------------------------------------------------------------------
// POST /:runId/archive — archive/restore with persisted run
// ---------------------------------------------------------------------------

test("archive: replay same fingerprint returns 200 with replayed=true", async () => {
  // seededRunId was archived in the list test with seededArchiveKey
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": seededArchiveKey },
    body: {
      operation: "archived",
      expectedCurrentState: "active",
      expectedSequence: 1,
      reason: "test archive",
    },
  });
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal(data.replayed, true);
});

test("archive: stale expected state returns 409", async () => {
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": "archive-stale-key" },
    body: {
      operation: "archived",
      expectedCurrentState: "active",
      expectedSequence: 1,
    },
  });
  // Run is already archived, so expectedCurrentState=active is stale
  assert.equal(status, 409);
  assert.equal(body.code, "conflict");
});

test("archive: restore archived run succeeds", async () => {
  // seededRunId was archived (event 1) in the list test; restore is event 2
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": "archive-restore-key" },
    body: {
      operation: "restored",
      expectedCurrentState: "archived",
      expectedSequence: 2,
    },
  });
  assert.equal(status, 200);
  const data = body.data as Record<string, unknown>;
  assert.equal(data.newState, "active");
});

test("archive: cross-workspace returns 404", async () => {
  const fakeUuid = "00000000-0000-4000-8000-000000000099";
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${fakeUuid}/archive`, {
    headers: { "X-PLS-Workspace": "ws_http_test_other", "Idempotency-Key": "archive-xws-key" },
    body: {
      operation: "archived",
      expectedCurrentState: "active",
      expectedSequence: 1,
    },
  });
  assert.equal(status, 404);
  assert.equal(body.code, "not_found");
});

test("archive: missing Idempotency-Key returns 400", async () => {
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    body: { operation: "archived", expectedCurrentState: "active", expectedSequence: 2 },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("archive: invalid operation returns 400", async () => {
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": "archive-inv-op" },
    body: { operation: "invalid", expectedCurrentState: "active", expectedSequence: 2 },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("archive: invalid expectedCurrentState returns 400", async () => {
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": "archive-inv-state" },
    body: { operation: "archived", expectedCurrentState: "invalid", expectedSequence: 2 },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("archive: missing expectedSequence returns 400", async () => {
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${seededRunId}/archive`, {
    headers: { "Idempotency-Key": "archive-inv-seq" },
    body: { operation: "archived", expectedCurrentState: "active" },
  });
  assert.equal(status, 400);
  assert.equal(body.code, "invalid_input");
});

test("archive: not found returns 404", async () => {
  const fakeUuid = "00000000-0000-4000-8000-000000000099";
  const { status, body } = await makeRequest("POST", `/api/v0/portrait-comparisons/${fakeUuid}/archive`, {
    headers: { "Idempotency-Key": "archive-nf" },
    body: { operation: "archived", expectedCurrentState: "active", expectedSequence: 1 },
  });
  assert.equal(status, 404);
  assert.equal(body.code, "not_found");
});

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

test("error: no SQLite/SQL/path leakage in error messages", async () => {
  const fakeUuid = "00000000-0000-4000-8000-000000000099";
  const { body } = await makeRequest("GET", `/api/v0/portrait-comparisons/${fakeUuid}`);
  const error = body.error as Record<string, unknown>;
  const message = String(error.message ?? "");
  assert.ok(!message.includes("sqlite"), `error message should not contain "sqlite": ${message}`);
  assert.ok(!message.includes("SELECT"), `error message should not contain "SELECT": ${message}`);
  assert.ok(!message.includes("INSERT"), `error message should not contain "INSERT": ${message}`);
  assert.ok(!message.includes(".sqlite"), `error message should not contain ".sqlite": ${message}`);
});

// ---------------------------------------------------------------------------
// Cross-workspace isolation
// ---------------------------------------------------------------------------

test("detail: cross-workspace returns 404 (not existence leak)", async () => {
  const { status: status1, body: body1 } = await makeRequest("GET", `/api/v0/portrait-comparisons/${seededRunId}`);
  const { status: status2, body: body2 } = await makeRequest("GET", `/api/v0/portrait-comparisons/${seededRunId}`, {
    headers: { "X-PLS-Workspace": "ws_http_test_other" },
  });
  assert.equal(status1, 200); // found in correct workspace
  assert.equal(status2, 404); // not found in other workspace
  assert.equal(body2.code, "not_found");
});
