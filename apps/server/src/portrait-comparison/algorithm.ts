import { checksumCanonicalJson, toJsonValue, PortraitComparisonValidationError, type JsonValue, type PortraitComparisonValidationIssue } from "./canonical-json.js";

export const PLS_COMPARISON_ALGORITHM_IDENTITY = "pls-portrait-comparison";
export const PLS_COMPARISON_FORMULA_ID = "pls-normalized-absolute-delta-v1";
export const PLS_COMPARISON_COVERAGE_FORMULA_ID = "included-weight-over-candidate-weight-v1";
export const PLS_COMPARISON_UNIT_RULES_ID = "expected-unit-exact-match-v1";
export const PLS_COMPARISON_EXCLUSION_MAPPING_ID = "pls-comparison-exclusions-v1";

export type ComparisonMode = "peer_same_period" | "self_cross_period";
export type DimensionEvidenceSide = "baseline" | "comparison";
export type EvidenceQualityStatus = "ready" | "limited";
export type EvidenceQualityEligibility = "eligible" | "insufficient";
export type ComparisonAlgorithmExclusionReason = "missing_baseline" | "missing_comparison" | "missing_both" | "unit_mismatch" | "quality_insufficient";
export type ComparisonAlgorithmParticipation = "included" | "excluded";

export interface LinearNormalizationDescriptor {
  readonly kind: "linear_0_100";
  readonly min: number;
  readonly max: number;
  readonly clamp: boolean;
}

export interface ComparisonAlgorithmCandidateDimension {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly expectedUnit: string;
  readonly weight: number;
  readonly normalization: LinearNormalizationDescriptor;
}

export interface OverallScorePolicy {
  readonly kind: "minimum_coverage";
  readonly minimumCoverage: number;
}

export interface ComparisonAlgorithmConfig {
  readonly algorithmIdentity: typeof PLS_COMPARISON_ALGORITHM_IDENTITY;
  readonly algorithmVersion: string;
  readonly candidateDimensions: readonly ComparisonAlgorithmCandidateDimension[];
  readonly floatingTolerance: number;
  readonly overallScorePolicy: OverallScorePolicy;
}

export interface DimensionEvidenceProjection {
  readonly side: DimensionEvidenceSide;
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly qualityStatus: EvidenceQualityStatus;
  readonly qualityEligibility: EvidenceQualityEligibility;
}

export interface ComparisonAlgorithmInput {
  readonly comparisonMode: ComparisonMode;
  readonly config: ComparisonAlgorithmConfig;
  readonly evidence: readonly DimensionEvidenceProjection[];
}

export interface IncludedDimensionAssessment {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly expectedUnit: string;
  readonly weight: number;
  readonly participation: "included";
  readonly exclusionReason: null;
  readonly baselineEvidence: DimensionEvidenceProjection;
  readonly comparisonEvidence: DimensionEvidenceProjection;
  readonly baselineNormalizedValue: number;
  readonly comparisonNormalizedValue: number;
  readonly rawDelta: number;
  readonly normalizedDelta: number;
  readonly dimensionSimilarity: number;
  readonly weightedContribution: number;
}

export interface ExcludedDimensionAssessment {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly expectedUnit: string;
  readonly weight: number;
  readonly participation: "excluded";
  readonly exclusionReason: ComparisonAlgorithmExclusionReason;
  readonly baselineEvidence: DimensionEvidenceProjection | null;
  readonly comparisonEvidence: DimensionEvidenceProjection | null;
  readonly baselineNormalizedValue: null;
  readonly comparisonNormalizedValue: null;
  readonly rawDelta: null;
  readonly normalizedDelta: null;
  readonly dimensionSimilarity: null;
  readonly weightedContribution: null;
}

export type DimensionAssessment = IncludedDimensionAssessment | ExcludedDimensionAssessment;

export interface ComparisonAlgorithmResult {
  readonly comparisonMode: ComparisonMode;
  readonly algorithmIdentity: typeof PLS_COMPARISON_ALGORITHM_IDENTITY;
  readonly algorithmVersion: string;
  readonly algorithmConfigChecksum: string;
  readonly floatingTolerance: number;
  readonly coverage: number;
  readonly candidateWeightSum: number;
  readonly includedWeightSum: number;
  readonly assessments: readonly DimensionAssessment[];
  readonly overallScore: number | null;
  readonly overallScoreExcludedReason: "coverage_insufficient" | null;
}

type IndexedEvidence = Record<DimensionEvidenceSide, Map<string, DimensionEvidenceProjection>>;

