import {
  JD_RECOMMENDED_CALIBRATED_MATRIX,
  JD_THREE_AUDIENCE_CALIBRATION_VERSION,
  type JdTenSegmentLabel,
  type ThreeAudienceWeights,
} from "./jd-three-audience-calibration.js";

export const THREE_AUDIENCE_ALGORITHM_VERSION = JD_THREE_AUDIENCE_CALIBRATION_VERSION;

export type ThreeAudienceChannel = "douyin" | "tmall" | "jd" | "offline" | "vip" | "wechat_channels" | "pinduoduo";
export type NativeSegmentSystem = "douyin_eight" | "tmall_industry_six" | "jd_ten" | "offline_industry_six" | "vip_eleven" | "wechat_channels_seven" | "pinduoduo_ten";
export type ThreeAudienceCode = "A" | "B" | "C";
export type ThreeAudienceName = "质感流行派" | "都市体面家" | "百搭优选客";
export type ThreeAudienceMode = "covered_normalized" | "expert_prior_blended";

export interface NativeAudienceSegmentShare {
  label: string;
  share: number;
}

export interface ThreeAudiencePrior {
  a: number;
  b: number;
  c: number;
}

export interface ThreeAudienceEstimateInput {
  brand: "semir";
  channel: ThreeAudienceChannel;
  distribution: {
    system: NativeSegmentSystem;
    segments: NativeAudienceSegmentShare[];
  };
  expertPrior?: ThreeAudiencePrior;
}

export interface ThreeAudienceShare {
  code: ThreeAudienceCode;
  name: ThreeAudienceName;
  share: number;
}

export interface ThreeAudienceEstimateResult {
  status: "available" | "unavailable";
  algorithmVersion: typeof THREE_AUDIENCE_ALGORITHM_VERSION;
  channel: ThreeAudienceChannel;
  system: NativeSegmentSystem;
  mode: ThreeAudienceMode;
  coverage: number;
  uncovered: number;
  shares: ThreeAudienceShare[];
  unmappedSegments: NativeAudienceSegmentShare[];
  qualityFlags: string[];
}

export class ThreeAudienceInputError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ThreeAudienceInputError";
  }
}

type Matrix = ReadonlyMap<string, ThreeAudienceWeights>;

const INPUT_TOTAL_TOLERANCE = 1e-6;
const JD_SOURCE_ROUNDING_TOLERANCE = 0.0001 + 1e-12;

const CHANNEL_SYSTEM: Record<ThreeAudienceChannel, NativeSegmentSystem> = {
  douyin: "douyin_eight",
  tmall: "tmall_industry_six",
  jd: "jd_ten",
  offline: "offline_industry_six",
  vip: "vip_eleven",
  wechat_channels: "wechat_channels_seven",
  pinduoduo: "pinduoduo_ten",
};

const AUDIENCE_NAMES: Record<ThreeAudienceCode, ThreeAudienceName> = {
  A: "质感流行派",
  B: "都市体面家",
  C: "百搭优选客",
};

const DOUYIN_MATRIX = matrix({
  新锐白领: { a: 0.8, b: 0.1, c: 0.1 },
  genz: { a: 0.45, b: 0.05, c: 0.5 },
  精致妈妈: { a: 0.15, b: 0.5, c: 0.35 },
  资深中产: { a: 0.1, b: 0.7, c: 0.2 },
  都市蓝领: { a: 0.05, b: 0.1, c: 0.85 },
  小镇青年: { a: 0.1, b: 0.05, c: 0.85 },
  都市银发: { a: 0.05, b: 0.3, c: 0.65 },
  小镇中老年: { a: 0, b: 0.1, c: 0.9 },
});

const INDUSTRY_SIX_MATRIX = matrix({
  潮流人群: { a: 1, b: 0, c: 0 },
  高阶时尚: { a: 0.4, b: 0.6, c: 0 },
  品质生活: { a: 0, b: 1, c: 0 },
  大众实用: { a: 0, b: 0.25, c: 0.75 },
  低价实惠: { a: 0, b: 0, c: 1 },
  低价有颜: { a: 0, b: 0, c: 1 },
});

