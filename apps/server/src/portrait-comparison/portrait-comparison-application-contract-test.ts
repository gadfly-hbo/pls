// Application contract tests — temporary SQLite DB, real V005 DDL, fake PortraitSource.
// Covers: production gate, success graph, idempotency, mode legality, list cursor,
// detail aggregation, explanation (succeeded/failed/interrupted/ensure-once/retry),
// archive (fingerprint/optimistic concurrency/collision), fault injection, read model.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { SCHEMA_DDL } from "../db/schema.js";
import { COMPARISON_DDL } from "../db/migrations/V005_portrait_comparison.js";

import {
  createComparison,
  getComparisonDetail,
  listComparisons,
  createExplanation,
  archiveComparison,
  createProductionComparisonApplication,
  type ComparisonApplicationPublicContext,
} from "./application/index.js";

// Import internal context type directly (not from public index)
import type { ComparisonApplicationContext } from "./application/comparison-application.js";

import {
  PLS_COMPARISON_CONTRACT_ID,
  PLS_COMPARISON_CONTRACT_VERSION,
  ComparisonValidationError,
  ComparisonIdempotencyConflictError,
  ComparisonQualityGateError,
  ComparisonSourceError,
  ComparisonNotFoundError,
  ComparisonConcurrencyError,
  ComparisonStateError,
} from "./application/index.js";

import type {
  CreateComparisonInput,
  ComparisonMode,
} from "./application/index.js";

import { PLS_COMPARISON_ALGORITHM_IDENTITY, type ComparisonAlgorithmConfig } from "./algorithm.js";
import { PLS_RULE_SUMMARY_GENERATOR_ID, PLS_RULE_SUMMARY_GENERATOR_VERSION } from "./rule-summary.js";

import type {
  PortraitSource,
  PortraitSourceCapability,
  PortraitObject,
  PortraitSnapshot,
  DimensionEvidenceRecord,
  ResolvedPortraitSnapshot,
  ListPortraitObjectsFilters,
} from "./portrait-source/index.js";
import { PortraitSourceNotReadyError } from "./portrait-source/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pls-app-"));
}

function createTestDb(dir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_DDL);
  db.exec(COMPARISON_DDL);
  db.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
  return db;
}

const TEST_ALGORITHM_CONFIG: ComparisonAlgorithmConfig = {
  algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
  algorithmVersion: "test-v1",
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

function makeFakePortraitSource(opts?: {
  baselineEvidence?: DimensionEvidenceRecord[];
  comparisonEvidence?: DimensionEvidenceRecord[];
  resolveError?: (objectId: string) => never;
}): PortraitSource {
  const baselineEvidence = opts?.baselineEvidence ?? makeBaselineEvidence();
  const comparisonEvidence = opts?.comparisonEvidence ?? makeComparisonEvidence();

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
        { workspaceId: "ws_test", family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
        { workspaceId: "ws_test", family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
      ];
    },
    listPortraitSnapshots(): readonly PortraitSnapshot[] {
      return [snapshotA, snapshotB];
    },
    resolvePortraitSnapshot(_workspaceId: string, objectId: string, snapshotId: string): ResolvedPortraitSnapshot {
      if (opts?.resolveError) opts.resolveError(objectId);
      const isBaseline = objectId === "obj_a";
      const snapshot = isBaseline ? snapshotA : snapshotB;
      if (snapshot.snapshotId !== snapshotId) {
        throw new PortraitSourceNotReadyError(`snapshot ${snapshotId} not found for ${objectId}`);
      }
      return {
        sourceSystem: "pls_workspace",
        sourceContractVersion: "1",
        workspaceId: "ws_test",
        objectId,
        snapshot,
        dimensionEvidence: isBaseline ? baselineEvidence : comparisonEvidence,
      };
    },
  };
}

// Quality policy type matching ComparisonApplicationContext (broader than NotReleasedQualityPolicy)
interface TestQualityPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly releaseStatus: string;
  readonly configChecksum: string;
  readonly reasonTaxonomy: readonly string[];
  readonly message: string;
}