export function computeComparisonAlgorithmResult(input: ComparisonAlgorithmInput): ComparisonAlgorithmResult {
  validateComparisonMode(input.comparisonMode, "comparisonMode");
  validateComparisonAlgorithmConfig(input.config);
  validateEvidence(input.evidence);
  const indexed = indexEvidence(input.evidence);
  const candidateWeightSum = input.config.candidateDimensions.reduce((sum, candidate) => sum + candidate.weight, 0);
  assertFiniteCalculation(candidateWeightSum, "candidateWeightSum");
  const includedWeightSum = input.config.candidateDimensions.reduce((sum, candidate) => {
    const baseline = indexed.baseline.get(candidate.dimensionKey) ?? null;
    const comparison = indexed.comparison.get(candidate.dimensionKey) ?? null;
    return excludeIfNeeded(candidate, baseline, comparison) === null ? sum + candidate.weight : sum;
  }, 0);
  assertFiniteCalculation(includedWeightSum, "includedWeightSum");
  const assessments = input.config.candidateDimensions.map((candidate) => assessDimension(candidate, indexed, includedWeightSum));
  const coverage = (includedWeightSum / candidateWeightSum) * 100;
  const contributionSum = assessments.reduce((sum, assessment) => sum + (assessment.weightedContribution ?? 0), 0);
  const overallScore = coverage + input.config.floatingTolerance >= input.config.overallScorePolicy.minimumCoverage ? contributionSum : null;
  assertFiniteCalculation(coverage, "coverage");
  assertFiniteCalculation(contributionSum, "contributionSum");
  if (overallScore !== null) assertFiniteCalculation(overallScore, "overallScore");
  return {
    comparisonMode: input.comparisonMode,
    algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
    algorithmVersion: input.config.algorithmVersion,
    algorithmConfigChecksum: computeAlgorithmConfigChecksum(input.config),
    floatingTolerance: input.config.floatingTolerance,
    coverage,
    candidateWeightSum,
    includedWeightSum,
    assessments,
    overallScore,
    overallScoreExcludedReason: overallScore === null ? "coverage_insufficient" : null,
  };
}

export function computeAlgorithmConfigChecksum(config: ComparisonAlgorithmConfig): string {
  validateComparisonAlgorithmConfig(config);
  const checksumInput = {
    algorithmIdentity: config.algorithmIdentity,
    algorithmVersion: config.algorithmVersion,
    candidateDimensions: config.candidateDimensions.map((candidate) => ({
      dimensionKey: candidate.dimensionKey,
      dimensionLabel: candidate.dimensionLabel,
      expectedUnit: candidate.expectedUnit,
      weight: candidate.weight,
      normalization: normalizationToJson(candidate.normalization),
    })),
    coverageFormula: PLS_COMPARISON_COVERAGE_FORMULA_ID,
    dimensionSimilarityFormula: PLS_COMPARISON_FORMULA_ID,
    unitCompatibilityRules: PLS_COMPARISON_UNIT_RULES_ID,
    exclusionReasonMapping: PLS_COMPARISON_EXCLUSION_MAPPING_ID,
    overallScorePolicy: {
      kind: config.overallScorePolicy.kind,
      minimumCoverage: config.overallScorePolicy.minimumCoverage,
    },
    floatingTolerance: config.floatingTolerance,
  } satisfies JsonValue;
  return checksumCanonicalJson(checksumInput);
}