const JD_MATRIX = matrix(JD_RECOMMENDED_CALIBRATED_MATRIX);

const VIP_MATRIX = matrix({
  青年女士: { a: 0.22, b: 0.28, c: 0.5 },
  中年女士: { a: 0.12, b: 0.42, c: 0.46 },
  妈妈人群: { a: 0.12, b: 0.42, c: 0.46 },
  年轻女士: { a: 0.38, b: 0.05, c: 0.57 },
  青年男士: { a: 0.22, b: 0.28, c: 0.5 },
  新生代女士: { a: 0.38, b: 0.05, c: 0.57 },
  中年男士: { a: 0.12, b: 0.52, c: 0.36 },
  年轻男士: { a: 0.38, b: 0.05, c: 0.57 },
  新生代男士: { a: 0.38, b: 0.05, c: 0.57 },
  银发男士: { a: 0.05, b: 0.3, c: 0.65 },
  银发女士: { a: 0.05, b: 0.3, c: 0.65 },
});

const WECHAT_CHANNELS_MATRIX = matrix({
  新锐白领: { a: 0.8, b: 0.1, c: 0.1 },
  Z世代: { a: 0.45, b: 0.1, c: 0.45 },
  资深中产: { a: 0.1, b: 0.55, c: 0.35 },
  都市银发: { a: 0.05, b: 0.5, c: 0.45 },
  都市蓝领: { a: 0.05, b: 0.15, c: 0.8 },
  小镇青年: { a: 0.1, b: 0.1, c: 0.8 },
  小镇中老年: { a: 0, b: 0.2, c: 0.8 },
});

const MATRIX_BY_CHANNEL: Record<ThreeAudienceChannel, Matrix> = {
  douyin: DOUYIN_MATRIX,
  tmall: INDUSTRY_SIX_MATRIX,
  jd: JD_MATRIX,
  offline: INDUSTRY_SIX_MATRIX,
  vip: VIP_MATRIX,
  wechat_channels: WECHAT_CHANNELS_MATRIX,
  pinduoduo: DOUYIN_MATRIX,
};

export function estimateSemirThreeAudienceShares(input: ThreeAudienceEstimateInput): ThreeAudienceEstimateResult {
  validateInput(input);
  const matrixForChannel = MATRIX_BY_CHANNEL[input.channel];
  const normalizedSegments = normalizeNativeSegments(input.channel, input.distribution.segments);
  let aRaw = 0;
  let bRaw = 0;
  let cRaw = 0;
  const unmappedSegments: NativeAudienceSegmentShare[] = [];

  for (const segment of normalizedSegments) {
    const weights = matrixForChannel.get(segment.label);
    if (!weights) {
      unmappedSegments.push(segment);
      continue;
    }
    aRaw += segment.share * weights.a;
    bRaw += segment.share * weights.b;
    cRaw += segment.share * weights.c;
  }

  const coverage = clamp01(aRaw + bRaw + cRaw);
  const uncovered = clamp01(1 - coverage);
  const qualityFlags = qualityFlagsFor(coverage, unmappedSegments);
  const mode: ThreeAudienceMode = input.expertPrior ? "expert_prior_blended" : "covered_normalized";
  if (coverage === 0) {
    return {
      status: "unavailable",
      algorithmVersion: THREE_AUDIENCE_ALGORITHM_VERSION,
      channel: input.channel,
      system: input.distribution.system,
      mode,
      coverage,
      uncovered,
      shares: [],
      unmappedSegments,
      qualityFlags: [...qualityFlags, "no_covered_segments"],
    };
  }

  const covered = { a: aRaw / coverage, b: bRaw / coverage, c: cRaw / coverage };
  const finalShares = input.expertPrior
    ? {
        a: coverage * covered.a + uncovered * input.expertPrior.a,
        b: coverage * covered.b + uncovered * input.expertPrior.b,
        c: coverage * covered.c + uncovered * input.expertPrior.c,
      }
    : covered;

  return {
    status: "available",
    algorithmVersion: THREE_AUDIENCE_ALGORITHM_VERSION,
    channel: input.channel,
    system: input.distribution.system,
    mode,
    coverage,
    uncovered,
    shares: toShares(finalShares),
    unmappedSegments,
    qualityFlags,
  };
}

