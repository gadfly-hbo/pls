import {
  estimateSemirThreeAudienceShares,
  ThreeAudienceInputError,
  THREE_AUDIENCE_ALGORITHM_VERSION,
  type NativeAudienceSegmentShare,
  type ThreeAudienceChannel,
  type ThreeAudienceEstimateInput,
  type ThreeAudienceEstimateResult,
  type NativeSegmentSystem,
} from "./three-audience-share.js";
import { JD_CALIBRATION_FIXTURES, JD_RECOMMENDED_CALIBRATED_MATRIX, JD_TEN_SEGMENT_LABELS } from "./jd-three-audience-calibration.js";

interface TestFailure {
  case: string;
  reason: string;
}

const EPS = 1e-9;
const failures: TestFailure[] = [];

checkTmallConfirmedSample();
checkSevenChannelMatrixUnits();
checkJdCalibratedMatrix();
checkMergeRules();
checkPriorBlending();
checkUnavailableAndUnmapped();
checkToleratedOverflowAndJdFixtures();
checkInvalidInputs();

process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, failures }, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;

function checkTmallConfirmedSample(): void {
  const result = estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [
    segment("潮流人群", 0.3937),
    segment("大众实用", 0.2035),
    segment("低价实惠", 0.0437),
    segment("品质生活", 0.1217),
    segment("低价有颜", 0.0642),
    segment("高阶时尚", 0.0737),
  ]));
  assertAvailable(result, "tmall_confirmed_sample");
  assertNear(result.coverage, 0.9005, 1e-12, "tmall_confirmed_sample", "coverage");
  assertShares(result, [0.4699389228206552, 0.24074958356468628, 0.28931149361465856], 1e-12, "tmall_confirmed_sample");
  assert(result.algorithmVersion === THREE_AUDIENCE_ALGORITHM_VERSION, "algorithmVersion mismatch", "tmall_confirmed_sample");
}

function checkSevenChannelMatrixUnits(): void {
  const cases: Array<{ name: string; channel: ThreeAudienceChannel; system: NativeSegmentSystem; label: string; expected: [number, number, number] }> = [
    { name: "douyin_matrix_unit", channel: "douyin", system: "douyin_eight", label: "新锐白领", expected: [0.8, 0.1, 0.1] },
    { name: "tmall_matrix_unit", channel: "tmall", system: "tmall_industry_six", label: "高阶时尚", expected: [0.4, 0.6, 0] },
    { name: "jd_matrix_unit", channel: "jd", system: "jd_ten", label: "都市Z世代", expected: [0.8, 0, 0.2] },
    { name: "offline_matrix_unit", channel: "offline", system: "offline_industry_six", label: "大众实用", expected: [0, 0.25, 0.75] },
    { name: "vip_matrix_unit", channel: "vip", system: "vip_eleven", label: "中年男士", expected: [0.12, 0.52, 0.36] },
    { name: "wechat_matrix_unit", channel: "wechat_channels", system: "wechat_channels_seven", label: "都市银发", expected: [0.05, 0.5, 0.45] },
    { name: "pdd_matrix_unit", channel: "pinduoduo", system: "pinduoduo_ten", label: "都市白领", expected: [0.8, 0.1, 0.1] },
  ];
  for (const testCase of cases) {
    const result = estimateSemirThreeAudienceShares(input(testCase.channel, testCase.system, [segment(testCase.label, 1)]));
    assertAvailable(result, testCase.name);
    assertShares(result, testCase.expected, EPS, testCase.name);
  }
}

