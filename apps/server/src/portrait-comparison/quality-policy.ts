import { checksumCanonicalJson, type JsonValue } from "./canonical-json.js";

export const PLS_COMPARISON_QUALITY_POLICY_ID = "pls-portrait-comparison-quality-policy";
export const PLS_COMPARISON_QUALITY_POLICY_VERSION = "not-released@0";

export const PLS_QUALITY_REASON_CODES = [
  "mock_source_data",
  "unstable_object_identity",
  "sample_size_below_minimum",
  "confidence_below_minimum",
  "portrait_data_stale",
  "portrait_coverage_below_minimum",
  "comparison_coverage_below_minimum",
  "statistical_sample_unavailable",
  "sample_size_below_ready",
  "confidence_below_ready",
  "portrait_coverage_incomplete",
  "source_quality_warning",
] as const;

export type PlsQualityReasonCode = (typeof PLS_QUALITY_REASON_CODES)[number];

export interface NotReleasedQualityPolicy {
  readonly policyId: typeof PLS_COMPARISON_QUALITY_POLICY_ID;
  readonly policyVersion: typeof PLS_COMPARISON_QUALITY_POLICY_VERSION;
  readonly releaseStatus: "not_released";
  readonly configChecksum: string;
  readonly reasonTaxonomy: readonly PlsQualityReasonCode[];
  readonly message: string;
}

const NOT_RELEASED_POLICY_CONFIG = {
  policyId: PLS_COMPARISON_QUALITY_POLICY_ID,
  policyVersion: PLS_COMPARISON_QUALITY_POLICY_VERSION,
  releaseStatus: "not_released",
  reasonTaxonomy: [...PLS_QUALITY_REASON_CODES],
  numericThresholds: null,
} satisfies JsonValue;

export function getProductionQualityPolicy(): NotReleasedQualityPolicy {
  return {
    policyId: PLS_COMPARISON_QUALITY_POLICY_ID,
    policyVersion: PLS_COMPARISON_QUALITY_POLICY_VERSION,
    releaseStatus: "not_released",
    configChecksum: checksumCanonicalJson(NOT_RELEASED_POLICY_CONFIG),
    reasonTaxonomy: PLS_QUALITY_REASON_CODES,
    message: "No calibrated PLS portrait comparison quality policy has been released; production Run creation must stay closed.",
  };
}
