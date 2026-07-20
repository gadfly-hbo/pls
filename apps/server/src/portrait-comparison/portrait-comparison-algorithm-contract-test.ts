import assert from "node:assert/strict";
import test from "node:test";

import {
  PLS_COMPARISON_ALGORITHM_IDENTITY,
  PortraitComparisonValidationError,
  canonicalJson,
  checksumCanonicalJson,
  computeAlgorithmConfigChecksum,
  computeComparisonAlgorithmResult,
  createRuleSummary,
  getProductionQualityPolicy,
  type ComparisonAlgorithmConfig,
  type DimensionEvidenceProjection,
  type RuleDimensionAssessmentSummary,
  type RuleSummaryInput,
} from "./index.js";

const CHECKSUM = "a".repeat(64);

const FIXTURE_CONFIG: ComparisonAlgorithmConfig = {
  algorithmIdentity: PLS_COMPARISON_ALGORITHM_IDENTITY,
  algorithmVersion: "fixture-pls-comparison@1",
  floatingTolerance: 1e-9,
  overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 60 },
  candidateDimensions: [
    { dimensionKey: "fixture_share_alpha", dimensionLabel: "Fixture Share Alpha", expectedUnit: "ratio", weight: 2, normalization: { kind: "linear_0_100", min: 0, max: 1, clamp: true } },
    { dimensionKey: "fixture_share_beta", dimensionLabel: "Fixture Share Beta", expectedUnit: "ratio", weight: 1, normalization: { kind: "linear_0_100", min: 0, max: 1, clamp: true } },
    { dimensionKey: "fixture_count_gamma", dimensionLabel: "Fixture Count Gamma", expectedUnit: "count", weight: 1, normalization: { kind: "linear_0_100", min: 0, max: 100, clamp: true } },
  ],
};

function evidence(side: "baseline" | "comparison", dimensionKey: string, value: number, overrides: Partial<DimensionEvidenceProjection> = {}): DimensionEvidenceProjection {
  return {
    side,
    dimensionKey,
    dimensionLabel: `Label for ${dimensionKey}`,
    value,
    unit: dimensionKey === "fixture_count_gamma" ? "count" : "ratio",
    qualityStatus: "ready",
    qualityEligibility: "eligible",
    ...overrides,
  };
}

function runWith(rows: readonly DimensionEvidenceProjection[], config = FIXTURE_CONFIG) {
  return computeComparisonAlgorithmResult({ comparisonMode: "peer_same_period", config, evidence: rows });
}

test("canonical JSON v1 sorts keys, preserves array order, and rejects invalid JSON values", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(checksumCanonicalJson({ b: 1, a: 2 }), checksumCanonicalJson({ a: 2, b: 1 }));
  assert.notEqual(checksumCanonicalJson(["a", "b"]), checksumCanonicalJson(["b", "a"]));
  assert.throws(() => canonicalJson({ x: Number.NaN }), PortraitComparisonValidationError);
  assert.throws(() => canonicalJson({ x: undefined }), PortraitComparisonValidationError);
  assert.throws(() => canonicalJson(new Date()), PortraitComparisonValidationError);
  assert.throws(() => canonicalJson(new Array(1)), /sparse array holes/);
  const leadingHole = [,"x"];
  const middleHole = ["x",,"y"];
  const trailingHole = ["x",];
  trailingHole.length = 2;
  assert.throws(() => canonicalJson(leadingHole), /sparse array holes/);
  assert.throws(() => canonicalJson(middleHole), /sparse array holes/);
  assert.throws(() => canonicalJson(trailingHole), /sparse array holes/);
  assert.throws(() => checksumCanonicalJson(leadingHole as never), /sparse array holes/);
  assert.throws(() => checksumCanonicalJson(middleHole as never), /sparse array holes/);
  assert.throws(() => checksumCanonicalJson(trailingHole as never), /sparse array holes/);
  assert.throws(() => checksumCanonicalJson({ x: Number.NaN }), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: Number.POSITIVE_INFINITY }), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: 9007199254740992 }), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: undefined } as never), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: () => true } as never), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: Symbol("x") } as never), PortraitComparisonValidationError);
  assert.throws(() => checksumCanonicalJson({ x: BigInt(1) } as never), PortraitComparisonValidationError);
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.throws(() => checksumCanonicalJson(circular as never), PortraitComparisonValidationError);
});