export function validateComparisonAlgorithmConfig(config: ComparisonAlgorithmConfig): void {
  const issues: PortraitComparisonValidationIssue[] = [];
  if (config.algorithmIdentity !== PLS_COMPARISON_ALGORITHM_IDENTITY) issues.push({ path: "config.algorithmIdentity", message: `must be ${PLS_COMPARISON_ALGORITHM_IDENTITY}` });
  if (isBlank(config.algorithmVersion)) issues.push({ path: "config.algorithmVersion", message: "must be nonblank" });
  if (!isJsonSafeFiniteNumber(config.floatingTolerance) || config.floatingTolerance <= 0 || config.floatingTolerance > 1e-6) issues.push({ path: "config.floatingTolerance", message: "must be > 0 and <= 1e-6" });
  if (config.overallScorePolicy.kind !== "minimum_coverage") issues.push({ path: "config.overallScorePolicy.kind", message: "must be minimum_coverage" });
  if (!isJsonSafeFiniteNumber(config.overallScorePolicy.minimumCoverage) || config.overallScorePolicy.minimumCoverage < 0 || config.overallScorePolicy.minimumCoverage > 100) issues.push({ path: "config.overallScorePolicy.minimumCoverage", message: "must be finite between 0 and 100" });
  if (config.candidateDimensions.length === 0) issues.push({ path: "config.candidateDimensions", message: "must contain at least one candidate" });
  const keys = new Set<string>();
  config.candidateDimensions.forEach((candidate, index) => {
    const path = `config.candidateDimensions[${index}]`;
    if (isBlank(candidate.dimensionKey)) issues.push({ path: `${path}.dimensionKey`, message: "must be nonblank" });
    else if (keys.has(candidate.dimensionKey)) issues.push({ path: `${path}.dimensionKey`, message: "must be unique" });
    else keys.add(candidate.dimensionKey);
    if (isBlank(candidate.dimensionLabel)) issues.push({ path: `${path}.dimensionLabel`, message: "must be nonblank" });
    if (isBlank(candidate.expectedUnit)) issues.push({ path: `${path}.expectedUnit`, message: "must be nonblank" });
    if (!isJsonSafeFiniteNumber(candidate.weight) || candidate.weight <= 0) issues.push({ path: `${path}.weight`, message: "must be positive and finite" });
    if (candidate.normalization.kind !== "linear_0_100") issues.push({ path: `${path}.normalization.kind`, message: "must be linear_0_100" });
    if (!isJsonSafeFiniteNumber(candidate.normalization.min)) issues.push({ path: `${path}.normalization.min`, message: "must be finite" });
    if (!isJsonSafeFiniteNumber(candidate.normalization.max)) issues.push({ path: `${path}.normalization.max`, message: "must be finite" });
    if (Number.isFinite(candidate.normalization.min) && Number.isFinite(candidate.normalization.max) && candidate.normalization.min >= candidate.normalization.max) issues.push({ path: `${path}.normalization`, message: "min must be less than max" });
    if (Number.isFinite(candidate.normalization.min) && Number.isFinite(candidate.normalization.max) && !Number.isFinite(candidate.normalization.max - candidate.normalization.min)) issues.push({ path: `${path}.normalization`, message: "normalization span must be finite" });
    if (candidate.normalization.clamp !== true) issues.push({ path: `${path}.normalization.clamp`, message: "must be true so successful algorithm output is projectable to V005" });
  });
  if (issues.length > 0) throw new PortraitComparisonValidationError(issues);
}

function assessDimension(candidate: ComparisonAlgorithmCandidateDimension, indexed: IndexedEvidence, includedWeightSum: number): DimensionAssessment {
  const baseline = indexed.baseline.get(candidate.dimensionKey) ?? null;
  const comparison = indexed.comparison.get(candidate.dimensionKey) ?? null;
  const excluded = excludeIfNeeded(candidate, baseline, comparison);
  if (excluded !== null) return excluded;
  if (baseline === null || comparison === null || includedWeightSum <= 0) throw new PortraitComparisonValidationError([{ path: candidate.dimensionKey, message: "included candidate is internally inconsistent" }]);
  const baselineNormalizedValue = normalizeValue(baseline.value, candidate.normalization);
  const comparisonNormalizedValue = normalizeValue(comparison.value, candidate.normalization);
  assertFiniteCalculation(baselineNormalizedValue, `${candidate.dimensionKey}.baselineNormalizedValue`);
  assertFiniteCalculation(comparisonNormalizedValue, `${candidate.dimensionKey}.comparisonNormalizedValue`);
  const rawDelta = comparison.value - baseline.value;
  const normalizedDelta = comparisonNormalizedValue - baselineNormalizedValue;
  assertFiniteCalculation(rawDelta, `${candidate.dimensionKey}.rawDelta`);
  assertFiniteCalculation(normalizedDelta, `${candidate.dimensionKey}.normalizedDelta`);
  const dimensionSimilarity = clamp(100 - Math.abs(normalizedDelta), 0, 100);
  assertFiniteCalculation(dimensionSimilarity, `${candidate.dimensionKey}.dimensionSimilarity`);
  const weightedContribution = (dimensionSimilarity * candidate.weight) / includedWeightSum;
  assertFiniteCalculation(weightedContribution, `${candidate.dimensionKey}.weightedContribution`);
  return {
    dimensionKey: candidate.dimensionKey,
    dimensionLabel: candidate.dimensionLabel,
    expectedUnit: candidate.expectedUnit,
    weight: candidate.weight,
    participation: "included",
    exclusionReason: null,
    baselineEvidence: baseline,
    comparisonEvidence: comparison,
    baselineNormalizedValue,
    comparisonNormalizedValue,
    rawDelta,
    normalizedDelta,
    dimensionSimilarity,
    weightedContribution,
  };
}