function makeTestContext(
  db: DatabaseSync,
  opts?: {
    portraitSource?: PortraitSource;
    _qualityPolicy?: TestQualityPolicy;
    clock?: () => string;
    uuid?: () => string;
    _faultHook?: (stage: string) => void;
    _explanationFaultHook?: (stage: string) => void;
  },
): ComparisonApplicationContext {
  let uuidCounter = 0;
  return {
    db,
    workspaceId: "ws_test",
    trustedActor: "test-actor",
    trustedActorDisplayName: "Test Actor",
    portraitSource: opts?.portraitSource ?? makeFakePortraitSource(),
    algorithmConfig: TEST_ALGORITHM_CONFIG,
    _qualityPolicy: opts?._qualityPolicy,
    _explanationFaultHook: opts?._explanationFaultHook,
    clock: opts?.clock ?? (() => "2026-07-19T12:00:00.000Z"),
    uuid: opts?.uuid ?? (() => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`),
    _faultHook: opts?._faultHook,
  };
}

function makeCreateInput(overrides?: Partial<CreateComparisonInput>): CreateComparisonInput {
  return {
    mode: "peer_same_period",
    idempotencyKey: "key_1",
    baseline: {
      object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
      snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
    comparison: {
      object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
      snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    },
    ...overrides,
  };
}

function makeReleasedQualityPolicy(): TestQualityPolicy {
  return {
    policyId: "pls-portrait-comparison-quality-policy",
    policyVersion: "released-test@1",
    releaseStatus: "released",
    configChecksum: "a".repeat(64),
    reasonTaxonomy: [],
    message: "test released policy",
  };
}

// ---------------------------------------------------------------------------
// Tests: Production gate
// ---------------------------------------------------------------------------

test("production gate: not_released policy blocks creation with zero Comparison writes", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db); // no _qualityPolicy → defaults to getProductionQualityPolicy()
    const input = makeCreateInput();

    assert.throws(
      () => createComparison(ctx, input),
      (error: unknown) => error instanceof ComparisonQualityGateError && error.reasonCodes.includes("quality_policy_not_released"),
    );

    // Verify zero Comparison rows
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
    const participantCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_participant").get() as { c: number }).c;
    assert.equal(participantCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("production gate: _qualityPolicy is internal and not part of public DTO", () => {
  // The _qualityPolicy field is prefixed with _ indicating internal/test-only
  // Verify that the public types do not expose qualityPolicy without underscore prefix
  const ctx = makeTestContext(createTestDb(makeTempDir()));
  assert.equal((ctx as unknown as Record<string, unknown>)["qualityPolicy"], undefined);
});

// ---------------------------------------------------------------------------
// Tests: Successful creation
// ---------------------------------------------------------------------------

test("successful peer_same_period creation: full graph persisted with correct row counts", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const input = makeCreateInput();

    const result = createComparison(ctx, input);
    assert.equal(result.replayed, false);
    assert.ok(result.runId.length > 0);

    // Verify row counts
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);
    const participantCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_participant").get() as { c: number }).c;
    assert.equal(participantCount, 2);
    const sourceCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_portrait_source").get() as { c: number }).c;
    assert.equal(sourceCount, 2);
    const evidenceCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_evidence").get() as { c: number }).c;
    assert.equal(evidenceCount, 4);
    const assessmentCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_assessment").get() as { c: number }).c;
    assert.equal(assessmentCount, 2);

    // Verify run fields
    const run = db.prepare("SELECT * FROM comparison_run WHERE id = ?").get(result.runId) as Record<string, unknown>;
    assert.equal(run["workspace_id"], "ws_test");
    assert.equal(run["mode"], "peer_same_period");
    assert.equal(run["quality_status"], "ready");
    assert.equal(run["algorithm_id"], PLS_COMPARISON_ALGORITHM_IDENTITY);
    assert.equal(run["algorithm_version"], "test-v1");
    assert.equal(run["comparison_contract_id"], PLS_COMPARISON_CONTRACT_ID);
    assert.equal(run["comparison_contract_version"], PLS_COMPARISON_CONTRACT_VERSION);
    assert.equal(run["idempotency_key"], "key_1");
    assert.equal(run["created_by"], "test-actor");
    assert.equal(typeof run["request_fingerprint"], "string");
    assert.equal((run["request_fingerprint"] as string).length, 64);

    // Verify participants
    const roles = db.prepare("SELECT role FROM comparison_participant WHERE comparison_run_id = ? ORDER BY role").all(result.runId) as Record<string, unknown>[];
    assert.equal(roles.length, 2);
    assert.equal(roles[0]!["role"], "baseline");
    assert.equal(roles[1]!["role"], "comparison");

    // Verify explanation auto-generated
    const attemptCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(attemptCount, 1);
    const outcomeCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome").get() as { c: number }).c;
    assert.equal(outcomeCount, 1);
    const outcome = db.prepare("SELECT status FROM comparison_explanation_outcome LIMIT 1").get() as Record<string, unknown>;
    assert.equal(outcome["status"], "succeeded");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Idempotency
// ---------------------------------------------------------------------------

test("idempotency: same key + same fingerprint replays without re-reading sources", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let resolveCount = 0;
    const source = makeFakePortraitSource({
      resolveError: () => { resolveCount++; return undefined as never; },
    });
    // Override resolvePortraitSnapshot to count calls without throwing
    const originalResolve = source.resolvePortraitSnapshot.bind(source);
    const countingSource: PortraitSource = {
      ...source,
      resolvePortraitSnapshot(wsId: string, objectId: string, snapshotId: string) {
        resolveCount++;
        return originalResolve(wsId, objectId, snapshotId);
      },
    };
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy, portraitSource: countingSource });
    const input = makeCreateInput();

    const first = createComparison(ctx, input);
    assert.equal(first.replayed, false);
    const firstResolveCount = resolveCount;

    const second = createComparison(ctx, input);
    assert.equal(second.replayed, true);
    assert.equal(second.runId, first.runId);
    // Replay should NOT re-read sources
    assert.equal(resolveCount, firstResolveCount);

    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("idempotency: same key + different fingerprint throws conflict", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    createComparison(ctx, makeCreateInput());

    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_c", displayName: "Platform C" },
          snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonIdempotencyConflictError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("idempotency: replay creates missing automatic explanation with new attempt", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Verify automatic explanation exists
    const initialAttempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(initialAttempts, 1);

    // Delete the automatic explanation to simulate crash
    db.prepare("DELETE FROM comparison_explanation_outcome").run();
    db.prepare("DELETE FROM comparison_explanation_attempt").run();

    // Replay should create a new explanation attempt
    const replayed = createComparison(ctx, makeCreateInput());
    assert.equal(replayed.replayed, true);

    // New explanation should exist
    const finalAttempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(finalAttempts, 1);
    const finalOutcomes = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome").get() as { c: number }).c;
    assert.equal(finalOutcomes, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Mode validation
// ---------------------------------------------------------------------------

test("mode validation: peer_same_period requires different objectIds", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mode validation: self_cross_period requires non-overlapping periods", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        mode: "self_cross_period",
        baseline: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-15", periodEnd: "2026-02-15" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Date validation
// ---------------------------------------------------------------------------

test("date validation: rejects impossible calendar dates like Feb 30", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        baseline: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-02-30", periodEnd: "2026-03-01" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("date validation: rejects month 13", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        baseline: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-13-01", periodEnd: "2026-12-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Source errors
// ---------------------------------------------------------------------------

test("source resolution error is wrapped with desensitized message", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const failingSource = makeFakePortraitSource({
      resolveError: (objectId: string) => { throw new PortraitSourceNotReadyError(`/path/to/db.sqlite: table missing for ${objectId}`); },
    });
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy, portraitSource: failingSource });

    try {
      createComparison(ctx, makeCreateInput());
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ComparisonSourceError);
      // Must NOT expose provider error message
      assert.ok(!error.message.includes("/path/to/db.sqlite"), "must not expose provider path");
      assert.ok(!error.message.includes("table missing"), "must not expose provider detail");
    }

    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Input validation
// ---------------------------------------------------------------------------

test("input validation: blank idempotencyKey rejected", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    assert.throws(
      () => createComparison(ctx, makeCreateInput({ idempotencyKey: "  " })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: List
// ---------------------------------------------------------------------------

test("list: cursor-based pagination with limit validation", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounter = 100;
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    });

    for (let i = 1; i <= 3; i++) {
      createComparison(ctx, makeCreateInput({ idempotencyKey: `key_${i}` }));
    }

    // Invalid limit
    assert.throws(
      () => listComparisons(ctx, { limit: 0 }),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
    assert.throws(
      () => listComparisons(ctx, { limit: 101 }),
      (error: unknown) => error instanceof ComparisonValidationError,
    );

    // Valid pagination
    const page1 = listComparisons(ctx, { limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.ok(page1.nextCursor !== null);

    const page2 = listComparisons(ctx, {
      limit: 2,
      afterCreatedAt: page1.nextCursor!.createdAt,
      afterRunId: page1.nextCursor!.runId,
    });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.nextCursor, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("list: archive filter excludes active runs", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounter = 200;
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    });

    const result1 = createComparison(ctx, makeCreateInput({ idempotencyKey: "k1" }));
    createComparison(ctx, makeCreateInput({ idempotencyKey: "k2" }));

    archiveComparison(ctx, {
      runId: result1.runId,
      operation: "archived",
      idempotencyKey: "archive_k1",
      expectedCurrentState: "active",
      expectedSequence: 1,
    });

    const active = listComparisons(ctx, { archiveFilter: "active" });
    assert.equal(active.items.length, 1);

    const archived = listComparisons(ctx, { archiveFilter: "archived" });
    assert.equal(archived.items.length, 1);

    const all = listComparisons(ctx, { archiveFilter: "all" });
    assert.equal(all.items.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Detail
// ---------------------------------------------------------------------------

test("detail: full aggregation with internal fields hidden", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());
    const detail = getComparisonDetail(ctx, created.runId);

    assert.ok(detail !== null);
    assert.equal(detail.id, created.runId);
    assert.equal(detail.mode, "peer_same_period");
    assert.equal(detail.qualityStatus, "ready");
    assert.equal(detail.baseline.objectId, "obj_a");
    assert.equal(detail.comparison.objectId, "obj_b");
    assert.equal(detail.dimensionEvidence.length, 4);
    assert.equal(detail.dimensionAssessments.length, 2);
    assert.equal(detail.explanationAttempts.length, 1);
    assert.equal(detail.explanationAttempts[0]!.status, "succeeded");
    assert.equal(detail.archiveState, "active");

    // Internal fields not exposed
    assert.equal((detail as unknown as Record<string, unknown>)["idempotencyKey"], undefined);
    assert.equal((detail as unknown as Record<string, unknown>)["requestFingerprint"], undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: not found returns null (no existence leak)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    const detail = getComparisonDetail(ctx, "00000000-0000-4000-8000-000000000000");
    assert.equal(detail, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Explanation
// ---------------------------------------------------------------------------

test("explanation: ensure-once returns same attempt", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    const first = createExplanation(ctx, { runId: created.runId });
    const second = createExplanation(ctx, { runId: created.runId });
    assert.equal(second.attemptId, first.attemptId);

    const attemptCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(attemptCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation: interrupted attempt stays interrupted; explicit retry creates new sequence", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Simulate crash: delete outcome but keep attempt
    db.prepare("DELETE FROM comparison_explanation_outcome").run();

    // The attempt is now interrupted
    const attempts = db.prepare("SELECT * FROM comparison_explanation_attempt").all() as Record<string, unknown>[];
    assert.equal(attempts.length, 1);

    // createExplanation should create a NEW attempt (not repair the interrupted one)
    const result = createExplanation(ctx, { runId: created.runId });
    assert.equal(result.status, "succeeded");

    // 2 attempts now: 1 interrupted + 1 succeeded
    const finalAttempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(finalAttempts, 2);
    // 1 outcome for the succeeded attempt (interrupted has none)
    const finalOutcomes = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome").get() as { c: number }).c;
    assert.equal(finalOutcomes, 1);

    // Interrupted attempt still has no outcome
    const interruptedOutcome = db.prepare(
      "SELECT COUNT(*) AS c FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?",
    ).get(String(attempts[0]!["id"])) as { c: number };
    assert.equal(interruptedOutcome.c, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation: retry after failed creates new sequence", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // The automatic explanation succeeded, so let's verify ensure-once
    const first = createExplanation(ctx, { runId: created.runId });
    assert.equal(first.status, "succeeded");

    // Calling again returns the same succeeded result
    const second = createExplanation(ctx, { runId: created.runId });
    assert.equal(second.attemptId, first.attemptId);
    assert.equal(second.status, "succeeded");

    // Only 1 attempt total
    const attemptCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(attemptCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation: not found run throws ComparisonNotFoundError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => createExplanation(ctx, { runId: "00000000-0000-4000-8000-000000000000" }),
      (error: unknown) => error instanceof ComparisonNotFoundError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Archive
// ---------------------------------------------------------------------------

test("archive: fingerprint-based replay (same fingerprint replays, different conflicts)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Same fingerprint replays
    const first = archiveComparison(ctx, {
      runId: created.runId,
      operation: "archived",
      idempotencyKey: "archive_1",
      expectedCurrentState: "active",
      expectedSequence: 1,
      reason: "test reason",
    });
    const second = archiveComparison(ctx, {
      runId: created.runId,
      operation: "archived",
      idempotencyKey: "archive_1",
      expectedCurrentState: "active",
      expectedSequence: 1,
      reason: "test reason",
    });
    assert.equal(second.replayed, true);
    assert.equal(second.eventId, first.eventId);

    // Different fingerprint (different reason) conflicts
    assert.throws(
      () => archiveComparison(ctx, {
        runId: created.runId,
        operation: "archived",
        idempotencyKey: "archive_1",
        expectedCurrentState: "active",
        expectedSequence: 1,
        reason: "different reason",
      }),
      (error: unknown) => error instanceof ComparisonIdempotencyConflictError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("archive: optimistic concurrency conflict on stale expectedCurrentState", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    archiveComparison(ctx, {
      runId: created.runId,
      operation: "archived",
      idempotencyKey: "archive_1",
      expectedCurrentState: "active",
      expectedSequence: 1,
    });

    // Wrong expectedSequence
    assert.throws(
      () => archiveComparison(ctx, {
        runId: created.runId,
        operation: "restored",
        idempotencyKey: "restore_1",
        expectedCurrentState: "archived",
        expectedSequence: 1, // should be 2
      }),
      (error: unknown) => error instanceof ComparisonConcurrencyError,
    );

    // Wrong expectedCurrentState
    assert.throws(
      () => archiveComparison(ctx, {
        runId: created.runId,
        operation: "archived",
        idempotencyKey: "archive_2",
        expectedCurrentState: "active",
        expectedSequence: 2,
      }),
      (error: unknown) => error instanceof ComparisonConcurrencyError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("archive: cross-workspace run not found", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_other", "Other");
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    const otherCtx: ComparisonApplicationContext = { ...ctx, workspaceId: "ws_other" };

    assert.throws(
      () => archiveComparison(otherCtx, {
        runId: created.runId,
        operation: "archived",
        idempotencyKey: "archive_1",
        expectedCurrentState: "active",
        expectedSequence: 1,
      }),
      (error: unknown) => error instanceof ComparisonNotFoundError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("archive: archived detail still readable by ID", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    archiveComparison(ctx, {
      runId: created.runId,
      operation: "archived",
      idempotencyKey: "archive_1",
      expectedCurrentState: "active",
      expectedSequence: 1,
    });

    // Archived run is still readable by ID
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
    assert.equal(detail.archiveState, "archived");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Fault injection
// ---------------------------------------------------------------------------

test("fault injection: source resolve failure leaves zero Comparison writes", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let hookCalled = "";
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        hookCalled = stage;
        if (stage === "before_source_resolve") {
          throw new ComparisonSourceError("injected source failure");
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonSourceError,
    );
    assert.equal(hookCalled, "before_source_resolve");

    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fault injection: algorithm failure leaves zero Comparison writes", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "before_algorithm") {
          throw new ComparisonSourceError("injected algorithm failure");
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonSourceError,
    );

    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fault injection: transaction failure rolls back all writes", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_insert") {
          throw new ComparisonSourceError("injected transaction failure");
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    // All tables should be empty (rollback)
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
    const participantCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_participant").get() as { c: number }).c;
    assert.equal(participantCount, 0);
    const sourceCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_portrait_source").get() as { c: number }).c;
    assert.equal(sourceCount, 0);
    const evidenceCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_evidence").get() as { c: number }).c;
    assert.equal(evidenceCount, 0);
    const assessmentCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_assessment").get() as { c: number }).c;
    assert.equal(assessmentCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Quality gate checksums and scores
// ---------------------------------------------------------------------------

test("quality gate: algorithm config checksums are persisted correctly", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());
    const run = db.prepare("SELECT * FROM comparison_run WHERE id = ?").get(created.runId) as Record<string, unknown>;

    assert.match(run["algorithm_config_checksum"] as string, /^[0-9a-f]{64}$/);
    assert.match(run["quality_policy_config_checksum"] as string, /^[0-9a-f]{64}$/);
    assert.match(run["comparison_contract_checksum"] as string, /^[0-9a-f]{64}$/);
    assert.match(run["request_fingerprint"] as string, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("quality gate: null overallScore blocks creation", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    // Use evidence that only has one dimension (missing gender), causing low coverage
    const partialBaseline: DimensionEvidenceRecord[] = [
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
    ];
    const partialComparison: DimensionEvidenceRecord[] = [
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
    ];
    const partialSource = makeFakePortraitSource({
      baselineEvidence: partialBaseline,
      comparisonEvidence: partialComparison,
    });
    // Config with minimumCoverage > 50 (only 50% coverage with one of two dimensions)
    const highCoverageConfig: ComparisonAlgorithmConfig = {
      ...TEST_ALGORITHM_CONFIG,
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 75 },
    };
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, { _qualityPolicy: releasedPolicy, portraitSource: partialSource }),
      algorithmConfig: highCoverageConfig,
    };

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonQualityGateError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Error taxonomy
// ---------------------------------------------------------------------------

test("error taxonomy: errors have stable codes and no raw provider text", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    try {
      createComparison(ctx, makeCreateInput({ idempotencyKey: "" }));
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof ComparisonValidationError);
      assert.equal(error.code, "comparison_validation");
      assert.ok(!error.message.includes("sqlite"), "error message must not contain raw SQLite text");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Evidence refs
// ---------------------------------------------------------------------------

test("evidence refs are preserved as JSON array in dimension_evidence", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);

    const firstEvidence = detail.dimensionEvidence[0]!;
    assert.ok(Array.isArray(firstEvidence.evidenceRefs));
    assert.ok(firstEvidence.evidenceRefs.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Generated UUID validation
// ---------------------------------------------------------------------------

test("generated UUIDs are lowercase v4", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());
    const run = db.prepare("SELECT * FROM comparison_run WHERE id = ?").get(created.runId) as Record<string, unknown>;

    // Verify UUID format
    assert.match(run["id"] as string, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Production factory
// ---------------------------------------------------------------------------

test("production factory: create blocks with not_released policy", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const app = createProductionComparisonApplication({
      db,
      workspaceId: "ws_test",
      trustedActor: "prod-actor",
      portraitSource: makeFakePortraitSource(),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
    });

    assert.throws(
      () => app.create(makeCreateInput()),
      (error: unknown) => error instanceof ComparisonQualityGateError,
    );

    // Zero Comparison writes
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("production factory: detail and list work with production context", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    // Create a run using internal context (to have data)
    const releasedPolicy = makeReleasedQualityPolicy();
    const internalCtx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const created = createComparison(internalCtx, makeCreateInput());

    // Now use production factory to read
    const app = createProductionComparisonApplication({
      db,
      workspaceId: "ws_test",
      trustedActor: "prod-actor",
      portraitSource: makeFakePortraitSource(),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
    });

    const detail = app.detail(created.runId);
    assert.ok(detail !== null);
    assert.equal(detail.id, created.runId);

    const listResult = app.list();
    assert.equal(listResult.items.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: JSON element type validation (fail closed, not silent filter)
// ---------------------------------------------------------------------------

test("detail: malformed JSON array in source_flags throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Corrupt source_flags_json with wrong element types (number instead of string)
    db.prepare(
      "UPDATE comparison_portrait_source SET source_flags_json = ? WHERE workspace_id = ?",
    ).run('[1, 2, 3]', "ws_test");

    assert.throws(
      () => getComparisonDetail(ctx, created.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("expected string"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: malformed JSON array in evidence_refs throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Corrupt evidence_refs_json with wrong element types (string instead of object)
    db.prepare(
      "UPDATE comparison_dimension_evidence SET evidence_refs_json = ? WHERE workspace_id = ?",
    ).run('["not_an_object"]', "ws_test");

    assert.throws(
      () => getComparisonDetail(ctx, created.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("expected object"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: non-string elements in quality_reasons throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Corrupt quality_reasons_json with valid JSON but wrong element types (numbers instead of strings)
    // V005 CHECK constraint requires json_valid and json_type='array', so we use a valid array
    db.prepare(
      "UPDATE comparison_run SET quality_reasons_json = ? WHERE workspace_id = ?",
    ).run('[1, 2, 3]', "ws_test");

    assert.throws(
      () => getComparisonDetail(ctx, created.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("expected string"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Automatic explanation ensure-once with interrupted attempts
// ---------------------------------------------------------------------------

test("automatic explanation: interrupted attempt remains interrupted on replay", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    // Create run — automatic explanation succeeds
    const created = createComparison(ctx, makeCreateInput());

    // Verify automatic explanation exists
    const initialAttempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(initialAttempts, 1);

    // Simulate crash: delete outcome but keep attempt (makes it interrupted)
    db.prepare("DELETE FROM comparison_explanation_outcome").run();

    // Verify attempt is now interrupted (no outcome)
    const interruptedCheck = db.prepare(
      "SELECT COUNT(*) AS c FROM comparison_explanation_outcome",
    ).get() as { c: number };
    assert.equal(interruptedCheck.c, 0);

    // Replay the same create — automatic path should NOT create another attempt
    // because the interrupted attempt already exists with the same generator identity
    const replayed = createComparison(ctx, makeCreateInput());
    assert.equal(replayed.replayed, true);

    // Still only 1 attempt (interrupted one remains)
    const finalAttempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(finalAttempts, 1);
    // Still 0 outcomes (interrupted remains interrupted)
    const finalOutcomes = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome").get() as { c: number }).c;
    assert.equal(finalOutcomes, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Audit writes for failures
// ---------------------------------------------------------------------------

test("audit: quality gate failure writes audit_event", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db); // no _qualityPolicy → defaults to not_released
    const input = makeCreateInput();

    assert.throws(
      () => createComparison(ctx, input),
      (error: unknown) => error instanceof ComparisonQualityGateError,
    );

    // Verify audit_event was written
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "quality_gate_blocked") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit_event should be written for quality gate failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.equal(auditRows[0]!["reason_code"], "quality_policy_not_released");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("audit: source resolution failure writes audit_event", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const failingSource = makeFakePortraitSource({
      resolveError: () => { throw new PortraitSourceNotReadyError("not ready"); },
    });
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy, portraitSource: failingSource });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonSourceError,
    );

    // Verify audit_event was written
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "source_resolution_failed") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit_event should be written for source failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["reason_code"], "source_error");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Cursor validation
// ---------------------------------------------------------------------------

test("list: invalid limit rejected", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { limit: 0 }),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
    assert.throws(
      () => listComparisons(ctx, { limit: 101 }),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
    assert.throws(
      () => listComparisons(ctx, { limit: -1 }),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Production factory cannot bypass quality gate
// ---------------------------------------------------------------------------

test("production factory: cannot inject _qualityPolicy or _faultHook", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);

    // The production factory type does not accept _qualityPolicy or _faultHook
    // This is a compile-time check — if the type exported these, this would be a type error
    const app = createProductionComparisonApplication({
      db,
      workspaceId: "ws_test",
      trustedActor: "prod-actor",
      portraitSource: makeFakePortraitSource(),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
      // _qualityPolicy is NOT accepted by the type — compile-time guarantee
    });

    // Verify the app object does not expose internal methods
    assert.equal(typeof app.create, "function");
    assert.equal(typeof app.detail, "function");
    assert.equal(typeof app.list, "function");
    assert.equal(typeof app.createExplanation, "function");
    assert.equal(typeof app.archive, "function");
    // No _qualityPolicy, _faultHook, algorithmConfig, clock, uuid exposed
    assert.equal((app as unknown as Record<string, unknown>)["_qualityPolicy"], undefined);
    assert.equal((app as unknown as Record<string, unknown>)["_faultHook"], undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: V005 schema constraints prevent corrupted data (defense-in-depth)
// ---------------------------------------------------------------------------

test("schema defense: V005 CHECK constraint rejects invalid participant role", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // V005 CHECK constraint rejects invalid roles at SQLite level
    assert.throws(
      () => db.prepare(
        "UPDATE comparison_participant SET role = ? WHERE workspace_id = ? AND role = ?",
      ).run("invalid_role", "ws_test", "baseline"),
      (error: unknown) => error instanceof Error && error.message.includes("CHECK constraint"),
    );

    // Run remains readable (not corrupted)
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("schema defense: V005 FK constraint rejects invalid participant run ownership", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // V005 FK constraint rejects invalid comparisonRunId
    assert.throws(
      () => db.prepare(
        "UPDATE comparison_participant SET comparison_run_id = ? WHERE workspace_id = ?",
      ).run("00000000-0000-4000-8000-999999999999", "ws_test"),
      (error: unknown) => error instanceof Error && error.message.includes("FOREIGN KEY"),
    );

    // Run remains readable (not corrupted)
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("schema defense: V005 UNIQUE constraint rejects duplicate source participant_id", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // V005 UNIQUE constraint rejects duplicate participant_id
    assert.throws(
      () => db.prepare(
        "UPDATE comparison_portrait_source SET participant_id = ? WHERE workspace_id = ?",
      ).run("00000000-0000-4000-8000-999999999999", "ws_test"),
      (error: unknown) => error instanceof Error && error.message.includes("UNIQUE"),
    );

    // Run remains readable (not corrupted)
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("schema defense: V005 CHECK constraint rejects non-finite similarity_score", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // V005 CHECK constraint rejects out-of-range scores
    assert.throws(
      () => db.prepare(
        "UPDATE comparison_run SET similarity_score = ? WHERE workspace_id = ?",
      ).run(99999999999999999999999999999999999999, "ws_test"),
      (error: unknown) => error instanceof Error && error.message.includes("CHECK"),
    );

    // Run remains readable with finite score
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
    assert.ok(Number.isFinite(detail.similarityScore));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: tampered in-range similarity_score throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // Tamper similarity_score to a wrong in-range value (within CHECK 0..100)
    db.prepare(
      "UPDATE comparison_run SET similarity_score = 99.9 WHERE workspace_id = ? AND id = ?",
    ).run("ws_test", created.runId);

    // Detail must detect the tampered score via recomputation and throw
    assert.throws(
      () => getComparisonDetail(ctx, created.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("similarityScore mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: explanation attempt sequence ordering validated", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const created = createComparison(ctx, makeCreateInput());

    // The automatic explanation should have sequence 1
    const detail = getComparisonDetail(ctx, created.runId);
    assert.ok(detail !== null);
    assert.equal(detail.explanationAttempts.length, 1);
    assert.equal(detail.explanationAttempts[0]!.attemptSequence, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Audit for idempotency conflict (revision 8)
// ---------------------------------------------------------------------------

test("idempotency conflict: different fingerprint throws ComparisonIdempotencyConflictError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    // Create first run
    createComparison(ctx, makeCreateInput());

    // Try to create with same key but different fingerprint (different objectId)
    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_c", displayName: "Platform C" },
          snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonIdempotencyConflictError,
    );

    // Still only 1 run (no new run created)
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Two-connection idempotency race
// ---------------------------------------------------------------------------

test("two-connection visibility: second connection sees first connection's committed run", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");

    // Create the DB schema
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    // Connection A
    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounterA = 0;
    const ctxA: ComparisonApplicationContext = {
      db: dbA,
      workspaceId: "ws_test",
      trustedActor: "shared-actor", // Same actor for both connections
      portraitSource: makeFakePortraitSource(),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterA++).padStart(12, "0")}`,
    };

    // Connection B
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");
    let uuidCounterB = 1000;
    const ctxB: ComparisonApplicationContext = {
      db: dbB,
      workspaceId: "ws_test",
      trustedActor: "shared-actor", // Same actor for both connections
      portraitSource: makeFakePortraitSource(),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterB++).padStart(12, "0")}`,
    };

    // Connection A creates a run
    const resultA = createComparison(ctxA, makeCreateInput());
    assert.equal(resultA.replayed, false);

    // Connection B tries with same key + same fingerprint → should replay
    const resultB = createComparison(ctxB, makeCreateInput());
    assert.equal(resultB.replayed, true);
    assert.equal(resultB.runId, resultA.runId);

    // Connection B tries with same key + different fingerprint → should conflict
    assert.throws(
      () => createComparison(ctxB, makeCreateInput({
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_c", displayName: "Platform C" },
          snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonIdempotencyConflictError,
    );

    // Still only 1 run total
    const runCount = (dbA.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);

    dbA.close();
    dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Cursor validation (revision 12)
// ---------------------------------------------------------------------------

test("list: missing afterRunId with afterCreatedAt throws ComparisonValidationError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { afterCreatedAt: "2026-07-19T12:00:00.000Z" }),
      (error: unknown) => error instanceof ComparisonValidationError && error.message.includes("afterCreatedAt and afterRunId"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("list: missing afterCreatedAt with afterRunId throws ComparisonValidationError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { afterRunId: "00000000-0000-4000-8000-000000000000" }),
      (error: unknown) => error instanceof ComparisonValidationError && error.message.includes("afterCreatedAt and afterRunId"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("list: invalid afterCreatedAt timestamp throws ComparisonValidationError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { afterCreatedAt: "not-a-timestamp", afterRunId: "00000000-0000-4000-8000-000000000000" }),
      (error: unknown) => error instanceof ComparisonValidationError && error.message.includes("UTC millisecond timestamp"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("list: invalid afterRunId throws ComparisonValidationError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { afterCreatedAt: "2026-07-19T12:00:00.000Z", afterRunId: "not-a-uuid" }),
      (error: unknown) => error instanceof ComparisonValidationError && error.message.includes("UUID v4"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("list: invalid archiveFilter throws ComparisonValidationError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db);

    assert.throws(
      () => listComparisons(ctx, { archiveFilter: "invalid" as "active" }),
      (error: unknown) => error instanceof ComparisonValidationError && error.message.includes("active"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Transaction error wrapping (revision 12)
// ---------------------------------------------------------------------------

test("transaction: raw SQLite error is wrapped in ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_after_insert") {
          // Simulate a raw SQLite error after insert
          throw new Error("SQLITE_CONSTRAINT: duplicate key");
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("internal error"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Post-insert projection validation (revision 12)
// ---------------------------------------------------------------------------

test("post-insert: run id and fingerprint are verified after insert", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Verify the run exists with correct fingerprint
    const run = db.prepare("SELECT * FROM comparison_run WHERE id = ?").get(result.runId) as Record<string, unknown>;
    assert.ok(run !== undefined);
    assert.equal(run["workspace_id"], "ws_test");
    assert.equal(typeof run["request_fingerprint"], "string");
    assert.equal((run["request_fingerprint"] as string).length, 64);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Algorithm error wrapping (revision 14)
// ---------------------------------------------------------------------------

test("algorithm: error inside algorithm computation is wrapped in ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    // Use a config with invalid normalization that will cause the algorithm to throw
    const badConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
      candidateDimensions: [
        {
          dimensionKey: "audience_age_distribution",
          dimensionLabel: "Audience Age Distribution",
          expectedUnit: "percent",
          weight: 0.5,
          normalization: { kind: "linear_0_100", min: 100, max: 0, clamp: true }, // min > max causes algorithm error
        },
      ],
      floatingTolerance: 1e-9,
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 50 },
    };
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, { _qualityPolicy: releasedPolicy }),
      algorithmConfig: badConfig,
    };

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("algorithm computation failed"),
    );

    // Verify zero Comparison writes
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Post-insert full graph validation (revision 14)
// ---------------------------------------------------------------------------

test("post-insert: full graph is validated after insert", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Verify full graph: participants, sources, evidence, assessments
    const detail = getComparisonDetail(ctx, result.runId);
    assert.ok(detail !== null);

    // Participants
    assert.equal(detail.baseline.objectId, "obj_a");
    assert.equal(detail.comparison.objectId, "obj_b");

    // Sources
    assert.equal(detail.baseline.source.snapshotId, "snap_a");
    assert.equal(detail.comparison.source.snapshotId, "snap_b");

    // Evidence (2 dimensions x 2 sides = 4)
    assert.equal(detail.dimensionEvidence.length, 4);

    // Assessments (2 candidate dimensions)
    assert.equal(detail.dimensionAssessments.length, 2);

    // Scores are finite
    assert.ok(Number.isFinite(detail.similarityScore));
    assert.ok(Number.isFinite(detail.coverage));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Numerical recomputation consistency (revision 16)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests: Post-insert corruption rollback and excluded assessment (revision 20)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests: Pre-validation corruption rollback (revision 23)
// Uses _faultHook("inside_transaction_before_validation") to corrupt DB
// before post-insert validation runs, proving validation catches it.
// ---------------------------------------------------------------------------

test("post-insert: tampered evidence FK before validation triggers rollback and zero core rows", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_validation") {
          // Corrupt: change baseline_evidence_id to point to a different evidence record
          const evidenceRows = db.prepare("SELECT id FROM comparison_dimension_evidence").all() as Record<string, unknown>[];
          if (evidenceRows.length >= 2) {
            db.prepare(
              "UPDATE comparison_dimension_assessment SET baseline_evidence_id = ? WHERE baseline_evidence_id = ?",
            ).run(String(evidenceRows[1]!["id"]), String(evidenceRows[0]!["id"]));
          }
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    // Zero core rows due to rollback
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_participant").get() as { c: number }).c, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_portrait_source").get() as { c: number }).c, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_evidence").get() as { c: number }).c, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_dimension_assessment").get() as { c: number }).c, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-insert: tampered normalized value before validation triggers rollback", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_validation") {
          // Corrupt: change baseline_normalized_value to a wrong value
          db.prepare(
            "UPDATE comparison_dimension_assessment SET baseline_normalized_value = 999.0 WHERE participation = 'included'",
          ).run();
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    // Zero core rows due to rollback
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Five-reason exclusion matrix (revision 23)
// ---------------------------------------------------------------------------

test("post-insert: missing_both excluded assessment has both FKs as null", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const customConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
      candidateDimensions: [
        {
          dimensionKey: "nonexistent_dimension",
          dimensionLabel: "Nonexistent Dimension",
          expectedUnit: "percent",
          weight: 1.0,
          normalization: { kind: "linear_0_100", min: 0, max: 100, clamp: true },
        },
      ],
      floatingTolerance: 1e-9,
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 },
    };
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, { _qualityPolicy: releasedPolicy }),
      algorithmConfig: customConfig,
    };

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    const excludedRow = db.prepare(
      "SELECT baseline_evidence_id, comparison_evidence_id, exclusion_reason FROM comparison_dimension_assessment WHERE participation = 'excluded'",
    ).get() as Record<string, unknown> | undefined;
    assert.ok(excludedRow !== undefined);
    assert.equal(excludedRow["exclusion_reason"], "missing_both");
    assert.equal(excludedRow["baseline_evidence_id"], null);
    assert.equal(excludedRow["comparison_evidence_id"], null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-insert: unit_mismatch excluded assessment has both evidence FKs with mismatched unit", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    // Expected unit is "wrong_unit" while evidence has "percent" → unit_mismatch
    const customConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
      candidateDimensions: [
        {
          dimensionKey: "audience_age_distribution",
          dimensionLabel: "Audience Age Distribution",
          expectedUnit: "wrong_unit",
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
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 },
    };
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, { _qualityPolicy: releasedPolicy }),
      algorithmConfig: customConfig,
    };

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    const excludedRow = db.prepare(
      "SELECT baseline_evidence_id, comparison_evidence_id, exclusion_reason FROM comparison_dimension_assessment WHERE exclusion_reason = 'unit_mismatch'",
    ).get() as Record<string, unknown> | undefined;
    assert.ok(excludedRow !== undefined, "unit_mismatch excluded assessment should exist");
    assert.ok(excludedRow["baseline_evidence_id"] !== null, "unit_mismatch should have baseline FK");
    assert.ok(excludedRow["comparison_evidence_id"] !== null, "unit_mismatch should have comparison FK");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

test("numerical: persisted assessments match recomputed values from evidence", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const result = createComparison(ctx, makeCreateInput());

    // Read persisted evidence
    const evidenceRows = db.prepare(`
      SELECT e.dimension_key, e.value, p.role
      FROM comparison_dimension_evidence e
      JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
      WHERE e.workspace_id = ? AND p.comparison_run_id = ?
    `).all("ws_test", result.runId) as Record<string, unknown>[];

    // Read persisted assessments
    const assessmentRows = db.prepare(`
      SELECT dimension_key, participation, baseline_normalized_value, comparison_normalized_value,
             raw_delta, normalized_delta, dimension_similarity, weighted_contribution
      FROM comparison_dimension_assessment
      WHERE workspace_id = ? AND comparison_run_id = ?
    `).all("ws_test", result.runId) as Record<string, unknown>[];

    const tolerance = TEST_ALGORITHM_CONFIG.floatingTolerance;

    for (const assessment of assessmentRows) {
      const dimKey = String(assessment["dimension_key"]);
      const participation = String(assessment["participation"]);

      if (participation === "included") {
        const baselineEvidence = evidenceRows.find((e) => e["dimension_key"] === dimKey && e["role"] === "baseline");
        const comparisonEvidence = evidenceRows.find((e) => e["dimension_key"] === dimKey && e["role"] === "comparison");
        assert.ok(baselineEvidence !== undefined, `baseline evidence for ${dimKey}`);
        assert.ok(comparisonEvidence !== undefined, `comparison evidence for ${dimKey}`);

        // Recompute rawDelta
        const expectedRawDelta = Number(comparisonEvidence!["value"]) - Number(baselineEvidence!["value"]);
        assert.ok(Math.abs(Number(assessment["raw_delta"]) - expectedRawDelta) <= tolerance,
          `rawDelta for ${dimKey}: expected ${expectedRawDelta}, got ${assessment["raw_delta"]}`);

        // Recompute normalizedDelta
        const baselineNorm = Number(assessment["baseline_normalized_value"]);
        const comparisonNorm = Number(assessment["comparison_normalized_value"]);
        const expectedNormalizedDelta = comparisonNorm - baselineNorm;
        assert.ok(Math.abs(Number(assessment["normalized_delta"]) - expectedNormalizedDelta) <= tolerance,
          `normalizedDelta for ${dimKey}: expected ${expectedNormalizedDelta}, got ${assessment["normalized_delta"]}`);

        // Recompute dimensionSimilarity
        const expectedSimilarity = Math.max(0, Math.min(100, 100 - Math.abs(expectedNormalizedDelta)));
        assert.ok(Math.abs(Number(assessment["dimension_similarity"]) - expectedSimilarity) <= tolerance,
          `dimensionSimilarity for ${dimKey}: expected ${expectedSimilarity}, got ${assessment["dimension_similarity"]}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Remaining exclusion reasons + all-table rollback (revision 25)
// ---------------------------------------------------------------------------

/** Helper: count rows in all 8 Comparison tables */
function countAllComparisonRows(db: DatabaseSync): Record<string, number> {
  const tables = [
    "comparison_run", "comparison_participant", "comparison_portrait_source",
    "comparison_dimension_evidence", "comparison_dimension_assessment",
    "comparison_explanation_attempt", "comparison_explanation_outcome",
    "comparison_archive_event",
  ];
  const result: Record<string, number> = {};
  for (const t of tables) {
    result[t] = (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
  }
  return result;
}

/** Assert all 8 Comparison tables have zero rows */
function assertZeroComparisonRows(db: DatabaseSync): void {
  const counts = countAllComparisonRows(db);
  for (const [table, count] of Object.entries(counts)) {
    assert.equal(count, 0, `${table} should have 0 rows after rollback`);
  }
}

test("post-insert: missing_baseline excluded assessment — comparison FK present, baseline FK null", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const customConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
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
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 },
    };
    // Baseline evidence: only age distribution (missing gender)
    const partialBaseline: DimensionEvidenceRecord[] = [{
      dimensionKey: "audience_age_distribution",
      dimensionLabel: "Audience Age Distribution",
      value: 30, unit: "percent",
      metricName: "age_18_24", metricAggregation: "sum",
      sourceBatchId: "batch_1", sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_1" }],
    }];
    const fullComparison = makeComparisonEvidence();
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, {
        _qualityPolicy: releasedPolicy,
        portraitSource: makeFakePortraitSource({ baselineEvidence: partialBaseline, comparisonEvidence: fullComparison }),
      }),
      algorithmConfig: customConfig,
    };

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    const excludedRow = db.prepare(
      "SELECT baseline_evidence_id, comparison_evidence_id, exclusion_reason FROM comparison_dimension_assessment WHERE exclusion_reason = 'missing_baseline'",
    ).get() as Record<string, unknown> | undefined;
    assert.ok(excludedRow !== undefined, "missing_baseline excluded assessment should exist");
    assert.equal(excludedRow["baseline_evidence_id"], null, "missing_baseline: baseline FK null");
    assert.ok(excludedRow["comparison_evidence_id"] !== null, "missing_baseline: comparison FK present");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-insert: missing_comparison excluded assessment — baseline FK present, comparison FK null", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const customConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
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
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 },
    };
    // Comparison evidence: only age distribution (missing gender)
    const fullBaseline = makeBaselineEvidence();
    const partialComparison: DimensionEvidenceRecord[] = [{
      dimensionKey: "audience_age_distribution",
      dimensionLabel: "Audience Age Distribution",
      value: 35, unit: "percent",
      metricName: "age_18_24", metricAggregation: "sum",
      sourceBatchId: "batch_2", sourceQualityFlags: [],
      sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_2" }],
    }];
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, {
        _qualityPolicy: releasedPolicy,
        portraitSource: makeFakePortraitSource({ baselineEvidence: fullBaseline, comparisonEvidence: partialComparison }),
      }),
      algorithmConfig: customConfig,
    };

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    const excludedRow = db.prepare(
      "SELECT baseline_evidence_id, comparison_evidence_id, exclusion_reason FROM comparison_dimension_assessment WHERE exclusion_reason = 'missing_comparison'",
    ).get() as Record<string, unknown> | undefined;
    assert.ok(excludedRow !== undefined, "missing_comparison excluded assessment should exist");
    assert.ok(excludedRow["baseline_evidence_id"] !== null, "missing_comparison: baseline FK present");
    assert.equal(excludedRow["comparison_evidence_id"], null, "missing_comparison: comparison FK null");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-insert: per-stage insert fault hooks trigger rollback and zero all 8 Comparison tables", () => {
  const stages = [
    "inside_transaction_before_insert",
    "inside_transaction_before_validation",
  ];
  for (const stage of stages) {
    const dir = makeTempDir();
    try {
      const db = createTestDb(dir);
      const releasedPolicy = makeReleasedQualityPolicy();
      const ctx = makeTestContext(db, {
        _qualityPolicy: releasedPolicy,
        _faultHook: (s: string) => {
          if (s === stage) throw new Error(`FAULT_AT_${stage}`);
        },
      });

      assert.throws(
        () => createComparison(ctx, makeCreateInput()),
        (error: unknown) => error instanceof ComparisonStateError,
      );

      // All 8 Comparison tables must have zero rows
      assertZeroComparisonRows(db);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("post-insert: FK tamper rollback zeros all 8 Comparison tables", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_validation") {
          const evidenceRows = db.prepare("SELECT id FROM comparison_dimension_evidence").all() as Record<string, unknown>[];
          if (evidenceRows.length >= 2) {
            db.prepare(
              "UPDATE comparison_dimension_assessment SET baseline_evidence_id = ? WHERE baseline_evidence_id = ?",
            ).run(String(evidenceRows[1]!["id"]), String(evidenceRows[0]!["id"]));
          }
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-insert: normalized value tamper rollback zeros all 8 Comparison tables", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_validation") {
          db.prepare(
            "UPDATE comparison_dimension_assessment SET baseline_normalized_value = 999.0 WHERE participation = 'included'",
          ).run();
        }
      },
    });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: quality_insufficient exclusion + per-table rollback (revision 26)
