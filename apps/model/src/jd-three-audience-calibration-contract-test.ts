import {
  buildJdCalibrationReportRows,
  buildAnnualAverageSegments,
  estimateJdThreeAudienceShares,
  JD_CALIBRATION_FIXTURES,
  JD_NORMALIZED_BUSINESS_TARGETS,
  JD_RECOMMENDED_CALIBRATED_MATRIX,
  JD_TEN_SEGMENT_LABELS,
  JD_V202_BASELINE_MATRIX,
  matrixRowSumFailures,
  sumShares,
  type JdSegmentShare,
} from "./jd-three-audience-calibration.js";

interface ContractOutput {
  ok: boolean;
  workbookCount: number;
  failures: string[];
}

const EPS = 1e-9;
const SOURCE_TOTAL_TOLERANCE = 0.0001 + 1e-12;
const YEAR_TARGET_TOLERANCE = 1e-9;

const failures: string[] = [];

failures.push(...matrixRowSumFailures(JD_RECOMMENDED_CALIBRATED_MATRIX));

for (const label of JD_TEN_SEGMENT_LABELS) {
  const baseline = JD_V202_BASELINE_MATRIX[label];
  const recommended = JD_RECOMMENDED_CALIBRATED_MATRIX[label];
  if (baseline.a > 0 && recommended.a <= 0) failures.push(`${label} removed baseline A contribution`);
  if (baseline.b > 0 && recommended.b <= 0) failures.push(`${label} removed baseline B contribution`);
  if (baseline.c > 0 && recommended.c <= 0) failures.push(`${label} removed baseline C contribution`);
}

for (const fixture of JD_CALIBRATION_FIXTURES) {
  const segments = fixture.segments;
  const labels = new Set(segments.map((segment) => segment.label));
  const total = sumShares(segments);
  if (segments.length !== JD_TEN_SEGMENT_LABELS.length) failures.push(`${fixture.name} expected 10 JD segments, got ${segments.length}`);
  for (const label of JD_TEN_SEGMENT_LABELS) {
    if (!labels.has(label)) failures.push(`${fixture.name} missing ${label}`);
  }
  if (Math.abs(total - 1) > SOURCE_TOTAL_TOLERANCE) failures.push(`${fixture.name} raw total ${total}`);

  const first = estimateJdThreeAudienceShares(segments);
  const second = estimateJdThreeAudienceShares([...segments].reverse());
  if (Math.abs(first.coverage - 1) > SOURCE_TOTAL_TOLERANCE) failures.push(`${fixture.name} coverage ${first.coverage}`);
  if (Math.abs(first.a + first.b + first.c - first.coverage) > EPS) failures.push(`${fixture.name} raw sum mismatch`);
  if ([first.a, first.b, first.c].some((value) => value < -EPS)) failures.push(`${fixture.name} has negative output`);
  if (Math.abs(first.a - second.a) > EPS || Math.abs(first.b - second.b) > EPS || Math.abs(first.c - second.c) > EPS) {
    failures.push(`${fixture.name} result is not deterministic`);
  }
}

for (const label of JD_TEN_SEGMENT_LABELS) {
  const single: JdSegmentShare[] = [{ label, share: 1 }];
  const result = estimateJdThreeAudienceShares(single);
  if (Math.abs(result.coverage - 1) > EPS) failures.push(`${label} single-row coverage ${result.coverage}`);
  if (Math.abs(result.a + result.b + result.c - 1) > EPS) failures.push(`${label} single-row A/B/C sum mismatch`);
}

const reportRows = buildJdCalibrationReportRows();
if (reportRows.length !== JD_CALIBRATION_FIXTURES.length) failures.push(`Report row count ${reportRows.length}`);

for (const target of JD_NORMALIZED_BUSINESS_TARGETS.filter((item) => item.rawSegmentDataAvailable)) {
  if (target.year !== "2025" && target.year !== "2026") continue;
  const average = estimateJdThreeAudienceShares(buildAnnualAverageSegments(target.year));
  if (Math.abs(average.a - target.normalized.a) > YEAR_TARGET_TOLERANCE) failures.push(`${target.year} A average ${average.a}`);
  if (Math.abs(average.b - target.normalized.b) > YEAR_TARGET_TOLERANCE) failures.push(`${target.year} B average ${average.b}`);
  if (Math.abs(average.c - target.normalized.c) > YEAR_TARGET_TOLERANCE) failures.push(`${target.year} C average ${average.c}`);
}

const output: ContractOutput = { ok: failures.length === 0, workbookCount: reportRows.length, failures };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!output.ok) process.exitCode = 1;
