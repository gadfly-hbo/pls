// Comparison Application — orchestrates create/list/detail/explanation/archive.
// Source resolve, algorithm, rule summary run OUTSIDE the core write transaction.
// Core Run graph persists inside a single BEGIN IMMEDIATE transaction.

import type { DatabaseSync } from "node:sqlite";

import type { PortraitSource, ResolvedPortraitSnapshot, PortraitSnapshot, DimensionEvidenceRecord } from "../portrait-source/index.js";
import { PortraitSourceNotReadyError, PortraitSourceError } from "../portrait-source/index.js";
import { computeComparisonAlgorithmResult, computeAlgorithmConfigChecksum, PLS_COMPARISON_ALGORITHM_IDENTITY, type ComparisonAlgorithmConfig, type ComparisonAlgorithmResult, type DimensionEvidenceProjection } from "../algorithm.js";
import { getProductionQualityPolicy } from "../quality-policy.js";
import { createRuleSummary, PLS_RULE_SUMMARY_GENERATOR_ID, PLS_RULE_SUMMARY_GENERATOR_VERSION, PLS_RULE_SUMMARY_CONTRACT_VERSION, type RuleSummaryInput, type RuleSummaryResult } from "../rule-summary.js";
import { checksumCanonicalJson, canonicalJson, toJsonValue, type JsonValue } from "../canonical-json.js";
import { writeAudit } from "../../lib/audit.js";

import { withTransaction } from "./transaction.js";
import {
  ComparisonValidationError,
  ComparisonIdempotencyConflictError,
  ComparisonQualityGateError,
  ComparisonSourceError,
  ComparisonConcurrencyError,
  ComparisonStateError,
  ComparisonNotFoundError,
} from "./errors.js";
import {
  PLS_COMPARISON_CONTRACT_ID,
  PLS_COMPARISON_CONTRACT_VERSION,
  type ComparisonMode,
  type CreateComparisonInput,
  type CreateComparisonOutput,
  type ListComparisonsInput,
  type ListComparisonsOutput,
  type ComparisonSummary,
  type ComparisonDetail,
  type ComparisonParticipantDetail,
  type PortraitSourceDetail,
  type DimensionEvidenceDetail,
  type DimensionAssessmentDetail,
  type ExplanationAttemptDetail,
  type ArchiveEventDetail,
  type CreateExplanationInput,
  type ExplanationOutput,
  type ArchiveComparisonInput,
  type ArchiveComparisonOutput,
} from "./types.js";

import {
  insertComparisonRunGraph,
  findRunByIdempotencyKey,
  findRunWorkspaceId,
  listComparisonRuns,
  getComparisonRunDetail,
  comparisonRecordExists,
  insertExplanationAttempt,
  insertExplanationOutcome,
  findExplanationAttempt,
  findOutcomeByAttemptId,
  getMaxAttemptSequence,
  listAttemptsWithOutcomes,
  insertArchiveEvent,
  findArchiveEventByIdempotencyKey,
  getMaxArchiveSequence,
  getLatestArchiveEvent,
  listArchiveEvents,
} from "../repository/index.js";
import type {
  ComparisonRunGraph,
  ComparisonRunRow,
  ComparisonParticipantRow,
  ComparisonPortraitSourceRow,
  ComparisonDimensionEvidenceRow,
  ComparisonDimensionAssessmentRow,
  ComparisonExplanationAttemptRow,
  ComparisonExplanationOutcomeRow,
  ComparisonArchiveEventRow,
} from "../repository/index.js";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Context / dependency injection
// Public context: minimal, cannot bypass getProductionQualityPolicy().
// Internal context: extends public, adds algorithm config, clock/uuid, fault hooks.
// Only the internal context is used by test factories; the public context is
// what production callers see.
// ---------------------------------------------------------------------------

export interface ComparisonApplicationPublicContext {
  readonly db: DatabaseSync;
  readonly workspaceId: string;
  readonly trustedActor: string;
  readonly trustedActorDisplayName?: string | null;
  readonly portraitSource: PortraitSource;
}

/** Internal/test-only context — NOT exported from public index. */
interface ComparisonApplicationInternalContext extends ComparisonApplicationPublicContext {
  readonly algorithmConfig: ComparisonAlgorithmConfig;
  readonly clock?: () => string;
  readonly uuid?: () => string;
  readonly _qualityPolicy?: { readonly policyId: string; readonly policyVersion: string; readonly releaseStatus: string; readonly configChecksum: string; readonly reasonTaxonomy: readonly string[]; readonly message: string };
  readonly _faultHook?: (stage: string, payload?: { graph?: ComparisonRunGraph }) => void;
  readonly _explanationFaultHook?: (stage: string, payload?: { ruleResult?: RuleSummaryResult }) => void;
}

/** Backward-compatible alias for internal/test use — NOT exported from public index. */
export type ComparisonApplicationContext = ComparisonApplicationInternalContext;

// ---------------------------------------------------------------------------
// Production factory — accepts only public deps, always uses getProductionQualityPolicy()
// This is the ONLY entry point for production callers.
// ---------------------------------------------------------------------------

export interface ComparisonApplicationDeps {
  readonly db: DatabaseSync;
  readonly workspaceId: string;
  readonly trustedActor: string;
  readonly trustedActorDisplayName?: string | null;
  readonly portraitSource: PortraitSource;
  readonly algorithmConfig: ComparisonAlgorithmConfig;
}

/**
 * Production comparison application — always uses getProductionQualityPolicy().
 * Cannot inject released policy, clock, uuid, or fault hooks.
 */
export function createProductionComparisonApplication(deps: ComparisonApplicationDeps) {
  const ctx: ComparisonApplicationInternalContext = {
    ...deps,
  };
  return {
    create: (input: CreateComparisonInput) => createComparison(ctx, input),
    detail: (runId: string) => getComparisonDetail(ctx, runId),
    list: (input?: ListComparisonsInput) => listComparisons(ctx, input),
    createExplanation: (input: CreateExplanationInput) => createExplanation(ctx, input),
    archive: (input: ArchiveComparisonInput) => archiveComparison(ctx, input),
  };
}

// ---------------------------------------------------------------------------
// Comparison contract checksum (PLS-specific, covers V005 persistence mapping)
// ---------------------------------------------------------------------------

function computeComparisonContractChecksum(): string {
  const contractDef = {
    contractId: PLS_COMPARISON_CONTRACT_ID,
    contractVersion: PLS_COMPARISON_CONTRACT_VERSION,
    tables: [
      "comparison_run", "comparison_participant", "comparison_portrait_source",
      "comparison_dimension_evidence", "comparison_dimension_assessment",
      "comparison_explanation_attempt", "comparison_explanation_outcome",
      "comparison_archive_event",
    ],
    runGrain: "workspace_id + id",
    participantGrain: "workspace_id + comparison_run_id + role",
    sourceGrain: "workspace_id + participant_id",
    evidenceGrain: "workspace_id + participant_id + dimension_key",
    assessmentGrain: "workspace_id + comparison_run_id + dimension_key",
    explanationAttemptGrain: "workspace_id + comparison_run_id + attempt_sequence",
    explanationOutcomeGrain: "workspace_id + explanation_attempt_id",
    archiveGrain: "workspace_id + comparison_run_id + event_sequence",
    idempotencyScope: "workspace_id + idempotency_key",
    archiveIdempotencyScope: "workspace_id + comparison_run_id + idempotency_key",
  } satisfies JsonValue;
  return checksumCanonicalJson(contractDef);
}

const COMPARISON_CONTRACT_CHECKSUM = computeComparisonContractChecksum();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(ctx: ComparisonApplicationContext): string {
  const ts = ctx.clock?.() ?? new Date().toISOString();
  if (!isUtcTimestampMs(ts)) throw new ComparisonValidationError([{ path: "clock", message: "clock must return UTC millisecond timestamp" }]);
  return ts;
}

function newId(ctx: ComparisonApplicationContext): string {
  const id = ctx.uuid?.() ?? crypto.randomUUID();
  requireUuid(id, "generatedId");
  return id;
}

function requireNonBlank(value: string, path: string): void {
  if (value.trim().length === 0) throw new ComparisonValidationError([{ path, message: "must be nonblank" }]);
}

function requireUuid(value: string, path: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new ComparisonValidationError([{ path, message: "must be a lowercase UUID v4" }]);
  }
}

/** Real calendar date validation — rejects impossible dates like Feb 30. */
function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m! < 1 || m! > 12) return false;
  if (d! < 1) return false;
  const daysInMonth = new Date(y!, m!, 0).getDate();
  return d! <= daysInMonth;
}

/** Strict UTC timestamp validation — rejects impossible timestamps like 2026-02-30T00:00:00.000Z. */
function isUtcTimestampMs(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  // Parse components and validate as real calendar date
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  const hr = Number(value.slice(11, 13));
  const min = Number(value.slice(14, 16));
  const sec = Number(value.slice(17, 19));
  const ms = Number(value.slice(20, 23));
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return false;
  if (hr > 23 || min > 59 || sec > 59 || ms > 999) return false;
  // Verify round-trip: parsed date must match input exactly
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;
  const reconstructed = date.toISOString();
  return reconstructed === value;
}

function parseJsonArray(value: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ComparisonStateError("malformed JSON in persisted data");
  }
  if (!Array.isArray(parsed)) {
    throw new ComparisonStateError("malformed JSON array in persisted data");
  }
  // Fail closed on wrong element types — don't silently filter
  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "string") {
      throw new ComparisonStateError(`malformed JSON array element at index ${i}: expected string`);
    }
  }
  return parsed as readonly string[];
}

function parseJsonRecordArray(value: string): readonly Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ComparisonStateError("malformed JSON in persisted data");
  }
  if (!Array.isArray(parsed)) {
    throw new ComparisonStateError("malformed JSON array in persisted data");
  }
  // Fail closed on wrong element types — don't silently filter
  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "object" || parsed[i] === null) {
      throw new ComparisonStateError(`malformed JSON array element at index ${i}: expected object`);
    }
  }
  return parsed as readonly Record<string, unknown>[];
}

function sanitizeSourceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Desensitize: remove any path, connection string, or SQL fragments
    return "source resolution failed";
  }
  return "source resolution failed";
}

// ---------------------------------------------------------------------------
// Controlled audit for validation failures — minimal, sanitized metadata only.
// Never includes raw snapshot/evidence/SQL/provider/fault-hook text.
// ---------------------------------------------------------------------------

type CreateValidationFailureReason =
  | "input_validation_failed"
  | "mode_validation_failed"
  | "graph_invariant_validation_failed"
  | "post_insert_validation_failed";

function auditCreateValidationFailure(
  ctx: ComparisonApplicationContext,
  requestId: string,
  reasonCode: CreateValidationFailureReason,
  mode: string,
): void {
  try {
    writeAudit(ctx.db, {
      workspaceId: ctx.workspaceId,
      actor: ctx.trustedActor,
      requestId,
      resourceType: "comparison_run",
      event: "create_validation_failed",
      reasonCode,
      meta: { mode },
    });
  } catch {
    // Audit failure does not block the controlled validation error
  }
}

function auditExplanationFailure(
  ctx: ComparisonApplicationContext,
  runId: string,
  event: string,
  reasonCode: string,
): void {
  try {
    writeAudit(ctx.db, {
      workspaceId: ctx.workspaceId,
      actor: ctx.trustedActor,
      requestId: runId,
      resourceType: "comparison_explanation",
      event,
      reasonCode,
    });
  } catch {
    // Audit failure does not block the controlled error
  }
}

/** Internal sentinels — distinguish manifest validation failures inside the Attempt transaction. */
class ManifestOwnershipError extends Error {
  constructor() {
    super("manifest record ownership/existence validation failed");
    this.name = "ManifestOwnershipError";
  }
}
class ManifestChecksumError extends Error {
  constructor() {
    super("manifest checksum mismatch");
    this.name = "ManifestChecksumError";
  }
}