test("algorithm includes exact unit matches and computes normalized score and coverage", () => {
  const result = runWith([
    evidence("baseline", "fixture_share_alpha", 0.2),
    evidence("comparison", "fixture_share_alpha", 0.25),
    evidence("baseline", "fixture_share_beta", 0.8),
    evidence("comparison", "fixture_share_beta", 0.7),
    evidence("baseline", "fixture_count_gamma", 10),
    evidence("comparison", "fixture_count_gamma", 20),
  ]);
  assert.equal(result.algorithmIdentity, "pls-portrait-comparison");
  assert.match(result.algorithmConfigChecksum, /^[0-9a-f]{64}$/);
  assert.equal(result.coverage, 100);
  assert.equal(result.overallScore, 92.5);
  assert.equal(result.assessments.every((assessment) => assessment.participation === "included"), true);
});

test("peer_same_period and self_cross_period share the same formula", () => {
  const rows = [
    evidence("baseline", "fixture_share_alpha", 0.1),
    evidence("comparison", "fixture_share_alpha", 0.2),
    evidence("baseline", "fixture_share_beta", 0.3),
    evidence("comparison", "fixture_share_beta", 0.4),
  ];
  const peer = computeComparisonAlgorithmResult({ comparisonMode: "peer_same_period", config: FIXTURE_CONFIG, evidence: rows });
  const self = computeComparisonAlgorithmResult({ comparisonMode: "self_cross_period", config: FIXTURE_CONFIG, evidence: rows });
  assert.equal(peer.overallScore, self.overallScore);
  assert.equal(peer.coverage, self.coverage);
});

test("algorithm emits all five exclusion reasons without zero-fill", () => {
  const missing = runWith([evidence("comparison", "fixture_share_alpha", 0.25), evidence("baseline", "fixture_share_beta", 0.8)]);
  assert.deepEqual(missing.assessments.map((assessment) => assessment.exclusionReason), ["missing_baseline", "missing_comparison", "missing_both"]);
  const unit = runWith([evidence("baseline", "fixture_share_alpha", 0.2, { unit: "pct" }), evidence("comparison", "fixture_share_alpha", 0.25)]);
  assert.equal(unit.assessments[0]?.exclusionReason, "unit_mismatch");
  const quality = runWith([evidence("baseline", "fixture_share_alpha", 0.2, { qualityStatus: "limited", qualityEligibility: "insufficient" }), evidence("comparison", "fixture_share_alpha", 0.25)]);
  assert.equal(quality.assessments[0]?.exclusionReason, "quality_insufficient");
});

test("algorithm evidence quality projection aligns with V005 persistence status", () => {
  const result = runWith([
    evidence("baseline", "fixture_share_alpha", 0.2, { qualityStatus: "limited", qualityEligibility: "insufficient" }),
    evidence("comparison", "fixture_share_alpha", 0.25, { qualityStatus: "ready", qualityEligibility: "eligible" }),
  ]);
  const assessment = result.assessments[0];
  assert.equal(assessment?.participation, "excluded");
  assert.equal(assessment?.exclusionReason, "quality_insufficient");
  assert.equal(assessment?.baselineEvidence?.qualityStatus, "limited");
  assert.equal(assessment?.baselineEvidence?.qualityEligibility, "insufficient");
  assert.throws(() => runWith([evidence("baseline", "fixture_share_alpha", 0.2, { qualityStatus: "insufficient" as never })]), /qualityStatus/);
});

