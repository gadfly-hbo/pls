// Public DTOs for the Comparison Application surface.
// Hides SQLite rows, SQL, idempotency internals, and provider details.

// ---------------------------------------------------------------------------
// Comparison contract identity (PLS-specific, not WorkPLS)
// ---------------------------------------------------------------------------

export const PLS_COMPARISON_CONTRACT_ID = "pls-portrait-comparison-contract";
export const PLS_COMPARISON_CONTRACT_VERSION = "1";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type ComparisonMode = "peer_same_period" | "self_cross_period";

export interface ComparisonObjectRef {
  readonly family: "channel" | "product";
  readonly objectType: string;
  readonly objectId: string;
  readonly displayName: string;
}

export interface ComparisonSnapshotRef {
  readonly snapshotId: string;
  readonly dataVersion: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface ComparisonSideRef {
  readonly object: ComparisonObjectRef;
  readonly snapshot: ComparisonSnapshotRef;
}

export interface CreateComparisonInput {
  readonly mode: ComparisonMode;
  readonly idempotencyKey: string;
  readonly baseline: ComparisonSideRef;
  readonly comparison: ComparisonSideRef;
}

export interface CreateComparisonOutput {
  readonly runId: string;
  readonly replayed: boolean;
}

// ---------------------------------------------------------------------------
// List (cursor-based pagination)
// ---------------------------------------------------------------------------

export interface ListComparisonsInput {
  readonly limit?: number;
  readonly afterCreatedAt?: string;
  readonly afterRunId?: string;
  readonly archiveFilter?: "active" | "archived" | "all";
}

export interface ComparisonSummary {
  readonly id: string;
  readonly mode: ComparisonMode;
  readonly similarityScore: number;
  readonly coverage: number;
  readonly qualityStatus: string;
  readonly createdAt: string;
  readonly baselineDisplayName: string;
  readonly comparisonDisplayName: string;
}

export interface ListComparisonsOutput {
  readonly items: readonly ComparisonSummary[];
  readonly nextCursor: { readonly createdAt: string; readonly runId: string } | null;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface PortraitSourceDetail {
  readonly sourceSystem: string;
  readonly sourceContractVersion: string;
  readonly snapshotId: string;
  readonly dataVersion: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly sourceGeneratedAt: string;
  readonly sourceBatchId: string | null;
  readonly sampleSize: number | null;
  readonly confidence: number | null;
  readonly qualityStatus: string;
  readonly sourceFlags: readonly string[];
  readonly policyReasons: readonly string[];
}

export interface ComparisonParticipantDetail {
  readonly objectId: string;
  readonly displayName: string;
  readonly family: string;
  readonly objectType: string;
  readonly source: PortraitSourceDetail;
}

export interface DimensionEvidenceDetail {
  readonly participantId: string;
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly qualityStatus: string;
  readonly sourceFlags: readonly string[];
  readonly policyReasons: readonly string[];
  readonly evidenceRefs: readonly Record<string, unknown>[];
}

export interface DimensionAssessmentDetail {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly expectedUnit: string;
  readonly weight: number;
  readonly participation: "included" | "excluded";
  readonly exclusionReason: string | null;
  readonly baselineEvidenceId: string | null;
  readonly comparisonEvidenceId: string | null;
  readonly baselineNormalizedValue: number | null;
  readonly comparisonNormalizedValue: number | null;
  readonly rawDelta: number | null;
  readonly normalizedDelta: number | null;
  readonly dimensionSimilarity: number | null;
  readonly weightedContribution: number | null;
}

export interface ExplanationAttemptDetail {
  readonly id: string;
  readonly attemptSequence: number;
  readonly generatorType: string;
  readonly generatorId: string;
  readonly generatorVersion: string;
  readonly status: "succeeded" | "failed" | "interrupted";
  readonly content: Record<string, unknown> | null;
  readonly errorCode: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface ArchiveEventDetail {
  readonly eventSequence: number;
  readonly operation: "archived" | "restored";
  readonly reason: string | null;
  readonly actor: string;
  readonly occurredAt: string;
}

export interface ComparisonDetail {
  readonly id: string;
  readonly mode: ComparisonMode;
  readonly similarityScore: number;
  readonly coverage: number;
  readonly qualityStatus: string;
  readonly qualityReasons: readonly string[];
  readonly algorithmId: string;
  readonly algorithmVersion: string;
  readonly algorithmConfigChecksum: string;
  readonly qualityPolicyId: string;
  readonly qualityPolicyVersion: string;
  readonly qualityPolicyConfigChecksum: string;
  readonly comparisonContractId: string;
  readonly comparisonContractVersion: string;
  readonly comparisonContractChecksum: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly createdByDisplayName: string | null;
  readonly baseline: ComparisonParticipantDetail;
  readonly comparison: ComparisonParticipantDetail;
  readonly dimensionEvidence: readonly DimensionEvidenceDetail[];
  readonly dimensionAssessments: readonly DimensionAssessmentDetail[];
  readonly explanationAttempts: readonly ExplanationAttemptDetail[];
  readonly archiveState: "active" | "archived";
  readonly archiveEvents: readonly ArchiveEventDetail[];
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

export interface CreateExplanationInput {
  readonly runId: string;
}

export interface ExplanationOutput {
  readonly attemptId: string;
  readonly attemptSequence: number;
  readonly status: "succeeded" | "failed" | "interrupted";
  readonly content: Record<string, unknown> | null;
  readonly errorCode: string | null;
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

export interface ArchiveComparisonInput {
  readonly runId: string;
  readonly operation: "archived" | "restored";
  readonly reason?: string | null;
  readonly idempotencyKey: string;
  readonly expectedCurrentState: "active" | "archived";
  readonly expectedSequence: number;
}

export interface ArchiveComparisonOutput {
  readonly eventId: string;
  readonly eventSequence: number;
  readonly replayed: boolean;
  readonly newState: "active" | "archived";
}

// ---------------------------------------------------------------------------
// Application interface
// ---------------------------------------------------------------------------

export interface ComparisonApplication {
  create(input: CreateComparisonInput): CreateComparisonOutput;
  detail(runId: string): ComparisonDetail | null;
  list(input?: ListComparisonsInput): ListComparisonsOutput;
  createExplanation(input: CreateExplanationInput): ExplanationOutput;
  archive(input: ArchiveComparisonInput): ArchiveComparisonOutput;
}