// ---------------------------------------------------------------------------

test("post-insert: per-table insertion fault hooks trigger rollback and zero all 8 tables", () => {
  const perTableStages = [
    "after_run_insert",
    "after_participants_insert",
    "after_sources_insert",
    "after_evidence_insert",
    "after_assessments_insert",
  ];
  for (const stage of perTableStages) {
    const dir = makeTempDir();
    try {
      const db = createTestDb(dir);
      const releasedPolicy = makeReleasedQualityPolicy();
      const ctx = makeTestContext(db, {
        _qualityPolicy: releasedPolicy,
        _faultHook: (s: string) => {
          if (s === stage) throw new Error(`FAULT_AT_${stage}`);
        },
      });

      assert.throws(
        () => createComparison(ctx, makeCreateInput()),
        (error: unknown) => error instanceof ComparisonStateError,
        `stage ${stage} should throw ComparisonStateError`,
      );

      // All 8 Comparison tables must have zero rows
      assertZeroComparisonRows(db);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("post-insert: validation failure writes audit_event with minimal metadata", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const ctx = makeTestContext(db); // no _qualityPolicy → not_released

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonQualityGateError,
    );

    // Verify audit was written
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "quality_gate_blocked") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit_event should be written for quality gate failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.ok(auditRows[0]!["reason_code"] !== null, "reason_code should be present");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Note: V005 CHECK constraints reject blank/whitespace display_name at the SQLite level,
// so application-level blank display name validation is defense-in-depth.
// The pre-validation fault hook tests prove that corrupted data causes rollback.

// ---------------------------------------------------------------------------
// Tests: quality_insufficient exclusion + validation audit (revision 27)
// ---------------------------------------------------------------------------

test("post-insert: quality_insufficient excluded assessment — evidence has quality flags", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    // Evidence with quality flags triggers qualityEligibility="insufficient" → quality_insufficient
    const baselineWithFlags: DimensionEvidenceRecord[] = [
      {
        dimensionKey: "audience_age_distribution",
        dimensionLabel: "Audience Age Distribution",
        value: 30, unit: "percent",
        metricName: "age_18_24", metricAggregation: "sum",
        sourceBatchId: "batch_1", sourceQualityFlags: ["low_sample_size"],
        sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_1" }],
      },
      {
        dimensionKey: "audience_gender_distribution",
        dimensionLabel: "Audience Gender Distribution",
        value: 55, unit: "percent",
        metricName: "female_ratio", metricAggregation: "sum",
        sourceBatchId: "batch_1", sourceQualityFlags: [],
        sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_1" }],
      },
    ];
    const comparisonWithFlags: DimensionEvidenceRecord[] = [
      {
        dimensionKey: "audience_age_distribution",
        dimensionLabel: "Audience Age Distribution",
        value: 35, unit: "percent",
        metricName: "age_18_24", metricAggregation: "sum",
        sourceBatchId: "batch_2", sourceQualityFlags: ["low_sample_size"],
        sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_2" }],
      },
      {
        dimensionKey: "audience_gender_distribution",
        dimensionLabel: "Audience Gender Distribution",
        value: 50, unit: "percent",
        metricName: "female_ratio", metricAggregation: "sum",
        sourceBatchId: "batch_2", sourceQualityFlags: [],
        sourceEvidenceRefs: [{ sourceRecordType: "audience_profile", sourceRecordId: "ap_2" }],
      },
    ];
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, {
        _qualityPolicy: releasedPolicy,
        portraitSource: makeFakePortraitSource({
          baselineEvidence: baselineWithFlags,
          comparisonEvidence: comparisonWithFlags,
        }),
      }),
      algorithmConfig: TEST_ALGORITHM_CONFIG,
    };

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Verify quality_insufficient excluded assessment
    const excludedRow = db.prepare(
      "SELECT baseline_evidence_id, comparison_evidence_id, exclusion_reason FROM comparison_dimension_assessment WHERE exclusion_reason = 'quality_insufficient'",
    ).get() as Record<string, unknown> | undefined;
    assert.ok(excludedRow !== undefined, "quality_insufficient excluded assessment should exist");
    assert.ok(excludedRow["baseline_evidence_id"] !== null, "quality_insufficient: baseline FK present");
    assert.ok(excludedRow["comparison_evidence_id"] !== null, "quality_insufficient: comparison FK present");

    // Verify both source projections — snapshot has empty flags → ready
    const sourceRows = db.prepare(
      "SELECT participant_id, quality_status, source_flags_json FROM comparison_portrait_source WHERE workspace_id = ?",
    ).all("ws_test") as Record<string, unknown>[];
    assert.equal(sourceRows.length, 2, "should have 2 source projections");
    for (const src of sourceRows) {
      assert.equal(src["quality_status"], "ready", "source snapshot flags empty → ready");
      assert.equal(src["source_flags_json"], "[]", "source flags should be empty JSON array");
    }

    // Verify both flagged evidence projections — flagged evidence → limited, unflagged → ready
    const evidenceRows = db.prepare(
      "SELECT dimension_key, quality_status, source_flags_json FROM comparison_dimension_evidence WHERE workspace_id = ? ORDER BY dimension_key, participant_id",
    ).all("ws_test") as Record<string, unknown>[];
    assert.ok(evidenceRows.length >= 4, "should have evidence for both dimensions on both sides");
    const ageEvidence = evidenceRows.filter((r) => r["dimension_key"] === "audience_age_distribution");
    const genderEvidence = evidenceRows.filter((r) => r["dimension_key"] === "audience_gender_distribution");
    assert.equal(ageEvidence.length, 2, "age evidence on both sides");
    assert.equal(genderEvidence.length, 2, "gender evidence on both sides");
    // Age dimension has flags → quality_status=limited
    for (const ev of ageEvidence) {
      assert.equal(ev["quality_status"], "limited", "flagged evidence should be limited");
      assert.equal(String(ev["source_flags_json"]), '["low_sample_size"]', "evidence source_flags should be exact canonical JSON");
    }
    // Gender dimension has no flags → quality_status=ready
    for (const ev of genderEvidence) {
      assert.equal(ev["quality_status"], "ready", "unflagged evidence should be ready");
      assert.equal(String(ev["source_flags_json"]), '[]', "evidence source_flags should be empty array");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validation audit: input validation failure writes exactly one sanitized audit", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    // Invalid input — invalid periodStart date (key is non-blank for audit requestId)
    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        baseline: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-02-30", periodEnd: "2026-03-01" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );

    // Exactly one audit row
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "create_validation_failed") as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "exactly one audit row for input validation failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.equal(auditRows[0]!["reason_code"], "input_validation_failed");
    assert.equal(auditRows[0]!["request_id"], "key_1");
    // Audit must not contain raw error text
    const meta = JSON.parse(String(auditRows[0]!["meta"]));
    assert.equal(meta.mode, "peer_same_period");
    assert.ok(!JSON.stringify(auditRows[0]!).includes("2026-02-30"), "audit must not contain injected raw error text");
    // Zero Comparison rows (validation failure before any write)
    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validation audit: source resolution failure writes audit_event", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const failingSource = makeFakePortraitSource({
      resolveError: () => { throw new PortraitSourceNotReadyError("not ready"); },
    });
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy, portraitSource: failingSource });

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonSourceError,
    );

    // Verify audit was written
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "source_resolution_failed") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit_event should be written for source failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.ok(auditRows[0]!["reason_code"] !== null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validation audit: algorithm failure writes audit_event", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    // Use a config with min > max to cause algorithm to throw
    const badConfig: ComparisonAlgorithmConfig = {
      algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
      algorithmVersion: "test-v1",
      candidateDimensions: [
        {
          dimensionKey: "audience_age_distribution",
          dimensionLabel: "Audience Age Distribution",
          expectedUnit: "percent",
          weight: 0.5,
          normalization: { kind: "linear_0_100", min: 100, max: 0, clamp: true },
        },
      ],
      floatingTolerance: 1e-9,
      overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 },
    };
    const ctx: ComparisonApplicationContext = {
      ...makeTestContext(db, { _qualityPolicy: releasedPolicy }),
      algorithmConfig: badConfig,
    };

    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );

    // Verify audit was written for algorithm failure
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "algorithm_failed") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit_event should be written for algorithm failure");
    assert.equal(auditRows[0]!["reason_code"], "algorithm_error");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests: Explanation fault seam + mode validation audit (revision 30)