/** In-transaction manifest validation: canonical JSON, checksum recompute, per-record ownership. */
function validateManifestInTransaction(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
  ruleResult: RuleSummaryResult,
): string {
  const manifestJson = canonicalJson(ruleResult.evidenceManifest as unknown as JsonValue);
  // Recompute checksum from the canonical JSON that will be stored and compare
  const recomputedChecksum = checksumCanonicalJson(ruleResult.evidenceManifest as unknown as JsonValue);
  if (recomputedChecksum !== ruleResult.evidenceManifestChecksum) {
    throw new ManifestChecksumError();
  }
  // Every manifest record must exist, belong to this workspace, and belong to this Run
  for (const entry of ruleResult.evidenceManifest) {
    if (!comparisonRecordExists(db, workspaceId, runId, entry.recordType, entry.recordId)) {
      throw new ManifestOwnershipError();
    }
  }
  return manifestJson;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validateCreateInput(input: CreateComparisonInput): void {
  const issues: Array<{ path: string; message: string }> = [];
  if (input.mode !== "peer_same_period" && input.mode !== "self_cross_period") {
    issues.push({ path: "mode", message: 'must be "peer_same_period" or "self_cross_period"' });
  }
  requireNonBlank(input.idempotencyKey, "idempotencyKey");
  validateSideRef(input.baseline, "baseline");
  validateSideRef(input.comparison, "comparison");
  if (issues.length > 0) throw new ComparisonValidationError(issues);
}

function validateSideRef(side: CreateComparisonInput["baseline"], path: string): void {
  const issues: Array<{ path: string; message: string }> = [];
  if (side.object.family !== "channel" && side.object.family !== "product") {
    issues.push({ path: `${path}.object.family`, message: 'must be "channel" or "product"' });
  }
  requireNonBlank(side.object.objectType, `${path}.object.objectType`);
  requireNonBlank(side.object.objectId, `${path}.object.objectId`);
  requireNonBlank(side.object.displayName, `${path}.object.displayName`);
  requireNonBlank(side.snapshot.snapshotId, `${path}.snapshot.snapshotId`);
  requireNonBlank(side.snapshot.dataVersion, `${path}.snapshot.dataVersion`);
  if (!isBusinessDate(side.snapshot.periodStart)) {
    issues.push({ path: `${path}.snapshot.periodStart`, message: "must be a valid YYYY-MM-DD date" });
  }
  if (!isBusinessDate(side.snapshot.periodEnd)) {
    issues.push({ path: `${path}.snapshot.periodEnd`, message: "must be a valid YYYY-MM-DD date" });
  }
  if (side.snapshot.periodStart > side.snapshot.periodEnd) {
    issues.push({ path: `${path}.snapshot.period`, message: "periodStart must not be after periodEnd" });
  }
  if (issues.length > 0) throw new ComparisonValidationError(issues);
}

function validateModeLegality(
  mode: ComparisonMode,
  baseline: CreateComparisonInput["baseline"],
  comparison: CreateComparisonInput["comparison"],
): void {
  const sameFamily = baseline.object.family === comparison.object.family;
  const sameType = baseline.object.objectType === comparison.object.objectType;
  const sameObject = baseline.object.objectId === comparison.object.objectId;

  if (mode === "peer_same_period") {
    if (!sameFamily || !sameType) {
      throw new ComparisonValidationError([{ path: "mode", message: "peer_same_period requires same family and objectType" }]);
    }
    if (sameObject) {
      throw new ComparisonValidationError([{ path: "mode", message: "peer_same_period requires different objectIds" }]);
    }
    if (baseline.snapshot.periodStart !== comparison.snapshot.periodStart ||
        baseline.snapshot.periodEnd !== comparison.snapshot.periodEnd) {
      throw new ComparisonValidationError([{ path: "mode", message: "peer_same_period requires identical periods" }]);
    }
    return;
  }
  // self_cross_period
  if (!sameFamily || !sameType || !sameObject) {
    throw new ComparisonValidationError([{ path: "mode", message: "self_cross_period requires same family, objectType, and objectId" }]);
  }
  if (baseline.snapshot.periodEnd >= comparison.snapshot.periodStart) {
    throw new ComparisonValidationError([{ path: "mode", message: "self_cross_period requires baseline periodEnd strictly before comparison periodStart" }]);
  }
}

// ---------------------------------------------------------------------------
// Source resolution & evidence mapping
// ---------------------------------------------------------------------------

interface ResolvedSide {
  readonly snapshot: PortraitSnapshot;
  readonly resolved: ResolvedPortraitSnapshot;
  readonly dimensionEvidence: readonly DimensionEvidenceRecord[];
}

function resolveSide(
  source: PortraitSource,
  workspaceId: string,
  objectId: string,
  snapshotId: string,
): ResolvedSide {
  let resolved: ResolvedPortraitSnapshot;
  try {
    resolved = source.resolvePortraitSnapshot(workspaceId, objectId, snapshotId);
  } catch (error) {
    if (error instanceof PortraitSourceError) {
      // Desensitize: don't expose provider error messages
      throw new ComparisonSourceError(sanitizeSourceErrorMessage(error));
    }
    throw error;
  }
  return {
    snapshot: resolved.snapshot,
    resolved,
    dimensionEvidence: resolved.dimensionEvidence,
  };
}

function validateSourceCompatibility(
  baseline: ResolvedSide,
  comparison: ResolvedSide,
): void {
  if (baseline.resolved.sourceSystem !== comparison.resolved.sourceSystem) {
    throw new ComparisonSourceError("both sides must use the same source system");
  }
  if (baseline.resolved.sourceContractVersion !== comparison.resolved.sourceContractVersion) {
    throw new ComparisonSourceError("both sides must use the same source contract version");
  }
}

/** Validate that request facts match resolved source facts (complete binding). */
function validateRequestBinding(
  request: CreateComparisonInput["baseline"],
  resolved: ResolvedSide,
  source: PortraitSource,
  workspaceId: string,
  path: string,
): void {
  // Workspace binding
  if (resolved.resolved.workspaceId !== workspaceId) {
    throw new ComparisonSourceError(`${path}: resolved workspaceId does not match context`);
  }
  // Object identity binding
  if (resolved.resolved.objectId !== request.object.objectId) {
    throw new ComparisonSourceError(`${path}: resolved objectId does not match request`);
  }
  // Verify family/objectType from source object list — fail closed if not found
  const objects = source.listPortraitObjects(workspaceId);
  const sourceObject = objects.find((o) => o.objectId === request.object.objectId);
  if (sourceObject === undefined) {
    throw new ComparisonSourceError(`${path}: object ${request.object.objectId} not found in source object list`);
  }
  if (sourceObject.family !== request.object.family) {
    throw new ComparisonSourceError(`${path}: source family does not match request`);
  }
  if (sourceObject.objectType !== request.object.objectType) {
    throw new ComparisonSourceError(`${path}: source objectType does not match request`);
  }
  if (sourceObject.displayName !== request.object.displayName) {
    throw new ComparisonSourceError(`${path}: source displayName does not match request`);
  }
  // Snapshot identity binding
  if (resolved.snapshot.snapshotId !== request.snapshot.snapshotId) {
    throw new ComparisonSourceError(`${path}: resolved snapshotId does not match request`);
  }
  if (resolved.snapshot.dataVersion !== request.snapshot.dataVersion) {
    throw new ComparisonSourceError(`${path}: resolved dataVersion does not match request`);
  }
  if (resolved.snapshot.periodStart !== request.snapshot.periodStart) {
    throw new ComparisonSourceError(`${path}: resolved periodStart does not match request`);
  }
  if (resolved.snapshot.periodEnd !== request.snapshot.periodEnd) {
    throw new ComparisonSourceError(`${path}: resolved periodEnd does not match request`);
  }
  // Source system binding (must match between resolved and snapshot)
  if (resolved.resolved.sourceSystem !== resolved.snapshot.sourceSystem) {
    throw new ComparisonSourceError(`${path}: resolved sourceSystem inconsistent`);
  }
  if (resolved.resolved.sourceContractVersion !== resolved.snapshot.sourceContractVersion) {
    throw new ComparisonSourceError(`${path}: resolved sourceContractVersion inconsistent`);
  }
  // Timestamp validation
  if (!isUtcTimestampMs(resolved.snapshot.sourceGeneratedAt)) {
    throw new ComparisonSourceError(`${path}: resolved sourceGeneratedAt is not a valid UTC ms timestamp`);
  }
}

function mapSourceQualityStatus(snapshot: PortraitSnapshot): "ready" | "limited" {
  return snapshot.sourceQualityFlags.length === 0 ? "ready" : "limited";
}

function mapEvidenceProjection(
  side: "baseline" | "comparison",
  evidence: readonly DimensionEvidenceRecord[],
  snapshot: PortraitSnapshot,
): DimensionEvidenceProjection[] {
  const sourceQuality = mapSourceQualityStatus(snapshot);
  return evidence.map((e) => ({
    side,
    dimensionKey: e.dimensionKey,
    dimensionLabel: e.dimensionLabel,
    value: e.value,
    unit: e.unit,
    qualityStatus: e.sourceQualityFlags.length === 0 ? sourceQuality : "limited" as const,
    qualityEligibility: (e.sourceQualityFlags.length === 0 && sourceQuality === "ready") ? "eligible" as const : "insufficient" as const,
  }));
}

// ---------------------------------------------------------------------------
// Quality gate — production always reads getProductionQualityPolicy()
// ---------------------------------------------------------------------------

function evaluateQualityGate(
  policy: ComparisonApplicationContext["_qualityPolicy"],
  algorithmResult: ComparisonAlgorithmResult,
): { blocked: boolean; reasonCodes: readonly string[] } {
  const effective = policy ?? getProductionQualityPolicy();
  if (effective.releaseStatus === "not_released") {
    return { blocked: true, reasonCodes: ["quality_policy_not_released"] };
  }
  // Future: evaluate actual thresholds when policy is released
  return { blocked: false, reasonCodes: [] };
}

// ---------------------------------------------------------------------------
// Request fingerprint — includes contract checksum
// ---------------------------------------------------------------------------

function computeRequestFingerprint(
  workspaceId: string,
  actor: string,
  mode: ComparisonMode,
  baseline: CreateComparisonInput["baseline"],
  comparison: CreateComparisonInput["comparison"],
): string {
  const fingerprintInput = {
    workspaceId,
    actor,
    mode,
    baseline: {
      family: baseline.object.family,
      objectType: baseline.object.objectType,
      objectId: baseline.object.objectId,
      snapshotId: baseline.snapshot.snapshotId,
      dataVersion: baseline.snapshot.dataVersion,
      periodStart: baseline.snapshot.periodStart,
      periodEnd: baseline.snapshot.periodEnd,
    },
    comparison: {
      family: comparison.object.family,
      objectType: comparison.object.objectType,
      objectId: comparison.object.objectId,
      snapshotId: comparison.snapshot.snapshotId,
      dataVersion: comparison.snapshot.dataVersion,
      periodStart: comparison.snapshot.periodStart,
      periodEnd: comparison.snapshot.periodEnd,
    },
    comparisonContractId: PLS_COMPARISON_CONTRACT_ID,
    comparisonContractVersion: PLS_COMPARISON_CONTRACT_VERSION,
    comparisonContractChecksum: COMPARISON_CONTRACT_CHECKSUM,
  } satisfies JsonValue;
  return checksumCanonicalJson(fingerprintInput);
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildRunGraph(
  ctx: ComparisonApplicationContext,
  input: CreateComparisonInput,
  baselineResolved: ResolvedSide,
  comparisonResolved: ResolvedSide,
  algorithmResult: ComparisonAlgorithmResult,
  requestFingerprint: string,
  qualityPolicy: NonNullable<ComparisonApplicationContext["_qualityPolicy"]>,
): ComparisonRunGraph {
  const runId = newId(ctx);
  const createdAt = now(ctx);
  const qualityStatus = evaluateQualityGate(qualityPolicy, algorithmResult);
  const qualityReasonsJson = canonicalJson([...qualityStatus.reasonCodes].sort());

  // Fail closed on null overallScore — don't persist 0
  if (algorithmResult.overallScore === null) {
    throw new ComparisonQualityGateError(["overall_score_null_coverage_insufficient"]);
  }

  const baselineParticipantId = newId(ctx);
  const comparisonParticipantId = newId(ctx);

  const baselineSourceId = newId(ctx);
  const comparisonSourceId = newId(ctx);

  const evidenceIdByKey = new Map<string, { baseline: string; comparison: string }>();
  const dimensionEvidenceRows: ComparisonDimensionEvidenceRow[] = [];

  for (const side of ["baseline", "comparison"] as const) {
    const participantId = side === "baseline" ? baselineParticipantId : comparisonParticipantId;
    const resolved = side === "baseline" ? baselineResolved : comparisonResolved;
    for (const e of resolved.dimensionEvidence) {
      const evidenceId = newId(ctx);
      const existing = evidenceIdByKey.get(e.dimensionKey);
      if (existing) {
        existing[side] = evidenceId;
      } else {
        evidenceIdByKey.set(e.dimensionKey, { baseline: "", comparison: "", [side]: evidenceId });
      }
      dimensionEvidenceRows.push({
        id: evidenceId,
        workspaceId: ctx.workspaceId,
        participantId,
        dimensionKey: e.dimensionKey,
        dimensionLabel: e.dimensionLabel,
        value: e.value,
        unit: e.unit,
        // Persist exact quality projection: evidence flags → limited; otherwise snapshot status
        qualityStatus: e.sourceQualityFlags.length === 0 ? mapSourceQualityStatus(resolved.snapshot) : "limited",
        sourceFlagsJson: canonicalJson([...e.sourceQualityFlags]),
        policyReasonsJson: canonicalJson([]),
        evidenceRefsJson: canonicalJson(e.sourceEvidenceRefs as JsonValue),
      });
    }
  }

  const assessmentRows: ComparisonDimensionAssessmentRow[] = algorithmResult.assessments.map((assessment) => {
    const ids = evidenceIdByKey.get(assessment.dimensionKey);
    return {
      id: newId(ctx),
      workspaceId: ctx.workspaceId,
      comparisonRunId: runId,
      dimensionKey: assessment.dimensionKey,
      dimensionLabel: assessment.dimensionLabel,
      expectedUnit: assessment.expectedUnit,
      weight: assessment.weight,
      participation: assessment.participation,
      exclusionReason: assessment.exclusionReason,
      baselineEvidenceId: assessment.participation === "included"
        ? (ids?.baseline ?? null)
        : (assessment.baselineEvidence !== null ? (ids?.baseline ?? null) : null),
      comparisonEvidenceId: assessment.participation === "included"
        ? (ids?.comparison ?? null)
        : (assessment.comparisonEvidence !== null ? (ids?.comparison ?? null) : null),
      baselineNormalizedValue: assessment.participation === "included" ? assessment.baselineNormalizedValue : null,
      comparisonNormalizedValue: assessment.participation === "included" ? assessment.comparisonNormalizedValue : null,
      rawDelta: assessment.participation === "included" ? assessment.rawDelta : null,
      normalizedDelta: assessment.participation === "included" ? assessment.normalizedDelta : null,
      dimensionSimilarity: assessment.participation === "included" ? assessment.dimensionSimilarity : null,
      weightedContribution: assessment.participation === "included" ? assessment.weightedContribution : null,
    };
  });

  const graph: ComparisonRunGraph = {
    run: {
      id: runId,
      workspaceId: ctx.workspaceId,
      mode: input.mode,
      similarityScore: algorithmResult.overallScore,
      coverage: algorithmResult.coverage,
      qualityStatus: qualityStatus.blocked ? "limited" : "ready",
      qualityReasonsJson,
      algorithmId: algorithmResult.algorithmIdentity,
      algorithmVersion: algorithmResult.algorithmVersion,
      algorithmConfigChecksum: algorithmResult.algorithmConfigChecksum,
      qualityPolicyId: qualityPolicy.policyId,
      qualityPolicyVersion: qualityPolicy.policyVersion,
      qualityPolicyConfigChecksum: qualityPolicy.configChecksum,
      comparisonContractId: PLS_COMPARISON_CONTRACT_ID,
      comparisonContractVersion: PLS_COMPARISON_CONTRACT_VERSION,
      comparisonContractChecksum: COMPARISON_CONTRACT_CHECKSUM,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      createdAt,
      createdBy: ctx.trustedActor,
      createdByDisplayName: ctx.trustedActorDisplayName ?? null,
    },
    participants: [
      {
        id: baselineParticipantId,
        workspaceId: ctx.workspaceId,
        comparisonRunId: runId,
        role: "baseline",
        family: input.baseline.object.family,
        objectType: input.baseline.object.objectType,
        objectId: input.baseline.object.objectId,
        displayName: input.baseline.object.displayName,
      },
      {
        id: comparisonParticipantId,
        workspaceId: ctx.workspaceId,
        comparisonRunId: runId,
        role: "comparison",
        family: input.comparison.object.family,
        objectType: input.comparison.object.objectType,
        objectId: input.comparison.object.objectId,
        displayName: input.comparison.object.displayName,
      },
    ],
    portraitSources: [
      {
        id: baselineSourceId,
        workspaceId: ctx.workspaceId,
        participantId: baselineParticipantId,
        sourceSystem: baselineResolved.resolved.sourceSystem,
        sourceContractVersion: baselineResolved.resolved.sourceContractVersion,
        snapshotId: baselineResolved.snapshot.snapshotId,
        dataVersion: baselineResolved.snapshot.dataVersion,
        periodStart: baselineResolved.snapshot.periodStart,
        periodEnd: baselineResolved.snapshot.periodEnd,
        sourceGeneratedAt: baselineResolved.snapshot.sourceGeneratedAt,
        sourceBatchId: baselineResolved.snapshot.sourceBatchId,
        sampleSize: baselineResolved.snapshot.sampleSize,
        confidence: baselineResolved.snapshot.confidence,
        qualityStatus: mapSourceQualityStatus(baselineResolved.snapshot),
        sourceFlagsJson: canonicalJson([...baselineResolved.snapshot.sourceQualityFlags]),
        policyReasonsJson: canonicalJson([]),
      },
      {
        id: comparisonSourceId,
        workspaceId: ctx.workspaceId,
        participantId: comparisonParticipantId,
        sourceSystem: comparisonResolved.resolved.sourceSystem,
        sourceContractVersion: comparisonResolved.resolved.sourceContractVersion,
        snapshotId: comparisonResolved.snapshot.snapshotId,
        dataVersion: comparisonResolved.snapshot.dataVersion,
        periodStart: comparisonResolved.snapshot.periodStart,
        periodEnd: comparisonResolved.snapshot.periodEnd,
        sourceGeneratedAt: comparisonResolved.snapshot.sourceGeneratedAt,
        sourceBatchId: comparisonResolved.snapshot.sourceBatchId,
        sampleSize: comparisonResolved.snapshot.sampleSize,
        confidence: comparisonResolved.snapshot.confidence,
        qualityStatus: mapSourceQualityStatus(comparisonResolved.snapshot),
        sourceFlagsJson: canonicalJson([...comparisonResolved.snapshot.sourceQualityFlags]),
        policyReasonsJson: canonicalJson([]),
      },
    ],
    dimensionEvidence: dimensionEvidenceRows,
    dimensionAssessments: assessmentRows,
  };

  // Test seam: allows tests to corrupt the in-memory graph before invariant validation
  ctx._faultHook?.("before_graph_validation", { graph });

  // Cross-row validation before persist
  validateGraphInvariants(graph, algorithmResult);

  return graph;
}

/** Build a ComparisonRunGraph from a detail projection for replay explanation repair. */
function buildReplayGraph(detail: NonNullable<ReturnType<typeof getComparisonRunDetail>>): ComparisonRunGraph | null {
  return {
    run: {
      id: detail.run.id,
      workspaceId: detail.run.workspaceId,
      mode: detail.run.mode,
      similarityScore: detail.run.similarityScore,
      coverage: detail.run.coverage,
      qualityStatus: detail.run.qualityStatus,
      qualityReasonsJson: detail.run.qualityReasonsJson,
      algorithmId: detail.run.algorithmId,
      algorithmVersion: detail.run.algorithmVersion,
      algorithmConfigChecksum: detail.run.algorithmConfigChecksum,
      qualityPolicyId: detail.run.qualityPolicyId,
      qualityPolicyVersion: detail.run.qualityPolicyVersion,
      qualityPolicyConfigChecksum: detail.run.qualityPolicyConfigChecksum,
      comparisonContractId: detail.run.comparisonContractId,
      comparisonContractVersion: detail.run.comparisonContractVersion,
      comparisonContractChecksum: detail.run.comparisonContractChecksum,
      idempotencyKey: detail.run.idempotencyKey,
      requestFingerprint: detail.run.requestFingerprint,
      createdAt: detail.run.createdAt,
      createdBy: detail.run.createdBy,
      createdByDisplayName: detail.run.createdByDisplayName,
    },
    participants: [detail.baseline.participant, detail.comparison.participant],
    portraitSources: [detail.baseline.source, detail.comparison.source],
    dimensionEvidence: detail.dimensionEvidence,
    dimensionAssessments: detail.dimensionAssessments,
  };
}

/** Cross-row invariant validation before persist. */
function validateGraphInvariants(graph: ComparisonRunGraph, algorithmResult: ComparisonAlgorithmResult): void {
  // Exactly 2 participants with correct roles
  if (graph.participants.length !== 2) {
    throw new ComparisonValidationError([{ path: "participants", message: "exactly 2 participants required" }]);
  }
  const baseline = graph.participants.find((p) => p.role === "baseline");
  const comparison = graph.participants.find((p) => p.role === "comparison");
  if (!baseline || !comparison) {
    throw new ComparisonValidationError([{ path: "participants", message: "must have baseline and comparison roles" }]);
  }

  // Participant run ownership
  for (const p of graph.participants) {
    if (p.comparisonRunId !== graph.run.id) {
      throw new ComparisonValidationError([{ path: "participants", message: "participant run ownership mismatch" }]);
    }
    if (p.workspaceId !== graph.run.workspaceId) {
      throw new ComparisonValidationError([{ path: "participants", message: "workspace ownership mismatch" }]);
    }
  }

  // Exactly 2 sources with source-to-participant bijection
  if (graph.portraitSources.length !== 2) {
    throw new ComparisonValidationError([{ path: "portraitSources", message: "exactly 2 sources required" }]);
  }
  const participantIds = new Set(graph.participants.map((p) => p.id));
  for (const s of graph.portraitSources) {
    if (s.workspaceId !== graph.run.workspaceId) {
      throw new ComparisonValidationError([{ path: "portraitSources", message: "workspace ownership mismatch" }]);
    }
    if (!participantIds.has(s.participantId)) {
      throw new ComparisonValidationError([{ path: "portraitSources", message: "source participantId not found in participants" }]);
    }
  }
  // Same source contract on both sides
  const sourceSystems = new Set(graph.portraitSources.map((s) => s.sourceSystem));
  if (sourceSystems.size !== 1) {
    throw new ComparisonValidationError([{ path: "portraitSources", message: "both sources must use the same source system" }]);
  }
  const sourceContractVersions = new Set(graph.portraitSources.map((s) => s.sourceContractVersion));
  if (sourceContractVersions.size !== 1) {
    throw new ComparisonValidationError([{ path: "portraitSources", message: "both sources must use the same source contract version" }]);
  }

  // Evidence workspace + participant ownership + dimension/unit binding
  const evidenceByParticipantAndKey = new Map<string, Set<string>>();
  for (const e of graph.dimensionEvidence) {
    if (e.workspaceId !== graph.run.workspaceId) {
      throw new ComparisonValidationError([{ path: "dimensionEvidence", message: "workspace ownership mismatch" }]);
    }
    if (!participantIds.has(e.participantId)) {
      throw new ComparisonValidationError([{ path: "dimensionEvidence", message: "evidence participantId not found in participants" }]);
    }
    const key = `${e.participantId}:${e.dimensionKey}`;
    if (evidenceByParticipantAndKey.has(key)) {
      throw new ComparisonValidationError([{ path: "dimensionEvidence", message: `duplicate evidence for ${key}` }]);
    }
    evidenceByParticipantAndKey.set(key, new Set());
    // Verify unit matches candidate dimension
    const candidate = algorithmResult.assessments.find((a) => a.dimensionKey === e.dimensionKey);
    if (candidate && candidate.participation === "included" && e.unit !== candidate.expectedUnit) {
      throw new ComparisonValidationError([{ path: "dimensionEvidence", message: `unit mismatch for ${e.dimensionKey}: expected ${candidate.expectedUnit}, got ${e.unit}` }]);
    }
  }

  // Assessment FKs and candidate coverage
  const candidateKeys = new Set(algorithmResult.assessments.map((a) => a.dimensionKey));
  if (graph.dimensionAssessments.length !== algorithmResult.assessments.length) {
    throw new ComparisonValidationError([{ path: "dimensionAssessments", message: "assessment count must match candidate count" }]);
  }
  for (const a of graph.dimensionAssessments) {
    if (a.workspaceId !== graph.run.workspaceId) {
      throw new ComparisonValidationError([{ path: "dimensionAssessments", message: "workspace ownership mismatch" }]);
    }
    if (a.comparisonRunId !== graph.run.id) {
      throw new ComparisonValidationError([{ path: "dimensionAssessments", message: "assessment run ownership mismatch" }]);
    }
    if (!candidateKeys.has(a.dimensionKey)) {
      throw new ComparisonValidationError([{ path: "dimensionAssessments", message: `assessment dimensionKey ${a.dimensionKey} not in candidates` }]);
    }
  }

  // Overall score must be finite
  if (!Number.isFinite(graph.run.similarityScore)) {
    throw new ComparisonValidationError([{ path: "similarityScore", message: "must be finite" }]);
  }
  // Coverage must be finite
  if (!Number.isFinite(graph.run.coverage)) {
    throw new ComparisonValidationError([{ path: "coverage", message: "must be finite" }]);
  }
}

// ---------------------------------------------------------------------------
// Rule explanation (post-commit, separate transaction)
// ---------------------------------------------------------------------------

function buildRuleSummaryInput(graph: ComparisonRunGraph): RuleSummaryInput {
  const run = graph.run;
  const baselineParticipant = graph.participants.find((p) => p.role === "baseline")!;
  const comparisonParticipant = graph.participants.find((p) => p.role === "comparison")!;
  const baselineSource = graph.portraitSources.find((s) => s.participantId === baselineParticipant.id)!;
  const comparisonSource = graph.portraitSources.find((s) => s.participantId === comparisonParticipant.id)!;

  return {
    comparisonRunId: run.id,
    comparisonMode: run.mode as ComparisonMode,
    similarityScore: run.similarityScore,
    coverage: run.coverage,
    qualityStatus: run.qualityStatus as "ready" | "limited",
    qualityReasonCodes: parseJsonArray(run.qualityReasonsJson),
    baseline: {
      participantId: baselineParticipant.id,
      portraitSourceId: baselineSource.id,
      objectId: baselineParticipant.objectId,
      displayName: baselineParticipant.displayName,
      family: baselineParticipant.family,
      objectType: baselineParticipant.objectType,
      snapshotId: baselineSource.snapshotId,
      periodStart: baselineSource.periodStart,
      periodEnd: baselineSource.periodEnd,
    },
    comparison: {
      participantId: comparisonParticipant.id,
      portraitSourceId: comparisonSource.id,
      objectId: comparisonParticipant.objectId,
      displayName: comparisonParticipant.displayName,
      family: comparisonParticipant.family,
      objectType: comparisonParticipant.objectType,
      snapshotId: comparisonSource.snapshotId,
      periodStart: comparisonSource.periodStart,
      periodEnd: comparisonSource.periodEnd,
    },
    algorithmVersion: run.algorithmVersion,
    algorithmConfigChecksum: run.algorithmConfigChecksum,
    qualityPolicyVersion: run.qualityPolicyVersion,
    qualityPolicyConfigChecksum: run.qualityPolicyConfigChecksum,
    dimensionAssessments: graph.dimensionAssessments.map((a) => ({
      dimensionAssessmentId: a.id,
      dimensionKey: a.dimensionKey,
      dimensionLabel: a.dimensionLabel,
      participation: a.participation as "included" | "excluded",
      exclusionReason: a.exclusionReason as RuleSummaryInput["dimensionAssessments"][number]["exclusionReason"],
      baselineEvidenceId: a.baselineEvidenceId,
      comparisonEvidenceId: a.comparisonEvidenceId,
      dimensionSimilarity: a.dimensionSimilarity,
      normalizedDelta: a.normalizedDelta,
    })),
  };
}

function generateAndPersistExplanation(
  ctx: ComparisonApplicationContext,
  graph: ComparisonRunGraph,
): void {
  const ruleInput = buildRuleSummaryInput(graph);

  let ruleResult: RuleSummaryResult;
  try {
    ctx._explanationFaultHook?.("before_rule_generation");
    ruleResult = createRuleSummary(ruleInput);
    // Test seam: allows tests to tamper with the generator output (manifest/checksum)
    ctx._explanationFaultHook?.("after_rule_generation", { ruleResult });
  } catch (error) {
    // Rule summary generation failed — persist failed Attempt/Outcome
    persistFailedExplanation(ctx, graph.run.id, "invalid_generator_output");
    return;
  }

  // Test seam: allows tests to open the competition window / corrupt manifest records
  // after generation but before the Attempt transaction begins.
  ctx._explanationFaultHook?.("before_attempt_transaction");

  // Transaction 1: ensure-once recheck + sequence allocation + manifest validation + Attempt insert
  // — all inside the same BEGIN IMMEDIATE transaction (no TOCTOU window).
  let attemptTx: { attemptId: string; attemptSequence: number; skipped: boolean };
  try {
    attemptTx = withTransaction(ctx.db, () => {
      // Ensure-once recheck INSIDE the transaction: an existing approved rule-generator
      // attempt (any status, including interrupted) means the automatic path does nothing.
      const existingAttempts = listAttemptsWithOutcomes(ctx.db, ctx.workspaceId, graph.run.id);
      const existingRuleAttempt = existingAttempts.find(
        (a) => a.attempt.generatorId === PLS_RULE_SUMMARY_GENERATOR_ID
          && a.attempt.generatorVersion === PLS_RULE_SUMMARY_GENERATOR_VERSION,
      );
      if (existingRuleAttempt !== undefined) {
        return { attemptId: existingRuleAttempt.attempt.id, attemptSequence: existingRuleAttempt.attempt.attemptSequence, skipped: true };
      }

      const maxSeq = getMaxAttemptSequence(ctx.db, ctx.workspaceId, graph.run.id);
      const nextSequence = (maxSeq ?? 0) + 1;
      const id = newId(ctx);

      // Manifest canonical JSON + checksum recompute + per-record ownership, all in-transaction
      const manifestJson = validateManifestInTransaction(ctx.db, ctx.workspaceId, graph.run.id, ruleResult);

      insertExplanationAttempt(ctx.db, {
        id,
        workspaceId: ctx.workspaceId,
        comparisonRunId: graph.run.id,
        attemptSequence: nextSequence,
        generatorType: ruleResult.generatorType,
        generatorId: ruleResult.generatorId,
        generatorVersion: ruleResult.generatorVersion,
        explanationContractVersion: ruleResult.explanationContractVersion,
        evidenceManifestJson: manifestJson,
        evidenceManifestChecksum: ruleResult.evidenceManifestChecksum,
        startedAt: now(ctx),
        actor: ctx.trustedActor,
      });
      return { attemptId: id, attemptSequence: nextSequence, skipped: false };
    });
  } catch (error) {
    if (error instanceof ManifestOwnershipError) {
      // Controlled failure semantics: no misleading succeeded/interrupted data;
      // persist a controlled failed Attempt/Outcome per the approved taxonomy.
      persistFailedExplanation(ctx, graph.run.id, "invalid_evidence_reference");
      return;
    }
    if (error instanceof ManifestChecksumError) {
      persistFailedExplanation(ctx, graph.run.id, "invalid_generator_output");
      return;
    }
    throw error;
  }

  if (attemptTx.skipped) return;
  const { attemptId } = attemptTx;

  // Transaction 2: create Outcome (separate — if this fails, attempt remains interrupted)
  try {
    // Test seam: allows tests to simulate crash between Attempt and Outcome
    ctx._explanationFaultHook?.("after_attempt_before_outcome");
    withTransaction(ctx.db, () => {
      ctx._explanationFaultHook?.("inside_outcome_transaction");
      insertExplanationOutcome(ctx.db, {
        id: newId(ctx),
        workspaceId: ctx.workspaceId,
        explanationAttemptId: attemptId,
        status: "succeeded",
        completedAt: now(ctx),
        contentJson: canonicalJson(ruleResult.content as unknown as JsonValue),
        errorCode: null,
        failureContractVersion: null,
        retryable: null,
        errorMessage: null,
      });
    });
  } catch {
    // Outcome persistence failed — attempt remains interrupted
    // Core Run is not affected. Audit minimal metadata.
    auditExplanationFailure(ctx, graph.run.id, "explanation_outcome_persistence_failed", "outcome_transaction_failed");
  }
}

function persistFailedExplanation(ctx: ComparisonApplicationContext, runId: string, errorCode: string): void {
  try {
    // Transaction 1: create Attempt
    const attemptId = withTransaction(ctx.db, () => {
      const maxSeq = getMaxAttemptSequence(ctx.db, ctx.workspaceId, runId);
      const nextSequence = (maxSeq ?? 0) + 1;
      const id = newId(ctx);

      insertExplanationAttempt(ctx.db, {
        id,
        workspaceId: ctx.workspaceId,
        comparisonRunId: runId,
        attemptSequence: nextSequence,
        generatorType: "rule",
        generatorId: PLS_RULE_SUMMARY_GENERATOR_ID,
        generatorVersion: PLS_RULE_SUMMARY_GENERATOR_VERSION,
        explanationContractVersion: PLS_RULE_SUMMARY_CONTRACT_VERSION,
        evidenceManifestJson: canonicalJson([]),
        evidenceManifestChecksum: checksumCanonicalJson([]),
        startedAt: now(ctx),
        actor: ctx.trustedActor,
      });
      return id;
    });

    // Transaction 2: create failed Outcome
    withTransaction(ctx.db, () => {
      insertExplanationOutcome(ctx.db, {
        id: newId(ctx),
        workspaceId: ctx.workspaceId,
        explanationAttemptId: attemptId,
        status: "failed",
        completedAt: now(ctx),
        contentJson: null,
        errorCode,
        failureContractVersion: PLS_RULE_SUMMARY_CONTRACT_VERSION,
        retryable: 1,
        errorMessage: "rule summary explanation failed",
      });
    });

    // Audit minimal metadata for explanation failure
    auditExplanationFailure(ctx, runId, "explanation_generation_failed", errorCode);
  } catch {
    // Explanation failure does not rollback the core Run
  }
}

// ---------------------------------------------------------------------------
// Post-insert numerical recomputation validation
// Reuses pure deterministic computation over the persisted projection.
// No source I/O, rule generation, or external algorithm execution.
// ---------------------------------------------------------------------------

function normalizeValue(value: number, normalization: { min: number; max: number; clamp: boolean }): number {
  const normalized = ((value - normalization.min) / (normalization.max - normalization.min)) * 100;
  return normalization.clamp ? Math.max(0, Math.min(100, normalized)) : normalized;
}

function verifyPersistedNumericalConsistency(
  db: DatabaseSync,
  workspaceId: string,
  runId: string,
  algorithmResult: ComparisonAlgorithmResult,
  algorithmConfig: ComparisonAlgorithmConfig,
  tolerance: number,
): void {
  // Read persisted assessments
  const assessmentRows = db.prepare(`
    SELECT dimension_key, dimension_label, expected_unit, weight, participation, exclusion_reason,
           baseline_evidence_id, comparison_evidence_id,
           baseline_normalized_value, comparison_normalized_value,
           raw_delta, normalized_delta, dimension_similarity, weighted_contribution
    FROM comparison_dimension_assessment
    WHERE workspace_id = ? AND comparison_run_id = ?
  `).all(workspaceId, runId) as Record<string, unknown>[];

  // Read persisted evidence for recomputation
  const evidenceRows = db.prepare(`
    SELECT e.id, e.participant_id, e.dimension_key, e.dimension_label, e.value, e.unit, p.role
    FROM comparison_dimension_evidence e
    JOIN comparison_participant p ON p.id = e.participant_id AND p.workspace_id = e.workspace_id
    WHERE e.workspace_id = ?
    AND e.participant_id IN (
      SELECT id FROM comparison_participant WHERE workspace_id = ? AND comparison_run_id = ?
    )
  `).all(workspaceId, workspaceId, runId) as Record<string, unknown>[];

  const evidenceByKey = new Map<string, { baseline: Record<string, unknown> | null; comparison: Record<string, unknown> | null }>();
  for (const row of evidenceRows) {
    const key = String(row["dimension_key"]);
    const role = String(row["role"]);
    if (!evidenceByKey.has(key)) evidenceByKey.set(key, { baseline: null, comparison: null });
    const entry = evidenceByKey.get(key)!;
    if (role === "baseline") entry.baseline = row;
    else if (role === "comparison") entry.comparison = row;
  }

  // Build candidate map from algorithm config (for normalization descriptors)
  const candidateConfigByKey = new Map<string, typeof algorithmConfig.candidateDimensions[number]>();
  for (const c of algorithmConfig.candidateDimensions) candidateConfigByKey.set(c.dimensionKey, c);

  // Build candidate map from algorithm result
  const candidateByKey = new Map<string, typeof algorithmResult.assessments[number]>();
  for (const a of algorithmResult.assessments) candidateByKey.set(a.dimensionKey, a);

  const candidateWeightSum = algorithmResult.candidateWeightSum;
  let includedWeightSum = 0;
  for (const assessment of algorithmResult.assessments) {
    if (assessment.participation === "included") includedWeightSum += assessment.weight;
  }

  // Verify each assessment
  for (const assessment of algorithmResult.assessments) {
    const persistedRow = assessmentRows.find((r) => String(r["dimension_key"]) === assessment.dimensionKey);
    if (persistedRow === undefined) {
      throw new ComparisonStateError(`post-insert validation: missing assessment for ${assessment.dimensionKey}`);
    }

    // Verify labels and weights match candidate contract
    if (String(persistedRow["dimension_label"]) !== assessment.dimensionLabel) {
      throw new ComparisonStateError(`post-insert validation: dimensionLabel mismatch for ${assessment.dimensionKey}`);
    }
    if (String(persistedRow["expected_unit"]) !== assessment.expectedUnit) {
      throw new ComparisonStateError(`post-insert validation: expectedUnit mismatch for ${assessment.dimensionKey}`);
    }
    if (Math.abs(Number(persistedRow["weight"]) - assessment.weight) > tolerance) {
      throw new ComparisonStateError(`post-insert validation: weight mismatch for ${assessment.dimensionKey}`);
    }
    if (String(persistedRow["participation"]) !== assessment.participation) {
      throw new ComparisonStateError(`post-insert validation: participation mismatch for ${assessment.dimensionKey}`);
    }
    if (String(persistedRow["exclusion_reason"] ?? null) !== String(assessment.exclusionReason ?? null)) {
      throw new ComparisonStateError(`post-insert validation: exclusionReason mismatch for ${assessment.dimensionKey}`);
    }

    // Look up evidence (used by both included and excluded branches)
    const evidence = evidenceByKey.get(assessment.dimensionKey);

    if (assessment.participation === "included") {
      if (!evidence?.baseline || !evidence?.comparison) {
        throw new ComparisonStateError(`post-insert validation: missing evidence for included ${assessment.dimensionKey}`);
      }

      const baselineValue = Number(evidence.baseline["value"]);
      const comparisonValue = Number(evidence.comparison["value"]);
      const rawDelta = comparisonValue - baselineValue;

      // Verify persisted rawDelta
      const persistedRawDelta = Number(persistedRow["raw_delta"]);
      if (Math.abs(persistedRawDelta - rawDelta) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: rawDelta mismatch for ${assessment.dimensionKey}`);
      }

      // Recompute normalized values from evidence + normalization descriptor
      if (assessment.participation !== "included") continue;
      const candidateConfig = candidateConfigByKey.get(assessment.dimensionKey);
      if (!candidateConfig) {
        throw new ComparisonStateError(`post-insert validation: missing config for ${assessment.dimensionKey}`);
      }
      const normalization = candidateConfig.normalization;
      const expectedBaselineNorm = normalizeValue(baselineValue, normalization);
      const expectedComparisonNorm = normalizeValue(comparisonValue, normalization);

      // Verify persisted normalized values match recomputed
      const persistedBaselineNorm = Number(persistedRow["baseline_normalized_value"]);
      const persistedComparisonNorm = Number(persistedRow["comparison_normalized_value"]);
      if (Math.abs(persistedBaselineNorm - expectedBaselineNorm) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: baselineNormalizedValue mismatch for ${assessment.dimensionKey}`);
      }
      if (Math.abs(persistedComparisonNorm - expectedComparisonNorm) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: comparisonNormalizedValue mismatch for ${assessment.dimensionKey}`);
      }

      // Verify normalizedDelta from recomputed normalized values
      const expectedNormalizedDelta = expectedComparisonNorm - expectedBaselineNorm;
      const persistedNormalizedDelta = Number(persistedRow["normalized_delta"]);
      if (Math.abs(persistedNormalizedDelta - expectedNormalizedDelta) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: normalizedDelta mismatch for ${assessment.dimensionKey}`);
      }

      // Verify dimensionSimilarity
      const expectedSimilarity = Math.max(0, Math.min(100, 100 - Math.abs(expectedNormalizedDelta)));
      const persistedSimilarity = Number(persistedRow["dimension_similarity"]);
      if (Math.abs(persistedSimilarity - expectedSimilarity) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: dimensionSimilarity mismatch for ${assessment.dimensionKey}`);
      }

      // Verify weightedContribution
      const expectedContribution = includedWeightSum > 0 ? (expectedSimilarity * candidateConfig.weight) / includedWeightSum : 0;
      const persistedContribution = Number(persistedRow["weighted_contribution"]);
      if (Math.abs(persistedContribution - expectedContribution) > tolerance) {
        throw new ComparisonStateError(`post-insert validation: weightedContribution mismatch for ${assessment.dimensionKey}`);
      }

      // Verify evidence FK binding — must point to exact evidence for same run, dimension, role
      const persistedBaselineFk = String(persistedRow["baseline_evidence_id"] ?? "");
      const persistedComparisonFk = String(persistedRow["comparison_evidence_id"] ?? "");
      if (!persistedBaselineFk || !persistedComparisonFk) {
        throw new ComparisonStateError(`post-insert validation: included assessment ${assessment.dimensionKey} missing evidence FKs`);
      }
      // Verify the FK points to the correct evidence record
      if (evidence?.baseline && String(evidence.baseline["id"]) !== persistedBaselineFk) {
        throw new ComparisonStateError(`post-insert validation: baseline evidence FK mismatch for ${assessment.dimensionKey}`);
      }
      if (evidence?.comparison && String(evidence.comparison["id"]) !== persistedComparisonFk) {
        throw new ComparisonStateError(`post-insert validation: comparison evidence FK mismatch for ${assessment.dimensionKey}`);
      }
      // Verify evidence dimension_label and unit match candidate contract
      if (evidence?.baseline) {
        if (String(evidence.baseline["dimension_label"]) !== assessment.dimensionLabel) {
          throw new ComparisonStateError(`post-insert validation: baseline evidence dimension_label mismatch for ${assessment.dimensionKey}`);
        }
        if (String(evidence.baseline["unit"]) !== assessment.expectedUnit) {
          throw new ComparisonStateError(`post-insert validation: baseline evidence unit mismatch for ${assessment.dimensionKey}`);
        }
      }
      if (evidence?.comparison) {
        if (String(evidence.comparison["dimension_label"]) !== assessment.dimensionLabel) {
          throw new ComparisonStateError(`post-insert validation: comparison evidence dimension_label mismatch for ${assessment.dimensionKey}`);
        }
        if (String(evidence.comparison["unit"]) !== assessment.expectedUnit) {
          throw new ComparisonStateError(`post-insert validation: comparison evidence unit mismatch for ${assessment.dimensionKey}`);
        }
      }
    } else {
      // Excluded: all derived fields must be null; evidence FKs must follow exclusion reason
      if (persistedRow["baseline_normalized_value"] !== null ||
          persistedRow["comparison_normalized_value"] !== null ||
          persistedRow["raw_delta"] !== null ||
          persistedRow["normalized_delta"] !== null ||
          persistedRow["dimension_similarity"] !== null ||
          persistedRow["weighted_contribution"] !== null) {
        throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} has non-null derived values`);
      }

      // Get the algorithm assessment's actual evidence values
      const algAssessment = algorithmResult.assessments.find((a) => a.dimensionKey === assessment.dimensionKey);
      const algBaselineEvidence = algAssessment && algAssessment.participation === "excluded" ? algAssessment.baselineEvidence : null;
      const algComparisonEvidence = algAssessment && algAssessment.participation === "excluded" ? algAssessment.comparisonEvidence : null;

      // Validate evidence FKs based on algorithm assessment's actual evidence presence
      const baselineFk = persistedRow["baseline_evidence_id"];
      const comparisonFk = persistedRow["comparison_evidence_id"];

      // FK must match algorithm assessment's evidence presence
      if (algBaselineEvidence !== null) {
        if (baselineFk === null) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} expected baseline FK but got null`);
        }
        if (!evidence?.baseline) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} baseline FK present but no evidence in evidence map`);
        }
        if (String(evidence.baseline["id"]) !== String(baselineFk)) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} baseline FK mismatch`);
        }
        // Validate persisted evidence matches algorithm assessment's actual evidence
        if (String(evidence.baseline["dimension_label"]) !== algBaselineEvidence.dimensionLabel) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} baseline evidence dimension_label mismatch`);
        }
        if (String(evidence.baseline["unit"]) !== algBaselineEvidence.unit) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} baseline evidence unit mismatch`);
        }
      } else {
        if (baselineFk !== null) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} expected null baseline FK but got ${baselineFk}`);
        }
      }

      if (algComparisonEvidence !== null) {
        if (comparisonFk === null) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} expected comparison FK but got null`);
        }
        if (!evidence?.comparison) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} comparison FK present but no evidence in evidence map`);
        }
        if (String(evidence.comparison["id"]) !== String(comparisonFk)) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} comparison FK mismatch`);
        }
        // Validate persisted evidence matches algorithm assessment's actual evidence
        if (String(evidence.comparison["dimension_label"]) !== algComparisonEvidence.dimensionLabel) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} comparison evidence dimension_label mismatch`);
        }
        if (String(evidence.comparison["unit"]) !== algComparisonEvidence.unit) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} comparison evidence unit mismatch`);
        }
      } else {
        if (comparisonFk !== null) {
          throw new ComparisonStateError(`post-insert validation: excluded ${assessment.dimensionKey} expected null comparison FK but got ${comparisonFk}`);
        }
      }
    }
  }

  // Verify coverage
  const expectedCoverage = candidateWeightSum > 0 ? (includedWeightSum / candidateWeightSum) * 100 : 0;
  const runRow = db.prepare("SELECT coverage, similarity_score FROM comparison_run WHERE workspace_id = ? AND id = ?").get(workspaceId, runId) as Record<string, unknown> | undefined;
  if (!runRow) throw new ComparisonStateError("post-insert validation: run not found for score/coverage check");
  if (Math.abs(Number(runRow["coverage"]) - expectedCoverage) > tolerance) {
    throw new ComparisonStateError("post-insert validation: coverage mismatch");
  }

  // Verify overall similarity_score = sum of weighted contributions
  if (algorithmResult.overallScore !== null) {
    const contributionSum = algorithmResult.assessments
      .filter((a) => a.participation === "included")
      .reduce((sum, a) => sum + (a.weightedContribution ?? 0), 0);
    const persistedScore = Number(runRow["similarity_score"]);
    if (Math.abs(persistedScore - contributionSum) > tolerance) {
      throw new ComparisonStateError(`post-insert validation: similarityScore mismatch: expected ${contributionSum}, got ${persistedScore}`);
    }
  }
}

// ---------------------------------------------------------------------------
// create — pre-source idempotency check, then resolve, then core transaction
// ---------------------------------------------------------------------------

export function createComparison(
  ctx: ComparisonApplicationContext,
  input: CreateComparisonInput,
): CreateComparisonOutput {
  // 1. Validate input — minimal sanitized audit on validation failure
  try {
    validateCreateInput(input);
  } catch (error) {
    if (error instanceof ComparisonValidationError) {
      auditCreateValidationFailure(ctx, input.idempotencyKey, "input_validation_failed", String(input.mode));
    }
    throw error;
  }
  try {
    validateModeLegality(input.mode, input.baseline, input.comparison);
  } catch (error) {
    if (error instanceof ComparisonValidationError) {
      auditCreateValidationFailure(ctx, input.idempotencyKey, "mode_validation_failed", input.mode);
    }
    throw error;
  }

  // 2. Compute fingerprint (includes contract checksum)
  const requestFingerprint = computeRequestFingerprint(
    ctx.workspaceId, ctx.trustedActor, input.mode, input.baseline, input.comparison,
  );

  // 3. Pre-source idempotency check (before resolving sources)
  const preExisting = findRunByIdempotencyKey(ctx.db, ctx.workspaceId, input.idempotencyKey);
  if (preExisting !== null) {
    if (preExisting.requestFingerprint === requestFingerprint) {
      // Replay: repair missing automatic explanation if needed
      const existingAttempts = listAttemptsWithOutcomes(ctx.db, ctx.workspaceId, preExisting.runId);
      const hasRuleExplanation = existingAttempts.some(
        (a) => a.attempt.generatorId === PLS_RULE_SUMMARY_GENERATOR_ID
          && a.attempt.generatorVersion === PLS_RULE_SUMMARY_GENERATOR_VERSION
          && a.outcome !== null,
      );
      if (!hasRuleExplanation) {
        const detail = getComparisonRunDetail(ctx.db, ctx.workspaceId, preExisting.runId);
        if (detail !== null) {
          const replayGraph = buildReplayGraph(detail);
          if (replayGraph !== null) {
            generateAndPersistExplanation(ctx, replayGraph);
          }
        }
      }
      return { runId: preExisting.runId, replayed: true };
    }
    throw new ComparisonIdempotencyConflictError(
      `idempotency key "${input.idempotencyKey}" was already used with a different request`,
    );
  }

  // 4. Resolve sources (OUTSIDE transaction)
  ctx._faultHook?.("before_source_resolve");
  let baselineResolved: ResolvedSide;
  let comparisonResolved: ResolvedSide;
  try {
    baselineResolved = resolveSide(
      ctx.portraitSource, ctx.workspaceId, input.baseline.object.objectId, input.baseline.snapshot.snapshotId,
    );
    comparisonResolved = resolveSide(
      ctx.portraitSource, ctx.workspaceId, input.comparison.object.objectId, input.comparison.snapshot.snapshotId,
    );
    validateSourceCompatibility(baselineResolved, comparisonResolved);

    // 5. Validate request facts match resolved facts (binding)
    validateRequestBinding(input.baseline, baselineResolved, ctx.portraitSource, ctx.workspaceId, "baseline");
    validateRequestBinding(input.comparison, comparisonResolved, ctx.portraitSource, ctx.workspaceId, "comparison");
  } catch (error) {
    // Audit minimal metadata for source failure
    try {
      writeAudit(ctx.db, {
        workspaceId: ctx.workspaceId,
        actor: ctx.trustedActor,
        requestId: input.idempotencyKey,
        resourceType: "comparison_run",
        event: "source_resolution_failed",
        reasonCode: error instanceof ComparisonSourceError ? "source_error" : "unknown",
        meta: { mode: input.mode },
      });
    } catch {
      // Audit failure does not block the source error
    }
    throw error;
  }

  ctx._faultHook?.("after_source_resolve");

  // 6. Quality gate
  const qualityPolicy = ctx._qualityPolicy ?? getProductionQualityPolicy();
  const baselineEvidence = mapEvidenceProjection("baseline", baselineResolved.dimensionEvidence, baselineResolved.snapshot);
  const comparisonEvidence = mapEvidenceProjection("comparison", comparisonResolved.dimensionEvidence, comparisonResolved.snapshot);
  const allEvidence = [...baselineEvidence, ...comparisonEvidence];

  // 7. Algorithm (OUTSIDE transaction)
  ctx._faultHook?.("before_algorithm");
  let algorithmResult: ComparisonAlgorithmResult;
  try {
    algorithmResult = computeComparisonAlgorithmResult({
      comparisonMode: input.mode,
      config: ctx.algorithmConfig,
      evidence: allEvidence,
    });
  } catch (error) {
    // Audit minimal metadata for algorithm failure
    try {
      writeAudit(ctx.db, {
        workspaceId: ctx.workspaceId,
        actor: ctx.trustedActor,
        requestId: input.idempotencyKey,
        resourceType: "comparison_run",
        event: "algorithm_failed",
        reasonCode: "algorithm_error",
        meta: { mode: input.mode },
      });
    } catch {
      // Audit failure does not block the algorithm error
    }
    // Wrap raw algorithm errors in controlled error taxonomy
    throw new ComparisonStateError("comparison algorithm computation failed");
  }

  const qualityGate = evaluateQualityGate(qualityPolicy, algorithmResult);
  if (qualityGate.blocked) {
    // Audit minimal metadata for quality gate failure
    try {
      writeAudit(ctx.db, {
        workspaceId: ctx.workspaceId,
        actor: ctx.trustedActor,
        requestId: input.idempotencyKey,
        resourceType: "comparison_run",
        event: "quality_gate_blocked",
        reasonCode: qualityGate.reasonCodes.join(","),
        meta: { mode: input.mode },
      });
    } catch {
      // Audit failure does not block the quality gate error
    }
    throw new ComparisonQualityGateError(qualityGate.reasonCodes);
  }
  ctx._faultHook?.("after_algorithm");

  // 8. Core transaction (BEGIN IMMEDIATE)
  ctx._faultHook?.("before_transaction");
  let graph: { runId: string; replayed: boolean; graph: ComparisonRunGraph | null };
  try {
    graph = withTransaction(ctx.db, () => {
      // Idempotency recheck inside transaction (covers two-connection race)
      const existing = findRunByIdempotencyKey(ctx.db, ctx.workspaceId, input.idempotencyKey);
      if (existing !== null) {
        if (existing.requestFingerprint === requestFingerprint) {
          return { runId: existing.runId, replayed: true, graph: null };
        }
        throw new ComparisonIdempotencyConflictError(
          `idempotency key "${input.idempotencyKey}" was already used with a different request`,
        );
      }

      ctx._faultHook?.("inside_transaction_before_insert");
      const runGraph = buildRunGraph(
        ctx, input, baselineResolved, comparisonResolved, algorithmResult, requestFingerprint, qualityPolicy,
      );
      insertComparisonRunGraph(ctx.db, runGraph, ctx._faultHook);

      // Test seam: allows tests to corrupt persisted data before post-insert validation
      ctx._faultHook?.("inside_transaction_before_validation");

      // Post-insert projection validation: read back and verify key fields
      const insertedRun = findRunByIdempotencyKey(ctx.db, ctx.workspaceId, input.idempotencyKey);
      if (insertedRun === null) {
        throw new ComparisonStateError("post-insert validation: run not found after insert");
      }
      if (insertedRun.runId !== runGraph.run.id) {
        throw new ComparisonStateError("post-insert validation: run ID mismatch");
      }
      if (insertedRun.requestFingerprint !== requestFingerprint) {
        throw new ComparisonStateError("post-insert validation: fingerprint mismatch");
      }

      // Verify full graph was persisted: participants, sources, evidence, assessments
      const detail = getComparisonRunDetail(ctx.db, ctx.workspaceId, runGraph.run.id);
      if (detail === null) {
        throw new ComparisonStateError("post-insert validation: detail not available after insert");
      }
      if (detail.baseline.participant.role !== "baseline" || detail.comparison.participant.role !== "comparison") {
        throw new ComparisonStateError("post-insert validation: participant roles mismatch");
      }
      if (detail.baseline.participant.comparisonRunId !== runGraph.run.id ||
          detail.comparison.participant.comparisonRunId !== runGraph.run.id) {
        throw new ComparisonStateError("post-insert validation: participant run ownership mismatch");
      }
      if (detail.baseline.source.participantId !== detail.baseline.participant.id ||
          detail.comparison.source.participantId !== detail.comparison.participant.id) {
        throw new ComparisonStateError("post-insert validation: source participant ownership mismatch");
      }
      if (detail.dimensionAssessments.length !== runGraph.dimensionAssessments.length) {
        throw new ComparisonStateError("post-insert validation: assessment count mismatch");
      }
      if (!Number.isFinite(detail.run.similarityScore) || !Number.isFinite(detail.run.coverage)) {
        throw new ComparisonStateError("post-insert validation: non-finite score or coverage");
      }

      // Numerical recomputation validation: recompute derived values from persisted
      // evidence and compare against persisted assessments with controlled tolerance
      verifyPersistedNumericalConsistency(ctx.db, ctx.workspaceId, runGraph.run.id, algorithmResult, ctx.algorithmConfig, ctx.algorithmConfig.floatingTolerance);

      ctx._faultHook?.("inside_transaction_after_insert");
      return { runId: runGraph.run.id, replayed: false, graph: runGraph };
    });
  } catch (error) {
    // Audit minimal sanitized metadata, classified by failure family.
    // Raw SQLite/fault-hook text never enters audit metadata.
    if (error instanceof ComparisonValidationError) {
      // Graph invariant validation (buildRunGraph) is the only ValidationError source inside the transaction
      auditCreateValidationFailure(ctx, input.idempotencyKey, "graph_invariant_validation_failed", input.mode);
    } else if (error instanceof ComparisonStateError) {
      // Post-insert projection / numerical recomputation validation failures
      auditCreateValidationFailure(ctx, input.idempotencyKey, "post_insert_validation_failed", input.mode);
    } else {
      try {
        writeAudit(ctx.db, {
          workspaceId: ctx.workspaceId,
          actor: ctx.trustedActor,
          requestId: input.idempotencyKey,
          resourceType: "comparison_run",
          event: "transaction_failed",
          reasonCode: error instanceof ComparisonIdempotencyConflictError ? "idempotency_conflict" : "transaction_error",
          meta: { mode: input.mode },
        });
      } catch {
        // Audit failure does not block the transaction error
      }
    }
    // Wrap raw SQLite/unknown errors in controlled error taxonomy
    if (error instanceof ComparisonIdempotencyConflictError ||
        error instanceof ComparisonStateError ||
        error instanceof ComparisonQualityGateError ||
        error instanceof ComparisonValidationError) {
      throw error;
    }
    throw new ComparisonStateError("comparison creation failed due to an internal error");
  }
  ctx._faultHook?.("after_transaction");

  // 9. Post-commit: rule explanation (separate transaction)
  if (graph.graph !== null) {
    generateAndPersistExplanation(ctx, graph.graph);
  }

  return { runId: graph.runId, replayed: graph.replayed };
}

// ---------------------------------------------------------------------------
// detail — fail closed on corrupted aggregates
// ---------------------------------------------------------------------------

export function getComparisonDetail(
  ctx: ComparisonApplicationContext,
  runId: string,
): ComparisonDetail | null {
  requireUuid(runId, "runId");
  const detail = getComparisonRunDetail(ctx.db, ctx.workspaceId, runId);
  if (detail === null) return null;

  // Exact aggregate validation — fail closed (ComparisonStateError) on any
  // corrupted cardinality, ownership, set, sequence, or numerical projection.
  validateDetailAggregateConsistency(ctx, detail);

  return mapDetailToDto(detail);
}

// ---------------------------------------------------------------------------
// Exact aggregate validation for detail reads.
// Recomputes the full projection from persisted evidence + the candidate
// contract identified by the Run's persisted algorithm identity/checksum, and
// compares every persisted derived value with controlled floating tolerance.
// ---------------------------------------------------------------------------

function validateDetailAggregateConsistency(
  ctx: ComparisonApplicationContext,
  detail: NonNullable<ReturnType<typeof getComparisonRunDetail>>,
): void {
  const run = detail.run;
  const config = ctx.algorithmConfig;
  const tolerance = config.floatingTolerance;
  const fail = (message: string): never => {
    throw new ComparisonStateError(`detail: corrupted aggregate — ${message}`);
  };

  // 1. Persisted identity trios must match the runtime candidate contract;
  //    otherwise the aggregate cannot be verified exactly.
  if (run.algorithmId !== config.algorithmIdentity || run.algorithmVersion !== config.algorithmVersion) {
    fail("algorithm identity/version does not match the runtime candidate contract");
  }
  if (run.algorithmConfigChecksum !== computeAlgorithmConfigChecksum(config)) {
    fail("algorithm config checksum does not match the runtime candidate contract");
  }
  if (run.comparisonContractId !== PLS_COMPARISON_CONTRACT_ID ||
      run.comparisonContractVersion !== PLS_COMPARISON_CONTRACT_VERSION ||
      run.comparisonContractChecksum !== COMPARISON_CONTRACT_CHECKSUM) {
    fail("comparison contract identity/version/checksum mismatch");
  }

  // 2. Participant/source cardinality, roles, and ownership
  //    (cardinality corruption already fails closed in the repository strict read)
  const baseline = detail.baseline.participant;
  const comparison = detail.comparison.participant;
  if (baseline.role !== "baseline" || comparison.role !== "comparison") {
    fail("invalid participant roles");
  }
  for (const p of [baseline, comparison]) {
    if (p.comparisonRunId !== run.id) fail("participant run ownership mismatch");
    if (p.workspaceId !== run.workspaceId) fail("participant workspace ownership mismatch");
    if (p.displayName.trim().length === 0) fail("blank participant display name");
  }
  if (detail.baseline.source.participantId !== baseline.id ||
      detail.comparison.source.participantId !== comparison.id) {
    fail("source participant ownership mismatch");
  }
  for (const s of [detail.baseline.source, detail.comparison.source]) {
    if (s.workspaceId !== run.workspaceId) fail("source workspace ownership mismatch");
  }
  if (detail.baseline.source.sourceSystem !== detail.comparison.source.sourceSystem ||
      detail.baseline.source.sourceContractVersion !== detail.comparison.source.sourceContractVersion) {
    fail("source system/contract mismatch between sides");
  }

  if (!Number.isFinite(run.similarityScore) || !Number.isFinite(run.coverage)) {
    fail("non-finite score or coverage");
  }

  // 3. Evidence — workspace/participant ownership + per-participant-key uniqueness + candidate membership
  const candidateKeySet = new Set(config.candidateDimensions.map((c) => c.dimensionKey));
  const evidenceByRoleAndKey = new Map<string, ComparisonDimensionEvidenceRow>();
  for (const e of detail.dimensionEvidence) {
    if (e.workspaceId !== run.workspaceId) fail("evidence workspace ownership mismatch");
    const role = e.participantId === baseline.id ? "baseline"
      : e.participantId === comparison.id ? "comparison"
      : null;
    if (role === null) fail("evidence participant ownership mismatch");
    if (!candidateKeySet.has(e.dimensionKey)) fail(`unknown evidence dimension ${e.dimensionKey} (not in candidate contract)`);
    const key = `${role}::${e.dimensionKey}`;
    if (evidenceByRoleAndKey.has(key)) fail(`duplicate evidence for ${e.dimensionKey} (${role})`);
    evidenceByRoleAndKey.set(key, e);
    if (!Number.isFinite(e.value)) fail(`non-finite evidence value for ${e.dimensionKey}`);
  }

  // 4. Assessments — exact candidate dimension set and cardinality
  if (detail.dimensionAssessments.length !== config.candidateDimensions.length) {
    fail(`assessment cardinality ${detail.dimensionAssessments.length} does not match candidate count ${config.candidateDimensions.length}`);
  }
  const assessmentByKey = new Map<string, ComparisonDimensionAssessmentRow>();
  for (const a of detail.dimensionAssessments) {
    if (a.workspaceId !== run.workspaceId) fail("assessment workspace ownership mismatch");
    if (a.comparisonRunId !== run.id) fail("assessment run ownership mismatch");
    if (assessmentByKey.has(a.dimensionKey)) fail(`duplicate assessment for ${a.dimensionKey}`);
    assessmentByKey.set(a.dimensionKey, a);
  }
  for (const candidate of config.candidateDimensions) {
    if (!assessmentByKey.has(candidate.dimensionKey)) fail(`missing assessment for ${candidate.dimensionKey}`);
  }
  for (const key of assessmentByKey.keys()) {
    if (!config.candidateDimensions.some((c) => c.dimensionKey === key)) fail(`unknown assessment dimension ${key}`);
  }

  // 5. Per-candidate expectation derived from persisted evidence; compare exactly
  const candidateWeightSum = config.candidateDimensions.reduce((sum, c) => sum + c.weight, 0);
  let includedWeightSum = 0;
  const includedWork: Array<{
    candidate: ComparisonAlgorithmConfig["candidateDimensions"][number];
    assessment: ComparisonDimensionAssessmentRow;
    baselineEvidence: ComparisonDimensionEvidenceRow;
    comparisonEvidence: ComparisonDimensionEvidenceRow;
  }> = [];

  for (const candidate of config.candidateDimensions) {
    const a = assessmentByKey.get(candidate.dimensionKey)!;
    if (a.dimensionLabel !== candidate.dimensionLabel) fail(`dimensionLabel mismatch for ${candidate.dimensionKey}`);
    if (a.expectedUnit !== candidate.expectedUnit) fail(`expectedUnit mismatch for ${candidate.dimensionKey}`);
    if (Math.abs(a.weight - candidate.weight) > tolerance) fail(`weight mismatch for ${candidate.dimensionKey}`);

    const be = evidenceByRoleAndKey.get(`baseline::${candidate.dimensionKey}`) ?? null;
    const ce = evidenceByRoleAndKey.get(`comparison::${candidate.dimensionKey}`) ?? null;
    for (const ev of [be, ce]) {
      if (ev !== null && ev.dimensionLabel !== candidate.dimensionLabel) {
        fail(`evidence dimensionLabel mismatch for ${candidate.dimensionKey}`);
      }
    }

    let expectedParticipation: "included" | "excluded";
    let expectedExclusionReason: string | null;
    let expectedBaselineFk: string | null;
    let expectedComparisonFk: string | null;
    if (be === null && ce === null) {
      expectedParticipation = "excluded"; expectedExclusionReason = "missing_both";
      expectedBaselineFk = null; expectedComparisonFk = null;
    } else if (be === null) {
      expectedParticipation = "excluded"; expectedExclusionReason = "missing_baseline";
      expectedBaselineFk = null; expectedComparisonFk = ce!.id;
    } else if (ce === null) {
      expectedParticipation = "excluded"; expectedExclusionReason = "missing_comparison";
      expectedBaselineFk = be.id; expectedComparisonFk = null;
    } else if (be.unit !== candidate.expectedUnit || ce.unit !== candidate.expectedUnit || be.unit !== ce.unit) {
      expectedParticipation = "excluded"; expectedExclusionReason = "unit_mismatch";
      expectedBaselineFk = be.id; expectedComparisonFk = ce.id;
    } else if (be.qualityStatus !== "ready" || ce.qualityStatus !== "ready") {
      expectedParticipation = "excluded"; expectedExclusionReason = "quality_insufficient";
      expectedBaselineFk = be.id; expectedComparisonFk = ce.id;
    } else {
      expectedParticipation = "included"; expectedExclusionReason = null;
      expectedBaselineFk = be.id; expectedComparisonFk = ce.id;
    }

    if (a.participation !== expectedParticipation) {
      fail(`participation mismatch for ${candidate.dimensionKey}: expected ${expectedParticipation}, persisted ${a.participation}`);
    }
    if ((a.exclusionReason ?? null) !== expectedExclusionReason) {
      fail(`exclusionReason mismatch for ${candidate.dimensionKey}`);
    }
    if ((a.baselineEvidenceId ?? null) !== expectedBaselineFk) {
      fail(`baseline evidence FK mismatch for ${candidate.dimensionKey}`);
    }
    if ((a.comparisonEvidenceId ?? null) !== expectedComparisonFk) {
      fail(`comparison evidence FK mismatch for ${candidate.dimensionKey}`);
    }

    if (expectedParticipation === "included") {
      if (a.baselineNormalizedValue === null || a.comparisonNormalizedValue === null ||
          a.rawDelta === null || a.normalizedDelta === null ||
          a.dimensionSimilarity === null || a.weightedContribution === null) {
        fail(`included assessment ${candidate.dimensionKey} has null derived values`);
      }
      includedWeightSum += candidate.weight;
      includedWork.push({ candidate, assessment: a, baselineEvidence: be!, comparisonEvidence: ce! });
    } else {
      if (a.baselineNormalizedValue !== null || a.comparisonNormalizedValue !== null ||
          a.rawDelta !== null || a.normalizedDelta !== null ||
          a.dimensionSimilarity !== null || a.weightedContribution !== null) {
        fail(`excluded assessment ${candidate.dimensionKey} has non-null derived values`);
      }
    }
  }

  // 6. Numerical recomputation from persisted evidence with controlled tolerance
  let recomputedScore = 0;
  for (const { candidate, assessment, baselineEvidence, comparisonEvidence } of includedWork) {
    const rawDelta = comparisonEvidence.value - baselineEvidence.value;
    if (Math.abs(assessment.rawDelta! - rawDelta) > tolerance) fail(`rawDelta mismatch for ${candidate.dimensionKey}`);
    const expectedBaselineNorm = normalizeValue(baselineEvidence.value, candidate.normalization);
    const expectedComparisonNorm = normalizeValue(comparisonEvidence.value, candidate.normalization);
    if (Math.abs(assessment.baselineNormalizedValue! - expectedBaselineNorm) > tolerance) {
      fail(`baselineNormalizedValue mismatch for ${candidate.dimensionKey}`);
    }
    if (Math.abs(assessment.comparisonNormalizedValue! - expectedComparisonNorm) > tolerance) {
      fail(`comparisonNormalizedValue mismatch for ${candidate.dimensionKey}`);
    }
    const expectedNormalizedDelta = expectedComparisonNorm - expectedBaselineNorm;
    if (Math.abs(assessment.normalizedDelta! - expectedNormalizedDelta) > tolerance) {
      fail(`normalizedDelta mismatch for ${candidate.dimensionKey}`);
    }
    const expectedSimilarity = Math.max(0, Math.min(100, 100 - Math.abs(expectedNormalizedDelta)));
    if (Math.abs(assessment.dimensionSimilarity! - expectedSimilarity) > tolerance) {
      fail(`dimensionSimilarity mismatch for ${candidate.dimensionKey}`);
    }
    const expectedContribution = includedWeightSum > 0
      ? (expectedSimilarity * candidate.weight) / includedWeightSum
      : 0;
    if (Math.abs(assessment.weightedContribution! - expectedContribution) > tolerance) {
      fail(`weightedContribution mismatch for ${candidate.dimensionKey}`);
    }
    recomputedScore += expectedContribution;
  }

  const expectedCoverage = candidateWeightSum > 0 ? (includedWeightSum / candidateWeightSum) * 100 : 0;
  if (Math.abs(run.coverage - expectedCoverage) > tolerance) fail("coverage mismatch");
  if (Math.abs(run.similarityScore - recomputedScore) > tolerance) fail("similarityScore mismatch");

  // 7. Explanation attempts — contiguous sequence starting at 1
  for (let i = 0; i < detail.explanationAttempts.length; i++) {
    const attempt = detail.explanationAttempts[i]!;
    if (attempt.attemptSequence !== i + 1) {
      fail(`explanation attempt sequence not contiguous from 1 at position ${i + 1}`);
    }
    if (attempt.comparisonRunId !== run.id || attempt.workspaceId !== run.workspaceId) {
      fail("explanation attempt ownership mismatch");
    }
  }

  // 8. Outcomes — each belongs to a real Attempt of this Run; at most one per Attempt
  const attemptIds = new Set(detail.explanationAttempts.map((a) => a.id));
  const outcomeAttemptIds = new Set<string>();
  for (const outcome of detail.explanationOutcomes) {
    if (outcome.workspaceId !== run.workspaceId) fail("explanation outcome workspace ownership mismatch");
    if (!attemptIds.has(outcome.explanationAttemptId)) {
      fail("explanation outcome does not belong to an attempt of this run");
    }
    if (outcomeAttemptIds.has(outcome.explanationAttemptId)) {
      fail("duplicate outcome for the same attempt");
    }
    outcomeAttemptIds.add(outcome.explanationAttemptId);
  }

  // 9. Archive events — contiguous sequence from 1 with legal state transitions
  deriveArchiveStateStrict(detail.archiveEvents, run);
}

/** Strictly validate the archive event chain and derive the current state. */
function deriveArchiveStateStrict(
  events: readonly ComparisonArchiveEventRow[],
  run: ComparisonRunRow,
): "active" | "archived" {
  let state: "active" | "archived" = "active";
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    if (event.eventSequence !== i + 1) {
      throw new ComparisonStateError(`detail: corrupted aggregate — archive event sequence not contiguous from 1 at position ${i + 1}`);
    }
    if (event.comparisonRunId !== run.id || event.workspaceId !== run.workspaceId) {
      throw new ComparisonStateError("detail: corrupted aggregate — archive event ownership mismatch");
    }
    if (event.operation === "archived") {
      if (state !== "active") {
        throw new ComparisonStateError("detail: corrupted aggregate — illegal archive transition (already archived)");
      }
      state = "archived";
    } else if (event.operation === "restored") {
      if (state !== "archived") {
        throw new ComparisonStateError("detail: corrupted aggregate — illegal archive transition (not archived)");
      }
      state = "active";
    } else {
      throw new ComparisonStateError("detail: corrupted aggregate — unknown archive operation");
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// list — validate cursor and limit
// ---------------------------------------------------------------------------

export function listComparisons(
  ctx: ComparisonApplicationContext,
  input?: ListComparisonsInput,
): ListComparisonsOutput {
  const limit = input?.limit ?? 20;
  if (limit < 1 || limit > 100) {
    throw new ComparisonValidationError([{ path: "limit", message: "must be between 1 and 100" }]);
  }

  // Validate cursor pair — both must be present or both absent
  if (input?.afterCreatedAt !== undefined || input?.afterRunId !== undefined) {
    if (input.afterCreatedAt === undefined || input.afterRunId === undefined) {
      throw new ComparisonValidationError([{ path: "cursor", message: "afterCreatedAt and afterRunId must both be provided" }]);
    }
    if (!isUtcTimestampMs(input.afterCreatedAt)) {
      throw new ComparisonValidationError([{ path: "afterCreatedAt", message: "must be a valid UTC millisecond timestamp" }]);
    }
    requireUuid(input.afterRunId, "afterRunId");
  }

  // Validate archiveFilter
  const archiveFilter = input?.archiveFilter ?? "active";
  if (archiveFilter !== "active" && archiveFilter !== "archived" && archiveFilter !== "all") {
    throw new ComparisonValidationError([{ path: "archiveFilter", message: 'must be "active", "archived", or "all"' }]);
  }

  const rows = listComparisonRuns(ctx.db, {
    workspaceId: ctx.workspaceId,
    limit: limit + 1,
    afterCreatedAt: input?.afterCreatedAt,
    afterRunId: input?.afterRunId,
    archiveFilter: input?.archiveFilter ?? "active",
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: ComparisonSummary[] = [];
  for (const row of page) {
    const detail = getComparisonRunDetail(ctx.db, ctx.workspaceId, row.id);
    if (detail === null) {
      // Corrupted aggregate — fail closed
      throw new ComparisonStateError(`list: run ${row.id} detail unavailable`);
    }
    items.push({
      id: row.id,
      mode: row.mode as ComparisonMode,
      similarityScore: row.similarityScore,
      coverage: row.coverage,
      qualityStatus: row.qualityStatus,
      createdAt: row.createdAt,
      baselineDisplayName: detail.baseline.participant.displayName,
      comparisonDisplayName: detail.comparison.participant.displayName,
    });
  }

  const lastItem = page[page.length - 1];
  const nextCursor = hasMore && lastItem !== undefined
    ? { createdAt: lastItem.createdAt, runId: lastItem.id }
    : null;

  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// createExplanation — transactional sequence, explicit retry appends new sequence
// ---------------------------------------------------------------------------

export function createExplanation(
  ctx: ComparisonApplicationContext,
  input: CreateExplanationInput,
): ExplanationOutput {
  requireUuid(input.runId, "runId");

  // Verify run exists and belongs to workspace
  const workspaceId = findRunWorkspaceId(ctx.db, input.runId);
  if (workspaceId === null) {
    throw new ComparisonNotFoundError(`comparison run ${input.runId} does not exist`);
  }
  if (workspaceId !== ctx.workspaceId) {
    throw new ComparisonNotFoundError(`comparison run ${input.runId} does not exist`);
  }

  // Get the run detail to build rule summary input
  const detail = getComparisonRunDetail(ctx.db, ctx.workspaceId, input.runId);
  if (detail === null) {
    throw new ComparisonNotFoundError(`comparison run ${input.runId} detail unavailable`);
  }

  // Check existing attempts — completed succeeded returns immediately
  const existingAttempts = listAttemptsWithOutcomes(ctx.db, ctx.workspaceId, input.runId);
  const existingSucceeded = existingAttempts.find(
    (a) => a.attempt.generatorId === PLS_RULE_SUMMARY_GENERATOR_ID
      && a.attempt.generatorVersion === PLS_RULE_SUMMARY_GENERATOR_VERSION
      && a.outcome !== null
      && a.outcome.status === "succeeded",
  );
  if (existingSucceeded !== undefined) {
    const outcome = existingSucceeded.outcome!;
    return {
      attemptId: existingSucceeded.attempt.id,
      attemptSequence: existingSucceeded.attempt.attemptSequence,
      status: "succeeded",
      content: outcome.contentJson !== null ? JSON.parse(outcome.contentJson) as Record<string, unknown> : null,
      errorCode: null,
    };
  }

  // Build rule summary
  const ruleInput: RuleSummaryInput = {
    comparisonRunId: detail.run.id,
    comparisonMode: detail.run.mode as ComparisonMode,
    similarityScore: detail.run.similarityScore,
    coverage: detail.run.coverage,
    qualityStatus: detail.run.qualityStatus as "ready" | "limited",
    qualityReasonCodes: parseJsonArray(detail.run.qualityReasonsJson),
    baseline: {
      participantId: detail.baseline.participant.id,
      portraitSourceId: detail.baseline.source.id,
      objectId: detail.baseline.participant.objectId,
      displayName: detail.baseline.participant.displayName,
      family: detail.baseline.participant.family,
      objectType: detail.baseline.participant.objectType,
      snapshotId: detail.baseline.source.snapshotId,
      periodStart: detail.baseline.source.periodStart,
      periodEnd: detail.baseline.source.periodEnd,
    },
    comparison: {
      participantId: detail.comparison.participant.id,
      portraitSourceId: detail.comparison.source.id,
      objectId: detail.comparison.participant.objectId,
      displayName: detail.comparison.participant.displayName,
      family: detail.comparison.participant.family,
      objectType: detail.comparison.participant.objectType,
      snapshotId: detail.comparison.source.snapshotId,
      periodStart: detail.comparison.source.periodStart,
      periodEnd: detail.comparison.source.periodEnd,
    },
    algorithmVersion: detail.run.algorithmVersion,
    algorithmConfigChecksum: detail.run.algorithmConfigChecksum,
    qualityPolicyVersion: detail.run.qualityPolicyVersion,
    qualityPolicyConfigChecksum: detail.run.qualityPolicyConfigChecksum,
    dimensionAssessments: detail.dimensionAssessments.map((a) => ({
      dimensionAssessmentId: a.id,
      dimensionKey: a.dimensionKey,
      dimensionLabel: a.dimensionLabel,
      participation: a.participation as "included" | "excluded",
      exclusionReason: a.exclusionReason as RuleSummaryInput["dimensionAssessments"][number]["exclusionReason"],
      baselineEvidenceId: a.baselineEvidenceId,
      comparisonEvidenceId: a.comparisonEvidenceId,
      dimensionSimilarity: a.dimensionSimilarity,
      normalizedDelta: a.normalizedDelta,
    })),
  };

  let ruleResult: RuleSummaryResult;
  try {
    ctx._explanationFaultHook?.("before_rule_generation");
    ruleResult = createRuleSummary(ruleInput);
    // Test seam: allows tests to tamper with the generator output (manifest/checksum)
    ctx._explanationFaultHook?.("after_rule_generation", { ruleResult });
  } catch {
    // Record failed attempt — always new sequence
    return persistExplicitFailedExplanation(ctx, input.runId);
  }

  // Test seam: allows tests to open the competition window / corrupt manifest records
  // after generation but before the Attempt transaction begins.
  ctx._explanationFaultHook?.("before_attempt_transaction");

  // Transaction 1: sequence allocation + manifest validation + Attempt insert
  // — all inside the same BEGIN IMMEDIATE transaction (no TOCTOU window).
  let attemptTx: { attemptId: string; attemptSequence: number };
  try {
    attemptTx = withTransaction(ctx.db, () => {
      const maxSeq = getMaxAttemptSequence(ctx.db, ctx.workspaceId, input.runId);
      const nextSequence = (maxSeq ?? 0) + 1;
      const id = newId(ctx);

      // Manifest canonical JSON + checksum recompute + per-record ownership, all in-transaction
      const manifestJson = validateManifestInTransaction(ctx.db, ctx.workspaceId, input.runId, ruleResult);

      insertExplanationAttempt(ctx.db, {
        id,
        workspaceId: ctx.workspaceId,
        comparisonRunId: input.runId,
        attemptSequence: nextSequence,
        generatorType: ruleResult.generatorType,
        generatorId: ruleResult.generatorId,
        generatorVersion: ruleResult.generatorVersion,
        explanationContractVersion: ruleResult.explanationContractVersion,
        evidenceManifestJson: manifestJson,
        evidenceManifestChecksum: ruleResult.evidenceManifestChecksum,
        startedAt: now(ctx),
        actor: ctx.trustedActor,
      });
      return { attemptId: id, attemptSequence: nextSequence };
    });
  } catch (error) {
    if (error instanceof ManifestOwnershipError || error instanceof ManifestChecksumError) {
      // Fail closed: no Attempt is inserted, no misleading succeeded/interrupted data
      const reasonCode = error instanceof ManifestOwnershipError ? "invalid_evidence_reference" : "invalid_generator_output";
      auditExplanationFailure(ctx, input.runId, "explanation_manifest_validation_failed", reasonCode);
      throw new ComparisonStateError("explanation manifest validation failed");
    }
    throw error;
  }
  const { attemptId, attemptSequence: allocatedSequence } = attemptTx;

  // Transaction 2: create Outcome
  try {
    withTransaction(ctx.db, () => {
      insertExplanationOutcome(ctx.db, {
        id: newId(ctx),
        workspaceId: ctx.workspaceId,
        explanationAttemptId: attemptId,
        status: "succeeded",
        completedAt: now(ctx),
        contentJson: canonicalJson(ruleResult.content as unknown as JsonValue),
        errorCode: null,
        failureContractVersion: null,
        retryable: null,
        errorMessage: null,
      });
    });
  } catch {
    // Outcome persistence failed — attempt remains interrupted
    return {
      attemptId,
      attemptSequence: allocatedSequence,
      status: "interrupted",
      content: null,
      errorCode: null,
    };
  }

  return {
    attemptId,
    attemptSequence: allocatedSequence,
    status: "succeeded",
    content: ruleResult.content as unknown as Record<string, unknown>,
    errorCode: null,
  };
}

function persistExplicitFailedExplanation(ctx: ComparisonApplicationContext, runId: string): ExplanationOutput {
  // Transaction 1: create Attempt — return allocated sequence
  const { attemptId, attemptSequence: allocatedSequence } = withTransaction(ctx.db, () => {
    const maxSeq = getMaxAttemptSequence(ctx.db, ctx.workspaceId, runId);
    const nextSequence = (maxSeq ?? 0) + 1;
    const id = newId(ctx);

    insertExplanationAttempt(ctx.db, {
      id,
      workspaceId: ctx.workspaceId,
      comparisonRunId: runId,
      attemptSequence: nextSequence,
      generatorType: "rule",
      generatorId: PLS_RULE_SUMMARY_GENERATOR_ID,
      generatorVersion: PLS_RULE_SUMMARY_GENERATOR_VERSION,
      explanationContractVersion: PLS_RULE_SUMMARY_CONTRACT_VERSION,
      evidenceManifestJson: canonicalJson([]),
      evidenceManifestChecksum: checksumCanonicalJson([]),
      startedAt: now(ctx),
      actor: ctx.trustedActor,
    });
    return { attemptId: id, attemptSequence: nextSequence };
  });

  // Transaction 2: create failed Outcome
  withTransaction(ctx.db, () => {
    insertExplanationOutcome(ctx.db, {
      id: newId(ctx),
      workspaceId: ctx.workspaceId,
      explanationAttemptId: attemptId,
      status: "failed",
      completedAt: now(ctx),
      contentJson: null,
      errorCode: "invalid_generator_output",
      failureContractVersion: PLS_RULE_SUMMARY_CONTRACT_VERSION,
      retryable: 1,
      errorMessage: "rule summary generation failed",
    });
  });

  return {
    attemptId,
    attemptSequence: allocatedSequence,
    status: "failed",
    content: null,
    errorCode: "invalid_generator_output",
  };
}

// ---------------------------------------------------------------------------
// archive — fingerprint includes expectedCurrentState, compare stored fingerprint
// ---------------------------------------------------------------------------

export function archiveComparison(
  ctx: ComparisonApplicationContext,
  input: ArchiveComparisonInput,
): ArchiveComparisonOutput {
  requireUuid(input.runId, "runId");
  if (input.operation !== "archived" && input.operation !== "restored") {
    throw new ComparisonValidationError([{ path: "operation", message: 'must be "archived" or "restored"' }]);
  }
  requireNonBlank(input.idempotencyKey, "idempotencyKey");
  if (input.expectedCurrentState !== "active" && input.expectedCurrentState !== "archived") {
    throw new ComparisonValidationError([{ path: "expectedCurrentState", message: 'must be "active" or "archived"' }]);
  }
  const reason = input.reason ?? null;
  if (reason !== null && reason.trim().length === 0) {
    throw new ComparisonValidationError([{ path: "reason", message: "must be null or nonblank" }]);
  }

  // Verify run exists and belongs to workspace
  const workspaceId = findRunWorkspaceId(ctx.db, input.runId);
  if (workspaceId === null) {
    throw new ComparisonNotFoundError(`comparison run ${input.runId} does not exist`);
  }
  if (workspaceId !== ctx.workspaceId) {
    throw new ComparisonNotFoundError(`comparison run ${input.runId} does not exist`);
  }

  // Validate expectedSequence
  if (!Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 1) {
    throw new ComparisonValidationError([{ path: "expectedSequence", message: "must be a positive safe integer" }]);
  }

  // Compute operation fingerprint — includes expectedCurrentState and expectedSequence
  const fingerprintInput = {
    workspaceId: ctx.workspaceId,
    runId: input.runId,
    actor: ctx.trustedActor,
    operation: input.operation,
    reason,
    expectedCurrentState: input.expectedCurrentState,
    expectedSequence: input.expectedSequence,
    archiveContractId: PLS_COMPARISON_CONTRACT_ID,
    archiveContractVersion: PLS_COMPARISON_CONTRACT_VERSION,
  } satisfies JsonValue;
  const operationFingerprint = checksumCanonicalJson(fingerprintInput);

  // Test seam: allows tests to open the competition window before the archive transaction
  ctx._faultHook?.("before_archive_transaction");

  return withTransaction(ctx.db, () => {
    // Idempotency check — compare stored fingerprint, not just operation
    const existing = findArchiveEventByIdempotencyKey(ctx.db, ctx.workspaceId, input.runId, input.idempotencyKey);
    if (existing !== null) {
      if (existing.operationFingerprint === operationFingerprint) {
        return {
          eventId: existing.id,
          eventSequence: existing.eventSequence,
          replayed: true,
          newState: existing.operation === "archived" ? "archived" as const : "active" as const,
        };
      }
      throw new ComparisonIdempotencyConflictError(
        `idempotency key "${input.idempotencyKey}" was already used with a different fingerprint`,
      );
    }

    // Check current state
    const latestEvent = getLatestArchiveEvent(ctx.db, ctx.workspaceId, input.runId);
    const currentState: "active" | "archived" = latestEvent !== null && latestEvent.operation === "archived" ? "archived" : "active";

    if (currentState !== input.expectedCurrentState) {
      throw new ComparisonConcurrencyError(
        `expected current state "${input.expectedCurrentState}" but actual is "${currentState}"`,
      );
    }

    // Validate state transition
    if (input.operation === "archived" && currentState !== "active") {
      throw new ComparisonStateError("cannot archive a run that is already archived");
    }
    if (input.operation === "restored" && currentState !== "archived") {
      throw new ComparisonStateError("cannot restore a run that is not archived");
    }

    // Sequence
    const maxSeq = getMaxArchiveSequence(ctx.db, ctx.workspaceId, input.runId);
    const nextSequence = (maxSeq ?? 0) + 1;

    // Validate expectedSequence matches actual next sequence
    if (input.expectedSequence !== nextSequence) {
      throw new ComparisonConcurrencyError(
        `expected sequence ${input.expectedSequence} but next is ${nextSequence}`,
      );
    }

    const eventId = newId(ctx);
    insertArchiveEvent(ctx.db, {
      id: eventId,
      workspaceId: ctx.workspaceId,
      comparisonRunId: input.runId,
      eventSequence: nextSequence,
      operation: input.operation,
      operationFingerprint,
      idempotencyKey: input.idempotencyKey,
      reason,
      actor: ctx.trustedActor,
      occurredAt: now(ctx),
    });

    return {
      eventId,
      eventSequence: nextSequence,
      replayed: false,
      newState: input.operation === "archived" ? "archived" as const : "active" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------

function mapDetailToDto(detail: NonNullable<ReturnType<typeof getComparisonRunDetail>>): ComparisonDetail {
  return {
    id: detail.run.id,
    mode: detail.run.mode as ComparisonMode,
    similarityScore: detail.run.similarityScore,
    coverage: detail.run.coverage,
    qualityStatus: detail.run.qualityStatus,
    qualityReasons: parseJsonArray(detail.run.qualityReasonsJson),
    algorithmId: detail.run.algorithmId,
    algorithmVersion: detail.run.algorithmVersion,
    algorithmConfigChecksum: detail.run.algorithmConfigChecksum,
    qualityPolicyId: detail.run.qualityPolicyId,
    qualityPolicyVersion: detail.run.qualityPolicyVersion,
    qualityPolicyConfigChecksum: detail.run.qualityPolicyConfigChecksum,
    comparisonContractId: detail.run.comparisonContractId,
    comparisonContractVersion: detail.run.comparisonContractVersion,
    comparisonContractChecksum: detail.run.comparisonContractChecksum,
    createdAt: detail.run.createdAt,
    createdBy: detail.run.createdBy,
    createdByDisplayName: detail.run.createdByDisplayName,
    baseline: mapParticipantDetail(detail.baseline),
    comparison: mapParticipantDetail(detail.comparison),
    dimensionEvidence: detail.dimensionEvidence.map(mapEvidenceDetail),
    dimensionAssessments: detail.dimensionAssessments.map(mapAssessmentDetail),
    explanationAttempts: detail.explanationAttempts.map((attempt) => {
      const outcome = detail.explanationOutcomes.find((o) => o.explanationAttemptId === attempt.id);
      return mapExplanationAttempt(attempt, outcome ?? null);
    }),
    archiveState: deriveArchiveStateStrict(detail.archiveEvents, detail.run),
    archiveEvents: detail.archiveEvents.map(mapArchiveEventDetail),
  };
}

function mapParticipantDetail(side: { participant: ComparisonParticipantRow; source: ComparisonPortraitSourceRow }): ComparisonParticipantDetail {
  return {
    objectId: side.participant.objectId,
    displayName: side.participant.displayName,
    family: side.participant.family,
    objectType: side.participant.objectType,
    source: mapSourceDetail(side.source),
  };
}

function mapSourceDetail(source: ComparisonPortraitSourceRow): PortraitSourceDetail {
  return {
    sourceSystem: source.sourceSystem,
    sourceContractVersion: source.sourceContractVersion,
    snapshotId: source.snapshotId,
    dataVersion: source.dataVersion,
    periodStart: source.periodStart,
    periodEnd: source.periodEnd,
    sourceGeneratedAt: source.sourceGeneratedAt,
    sourceBatchId: source.sourceBatchId,
    sampleSize: source.sampleSize,
    confidence: source.confidence,
    qualityStatus: source.qualityStatus,
    sourceFlags: parseJsonArray(source.sourceFlagsJson),
    policyReasons: parseJsonArray(source.policyReasonsJson),
  };
}

function mapEvidenceDetail(evidence: ComparisonDimensionEvidenceRow): DimensionEvidenceDetail {
  return {
    participantId: evidence.participantId,
    dimensionKey: evidence.dimensionKey,
    dimensionLabel: evidence.dimensionLabel,
    value: evidence.value,
    unit: evidence.unit,
    qualityStatus: evidence.qualityStatus,
    sourceFlags: parseJsonArray(evidence.sourceFlagsJson),
    policyReasons: parseJsonArray(evidence.policyReasonsJson),
    evidenceRefs: parseJsonRecordArray(evidence.evidenceRefsJson),
  };
}

function mapAssessmentDetail(assessment: ComparisonDimensionAssessmentRow): DimensionAssessmentDetail {
  return {
    dimensionKey: assessment.dimensionKey,
    dimensionLabel: assessment.dimensionLabel,
    expectedUnit: assessment.expectedUnit,
    weight: assessment.weight,
    participation: assessment.participation as "included" | "excluded",
    exclusionReason: assessment.exclusionReason,
    baselineEvidenceId: assessment.baselineEvidenceId,
    comparisonEvidenceId: assessment.comparisonEvidenceId,
    baselineNormalizedValue: assessment.baselineNormalizedValue,
    comparisonNormalizedValue: assessment.comparisonNormalizedValue,
    rawDelta: assessment.rawDelta,
    normalizedDelta: assessment.normalizedDelta,
    dimensionSimilarity: assessment.dimensionSimilarity,
    weightedContribution: assessment.weightedContribution,
  };
}

function mapExplanationAttempt(
  attempt: ComparisonExplanationAttemptRow,
  outcome: ComparisonExplanationOutcomeRow | null,
): ExplanationAttemptDetail {
  const status = outcome === null ? "interrupted" : outcome.status as "succeeded" | "failed";
  return {
    id: attempt.id,
    attemptSequence: attempt.attemptSequence,
    generatorType: attempt.generatorType,
    generatorId: attempt.generatorId,
    generatorVersion: attempt.generatorVersion,
    status,
    content: outcome?.contentJson !== null && outcome?.contentJson !== undefined
      ? JSON.parse(outcome.contentJson) as Record<string, unknown>
      : null,
    errorCode: outcome?.errorCode ?? null,
    startedAt: attempt.startedAt,
    completedAt: outcome?.completedAt ?? null,
  };
}

function mapArchiveEventDetail(event: ComparisonArchiveEventRow): ArchiveEventDetail {
  return {
    eventSequence: event.eventSequence,
    operation: event.operation as "archived" | "restored",
    reason: event.reason,
    actor: event.actor,
    occurredAt: event.occurredAt,
  };
}

function deriveArchiveState(events: readonly ComparisonArchiveEventRow[]): "active" | "archived" {
  if (events.length === 0) return "active";
  const last = events[events.length - 1]!;
  return last.operation === "archived" ? "archived" : "active";
}
