export const JD_THREE_AUDIENCE_CALIBRATION_VERSION = "semir_three_audience_v2.1.0-jd-calibrated" as const;

export type ThreeAudienceCode = "A" | "B" | "C";

export interface ThreeAudienceWeights {
  a: number;
  b: number;
  c: number;
}

export interface JdSegmentShare {
  label: JdTenSegmentLabel;
  share: number;
}

export interface JdCalibrationFixture {
  name: string;
  year: "2025" | "2026";
  provenance: string;
  segments: JdSegmentShare[];
}

export interface JdAudienceEstimate {
  a: number;
  b: number;
  c: number;
  coverage: number;
}

export interface JdWorkbookCalibrationResult {
  name: string;
  year: "2025" | "2026";
  provenance: string;
  rawTotal: number;
  baseline: JdAudienceEstimate;
  recommended: JdAudienceEstimate;
  delta: JdAudienceEstimate;
}

export interface JdBusinessTarget {
  year: "2024" | "2025" | "2026";
  a: number;
  b: number;
  c: number;
  source: "business_confirmed_target";
  rawSegmentDataAvailable: boolean;
}

export interface JdNormalizedTarget extends JdBusinessTarget {
  normalized: ThreeAudienceWeights;
  rawSum: number;
}

export const JD_TEN_SEGMENT_LABELS = [
  "都市Z世代",
  "学生一族",
  "都市家庭",
  "都市中产",
  "小镇中产",
  "小镇青年",
  "小镇家庭",
  "都市蓝领",
  "银发一族",
  "小镇中年",
] as const;

export type JdTenSegmentLabel = (typeof JD_TEN_SEGMENT_LABELS)[number];

type AdjustableLabel = "学生一族" | "都市家庭" | "小镇中产" | "小镇家庭";
type AdjustableField = "a" | "b";

interface AdjustableVariable {
  label: AdjustableLabel;
  field: AdjustableField;
}

export const JD_V202_BASELINE_MATRIX: Record<JdTenSegmentLabel, ThreeAudienceWeights> = {
  都市Z世代: { a: 0.8, b: 0, c: 0 },
  学生一族: { a: 0.3, b: 0, c: 0.3 },
  都市家庭: { a: 0, b: 1, c: 0 },
  都市中产: { a: 0, b: 1, c: 0 },
  小镇中产: { a: 0, b: 0.4, c: 0 },
  小镇青年: { a: 0, b: 0, c: 1 },
  小镇家庭: { a: 0, b: 0, c: 0.5 },
  都市蓝领: { a: 0, b: 0, c: 1 },
  银发一族: { a: 0, b: 0, c: 0 },
  小镇中年: { a: 0, b: 0, c: 0 },
};

export const JD_RESIDUAL_TO_PRIMARY_MATRIX: Record<JdTenSegmentLabel, ThreeAudienceWeights> = {
  都市Z世代: { a: 1, b: 0, c: 0 },
  学生一族: { a: 0.5, b: 0, c: 0.5 },
  都市家庭: { a: 0, b: 1, c: 0 },
  都市中产: { a: 0, b: 1, c: 0 },
  小镇中产: { a: 0, b: 1, c: 0 },
  小镇青年: { a: 0, b: 0, c: 1 },
  小镇家庭: { a: 0, b: 0, c: 1 },
  都市蓝领: { a: 0, b: 0, c: 1 },
  银发一族: { a: 0, b: 0, c: 1 },
  小镇中年: { a: 0, b: 0, c: 1 },
};

export const JD_TARGET_CALIBRATION_PRIOR_MATRIX: Record<JdTenSegmentLabel, ThreeAudienceWeights> = {
  都市Z世代: { a: 0.8, b: 0, c: 0.2 },
  学生一族: { a: 0.28, b: 0.35, c: 0.37 },
  都市家庭: { a: 0.2, b: 0.55, c: 0.25 },
  都市中产: { a: 0.2, b: 0.8, c: 0 },
  小镇中产: { a: 0.15, b: 0.47, c: 0.38 },
  小镇青年: { a: 0.1, b: 0, c: 0.9 },
  小镇家庭: { a: 0.2, b: 0.15, c: 0.65 },
  都市蓝领: { a: 0.05, b: 0, c: 0.95 },
  银发一族: { a: 0, b: 0.3, c: 0.7 },
  小镇中年: { a: 0, b: 0.1, c: 0.9 },
};

