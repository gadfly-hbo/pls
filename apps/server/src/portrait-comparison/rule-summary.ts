import { checksumCanonicalJson, PortraitComparisonValidationError, type JsonValue } from "./canonical-json.js";
import type { ComparisonAlgorithmExclusionReason, ComparisonMode } from "./algorithm.js";

export const PLS_RULE_SUMMARY_GENERATOR_ID = "pls-portrait-comparison-rule-summary";
export const PLS_RULE_SUMMARY_GENERATOR_VERSION = "rule-summary@1";
export const PLS_RULE_SUMMARY_CONTRACT_VERSION = "0.1.0";

export type ManifestRecordType = "comparison_run" | "comparison_participant" | "comparison_portrait_source" | "comparison_dimension_assessment" | "comparison_dimension_evidence";
export type RuleQualityStatus = "ready" | "limited";
export type RuleAssessmentParticipation = "included" | "excluded";

export interface EvidenceManifestEntry {
  readonly recordType: ManifestRecordType;
  readonly recordId: string;
}

export interface ExplanationClaim {
  readonly text: string;
  readonly evidenceRefs: readonly EvidenceManifestEntry[];
}

export interface ExplanationContent {
  readonly conclusion: ExplanationClaim;
  readonly similarities: readonly ExplanationClaim[];
  readonly differences: readonly ExplanationClaim[];
  readonly opportunities: readonly ExplanationClaim[];
  readonly risks: readonly ExplanationClaim[];
  readonly nextSteps: readonly ExplanationClaim[];
}