function checkJdCalibratedMatrix(): void {
  for (const label of JD_TEN_SEGMENT_LABELS) {
    const weights = JD_RECOMMENDED_CALIBRATED_MATRIX[label];
    const result = estimateSemirThreeAudienceShares(input("jd", "jd_ten", [segment(label, 1)]));
    assertAvailable(result, `jd_single_${label}`);
    assertShares(result, [weights.a, weights.b, weights.c], 1e-12, `jd_single_${label}`);
    assertNear(result.coverage, 1, EPS, `jd_single_${label}`, "coverage");
  }
  for (const fixture of JD_CALIBRATION_FIXTURES) {
    const result = estimateSemirThreeAudienceShares(input("jd", "jd_ten", fixture.segments));
    assertAvailable(result, `jd_fixture_${fixture.name}`);
    assertNear(result.coverage, 1, 1e-12, `jd_fixture_${fixture.name}`, "coverage");
    assertEveryShareInRange(result, `jd_fixture_${fixture.name}`);
  }
}

function checkMergeRules(): void {
  const pdd = estimateSemirThreeAudienceShares(input("pinduoduo", "pinduoduo_ten", [segment("都市Z世代", 0.4), segment("学生", 0.6)]));
  assertAvailable(pdd, "pdd_merge_genz");
  assertShares(pdd, [0.45, 0.05, 0.5], EPS, "pdd_merge_genz");

  const wechat = estimateSemirThreeAudienceShares(input("wechat_channels", "wechat_channels_seven", [segment("精致妈妈", 0.25), segment("精致中产", 0.75)]));
  assertAvailable(wechat, "wechat_merge_senior_middle");
  assertShares(wechat, [0.1, 0.55, 0.35], EPS, "wechat_merge_senior_middle");
}

function checkPriorBlending(): void {
  const base = estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", 0.5)]));
  assertAvailable(base, "prior_base");
  assertShares(base, [1, 0, 0], EPS, "prior_base");
  assertNear(base.coverage, 0.5, EPS, "prior_base", "coverage");

  const blended = estimateSemirThreeAudienceShares({ ...input("tmall", "tmall_industry_six", [segment("潮流人群", 0.5)]), expertPrior: { a: 0.2, b: 0.3, c: 0.5 } });
  assertAvailable(blended, "prior_blended");
  assert(blended.mode === "expert_prior_blended", `expected expert_prior_blended, got ${blended.mode}`, "prior_blended");
  assertShares(blended, [0.6, 0.15, 0.25], EPS, "prior_blended");
}

function checkUnavailableAndUnmapped(): void {
  const unknownOnly = estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("未知标签", 0.4)]));
  assert(unknownOnly.status === "unavailable", "unknown-only should be unavailable", "unknown_only");
  assert(unknownOnly.shares.length === 0, "unavailable must have no shares", "unknown_only");
  assert(unknownOnly.qualityFlags.includes("no_covered_segments"), "missing no_covered_segments", "unknown_only");
  assert(unknownOnly.qualityFlags.includes("unmapped_segments_present"), "missing unmapped flag", "unknown_only");

  const partial = estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", 0.4), segment("未知标签", 0.2)]));
  assertAvailable(partial, "partial_unmapped");
  assertNear(partial.coverage, 0.4, EPS, "partial_unmapped", "coverage");
  assert(partial.qualityFlags.includes("low_coverage"), "missing low_coverage", "partial_unmapped");
  assert(partial.qualityFlags.includes("unmapped_segments_present"), "missing unmapped flag", "partial_unmapped");
  assert(partial.unmappedSegments.length === 1 && partial.unmappedSegments[0]?.label === "未知标签", "unmapped segment not retained", "partial_unmapped");

  const partialCoverage = estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", 0.85)]));
  assertAvailable(partialCoverage, "partial_coverage_threshold");
  assertNear(partialCoverage.coverage, 0.85, EPS, "partial_coverage_threshold", "coverage");
  assert(partialCoverage.qualityFlags.includes("partial_coverage"), "missing partial_coverage", "partial_coverage_threshold");
  assert(!partialCoverage.qualityFlags.includes("low_coverage"), "must not include low_coverage", "partial_coverage_threshold");
}