export const JD_BUSINESS_TARGETS: JdBusinessTarget[] = [
  { year: "2024", a: 0.225, b: 0.326, c: 0.448, source: "business_confirmed_target", rawSegmentDataAvailable: false },
  { year: "2025", a: 0.221, b: 0.329, c: 0.45, source: "business_confirmed_target", rawSegmentDataAvailable: true },
  { year: "2026", a: 0.211, b: 0.347, c: 0.441, source: "business_confirmed_target", rawSegmentDataAvailable: true },
];

export const JD_CALIBRATION_FIXTURES: JdCalibrationFixture[] = [
  {
    name: "京自营26年1-6月",
    year: "2026",
    provenance: "extracted from 透视分析_京自营26年1-6月.xlsx Sheet0 十大靶群 rows on 2026-07-10",
    segments: segments({ 都市Z世代: 0.0433, 学生一族: 0.1237, 都市家庭: 0.2215, 都市中产: 0.0737, 小镇中产: 0.147, 小镇青年: 0.0407, 小镇家庭: 0.265, 都市蓝领: 0.0343, 银发一族: 0.0384, 小镇中年: 0.0124 }),
  },
  {
    name: "京自营25年",
    year: "2025",
    provenance: "extracted from 透视分析_京自营25年.xlsx Sheet0 十大靶群 rows on 2026-07-10",
    segments: segments({ 都市Z世代: 0.0221, 学生一族: 0.356, 都市家庭: 0.1664, 都市中产: 0.0415, 小镇中产: 0.0867, 小镇青年: 0.0412, 小镇家庭: 0.2092, 都市蓝领: 0.0304, 银发一族: 0.0354, 小镇中年: 0.0112 }),
  },
  {
    name: "京东森马官旗25年",
    year: "2025",
    provenance: "extracted from 透视分析_京东森马官旗25年.xlsx Sheet0 十大靶群 rows on 2026-07-10",
    segments: segments({ 都市Z世代: 0.0188, 学生一族: 0.3826, 都市家庭: 0.1527, 都市中产: 0.0329, 小镇中产: 0.0733, 小镇青年: 0.048, 小镇家庭: 0.213, 都市蓝领: 0.0319, 银发一族: 0.0343, 小镇中年: 0.0126 }),
  },
  {
    name: "森马京东官旗26年1-6月",
    year: "2026",
    provenance: "extracted from 透视分析_森马京东官旗26年1-6月.xlsx Sheet0 十大靶群 rows on 2026-07-10",
    segments: segments({ 都市Z世代: 0.0378, 学生一族: 0.1153, 都市家庭: 0.2048, 都市中产: 0.0709, 小镇中产: 0.1499, 小镇青年: 0.0531, 小镇家庭: 0.2686, 都市蓝领: 0.0404, 银发一族: 0.0417, 小镇中年: 0.0176 }),
  },
];

const ADJUSTABLE_VARIABLES: AdjustableVariable[] = [
  { label: "学生一族", field: "a" },
  { label: "学生一族", field: "b" },
  { label: "都市家庭", field: "a" },
  { label: "都市家庭", field: "b" },
  { label: "小镇中产", field: "a" },
  { label: "小镇中产", field: "b" },
  { label: "小镇家庭", field: "a" },
  { label: "小镇家庭", field: "b" },
];

export const JD_NORMALIZED_BUSINESS_TARGETS: JdNormalizedTarget[] = JD_BUSINESS_TARGETS.map((target) => {
  const rawSum = target.a + target.b + target.c;
  return { ...target, rawSum, normalized: { a: target.a / rawSum, b: target.b / rawSum, c: target.c / rawSum } };
});

export const JD_RECOMMENDED_CALIBRATED_MATRIX: Record<JdTenSegmentLabel, ThreeAudienceWeights> = deriveJdTargetCalibratedMatrix();