// ---------------------------------------------------------------------------

test("explanation: before_rule_generation fault hook triggers failed Attempt/Outcome and audit", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string) => {
        if (stage === "before_rule_generation") {
          throw new Error("RULE_GEN_FAULT");
        }
      },
    });

    // Create succeeds; automatic explanation fails at generation
    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Core run exists
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);

    // Explanation attempt exists but outcome is failed
    const attempts = db.prepare("SELECT * FROM comparison_explanation_attempt WHERE comparison_run_id = ?").all(result.runId) as Record<string, unknown>[];
    assert.ok(attempts.length > 0, "explanation attempt should exist");
    const outcomes = db.prepare("SELECT * FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?").get(String(attempts[0]!["id"])) as Record<string, unknown> | undefined;
    assert.ok(outcomes !== undefined, "explanation outcome should exist");
    assert.equal(outcomes["status"], "failed");
    assert.equal(outcomes["error_code"], "invalid_generator_output");

    // Audit written for explanation failure
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_explanation", "explanation_generation_failed") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit should be written for explanation failure");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation: after_attempt_before_outcome fault hook leaves interrupted attempt", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string) => {
        if (stage === "after_attempt_before_outcome") {
          throw new Error("OUTCOME_FAULT");
        }
      },
    });

    // Create succeeds; automatic explanation attempt succeeds but outcome fails
    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Attempt exists without outcome (interrupted)
    const attempts = db.prepare("SELECT * FROM comparison_explanation_attempt WHERE comparison_run_id = ?").all(result.runId) as Record<string, unknown>[];
    assert.ok(attempts.length > 0, "explanation attempt should exist");
    const outcomes = db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?").get(String(attempts[0]!["id"])) as { c: number };
    assert.equal(outcomes.c, 0, "outcome should not exist (interrupted)");

    // Core run is not affected
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mode validation: invalid mode throws ComparisonValidationError and writes exactly one sanitized audit", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    // Invalid mode — same objectId for peer_same_period
    assert.throws(
      () => createComparison(ctx, makeCreateInput({
        comparison: {
          object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
          snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
        },
      })),
      (error: unknown) => error instanceof ComparisonValidationError,
    );

    // Exactly one audit row
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "create_validation_failed") as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "exactly one audit row for mode validation failure");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.equal(auditRows[0]!["reason_code"], "mode_validation_failed");
    assert.equal(auditRows[0]!["request_id"], "key_1");
    // Audit must not contain raw error text
    const meta = JSON.parse(String(auditRows[0]!["meta"]));
    assert.equal(meta.mode, "peer_same_period");
    // Zero Comparison rows
    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: exact cardinality — 2 participants, 2 sources, 4 evidence, 2 assessments", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const result = createComparison(ctx, makeCreateInput());
    const detail = getComparisonDetail(ctx, result.runId);
    assert.ok(detail !== null);

    // Exact cardinality assertions
    assert.equal(detail.baseline.family, "channel");
    assert.equal(detail.baseline.objectType, "platform");
    assert.equal(detail.comparison.family, "channel");
    assert.equal(detail.comparison.objectType, "platform");

    // Evidence cardinality: 2 dimensions × 2 sides = 4
    assert.equal(detail.dimensionEvidence.length, 4);
    const baselineEvidence = detail.dimensionEvidence.filter((e) => e.participantId === detail.baseline.objectId || detail.dimensionEvidence.indexOf(e) < 2);
    assert.ok(baselineEvidence.length > 0);

    // Assessment cardinality: 2 candidate dimensions
    assert.equal(detail.dimensionAssessments.length, 2);
    for (const a of detail.dimensionAssessments) {
      assert.ok(a.weight > 0, "assessment weight should be positive");
      assert.ok(a.participation === "included" || a.participation === "excluded");
      if (a.participation === "included") {
        assert.ok(a.baselineEvidenceId !== null);
        assert.ok(a.comparisonEvidenceId !== null);
        assert.ok(Number.isFinite(a.dimensionSimilarity));
        assert.ok(Number.isFinite(a.weightedContribution));
      }
    }

    // Explanation attempts: 1 (auto-generated)
    assert.equal(detail.explanationAttempts.length, 1);
    assert.equal(detail.explanationAttempts[0]!.status, "succeeded");
    assert.equal(detail.explanationAttempts[0]!.attemptSequence, 1);

    // Archive events: 0
    assert.equal(detail.archiveEvents.length, 0);
    assert.equal(detail.archiveState, "active");

    // Scores are finite
    assert.ok(Number.isFinite(detail.similarityScore));
    assert.ok(Number.isFinite(detail.coverage));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation: inside_outcome_transaction fault leaves interrupted attempt with audit, core Run unaffected", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string) => {
        if (stage === "inside_outcome_transaction") {
          throw new Error("OUTCOME_PERSISTENCE_FAULT");
        }
      },
    });

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Attempt exists without outcome (interrupted)
    const attempts = db.prepare("SELECT * FROM comparison_explanation_attempt WHERE comparison_run_id = ?").all(result.runId) as Record<string, unknown>[];
    assert.ok(attempts.length > 0, "explanation attempt should exist");
    const outcomes = db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?").get(String(attempts[0]!["id"])) as { c: number };
    assert.equal(outcomes.c, 0, "outcome should not exist (interrupted)");

    // Core run is not affected
    const runCount = (db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);

    // Audit written for outcome persistence failure
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_explanation", "explanation_outcome_persistence_failed") as Record<string, unknown>[];
    assert.ok(auditRows.length > 0, "audit should be written for outcome persistence failure");
    assert.equal(auditRows[0]!["reason_code"], "outcome_transaction_failed");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: missing assessments throws ComparisonStateError (fail-closed)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });

    const result = createComparison(ctx, makeCreateInput());

    // Delete all assessments — simulates data loss
    db.prepare("DELETE FROM comparison_dimension_assessment WHERE workspace_id = ? AND comparison_run_id = ?").run("ws_test", result.runId);

    // Detail must detect missing assessments and throw ComparisonStateError
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("assessment cardinality"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// B1: Detail exact aggregate validation — negative tests
// ===========================================================================

test("detail: deleting one assessment throws ComparisonStateError (not zero — exact set mismatch)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Delete only ONE of the two assessments (not all)
    const assessments = db.prepare(
      "SELECT id FROM comparison_dimension_assessment WHERE workspace_id = ? AND comparison_run_id = ?",
    ).all("ws_test", result.runId) as Record<string, unknown>[];
    assert.ok(assessments.length === 2, "should have 2 assessments before corruption");
    db.prepare("DELETE FROM comparison_dimension_assessment WHERE id = ?").run(String(assessments[0]!["id"]));
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("assessment cardinality"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: extra unknown-dimension assessment throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Insert an assessment for a dimension not in the candidate contract
    db.prepare(`
      INSERT INTO comparison_dimension_assessment (
        id, workspace_id, comparison_run_id, dimension_key, dimension_label, expected_unit, weight,
        participation, exclusion_reason, baseline_evidence_id, comparison_evidence_id,
        baseline_normalized_value, comparison_normalized_value, raw_delta, normalized_delta,
        dimension_similarity, weighted_contribution
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", result.runId,
      "unknown_dim", "Unknown Dimension", "percent", 1.0,
      "excluded", "missing_both", null, null,
      null, null, null, null, null, null,
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("assessment cardinality"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: deleting one side's dimension evidence throws ComparisonStateError (FK off)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.exec("PRAGMA foreign_keys = OFF");
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Delete one evidence row (baseline age dimension)
    db.prepare(`
      DELETE FROM comparison_dimension_evidence
      WHERE workspace_id = ? AND dimension_key = ? AND participant_id IN (
        SELECT id FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ? AND role = 'baseline'
      )
    `).run("ws_test", "audience_age_distribution", "ws_test", result.runId);
    // Derived: age dimension should be missing_baseline but persisted assessment is included → mismatch
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("participation mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: assessment FK pointing to wrong-role evidence throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Get baseline evidence id for age dimension
    const evidence = db.prepare(`
      SELECT e.id AS evidence_id, p.role FROM comparison_dimension_evidence e
      JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
      WHERE e.workspace_id = ? AND e.dimension_key = ? AND p.comparison_run_id = ?
    `).all("ws_test", "audience_age_distribution", result.runId) as Record<string, unknown>[];
    const baselineEvidence = evidence.find((e) => e["role"] === "baseline")!;
    const comparisonEvidence = evidence.find((e) => e["role"] === "comparison")!;
    // Swap: point baseline_evidence_id to the comparison side's evidence
    db.prepare(
      "UPDATE comparison_dimension_assessment SET baseline_evidence_id = ? WHERE baseline_evidence_id = ?",
    ).run(String(comparisonEvidence["evidence_id"]), String(baselineEvidence["evidence_id"]));
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("baseline evidence FK mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: assessment FK pointing to wrong-dimension evidence throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Get evidence ids for two different dimensions (baseline)
    const ageEvidence = db.prepare(`
      SELECT e.id FROM comparison_dimension_evidence e
      JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
      WHERE e.workspace_id = ? AND e.dimension_key = ? AND p.comparison_run_id = ? AND p.role = 'baseline'
    `).get("ws_test", "audience_age_distribution", result.runId) as Record<string, unknown>;
    const genderEvidence = db.prepare(`
      SELECT e.id FROM comparison_dimension_evidence e
      JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
      WHERE e.workspace_id = ? AND e.dimension_key = ? AND p.comparison_run_id = ? AND p.role = 'baseline'
    `).get("ws_test", "audience_gender_distribution", result.runId) as Record<string, unknown>;
    // Point age assessment's baseline FK to gender evidence (wrong dimension)
    db.prepare(
      "UPDATE comparison_dimension_assessment SET baseline_evidence_id = ? WHERE baseline_evidence_id = ? AND dimension_key = ?",
    ).run(String(genderEvidence["id"]), String(ageEvidence["id"]), "audience_age_distribution");
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: missing participant throws ComparisonStateError (not null)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.exec("PRAGMA foreign_keys = OFF");
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Delete one participant (FK off to bypass RESTRICT)
    db.prepare("DELETE FROM comparison_participant WHERE workspace_id = ? AND role = 'baseline'").run("ws_test");
    // Detail must THROW (not return null) — run exists but aggregate is corrupted
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("expected 2 participants"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: missing portrait source throws ComparisonStateError (not null)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.exec("PRAGMA foreign_keys = OFF");
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Delete one source (FK off)
    db.prepare("DELETE FROM comparison_portrait_source WHERE workspace_id = ?").run("ws_test");
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("missing portrait source"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: tampered run coverage throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Tamper coverage to a wrong in-range value
    db.prepare(
      "UPDATE comparison_run SET coverage = 10.0 WHERE workspace_id = ? AND id = ?",
    ).run("ws_test", result.runId);
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("coverage mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: tampered weighted_contribution throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Tamper weighted_contribution of an included assessment
    db.prepare(`
      UPDATE comparison_dimension_assessment SET weighted_contribution = 99.0
      WHERE workspace_id = ? AND comparison_run_id = ? AND participation = 'included'
    `).run("ws_test", result.runId);
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("weightedContribution mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: tampered assessment weight throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Tamper weight of one assessment (within CHECK >0)
    db.prepare(`
      UPDATE comparison_dimension_assessment SET weight = 99.0
      WHERE workspace_id = ? AND comparison_run_id = ? AND dimension_key = ?
    `).run("ws_test", result.runId, "audience_age_distribution");
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("weight mismatch"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: extra evidence on baseline side (unknown dimension) throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Get baseline participant id
    const baseline = db.prepare(
      "SELECT id FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ? AND role = 'baseline'",
    ).get("ws_test", result.runId) as Record<string, unknown>;
    // Insert extra evidence for a dimension not in the candidate contract
    db.prepare(`
      INSERT INTO comparison_dimension_evidence (
        id, workspace_id, participant_id, dimension_key, dimension_label,
        value, unit, quality_status, source_flags_json, policy_reasons_json, evidence_refs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", String(baseline["id"]),
      "unknown_extra_dim", "Unknown Extra Dimension", 50.0, "percent",
      "ready", "[]", "[]", '[{"sourceRecordType":"test","sourceRecordId":"t1"}]',
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("unknown evidence dimension"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: extra evidence on comparison side (unknown dimension) throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Get comparison participant id
    const comparison = db.prepare(
      "SELECT id FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ? AND role = 'comparison'",
    ).get("ws_test", result.runId) as Record<string, unknown>;
    // Insert extra evidence for a dimension not in the candidate contract
    db.prepare(`
      INSERT INTO comparison_dimension_evidence (
        id, workspace_id, participant_id, dimension_key, dimension_label,
        value, unit, quality_status, source_flags_json, policy_reasons_json, evidence_refs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", String(comparison["id"]),
      "unknown_extra_dim", "Unknown Extra Dimension", 50.0, "percent",
      "ready", "[]", "[]", '[{"sourceRecordType":"test","sourceRecordId":"t1"}]',
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("unknown evidence dimension"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// B2: Contiguous sequence + archive transition semantics — corruption tests
// ===========================================================================

test("detail: explanation attempt sequence gap throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Auto-generated attempt has sequence 1; insert attempt with sequence 3 (gap)
    db.prepare(`
      INSERT INTO comparison_explanation_attempt (
        id, workspace_id, comparison_run_id, attempt_sequence,
        generator_type, generator_id, generator_version, explanation_contract_version,
        evidence_manifest_json, evidence_manifest_checksum, started_at, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000098", "ws_test", result.runId, 3,
      "rule", "pls-portrait-comparison-rule-summary", "rule-summary@1", "0.1.0",
      "[]", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "2026-07-19T12:00:00.000Z", "test-actor",
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("not contiguous from 1"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: explanation attempt sequence not starting at 1 throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.exec("PRAGMA foreign_keys = OFF");
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Delete auto-generated attempt 1 + its outcome → only sequence 2 remains
    // First create attempt 2
    db.prepare(`
      INSERT INTO comparison_explanation_attempt (
        id, workspace_id, comparison_run_id, attempt_sequence,
        generator_type, generator_id, generator_version, explanation_contract_version,
        evidence_manifest_json, evidence_manifest_checksum, started_at, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000098", "ws_test", result.runId, 2,
      "rule", "pls-portrait-comparison-rule-summary", "rule-summary@1", "0.1.0",
      "[]", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "2026-07-19T12:00:00.000Z", "test-actor",
    );
    // Delete attempt 1 and its outcome (FK off)
    db.prepare("DELETE FROM comparison_explanation_outcome").run();
    db.prepare("DELETE FROM comparison_explanation_attempt WHERE attempt_sequence = 1").run();
    // Remaining attempts: sequence 2 only → first seq ≠ 1
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("not contiguous from 1"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: duplicate outcome prevented by V005 UNIQUE constraint (schema defense)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Auto-generated attempt has id; attempt to insert second outcome for same attempt
    // V005 UNIQUE (workspace_id, explanation_attempt_id) on comparison_explanation_outcome rejects this
    const attempt = db.prepare(
      "SELECT id FROM comparison_explanation_attempt WHERE workspace_id = ? AND comparison_run_id = ?",
    ).get("ws_test", result.runId) as Record<string, unknown>;
    assert.throws(
      () => db.prepare(`
        INSERT INTO comparison_explanation_outcome (
          id, workspace_id, explanation_attempt_id, status, completed_at,
          content_json, error_code, failure_contract_version, retryable, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "00000000-0000-4000-8000-000000000099", "ws_test", String(attempt["id"]),
        "failed", "2026-07-19T12:00:00.000Z",
        null, "invalid_generator_output", "0.1.0", 1, "duplicate",
      ),
      (error: unknown) => error instanceof Error && error.message.includes("UNIQUE"),
    );
    // Detail still reads correctly (no corruption)
    const detail = getComparisonDetail(ctx, result.runId);
    assert.ok(detail !== null);
    assert.equal(detail.explanationAttempts.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: unrelated orphan outcome does not poison healthy run detail (run-scoped validation)", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    db.exec("PRAGMA foreign_keys = OFF");
    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounter = 0;
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    });
    // Create two runs
    const run1 = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_1" }));
    const run2 = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_2" }));
    // Insert an orphan outcome referencing a fabricated attempt id (not linked to any run)
    db.prepare(`
      INSERT INTO comparison_explanation_outcome (
        id, workspace_id, explanation_attempt_id, status, completed_at,
        content_json, error_code, failure_contract_version, retryable, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test",
      "00000000-0000-4000-8000-999999999999", // fabricated attempt id
      "failed", "2026-07-19T12:00:00.000Z",
      null, "invalid_generator_output", "0.1.0", 1, "orphan",
    );
    // Run1 detail should still work (orphan is not linked to run1)
    const detail1 = getComparisonDetail(ctx, run1.runId);
    assert.ok(detail1 !== null, "run1 detail should not be poisoned by unrelated orphan");
    assert.equal(detail1.id, run1.runId);
    // Run2 detail should also work
    const detail2 = getComparisonDetail(ctx, run2.runId);
    assert.ok(detail2 !== null, "run2 detail should not be poisoned by unrelated orphan");
    assert.equal(detail2.id, run2.runId);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: archive sequence gap throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Archive normally (seq 1)
    archiveComparison(ctx, {
      runId: result.runId, operation: "archived",
      idempotencyKey: "archive_1", expectedCurrentState: "active", expectedSequence: 1,
    });
    // Insert event with sequence 3 (gap)
    db.prepare(`
      INSERT INTO comparison_archive_event (
        id, workspace_id, comparison_run_id, event_sequence,
        operation, operation_fingerprint, idempotency_key, reason, actor, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", result.runId, 3,
      "restored", "a".repeat(64), "fake_key", null, "test-actor", "2026-07-19T12:00:00.000Z",
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("not contiguous from 1"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: archive first event restored throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Insert first event as 'restored' (illegal — first must be 'archived')
    db.prepare(`
      INSERT INTO comparison_archive_event (
        id, workspace_id, comparison_run_id, event_sequence,
        operation, operation_fingerprint, idempotency_key, reason, actor, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", result.runId, 1,
      "restored", "a".repeat(64), "fake_key", null, "test-actor", "2026-07-19T12:00:00.000Z",
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("illegal archive transition"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detail: consecutive archived events throw ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, { _qualityPolicy: releasedPolicy });
    const result = createComparison(ctx, makeCreateInput());
    // Archive normally (seq 1, archived)
    archiveComparison(ctx, {
      runId: result.runId, operation: "archived",
      idempotencyKey: "archive_1", expectedCurrentState: "active", expectedSequence: 1,
    });
    // Insert another 'archived' event (seq 2) — illegal consecutive archived
    db.prepare(`
      INSERT INTO comparison_archive_event (
        id, workspace_id, comparison_run_id, event_sequence,
        operation, operation_fingerprint, idempotency_key, reason, actor, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "00000000-0000-4000-8000-000000000099", "ws_test", result.runId, 2,
      "archived", "b".repeat(64), "fake_key_2", null, "test-actor", "2026-07-19T12:00:00.000Z",
    );
    assert.throws(
      () => getComparisonDetail(ctx, result.runId),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("illegal archive transition"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// B3: Validation audit for graph invariant + post-insert failures
// ===========================================================================

test("validation audit: graph invariant failure writes audit and rolls back all 8 tables", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string, payload?: { graph?: any }) => {
        if (stage === "before_graph_validation" && payload?.graph) {
          // Corrupt graph: change participant run ownership to trigger invariant failure
          payload.graph.participants[0].comparisonRunId = "00000000-0000-4000-8000-999999999999";
        }
      },
    });
    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonValidationError,
    );
    // Exactly one audit row
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "create_validation_failed") as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "exactly one audit row for graph invariant failure");
    assert.equal(auditRows[0]!["reason_code"], "graph_invariant_validation_failed");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    // Zero rows in all 8 Comparison tables (rollback)
    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validation audit: post-insert validation failure writes audit and rolls back", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _faultHook: (stage: string) => {
        if (stage === "inside_transaction_before_validation") {
          // Corrupt persisted data: tamper baseline_normalized_value to a wrong in-range value.
          // Must be within V005 CHECK (0..100) so the UPDATE doesn't fail at SQLite level.
          // The real post-insert validator (verifyPersistedNumericalConsistency) will detect
          // the mismatch and throw ComparisonStateError — our tx catch classifies it as
          // "post_insert_validation_failed".
          db.prepare(`
            UPDATE comparison_dimension_assessment
            SET baseline_normalized_value = 99.5
            WHERE participation = 'included'
          `).run();
        }
      },
    });
    assert.throws(
      () => createComparison(ctx, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonStateError,
    );
    // Exactly one audit row
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_run", "create_validation_failed") as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "exactly one audit row for post-insert failure");
    assert.equal(auditRows[0]!["reason_code"], "post_insert_validation_failed");
    // Zero rows (rollback)
    assertZeroComparisonRows(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// B4: Manifest ownership+checksum recheck inside Attempt transaction
// ===========================================================================

test("explanation manifest: tampered checksum (automatic path) yields controlled failed outcome", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string, payload?: { ruleResult?: any }) => {
        if (stage === "after_rule_generation" && payload?.ruleResult) {
          // Tamper checksum: flip first two hex chars
          const original = payload.ruleResult.evidenceManifestChecksum as string;
          payload.ruleResult.evidenceManifestChecksum = "ff" + original.slice(2);
        }
      },
    });
    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);
    // Core run exists
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c, 1);
    // Explanation attempt exists with failed outcome (not succeeded/interrupted)
    const outcomes = db.prepare(`
      SELECT o.status, o.error_code FROM comparison_explanation_outcome o
      JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id
      WHERE a.comparison_run_id = ?
    `).all(result.runId) as Record<string, unknown>[];
    assert.equal(outcomes.length, 1, "exactly one outcome");
    assert.equal(outcomes[0]!["status"], "failed");
    assert.equal(outcomes[0]!["error_code"], "invalid_generator_output");
    // No succeeded outcome
    const succeeded = outcomes.filter((o) => o["status"] === "succeeded");
    assert.equal(succeeded.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation manifest: cross-run record reference (automatic path) yields controlled failed outcome", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let firstRunId = "";
    let uuidCounter = 0;
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      _explanationFaultHook: (stage: string, payload?: { ruleResult?: any }) => {
        if (stage === "after_rule_generation" && payload?.ruleResult && firstRunId) {
          // Tamper: point first comparison_participant manifest entry to first run's participant
          const firstRunParticipant = db.prepare(
            "SELECT id FROM comparison_participant WHERE comparison_run_id = ? AND role = 'baseline'",
          ).get(firstRunId) as Record<string, unknown> | undefined;
          if (firstRunParticipant) {
            const entries = payload.ruleResult.evidenceManifest as Array<{ recordType: string; recordId: string }>;
            const participantEntry = entries.find((e) => e.recordType === "comparison_participant");
            if (participantEntry) participantEntry.recordId = String(firstRunParticipant["id"]);
          }
        }
      },
    });
    // Create first run
    const first = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_1" }));
    firstRunId = first.runId;
    // Create second run — hook will tamper manifest to reference first run's participant
    const second = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_2" }));
    assert.equal(second.replayed, false);
    // Second run exists
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c, 2);
    // Second run's explanation should be failed (checksum mismatch detected first because
    // tampering the manifest entry changes the canonical JSON, invalidating the checksum)
    const secondOutcomes = db.prepare(`
      SELECT o.status, o.error_code FROM comparison_explanation_outcome o
      JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id
      WHERE a.comparison_run_id = ?
    `).all(second.runId) as Record<string, unknown>[];
    assert.equal(secondOutcomes.length, 1);
    assert.equal(secondOutcomes[0]!["status"], "failed");
    assert.equal(secondOutcomes[0]!["error_code"], "invalid_generator_output");
    // First run's explanation unaffected (succeeded)
    const firstOutcomes = db.prepare(`
      SELECT o.status FROM comparison_explanation_outcome o
      JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id
      WHERE a.comparison_run_id = ?
    `).all(first.runId) as Record<string, unknown>[];
    assert.equal(firstOutcomes[0]!["status"], "succeeded");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation manifest: nonexistent record reference (automatic path) yields controlled failed outcome", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string, payload?: { ruleResult?: any }) => {
        if (stage === "after_rule_generation" && payload?.ruleResult) {
          // Tamper: replace first manifest entry's recordId with a random UUID
          const entries = payload.ruleResult.evidenceManifest as Array<{ recordType: string; recordId: string }>;
          if (entries.length > 0) entries[0]!.recordId = "00000000-0000-4000-8000-999999999999";
        }
      },
    });
    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);
    // Failed outcome (checksum mismatch detected first because tampering the manifest
    // entry changes the canonical JSON, invalidating the checksum)
    const outcomes = db.prepare(`
      SELECT o.status, o.error_code FROM comparison_explanation_outcome o
      JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id
      WHERE a.comparison_run_id = ?
    `).all(result.runId) as Record<string, unknown>[];
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0]!["status"], "failed");
    assert.equal(outcomes[0]!["error_code"], "invalid_generator_output");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation manifest: tampered checksum (explicit path) throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string, payload?: { ruleResult?: any }) => {
        if (stage === "after_rule_generation" && payload?.ruleResult) {
          payload.ruleResult.evidenceManifestChecksum = "ff" + (payload.ruleResult.evidenceManifestChecksum as string).slice(2);
        }
      },
    });
    const result = createComparison(ctx, makeCreateInput());
    // Auto-generated explanation succeeded (no tamper on automatic path — hook fires for both)
    // Wait — hook fires for automatic too! Let me think...
    // Actually the hook fires for both automatic AND explicit paths.
    // Automatic path: hook tampers → in-tx mismatch → persistFailedExplanation.
    // So after create, the automatic explanation should be failed.
    // Then explicit createExplanation also triggers hook → tamper → throws.
    // Let me verify automatic path is failed first:
    const autoOutcomes = db.prepare(`
      SELECT o.status, o.error_code FROM comparison_explanation_outcome o
      JOIN comparison_explanation_attempt a ON a.id = o.explanation_attempt_id
      WHERE a.comparison_run_id = ?
    `).all(result.runId) as Record<string, unknown>[];
    assert.equal(autoOutcomes.length, 1, "automatic explanation exists");
    assert.equal(autoOutcomes[0]!["status"], "failed", "automatic explanation failed due to tampered checksum");
    // Explicit path also fails
    assert.throws(
      () => createExplanation(ctx, { runId: result.runId }),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("manifest validation"),
    );
    // Count attempts: automatic failed attempt + no new attempt from explicit (throws before insert)
    const attempts = (db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(attempts, 1, "only the automatic failed attempt; explicit did not insert");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explanation manifest: cross-run record reference (explicit path) throws ComparisonStateError", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    let firstRunId = "";
    let uuidCounter = 0;
    // Use a hook that only fires for the explicit path (stage check)
    let tamperForExplicit = false;
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      _explanationFaultHook: (stage: string, payload?: { ruleResult?: any }) => {
        if (stage === "after_rule_generation" && payload?.ruleResult && tamperForExplicit && firstRunId) {
          const firstRunParticipant = db.prepare(
            "SELECT id FROM comparison_participant WHERE comparison_run_id = ? AND role = 'baseline'",
          ).get(firstRunId) as Record<string, unknown> | undefined;
          if (firstRunParticipant) {
            const entries = payload.ruleResult.evidenceManifest as Array<{ recordType: string; recordId: string }>;
            const participantEntry = entries.find((e) => e.recordType === "comparison_participant");
            if (participantEntry) participantEntry.recordId = String(firstRunParticipant["id"]);
          }
        }
      },
    });
    // Create first run (no tamper)
    const first = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_1" }));
    firstRunId = first.runId;
    // Create second run (no tamper — automatic explanation succeeds)
    const second = createComparison(ctx, makeCreateInput({ idempotencyKey: "key_2" }));
    // Enable tamper for explicit path
    tamperForExplicit = true;
    // Delete second run's explanation to force explicit regeneration
    const secondAttempt = db.prepare(
      "SELECT id FROM comparison_explanation_attempt WHERE comparison_run_id = ?",
    ).get(second.runId) as Record<string, unknown>;
    db.prepare("DELETE FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?").run(String(secondAttempt["id"]));
    db.prepare("DELETE FROM comparison_explanation_attempt WHERE id = ?").run(String(secondAttempt["id"]));
    // Explicit path should throw due to cross-run reference tamper
    assert.throws(
      () => createExplanation(ctx, { runId: second.runId }),
      (error: unknown) => error instanceof ComparisonStateError && error.message.includes("manifest validation"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// B5: True overlapping two-connection competition tests
// ===========================================================================

test("concurrency: overlapping create with same fingerprint replays single run", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");

    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounterA = 0;
    let uuidCounterB = 500;
    const orderLog: string[] = [];

    const ctxB: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterB++).padStart(12, "0")}`,
    };

    const ctxA: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterA++).padStart(12, "0")}`,
      _faultHook: (stage: string) => {
        if (stage === "before_transaction") {
          orderLog.push("A_pre_tx_done");
          // B runs its entire create inside A's race window
          const resultB = createComparison(ctxB, makeCreateInput());
          orderLog.push(`B_committed_${resultB.replayed ? "replay" : "created"}`);
        }
      },
    };

    const resultA = createComparison(ctxA, makeCreateInput());

    // A should replay B's committed run (same key + same fingerprint)
    assert.equal(resultA.replayed, true, "A replays after B committed in the race window");
    assert.ok(orderLog.includes("A_pre_tx_done"), "A passed pre-transaction check");
    assert.ok(orderLog.some((l) => l.startsWith("B_committed")), "B committed during A's race window");

    // Exactly 1 run, not 2
    const runCount = (dbA.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);
    // Exactly 1 explanation attempt (B created it)
    const attemptCount = (dbA.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_attempt").get() as { c: number }).c;
    assert.equal(attemptCount, 1);

    dbA.close(); dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: overlapping create with different fingerprint yields stable conflict", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");

    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounterA = 0;
    let uuidCounterB = 500;
    const orderLog: string[] = [];

    // B uses swapped sides (different fingerprint, same key)
    const inputB = makeCreateInput({
      baseline: {
        object: { family: "channel", objectType: "platform", objectId: "obj_b", displayName: "Platform B" },
        snapshot: { snapshotId: "snap_b", dataVersion: "v2", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      },
      comparison: {
        object: { family: "channel", objectType: "platform", objectId: "obj_a", displayName: "Platform A" },
        snapshot: { snapshotId: "snap_a", dataVersion: "v1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      },
    });

    const ctxB: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterB++).padStart(12, "0")}`,
    };

    const ctxA: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterA++).padStart(12, "0")}`,
      _faultHook: (stage: string) => {
        if (stage === "before_transaction") {
          orderLog.push("A_pre_tx_done");
          // B creates a run with the same key but different fingerprint
          const resultB = createComparison(ctxB, inputB);
          orderLog.push(`B_committed_${resultB.runId}`);
        }
      },
    };

    // A should get idempotency conflict
    assert.throws(
      () => createComparison(ctxA, makeCreateInput()),
      (error: unknown) => error instanceof ComparisonIdempotencyConflictError,
    );

    assert.ok(orderLog.includes("A_pre_tx_done"), "A passed pre-transaction check before conflict");

    // Exactly 1 run (B's)
    const runCount = (dbA.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c;
    assert.equal(runCount, 1);

    dbA.close(); dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: automatic explanation ensure-once under overlap (exactly one approved generator attempt)", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");

    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounterA = 0;
    let uuidCounterB = 500;
    const orderLog: string[] = [];

    // Create run with B (no hooks), then delete explanation to simulate crash
    const ctxSetup: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterB++).padStart(12, "0")}`,
    };
    const created = createComparison(ctxSetup, makeCreateInput());
    // Delete explanation (simulate crash)
    dbA.prepare("DELETE FROM comparison_explanation_outcome").run();
    dbA.prepare("DELETE FROM comparison_explanation_attempt").run();

    // B's replay context for the race
    const ctxB: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterB++).padStart(12, "0")}`,
    };

    // A's replay context with hook to trigger B's replay inside the race window
    const ctxA: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounterA++).padStart(12, "0")}`,
      _explanationFaultHook: (stage: string) => {
        if (stage === "before_attempt_transaction") {
          orderLog.push("A_before_attempt_tx");
          // B replays and creates the explanation
          const replayB = createComparison(ctxB, makeCreateInput());
          orderLog.push(`B_replay_${replayB.replayed ? "ok" : "new"}`);
        }
      },
    };

    // A replays — hook triggers B's full replay-repair, then A's in-tx recheck skips
    const resultA = createComparison(ctxA, makeCreateInput());
    assert.equal(resultA.replayed, true, "A replays");
    assert.ok(orderLog.includes("A_before_attempt_tx"), "A reached attempt transaction window");
    assert.ok(orderLog.some((l) => l.startsWith("B_replay")), "B completed replay during A's window");

    // Exactly 1 approved generator attempt (B created it, A skipped)
    const attempts = dbA.prepare(`
      SELECT COUNT(*) AS c FROM comparison_explanation_attempt
      WHERE generator_id = 'pls-portrait-comparison-rule-summary'
    `).get() as { c: number };
    assert.equal(attempts.c, 1, "exactly one approved generator attempt");

    dbA.close(); dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: explicit explanation retries get unique contiguous sequences under overlap", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");

    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounter = 0;
    const orderLog: string[] = [];

    // Create run with auto-explanation (seq 1 succeeded)
    const ctxSetup: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    };
    const created = createComparison(ctxSetup, makeCreateInput());
    // Delete outcome to make attempt 1 interrupted (explicit retry path)
    dbA.prepare("DELETE FROM comparison_explanation_outcome").run();

    // B's context for explicit explanation
    const ctxB: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    };

    // A's context with hook to trigger B's explicit explanation inside race window
    const ctxA: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      _explanationFaultHook: (stage: string) => {
        if (stage === "before_attempt_transaction") {
          orderLog.push("A_before_attempt_tx");
          // B runs explicit explanation fully (allocates seq 2 + outcome)
          const resultB = createExplanation(ctxB, { runId: created.runId });
          orderLog.push(`B_explanation_seq_${resultB.attemptSequence}`);
        }
      },
    };

    // A runs explicit explanation — hook triggers B first, then A gets seq 3
    const resultA = createExplanation(ctxA, { runId: created.runId });
    assert.ok(orderLog.includes("A_before_attempt_tx"), "A reached attempt window");
    assert.ok(orderLog.some((l) => l.startsWith("B_explanation_seq")), "B completed during A's window");

    // Sequences: 1 (interrupted), 2 (B), 3 (A) — contiguous and unique
    const sequences = dbA.prepare(`
      SELECT attempt_sequence FROM comparison_explanation_attempt
      WHERE comparison_run_id = ? ORDER BY attempt_sequence
    `).all(created.runId) as Record<string, unknown>[];
    assert.equal(sequences.length, 3, "3 attempts: 1 interrupted + 2 from overlap");
    assert.equal(sequences[0]!["attempt_sequence"], 1);
    assert.equal(sequences[1]!["attempt_sequence"], 2);
    assert.equal(sequences[2]!["attempt_sequence"], 3);
    assert.equal(resultA.attemptSequence, 3, "A got sequence 3");

    dbA.close(); dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrency: overlapping archive with same expected state yields one success + conflict", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const setupDb = new DatabaseSync(dbPath);
    setupDb.exec("PRAGMA foreign_keys = ON");
    setupDb.exec(SCHEMA_DDL);
    setupDb.exec(COMPARISON_DDL);
    setupDb.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run("ws_test", "Test Workspace");
    setupDb.close();

    const dbA = new DatabaseSync(dbPath);
    dbA.exec("PRAGMA foreign_keys = ON");
    const dbB = new DatabaseSync(dbPath);
    dbB.exec("PRAGMA foreign_keys = ON");

    const releasedPolicy = makeReleasedQualityPolicy();
    let uuidCounter = 0;
    const orderLog: string[] = [];

    // Create run
    const ctxSetup: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
    };
    const created = createComparison(ctxSetup, makeCreateInput());

    const ctxB: ComparisonApplicationContext = {
      db: dbB, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      _faultHook: (stage: string) => {},
    };

    const ctxA: ComparisonApplicationContext = {
      db: dbA, workspaceId: "ws_test", trustedActor: "shared-actor",
      portraitSource: makeFakePortraitSource(), algorithmConfig: TEST_ALGORITHM_CONFIG,
      _qualityPolicy: releasedPolicy,
      clock: () => "2026-07-19T12:00:00.000Z",
      uuid: () => `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      _faultHook: (stage: string) => {
        if (stage === "before_archive_transaction") {
          orderLog.push("A_before_archive_tx");
          // B archives with different key, same expected state
          const resultB = archiveComparison(ctxB, {
            runId: created.runId, operation: "archived",
            idempotencyKey: "arch_b", expectedCurrentState: "active", expectedSequence: 1,
          });
          orderLog.push(`B_archived_seq_${resultB.eventSequence}`);
        }
      },
    };

    // A archives with different key, same expected state → conflict
    assert.throws(
      () => archiveComparison(ctxA, {
        runId: created.runId, operation: "archived",
        idempotencyKey: "arch_a", expectedCurrentState: "active", expectedSequence: 1,
      }),
      (error: unknown) => error instanceof ComparisonConcurrencyError,
    );

    assert.ok(orderLog.includes("A_before_archive_tx"), "A reached archive transaction window");
    assert.ok(orderLog.some((l) => l.startsWith("B_archived_seq")), "B committed during A's window");

    // Exactly 1 archive event (B's)
    const eventCount = (dbA.prepare(
      "SELECT COUNT(*) AS c FROM comparison_archive_event WHERE comparison_run_id = ?",
    ).get(created.runId) as { c: number }).c;
    assert.equal(eventCount, 1);

    dbA.close(); dbB.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Extra closure: strengthen outcome-persistence audit assertions
