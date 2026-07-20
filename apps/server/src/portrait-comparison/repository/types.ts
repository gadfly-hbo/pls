// V005 internal row types — map 1:1 to SQLite columns.
// NOT exported from the public application surface.

export interface ComparisonRunRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly mode: string;
  readonly similarityScore: number;
  readonly coverage: number;
  readonly qualityStatus: string;
  readonly qualityReasonsJson: string;
  readonly algorithmId: string;
  readonly algorithmVersion: string;
  readonly algorithmConfigChecksum: string;
  readonly qualityPolicyId: string;
  readonly qualityPolicyVersion: string;
  readonly qualityPolicyConfigChecksum: string;
  readonly comparisonContractId: string;
  readonly comparisonContractVersion: string;
  readonly comparisonContractChecksum: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly createdByDisplayName: string | null;
}

export interface ComparisonParticipantRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly comparisonRunId: string;
  readonly role: string;
  readonly family: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly displayName: string;
}

export interface ComparisonPortraitSourceRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly participantId: string;
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
  readonly sourceFlagsJson: string;
  readonly policyReasonsJson: string;
}

export interface ComparisonDimensionEvidenceRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly participantId: string;
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly qualityStatus: string;
  readonly sourceFlagsJson: string;
  readonly policyReasonsJson: string;
  readonly evidenceRefsJson: string;
}

export interface ComparisonDimensionAssessmentRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly comparisonRunId: string;
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly expectedUnit: string;
  readonly weight: number;
  readonly participation: string;
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

export interface ComparisonExplanationAttemptRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly comparisonRunId: string;
  readonly attemptSequence: number;
  readonly generatorType: string;
  readonly generatorId: string;
  readonly generatorVersion: string;
  readonly explanationContractVersion: string;
  readonly evidenceManifestJson: string;
  readonly evidenceManifestChecksum: string;
  readonly startedAt: string;
  readonly actor: string;
}

export interface ComparisonExplanationOutcomeRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly explanationAttemptId: string;
  readonly status: string;
  readonly completedAt: string;
  readonly contentJson: string | null;
  readonly errorCode: string | null;
  readonly failureContractVersion: string | null;
  readonly retryable: number | null;
  readonly errorMessage: string | null;
}

export interface ComparisonArchiveEventRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly comparisonRunId: string;
  readonly eventSequence: number;
  readonly operation: string;
  readonly operationFingerprint: string;
  readonly idempotencyKey: string;
  readonly reason: string | null;
  readonly actor: string;
  readonly occurredAt: string;
}

/** Full Comparison Run aggregate graph across all 8 tables. */
export interface ComparisonRunGraph {
  readonly run: ComparisonRunRow;
  readonly participants: readonly ComparisonParticipantRow[];
  readonly portraitSources: readonly ComparisonPortraitSourceRow[];
  readonly dimensionEvidence: readonly ComparisonDimensionEvidenceRow[];
  readonly dimensionAssessments: readonly ComparisonDimensionAssessmentRow[];
}