export function deriveJdTargetCalibratedMatrix(): Record<JdTenSegmentLabel, ThreeAudienceWeights> {
  const constraints = buildTargetConstraints();
  const priorVector = ADJUSTABLE_VARIABLES.map(({ label, field }) => JD_TARGET_CALIBRATION_PRIOR_MATRIX[label][field]);
  const adjustment = solveLinearSystem(
    multiplyMatrix(constraints.matrix, transpose(constraints.matrix)),
    subtractVectors(constraints.target, multiplyMatrixVector(constraints.matrix, priorVector)),
  );
  const calibratedVector = addVectors(priorVector, multiplyMatrixVector(transpose(constraints.matrix), adjustment));
  const matrix = cloneMatrix(JD_TARGET_CALIBRATION_PRIOR_MATRIX);
  ADJUSTABLE_VARIABLES.forEach(({ label, field }, index) => {
    matrix[label][field] = roundWeight(calibratedVector[index] ?? 0);
  });
  for (const label of JD_TEN_SEGMENT_LABELS) {
    matrix[label].c = roundWeight(1 - matrix[label].a - matrix[label].b);
  }
  const failures = matrixRowSumFailures(matrix);
  if (failures.length > 0) throw new Error(`Derived JD calibration matrix is invalid: ${failures.join("; ")}`);
  return matrix;
}

export function estimateJdThreeAudienceShares(
  segments: JdSegmentShare[],
  matrix: Record<JdTenSegmentLabel, ThreeAudienceWeights> = JD_RECOMMENDED_CALIBRATED_MATRIX,
): JdAudienceEstimate {
  let a = 0;
  let b = 0;
  let c = 0;
  for (const segment of segments) {
    const weights = matrix[segment.label];
    a += segment.share * weights.a;
    b += segment.share * weights.b;
    c += segment.share * weights.c;
  }
  return { a, b, c, coverage: a + b + c };
}

export function matrixRowSumFailures(matrix: Record<JdTenSegmentLabel, ThreeAudienceWeights>, tolerance = 1e-9): string[] {
  const failures: string[] = [];
  for (const label of JD_TEN_SEGMENT_LABELS) {
    const weights = matrix[label];
    const values = [weights.a, weights.b, weights.c];
    if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      failures.push(`${label} has weight outside [0,1]`);
      continue;
    }
    const total = weights.a + weights.b + weights.c;
    if (Math.abs(total - 1) > tolerance) failures.push(`${label} row sum ${total}`);
  }
  return failures;
}

export function buildJdCalibrationReportRows(fixtures: JdCalibrationFixture[] = JD_CALIBRATION_FIXTURES): JdWorkbookCalibrationResult[] {
  return fixtures.map((fixture) => {
    const baseline = estimateJdThreeAudienceShares(fixture.segments, JD_V202_BASELINE_MATRIX);
    const recommended = estimateJdThreeAudienceShares(fixture.segments, JD_RECOMMENDED_CALIBRATED_MATRIX);
    return {
      name: fixture.name,
      year: fixture.year,
      provenance: fixture.provenance,
      rawTotal: sumShares(fixture.segments),
      baseline,
      recommended,
      delta: {
        a: recommended.a - baseline.a,
        b: recommended.b - baseline.b,
        c: recommended.c - baseline.c,
        coverage: recommended.coverage - baseline.coverage,
      },
    };
  });
}

export function buildAnnualAverageSegments(year: "2025" | "2026", fixtures: JdCalibrationFixture[] = JD_CALIBRATION_FIXTURES): JdSegmentShare[] {
  const yearFixtures = fixtures.filter((fixture) => fixture.year === year);
  if (yearFixtures.length === 0) throw new Error(`No JD calibration fixtures for ${year}`);
  return JD_TEN_SEGMENT_LABELS.map((label) => ({
    label,
    share: yearFixtures.reduce((sum, fixture) => sum + normalizeSegments(fixture.segments).find((segment) => segment.label === label)!.share / yearFixtures.length, 0),
  }));
}