function checkToleratedOverflowAndJdFixtures(): void {
  const overflow = estimateSemirThreeAudienceShares({
    ...input("tmall", "tmall_industry_six", [segment("潮流人群", 0.50000025), segment("低价实惠", 0.50000025)]),
    expertPrior: { a: 0.2, b: 0.3, c: 0.5 },
  });
  assertAvailable(overflow, "tolerated_overflow_with_prior");
  assertNear(overflow.coverage, 1, 1e-12, "tolerated_overflow_with_prior", "coverage");
  assertNear(overflow.uncovered, 0, 1e-12, "tolerated_overflow_with_prior", "uncovered");
  assertEveryShareInRange(overflow, "tolerated_overflow_with_prior");
  assertShares(overflow, [0.5, 0, 0.5], 1e-12, "tolerated_overflow_with_prior");
}

function checkInvalidInputs(): void {
  expectError(() => estimateSemirThreeAudienceShares(input("tmall", "jd_ten", [segment("潮流人群", 1)])), "channel_system_mismatch", "invalid_system");
  expectError(() => estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", 0.4), segment("潮流人群", 0.2)])), "duplicate_segment", "duplicate_segment");
  expectError(() => estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", -0.1)])), "invalid_share", "negative_share");
  expectError(() => estimateSemirThreeAudienceShares(input("tmall", "tmall_industry_six", [segment("潮流人群", 0.7), segment("大众实用", 0.31)])), "share_total_exceeds_one", "total_exceeds_one");
  expectError(() => estimateSemirThreeAudienceShares({ ...input("tmall", "tmall_industry_six", [segment("潮流人群", 0.5)]), expertPrior: { a: 0.2, b: 0.2, c: 0.2 } }), "invalid_prior", "invalid_prior_sum");
}

function input(channel: ThreeAudienceChannel, system: NativeSegmentSystem, segments: NativeAudienceSegmentShare[]): ThreeAudienceEstimateInput {
  return { brand: "semir", channel, distribution: { system, segments } };
}

function segment(label: string, share: number): NativeAudienceSegmentShare {
  return { label, share };
}

function assertAvailable(result: ThreeAudienceEstimateResult, caseName: string): void {
  assert(result.status === "available", `expected available, got ${result.status}`, caseName);
  assert(result.shares.length === 3, `expected 3 shares, got ${result.shares.length}`, caseName);
  assertNear(result.shares.reduce((sum, share) => sum + share.share, 0), 1, 1e-9, caseName, "share sum");
}

function assertShares(result: ThreeAudienceEstimateResult, expected: [number, number, number], tolerance: number, caseName: string): void {
  assertNear(result.shares[0]?.share ?? Number.NaN, expected[0], tolerance, caseName, "A");
  assertNear(result.shares[1]?.share ?? Number.NaN, expected[1], tolerance, caseName, "B");
  assertNear(result.shares[2]?.share ?? Number.NaN, expected[2], tolerance, caseName, "C");
}

function assertEveryShareInRange(result: ThreeAudienceEstimateResult, caseName: string): void {
  for (const share of result.shares) {
    assert(share.share >= -EPS && share.share <= 1 + EPS, `${share.code} share out of range: ${share.share}`, caseName);
  }
}

function assertNear(actual: number, expected: number, tolerance: number, caseName: string, field: string): void {
  if (Math.abs(actual - expected) > tolerance) fail(caseName, `${field}: expected ${expected}, got ${actual}`);
}

function assert(condition: boolean, reason: string, caseName: string): void {
  if (!condition) fail(caseName, reason);
}

function expectError(fn: () => void, code: string, caseName: string): void {
  try {
    fn();
    fail(caseName, `expected error ${code}`);
  } catch (error) {
    if (!(error instanceof ThreeAudienceInputError)) {
      fail(caseName, `expected ${code}, got ${error instanceof Error ? error.message : String(error)}`);
    } else {
      if (error.code !== code) fail(caseName, `expected ${code}, got ${error.message}`);
      if (error.name !== "ThreeAudienceInputError") fail(caseName, `expected ThreeAudienceInputError name, got ${error.name}`);
    }
  }
}

function fail(caseName: string, reason: string): void {
  failures.push({ case: caseName, reason });
}