function validateInput(input: ThreeAudienceEstimateInput): void {
  if (input.brand !== "semir") throw new ThreeAudienceInputError("unsupported_brand", `Unsupported brand: ${input.brand}`);
  const expectedSystem = CHANNEL_SYSTEM[input.channel];
  if (input.distribution.system !== expectedSystem) {
    throw new ThreeAudienceInputError("channel_system_mismatch", `${input.channel} requires ${expectedSystem}, got ${input.distribution.system}`);
  }
  const seenLabels = new Set<string>();
  let total = 0;
  for (const segment of input.distribution.segments) {
    if (seenLabels.has(segment.label)) throw new ThreeAudienceInputError("duplicate_segment", `Duplicate segment: ${segment.label}`);
    seenLabels.add(segment.label);
    if (!Number.isFinite(segment.share) || segment.share < 0 || segment.share > 1) {
      throw new ThreeAudienceInputError("invalid_share", `Invalid share for ${segment.label}: ${segment.share}`);
    }
    total += segment.share;
  }
  if (total > 1 + inputTotalTolerance(input.channel)) throw new ThreeAudienceInputError("share_total_exceeds_one", `Input share total exceeds 1: ${total}`);
  if (input.expertPrior) validatePrior(input.expertPrior);
}

function validatePrior(prior: ThreeAudiencePrior): void {
  const values = [prior.a, prior.b, prior.c];
  if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new ThreeAudienceInputError("invalid_prior", "Expert prior values must be finite and in [0,1]");
  }
  const total = prior.a + prior.b + prior.c;
  if (Math.abs(total - 1) > 1e-6) throw new ThreeAudienceInputError("invalid_prior", `Expert prior must sum to 1, got ${total}`);
}

function normalizeNativeSegments(channel: ThreeAudienceChannel, segments: NativeAudienceSegmentShare[]): NativeAudienceSegmentShare[] {
  const total = segments.reduce((sum, segment) => sum + segment.share, 0);
  const scale = total > 1 && total <= 1 + inputTotalTolerance(channel) ? total : 1;
  const merged = new Map<string, number>();
  for (const segment of segments) {
    const label = normalizeLabel(channel, segment.label);
    merged.set(label, (merged.get(label) ?? 0) + segment.share / scale);
  }
  return [...merged.entries()].map(([label, share]) => ({ label, share }));
}

function inputTotalTolerance(channel: ThreeAudienceChannel): number {
  return channel === "jd" ? JD_SOURCE_ROUNDING_TOLERANCE : INPUT_TOTAL_TOLERANCE;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeLabel(channel: ThreeAudienceChannel, label: string): string {
  if (channel === "douyin" && label === "Z世代") return "genz";
  if (channel === "wechat_channels") {
    if (label === "小镇中青年") return "小镇中老年";
    if (label === "精致妈妈" || label === "精致中产") return "资深中产";
  }
  if (channel === "pinduoduo") {
    if (label === "都市白领") return "新锐白领";
    if (label === "都市Z世代" || label === "学生") return "genz";
    if (label === "都市中产" || label === "小资中年") return "资深中产";
    if (label === "小镇银发") return "小镇中老年";
  }
  return label;
}

function qualityFlagsFor(coverage: number, unmappedSegments: NativeAudienceSegmentShare[]): string[] {
  const flags: string[] = [];
  if (coverage < 0.8) flags.push("low_coverage");
  else if (coverage < 0.9) flags.push("partial_coverage");
  if (unmappedSegments.length > 0) flags.push("unmapped_segments_present");
  return flags;
}

function toShares(shares: ThreeAudiencePrior): ThreeAudienceShare[] {
  return [
    { code: "A", name: AUDIENCE_NAMES.A, share: shares.a },
    { code: "B", name: AUDIENCE_NAMES.B, share: shares.b },
    { code: "C", name: AUDIENCE_NAMES.C, share: shares.c },
  ];
}

function matrix(input: Record<string, ThreeAudienceWeights> | Record<JdTenSegmentLabel, ThreeAudienceWeights>): Matrix {
  return new Map(Object.entries(input));
}