export function normalizeSegments(input: JdSegmentShare[]): JdSegmentShare[] {
  const total = sumShares(input);
  if (!Number.isFinite(total) || total <= 0) throw new Error(`Cannot normalize JD segments with total ${total}`);
  return input.map((segment) => ({ ...segment, share: segment.share / total }));
}

export function sumShares(segments: JdSegmentShare[]): number {
  return segments.reduce((sum, segment) => sum + segment.share, 0);
}

function buildTargetConstraints(): { matrix: number[][]; target: number[] } {
  const rows: number[][] = [];
  const target: number[] = [];
  for (const year of ["2025", "2026"] as const) {
    const annualSegments = buildAnnualAverageSegments(year);
    const normalizedTarget = JD_NORMALIZED_BUSINESS_TARGETS.find((item) => item.year === year);
    if (!normalizedTarget) throw new Error(`Missing JD business target for ${year}`);
    for (const field of ["a", "b"] as const) {
      rows.push(ADJUSTABLE_VARIABLES.map((variable) => (variable.field === field ? shareForLabel(annualSegments, variable.label) : 0)));
      target.push(normalizedTarget.normalized[field] - fixedContribution(annualSegments, field));
    }
  }
  return { matrix: rows, target };
}

function fixedContribution(segments: JdSegmentShare[], field: AdjustableField): number {
  const adjustableLabels = new Set<JdTenSegmentLabel>(ADJUSTABLE_VARIABLES.map((variable) => variable.label));
  return segments.reduce((sum, segment) => {
    if (adjustableLabels.has(segment.label)) return sum;
    return sum + segment.share * JD_TARGET_CALIBRATION_PRIOR_MATRIX[segment.label][field];
  }, 0);
}

function shareForLabel(segments: JdSegmentShare[], label: JdTenSegmentLabel): number {
  const segment = segments.find((item) => item.label === label);
  if (!segment) throw new Error(`Missing JD segment ${label}`);
  return segment.share;
}

function cloneMatrix(matrix: Record<JdTenSegmentLabel, ThreeAudienceWeights>): Record<JdTenSegmentLabel, ThreeAudienceWeights> {
  return Object.fromEntries(JD_TEN_SEGMENT_LABELS.map((label) => [label, { ...matrix[label] }])) as Record<JdTenSegmentLabel, ThreeAudienceWeights>;
}

function segments(input: Record<JdTenSegmentLabel, number>): JdSegmentShare[] {
  return JD_TEN_SEGMENT_LABELS.map((label) => ({ label, share: input[label] }));
}

function roundWeight(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function addVectors(left: number[], right: number[]): number[] {
  return left.map((value, index) => value + (right[index] ?? 0));
}

function subtractVectors(left: number[], right: number[]): number[] {
  return left.map((value, index) => value - (right[index] ?? 0));
}

function transpose(matrix: number[][]): number[][] {
  const first = matrix[0];
  if (!first) return [];
  return first.map((_, columnIndex) => matrix.map((row) => row[columnIndex] ?? 0));
}

function multiplyMatrix(left: number[][], right: number[][]): number[][] {
  const rightT = transpose(right);
  return left.map((row) => rightT.map((column) => row.reduce((sum, value, index) => sum + value * (column[index] ?? 0), 0)));
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0));
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]![column] ?? 0) > Math.abs(augmented[pivot]![column] ?? 0)) pivot = row;
    }
    const pivotValue = augmented[pivot]![column] ?? 0;
    if (Math.abs(pivotValue) < 1e-12) throw new Error("JD calibration constraints are singular");
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    for (let valueColumn = column; valueColumn <= n; valueColumn += 1) augmented[column]![valueColumn] = (augmented[column]![valueColumn] ?? 0) / pivotValue;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column] ?? 0;
      for (let valueColumn = column; valueColumn <= n; valueColumn += 1) {
        augmented[row]![valueColumn] = (augmented[row]![valueColumn] ?? 0) - factor * (augmented[column]![valueColumn] ?? 0);
      }
    }
  }
  return augmented.map((row) => row[n] ?? 0);
}