export interface RuleParticipantSnapshot {
  readonly participantId: string;
  readonly portraitSourceId: string;
  readonly objectId: string;
  readonly displayName: string;
  readonly family: string;
  readonly objectType: string;
  readonly snapshotId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface RuleDimensionAssessmentSummary {
  readonly dimensionAssessmentId: string;
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly participation: RuleAssessmentParticipation;
  readonly exclusionReason: ComparisonAlgorithmExclusionReason | null;
  readonly baselineEvidenceId: string | null;
  readonly comparisonEvidenceId: string | null;
  readonly dimensionSimilarity: number | null;
  readonly normalizedDelta: number | null;
}

export interface RuleSummaryInput {
  readonly comparisonRunId: string;
  readonly comparisonMode: ComparisonMode;
  readonly similarityScore: number;
  readonly coverage: number;
  readonly qualityStatus: RuleQualityStatus;
  readonly qualityReasonCodes: readonly string[];
  readonly baseline: RuleParticipantSnapshot;
  readonly comparison: RuleParticipantSnapshot;
  readonly algorithmVersion: string;
  readonly algorithmConfigChecksum: string;
  readonly qualityPolicyVersion: string;
  readonly qualityPolicyConfigChecksum: string;
  readonly dimensionAssessments: readonly RuleDimensionAssessmentSummary[];
}

export interface RuleSummaryResult {
  readonly generatorType: "rule";
  readonly generatorId: typeof PLS_RULE_SUMMARY_GENERATOR_ID;
  readonly generatorVersion: typeof PLS_RULE_SUMMARY_GENERATOR_VERSION;
  readonly explanationContractVersion: typeof PLS_RULE_SUMMARY_CONTRACT_VERSION;
  readonly evidenceManifest: readonly EvidenceManifestEntry[];
  readonly evidenceManifestChecksum: string;
  readonly content: ExplanationContent;
}

const EXCLUSION_REASON_LABEL: Readonly<Record<ComparisonAlgorithmExclusionReason, string>> = {
  missing_baseline: "baseline side is missing comparable evidence",
  missing_comparison: "comparison side is missing comparable evidence",
  missing_both: "both sides are missing comparable evidence",
  unit_mismatch: "unit does not exactly match the candidate dimension",
  quality_insufficient: "dimension evidence quality is insufficient",
};

const MANIFEST_RECORD_TYPES: readonly ManifestRecordType[] = ["comparison_run", "comparison_participant", "comparison_portrait_source", "comparison_dimension_assessment", "comparison_dimension_evidence"];

export function createRuleSummary(input: RuleSummaryInput): RuleSummaryResult {
  validateInput(input);
  const evidenceManifest = normalizeEvidenceManifest(buildEvidenceManifest(input));
  const content = validateExplanationContent(buildContent(input), evidenceManifest);
  assertNoGeneratorMasquerade(content);
  return {
    generatorType: "rule",
    generatorId: PLS_RULE_SUMMARY_GENERATOR_ID,
    generatorVersion: PLS_RULE_SUMMARY_GENERATOR_VERSION,
    explanationContractVersion: PLS_RULE_SUMMARY_CONTRACT_VERSION,
    evidenceManifest,
    evidenceManifestChecksum: checksumCanonicalJson(manifestToJson(evidenceManifest)),
    content,
  };
}

function validateInput(input: RuleSummaryInput): void {
  requireNonBlank(input.comparisonRunId, "comparisonRunId");
  if (input.comparisonMode !== "peer_same_period" && input.comparisonMode !== "self_cross_period") throw new PortraitComparisonValidationError([{ path: "comparisonMode", message: "unsupported mode" }]);
  requirePercent(input.similarityScore, "similarityScore");
  requirePercent(input.coverage, "coverage");
  if (input.qualityStatus !== "ready" && input.qualityStatus !== "limited") throw new PortraitComparisonValidationError([{ path: "qualityStatus", message: "must be ready or limited" }]);
  input.qualityReasonCodes.forEach((code, index) => requireNonBlank(code, `qualityReasonCodes[${index}]`));
  validateParticipant(input.baseline, "baseline");
  validateParticipant(input.comparison, "comparison");
  requireNonBlank(input.algorithmVersion, "algorithmVersion");
  requireChecksum(input.algorithmConfigChecksum, "algorithmConfigChecksum");
  requireNonBlank(input.qualityPolicyVersion, "qualityPolicyVersion");
  requireChecksum(input.qualityPolicyConfigChecksum, "qualityPolicyConfigChecksum");
  if (input.dimensionAssessments.length === 0) throw new PortraitComparisonValidationError([{ path: "dimensionAssessments", message: "must contain at least one assessment" }]);
  const seen = new Set<string>();
  input.dimensionAssessments.forEach((assessment, index) => {
    validateAssessment(assessment, `dimensionAssessments[${index}]`);
    if (seen.has(assessment.dimensionAssessmentId)) throw new PortraitComparisonValidationError([{ path: "dimensionAssessments.dimensionAssessmentId", message: "must be unique" }]);
    seen.add(assessment.dimensionAssessmentId);
  });
}

function validateParticipant(participant: RuleParticipantSnapshot, path: string): void {
  requireNonBlank(participant.participantId, `${path}.participantId`);
  requireNonBlank(participant.portraitSourceId, `${path}.portraitSourceId`);
  requireNonBlank(participant.objectId, `${path}.objectId`);
  requireNonBlank(participant.displayName, `${path}.displayName`);
  requireNonBlank(participant.family, `${path}.family`);
  requireNonBlank(participant.objectType, `${path}.objectType`);
  requireNonBlank(participant.snapshotId, `${path}.snapshotId`);
  requireNonBlank(participant.periodStart, `${path}.periodStart`);
  requireNonBlank(participant.periodEnd, `${path}.periodEnd`);
}

function validateAssessment(assessment: RuleDimensionAssessmentSummary, path: string): void {
  requireNonBlank(assessment.dimensionAssessmentId, `${path}.dimensionAssessmentId`);
  requireNonBlank(assessment.dimensionKey, `${path}.dimensionKey`);
  requireNonBlank(assessment.dimensionLabel, `${path}.dimensionLabel`);
  if (assessment.participation === "included") {
    if (assessment.exclusionReason !== null) throw new PortraitComparisonValidationError([{ path: `${path}.exclusionReason`, message: "included assessment must use null" }]);
    requireNonBlank(assessment.baselineEvidenceId, `${path}.baselineEvidenceId`);
    requireNonBlank(assessment.comparisonEvidenceId, `${path}.comparisonEvidenceId`);
    requirePercent(assessment.dimensionSimilarity, `${path}.dimensionSimilarity`);
    requireFiniteNumber(assessment.normalizedDelta, `${path}.normalizedDelta`);
    return;
  }
  if (assessment.participation !== "excluded") throw new PortraitComparisonValidationError([{ path: `${path}.participation`, message: "must be included or excluded" }]);
  if (assessment.exclusionReason === null || !(assessment.exclusionReason in EXCLUSION_REASON_LABEL)) throw new PortraitComparisonValidationError([{ path: `${path}.exclusionReason`, message: "unsupported exclusion reason" }]);
  if (assessment.dimensionSimilarity !== null || assessment.normalizedDelta !== null) throw new PortraitComparisonValidationError([{ path, message: "excluded assessment must not carry derived scores" }]);
  if (assessment.baselineEvidenceId !== null) requireNonBlank(assessment.baselineEvidenceId, `${path}.baselineEvidenceId`);
  if (assessment.comparisonEvidenceId !== null) requireNonBlank(assessment.comparisonEvidenceId, `${path}.comparisonEvidenceId`);
}

function buildEvidenceManifest(input: RuleSummaryInput): EvidenceManifestEntry[] {
  const entries: EvidenceManifestEntry[] = [
    { recordType: "comparison_run", recordId: input.comparisonRunId },
    { recordType: "comparison_participant", recordId: input.baseline.participantId },
    { recordType: "comparison_participant", recordId: input.comparison.participantId },
    { recordType: "comparison_portrait_source", recordId: input.baseline.portraitSourceId },
    { recordType: "comparison_portrait_source", recordId: input.comparison.portraitSourceId },
  ];
  for (const assessment of input.dimensionAssessments) {
    entries.push({ recordType: "comparison_dimension_assessment", recordId: assessment.dimensionAssessmentId });
    if (assessment.baselineEvidenceId !== null) entries.push({ recordType: "comparison_dimension_evidence", recordId: assessment.baselineEvidenceId });
    if (assessment.comparisonEvidenceId !== null) entries.push({ recordType: "comparison_dimension_evidence", recordId: assessment.comparisonEvidenceId });
  }
  return entries;
}

function buildContent(input: RuleSummaryInput): ExplanationContent {
  const runRef = ref("comparison_run", input.comparisonRunId);
  const excluded = input.dimensionAssessments.filter((assessment) => assessment.participation === "excluded");
  const scoreName = input.comparisonMode === "peer_same_period" ? "portrait similarity" : "portrait stability";
  const risks = excluded.slice(0, 3).map((assessment) => claim(`${assessment.dimensionLabel} was excluded: ${EXCLUSION_REASON_LABEL[assessment.exclusionReason!]}.`, [runRef, assessmentRef(assessment)]));
  if (input.qualityStatus === "limited" && risks.length < 3) risks.push(claim(`Quality status is limited; reason codes: ${input.qualityReasonCodes.length > 0 ? input.qualityReasonCodes.join(", ") : "none"}.`, [runRef]));
  return {
    conclusion: claim(`Rule summary: ${input.baseline.displayName} vs ${input.comparison.displayName}; ${scoreName} is ${formatNumber(input.similarityScore)}; coverage is ${formatNumber(input.coverage)}; quality status is ${input.qualityStatus}.`, [runRef]),
    similarities: [],
    differences: [],
    opportunities: [],
    risks,
    nextSteps: [claim(`Inspect the deterministic dimension assessments and evidence before using this ${scoreName} in a downstream decision.`, [runRef])],
  };
}

function validateExplanationContent(content: ExplanationContent, manifest: readonly EvidenceManifestEntry[]): ExplanationContent {
  const manifestKeys = new Set(manifest.map(manifestKey));
  const categories = [content.similarities, content.differences, content.opportunities, content.risks, content.nextSteps];
  validateClaim(content.conclusion, "content.conclusion", manifestKeys);
  categories.forEach((claims, categoryIndex) => {
    if (claims.length > 3) throw new PortraitComparisonValidationError([{ path: `content.category[${categoryIndex}]`, message: "at most 3 claims are allowed" }]);
    claims.forEach((claimItem, index) => validateClaim(claimItem, `content.category[${categoryIndex}][${index}]`, manifestKeys));
  });
  return content;
}

function validateClaim(claimItem: ExplanationClaim, path: string, manifestKeys: ReadonlySet<string>): void {
  requireNonBlank(claimItem.text, `${path}.text`);
  if (claimItem.evidenceRefs.length === 0) throw new PortraitComparisonValidationError([{ path: `${path}.evidenceRefs`, message: "must not be empty" }]);
  claimItem.evidenceRefs.forEach((entry, index) => {
    validateManifestEntry(entry, `${path}.evidenceRefs[${index}]`);
    if (!manifestKeys.has(manifestKey(entry))) throw new PortraitComparisonValidationError([{ path: `${path}.evidenceRefs[${index}]`, message: "ref is not in evidence manifest" }]);
  });
}

function normalizeEvidenceManifest(entries: readonly EvidenceManifestEntry[]): EvidenceManifestEntry[] {
  const byKey = new Map<string, EvidenceManifestEntry>();
  entries.forEach((entry, index) => {
    validateManifestEntry(entry, `evidenceManifest[${index}]`);
    byKey.set(manifestKey(entry), entry);
  });
  return [...byKey.values()].sort((a, b) => compareUtf16(manifestKey(a), manifestKey(b)));
}

function validateManifestEntry(entry: EvidenceManifestEntry, path: string): void {
  if (!MANIFEST_RECORD_TYPES.includes(entry.recordType)) throw new PortraitComparisonValidationError([{ path: `${path}.recordType`, message: "unsupported record type" }]);
  requireNonBlank(entry.recordId, `${path}.recordId`);
}

function manifestToJson(manifest: readonly EvidenceManifestEntry[]): JsonValue {
  return manifest.map((entry) => ({ recordType: entry.recordType, recordId: entry.recordId }));
}

function assertNoGeneratorMasquerade(content: ExplanationContent): void {
  const forbidden = /\bAI\b|model|prediction|recommendation engine|模型|预测|推荐引擎/i;
  for (const claimItem of [content.conclusion, ...content.similarities, ...content.differences, ...content.opportunities, ...content.risks, ...content.nextSteps]) {
    if (forbidden.test(claimItem.text)) throw new PortraitComparisonValidationError([{ path: "content", message: "rule summary must not masquerade as AI, model, prediction, or recommendation engine output" }]);
  }
}

function claim(text: string, evidenceRefs: readonly EvidenceManifestEntry[]): ExplanationClaim {
  return { text, evidenceRefs };
}

function ref(recordType: ManifestRecordType, recordId: string): EvidenceManifestEntry {
  return { recordType, recordId };
}

function assessmentRef(assessment: RuleDimensionAssessmentSummary): EvidenceManifestEntry {
  return ref("comparison_dimension_assessment", assessment.dimensionAssessmentId);
}

function manifestKey(entry: EvidenceManifestEntry): string {
  return `${entry.recordType}\u0000${entry.recordId}`;
}

function compareUtf16(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a.charCodeAt(index);
    const right = b.charCodeAt(index);
    if (left !== right) return left - right;
  }
  return a.length - b.length;
}

function requireNonBlank(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new PortraitComparisonValidationError([{ path, message: "must be a nonblank string" }]);
}

function requireFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new PortraitComparisonValidationError([{ path, message: "must be a finite number" }]);
}

function requirePercent(value: unknown, path: string): asserts value is number {
  requireFiniteNumber(value, path);
  if (value < 0 || value > 100) throw new PortraitComparisonValidationError([{ path, message: "must be between 0 and 100" }]);
}

function requireChecksum(value: unknown, path: string): asserts value is string {
  requireNonBlank(value, path);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new PortraitComparisonValidationError([{ path, message: "must be a 64-character lowercase sha256 hex checksum" }]);
}

function formatNumber(value: number | null): string {
  if (value === null) throw new PortraitComparisonValidationError([{ path: "formatNumber", message: "value must be present" }]);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