test("algorithm rejects duplicate evidence and invalid config boundaries", () => {
  assert.throws(() => runWith([evidence("baseline", "fixture_share_alpha", 0.2), evidence("baseline", "fixture_share_alpha", 0.3)]), /duplicate evidence/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [] }), /candidateDimensions/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [FIXTURE_CONFIG.candidateDimensions[0]!, FIXTURE_CONFIG.candidateDimensions[0]!] }), /unique/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, weight: 0 }] }), /positive/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, expectedUnit: " " }] }), /nonblank/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, normalization: { kind: "linear_0_100", min: 1, max: 1, clamp: true } }] }), /min must be less than max/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, weight: 9007199254740992 }] }), /weight/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, normalization: { kind: "linear_0_100", min: -Number.MAX_VALUE, max: Number.MAX_VALUE, clamp: true } }] }), /normalization span/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, normalization: { kind: "linear_0_100", min: 0, max: 1, clamp: false } }] }), /clamp/);
  assert.throws(() => runWith([], { ...FIXTURE_CONFIG, floatingTolerance: 0 }), /floatingTolerance/);
});

test("algorithm fails closed when finite inputs would produce non-finite outputs", () => {
  const overflowConfig: ComparisonAlgorithmConfig = {
    ...FIXTURE_CONFIG,
    candidateDimensions: [
      { dimensionKey: "overflow", dimensionLabel: "Overflow", expectedUnit: "unit", weight: 1, normalization: { kind: "linear_0_100", min: 0, max: 1, clamp: true } },
    ],
  };
  assert.throws(
    () => runWith([
      evidence("baseline", "overflow", -Number.MAX_VALUE, { unit: "unit" }),
      evidence("comparison", "overflow", Number.MAX_VALUE, { unit: "unit" }),
    ], overflowConfig),
    /rawDelta/,
  );
});

test("normalization clamps and score is suppressed when coverage is insufficient", () => {
  const strictConfig: ComparisonAlgorithmConfig = { ...FIXTURE_CONFIG, overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 80 } };
  const result = runWith([
    evidence("baseline", "fixture_share_alpha", -5),
    evidence("comparison", "fixture_share_alpha", 5),
    evidence("baseline", "fixture_share_beta", 0.8),
    evidence("comparison", "fixture_share_beta", 0.6),
  ], strictConfig);
  const contributionSum = result.assessments.reduce((sum, assessment) => sum + (assessment.weightedContribution ?? 0), 0);
  assert.equal(result.coverage, 75);
  assert.equal(result.overallScore, null);
  assert.equal(result.overallScoreExcludedReason, "coverage_insufficient");
  assert.ok(contributionSum >= 0);
});

test("successful normalized values and deltas stay projectable to V005 bounds", () => {
  const result = runWith([
    evidence("baseline", "fixture_share_alpha", -10),
    evidence("comparison", "fixture_share_alpha", 20),
  ], { ...FIXTURE_CONFIG, overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 0 } });
  const assessment = result.assessments[0];
  assert.equal(assessment?.participation, "included");
  if (assessment?.participation !== "included") throw new Error("expected included assessment");
  assert.equal(assessment.baselineNormalizedValue, 0);
  assert.equal(assessment.comparisonNormalizedValue, 100);
  assert.equal(assessment.normalizedDelta, 100);
  assert.ok(assessment.dimensionSimilarity >= 0 && assessment.dimensionSimilarity <= 100);
  assert.ok(assessment.weightedContribution >= 0 && assessment.weightedContribution <= 100);
});

test("algorithm config checksum is insertion-order stable and behavior-field sensitive", () => {
  const checksum = computeAlgorithmConfigChecksum(FIXTURE_CONFIG);
  const equivalent = computeAlgorithmConfigChecksum({ ...FIXTURE_CONFIG, candidateDimensions: [...FIXTURE_CONFIG.candidateDimensions] });
  assert.equal(checksum, equivalent);
  assert.notEqual(checksum, computeAlgorithmConfigChecksum({ ...FIXTURE_CONFIG, algorithmVersion: "fixture-pls-comparison@2" }));
  assert.notEqual(checksum, computeAlgorithmConfigChecksum({ ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, weight: 3 }, ...FIXTURE_CONFIG.candidateDimensions.slice(1)] }));
  assert.notEqual(checksum, computeAlgorithmConfigChecksum({ ...FIXTURE_CONFIG, candidateDimensions: [{ ...FIXTURE_CONFIG.candidateDimensions[0]!, normalization: { kind: "linear_0_100", min: 0, max: 2, clamp: true } }, ...FIXTURE_CONFIG.candidateDimensions.slice(1)] }));
  assert.notEqual(checksum, computeAlgorithmConfigChecksum({ ...FIXTURE_CONFIG, overallScorePolicy: { kind: "minimum_coverage", minimumCoverage: 80 } }));
});