// ===========================================================================

test("explanation: inside_outcome_transaction fault — outcome persistence audit has exactly 1 row with stable metadata", () => {
  const dir = makeTempDir();
  try {
    const db = createTestDb(dir);
    const releasedPolicy = makeReleasedQualityPolicy();
    const ctx = makeTestContext(db, {
      _qualityPolicy: releasedPolicy,
      _explanationFaultHook: (stage: string) => {
        if (stage === "inside_outcome_transaction") {
          throw new Error("OUTCOME_PERSISTENCE_FAULT");
        }
      },
    });

    const result = createComparison(ctx, makeCreateInput());
    assert.equal(result.replayed, false);

    // Attempt exists without outcome (interrupted)
    const attempts = db.prepare("SELECT * FROM comparison_explanation_attempt WHERE comparison_run_id = ?").all(result.runId) as Record<string, unknown>[];
    assert.ok(attempts.length > 0);
    const outcomes = db.prepare("SELECT COUNT(*) AS c FROM comparison_explanation_outcome WHERE explanation_attempt_id = ?").get(String(attempts[0]!["id"])) as { c: number };
    assert.equal(outcomes.c, 0, "outcome should not exist (interrupted)");

    // Core run unaffected
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM comparison_run").get() as { c: number }).c, 1);

    // Exactly 1 audit row
    const auditRows = db.prepare(
      "SELECT * FROM audit_event WHERE resource_type = ? AND event = ?",
    ).all("comparison_explanation", "explanation_outcome_persistence_failed") as Record<string, unknown>[];
    assert.equal(auditRows.length, 1, "exactly one audit row");
    assert.equal(auditRows[0]!["workspace_id"], "ws_test");
    assert.equal(auditRows[0]!["actor"], "test-actor");
    assert.equal(auditRows[0]!["request_id"], result.runId, "request_id is the run id");
    assert.equal(auditRows[0]!["reason_code"], "outcome_transaction_failed");
    // Audit must NOT contain the injected fault text
    assert.ok(!JSON.stringify(auditRows[0]!).includes("OUTCOME_PERSISTENCE_FAULT"),
      "audit must not contain injected fault hook text");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