function excludeIfNeeded(candidate: ComparisonAlgorithmCandidateDimension, baseline: DimensionEvidenceProjection | null, comparison: DimensionEvidenceProjection | null): ExcludedDimensionAssessment | null {
  const base = {
    dimensionKey: candidate.dimensionKey,
    dimensionLabel: candidate.dimensionLabel,
    expectedUnit: candidate.expectedUnit,
    weight: candidate.weight,
    participation: "excluded" as const,
    baselineEvidence: baseline,
    comparisonEvidence: comparison,
    baselineNormalizedValue: null,
    comparisonNormalizedValue: null,
    rawDelta: null,
    normalizedDelta: null,
    dimensionSimilarity: null,
    weightedContribution: null,
  };
  if (baseline === null && comparison === null) return { ...base, exclusionReason: "missing_both" };
  if (baseline === null) return { ...base, exclusionReason: "missing_baseline" };
  if (comparison === null) return { ...base, exclusionReason: "missing_comparison" };
  if (baseline.unit !== candidate.expectedUnit || comparison.unit !== candidate.expectedUnit || baseline.unit !== comparison.unit) return { ...base, exclusionReason: "unit_mismatch" };
  if (baseline.qualityEligibility === "insufficient" || comparison.qualityEligibility === "insufficient") return { ...base, exclusionReason: "quality_insufficient" };
  return null;
}

function validateEvidence(evidence: readonly DimensionEvidenceProjection[]): void {
  const issues: PortraitComparisonValidationIssue[] = [];
  const seen = new Set<string>();
  evidence.forEach((row, index) => {
    const path = `evidence[${index}]`;
    if (row.side !== "baseline" && row.side !== "comparison") issues.push({ path: `${path}.side`, message: "must be baseline or comparison" });
    if (isBlank(row.dimensionKey)) issues.push({ path: `${path}.dimensionKey`, message: "must be nonblank" });
    if (isBlank(row.dimensionLabel)) issues.push({ path: `${path}.dimensionLabel`, message: "must be nonblank" });
    if (!Number.isFinite(row.value)) issues.push({ path: `${path}.value`, message: "must be finite" });
    if (isBlank(row.unit)) issues.push({ path: `${path}.unit`, message: "must be nonblank" });
    if (row.qualityStatus !== "ready" && row.qualityStatus !== "limited") issues.push({ path: `${path}.qualityStatus`, message: "must be ready or limited" });
    if (row.qualityEligibility !== "eligible" && row.qualityEligibility !== "insufficient") issues.push({ path: `${path}.qualityEligibility`, message: "must be eligible or insufficient" });
    const duplicateKey = `${row.side}:${row.dimensionKey}`;
    if (seen.has(duplicateKey)) issues.push({ path, message: "duplicate evidence for same side and dimensionKey" });
    seen.add(duplicateKey);
  });
  if (issues.length > 0) throw new PortraitComparisonValidationError(issues);
}

function indexEvidence(evidence: readonly DimensionEvidenceProjection[]): IndexedEvidence {
  const baseline = new Map<string, DimensionEvidenceProjection>();
  const comparison = new Map<string, DimensionEvidenceProjection>();
  for (const row of evidence) (row.side === "baseline" ? baseline : comparison).set(row.dimensionKey, row);
  return { baseline, comparison };
}

function validateComparisonMode(mode: ComparisonMode, path: string): void {
  if (mode !== "peer_same_period" && mode !== "self_cross_period") throw new PortraitComparisonValidationError([{ path, message: "must be peer_same_period or self_cross_period" }]);
}

function normalizationToJson(normalization: LinearNormalizationDescriptor): JsonValue {
  return toJsonValue({ kind: normalization.kind, min: normalization.min, max: normalization.max, clamp: normalization.clamp }, "normalization");
}

function normalizeValue(value: number, normalization: LinearNormalizationDescriptor): number {
  const normalized = ((value - normalization.min) / (normalization.max - normalization.min)) * 100;
  return normalization.clamp ? clamp(normalized, 0, 100) : normalized;
}

function assertFiniteCalculation(value: number, path: string): void {
  if (!Number.isFinite(value)) throw new PortraitComparisonValidationError([{ path, message: "calculation produced a non-finite value" }]);
}

function isJsonSafeFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