test("production quality policy is explicitly not_released and has no numeric defaults", () => {
  const policy = getProductionQualityPolicy();
  assert.equal(policy.releaseStatus, "not_released");
  assert.equal(policy.policyId, "pls-portrait-comparison-quality-policy");
  assert.match(policy.configChecksum, /^[0-9a-f]{64}$/);
  assert.ok(policy.reasonTaxonomy.includes("comparison_coverage_below_minimum"));
});

const ASSESSMENTS: RuleDimensionAssessmentSummary[] = [
  { dimensionAssessmentId: "assessment_alpha", dimensionKey: "alpha", dimensionLabel: "Alpha", participation: "included", exclusionReason: null, baselineEvidenceId: "evidence_baseline_alpha", comparisonEvidenceId: "evidence_comparison_alpha", dimensionSimilarity: 96, normalizedDelta: 4 },
  { dimensionAssessmentId: "assessment_beta", dimensionKey: "beta", dimensionLabel: "Beta", participation: "included", exclusionReason: null, baselineEvidenceId: "evidence_baseline_beta", comparisonEvidenceId: "evidence_comparison_beta", dimensionSimilarity: 82.5, normalizedDelta: -17.5 },
  { dimensionAssessmentId: "assessment_gamma", dimensionKey: "gamma", dimensionLabel: "Gamma", participation: "excluded", exclusionReason: "missing_comparison", baselineEvidenceId: "evidence_baseline_gamma", comparisonEvidenceId: null, dimensionSimilarity: null, normalizedDelta: null },
];

const RULE_INPUT: RuleSummaryInput = {
  comparisonRunId: "run_fixture_1",
  comparisonMode: "peer_same_period",
  similarityScore: 88.5,
  coverage: 75,
  qualityStatus: "ready",
  qualityReasonCodes: [],
  baseline: { participantId: "participant_baseline", portraitSourceId: "source_baseline", objectId: "store_a", displayName: "A Store", family: "channel", objectType: "store", snapshotId: "snap_a", periodStart: "2026-06-01", periodEnd: "2026-06-30" },
  comparison: { participantId: "participant_comparison", portraitSourceId: "source_comparison", objectId: "store_b", displayName: "B Store", family: "channel", objectType: "store", snapshotId: "snap_b", periodStart: "2026-06-01", periodEnd: "2026-06-30" },
  algorithmVersion: "fixture-pls-comparison@1",
  algorithmConfigChecksum: CHECKSUM,
  qualityPolicyVersion: "not-released@0",
  qualityPolicyConfigChecksum: "b".repeat(64),
  dimensionAssessments: ASSESSMENTS,
};

test("rule summary uses PLS identity, deterministic manifest checksum, and bounded content", () => {
  const result = createRuleSummary(RULE_INPUT);
  assert.equal(result.generatorType, "rule");
  assert.equal(result.generatorId, "pls-portrait-comparison-rule-summary");
  assert.doesNotMatch(result.generatorId, /workpls/);
  assert.match(result.evidenceManifestChecksum, /^[0-9a-f]{64}$/);
  assert.ok(result.evidenceManifest.some((entry) => entry.recordType === "comparison_run"));
  assert.ok(result.evidenceManifest.some((entry) => entry.recordType === "comparison_dimension_evidence"));
  for (const claims of [result.content.similarities, result.content.differences, result.content.opportunities, result.content.risks, result.content.nextSteps]) assert.ok(claims.length <= 3);
});

test("rule summary keeps every claim inside the same manifest and fails closed on bad input", () => {
  const result = createRuleSummary(RULE_INPUT);
  const keys = new Set(result.evidenceManifest.map((entry) => `${entry.recordType}/${entry.recordId}`));
  for (const claimItem of [result.content.conclusion, ...result.content.similarities, ...result.content.differences, ...result.content.opportunities, ...result.content.risks, ...result.content.nextSteps]) {
    assert.ok(claimItem.text.trim().length > 0);
    for (const ref of claimItem.evidenceRefs) assert.ok(keys.has(`${ref.recordType}/${ref.recordId}`));
  }
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, comparisonRunId: " " }), /comparisonRunId/);
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, similarityScore: null as never }), /similarityScore/);
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, similarityScore: Number.NaN }), /similarityScore/);
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, algorithmConfigChecksum: "bad" }), /algorithmConfigChecksum/);
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, dimensionAssessments: [] }), /dimensionAssessments/);
  assert.throws(() => createRuleSummary({ ...RULE_INPUT, dimensionAssessments: [{ ...ASSESSMENTS[0]!, baselineEvidenceId: null }] }), /baselineEvidenceId/);
});

test("rule summary has no hardcoded score opportunity, similarity threshold, or generator masquerade", () => {
  const result = createRuleSummary(RULE_INPUT);
  const claims = [result.content.conclusion, ...result.content.similarities, ...result.content.differences, ...result.content.opportunities, ...result.content.risks, ...result.content.nextSteps];
  assert.equal(result.content.opportunities.length, 0);
  assert.equal(result.content.similarities.length, 0);
  assert.equal(result.content.differences.length, 0);
  for (const claimItem of claims) assert.doesNotMatch(claimItem.text, /\bAI\b|model|prediction|recommendation engine|模型|预测|推荐引擎/i);
});

test("rule summary manifest uses deterministic UTF-16 ordering for checksum stability", () => {
  const input: RuleSummaryInput = {
    ...RULE_INPUT,
    comparisonRunId: "run_中",
    baseline: { ...RULE_INPUT.baseline, participantId: "participant_𠮷", portraitSourceId: "source_中" },
    comparison: { ...RULE_INPUT.comparison, participantId: "participant_a", portraitSourceId: "source_😀" },
    dimensionAssessments: [
      { ...ASSESSMENTS[0]!, dimensionAssessmentId: "assessment_😀", baselineEvidenceId: "evidence_中", comparisonEvidenceId: "evidence_a" },
      { ...ASSESSMENTS[1]!, dimensionAssessmentId: "assessment_a", baselineEvidenceId: "evidence_𠮷", comparisonEvidenceId: "evidence_b" },
      { ...ASSESSMENTS[0]!, dimensionAssessmentId: "assessment_b", baselineEvidenceId: "evidence_中", comparisonEvidenceId: "evidence_a" },
    ],
  };
  const first = createRuleSummary(input);
  const second = createRuleSummary({ ...input, dimensionAssessments: [...input.dimensionAssessments].reverse() });
  assert.equal(first.evidenceManifestChecksum, second.evidenceManifestChecksum);
  assert.deepEqual(first.evidenceManifest, second.evidenceManifest);
  assert.deepEqual(first.evidenceManifest.map((entry) => `${entry.recordType}/${entry.recordId}`), [
    "comparison_dimension_assessment/assessment_a",
    "comparison_dimension_assessment/assessment_b",
    "comparison_dimension_assessment/assessment_😀",
    "comparison_dimension_evidence/evidence_a",
    "comparison_dimension_evidence/evidence_b",
    "comparison_dimension_evidence/evidence_中",
    "comparison_dimension_evidence/evidence_𠮷",
    "comparison_participant/participant_a",
    "comparison_participant/participant_𠮷",
    "comparison_portrait_source/source_中",
    "comparison_portrait_source/source_😀",
    "comparison_run/run_中",
  ]);
});
