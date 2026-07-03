import { diagnoseAccountFit, type AccountFitAdapterInput, type AccountFitDiagnostic } from "./account-fit.js";
import type { ProfileTagScore } from "./baseline.js";

interface ScenarioResult {
  scenario: string;
  fitScore: number;
  fitConfidence: number;
  recommendation: string;
  matchedDimensionCount: number;
  mismatchedDimensionCount: number;
  adviceCount: number;
  qualityFlags: string[];
}

interface ContractResult {
  ok: boolean;
  scenarios: ScenarioResult[];
  failures: string[];
}

const scenarios: Array<{ name: string; input: AccountFitAdapterInput; check: (result: AccountFitDiagnostic) => string[] }> = [
  {
    name: "matched",
    input: inputFixture("mock_sku_fit_match", "mock_account_fit_match", productTags(), productTags(), { accountSampleSize: 1200, productSampleSize: 1000 }, {
      legacyFitScore: { score: 0.9744, source: "legacy_dashboard", usage: "diagnostic_reference_only" },
    }),
    check: (result) => [
      result.recommendation === "priority_launch" ? "" : `matched expected priority_launch, got ${result.recommendation}`,
      result.positiveDrivers.length >= 3 ? "" : "matched expected at least 3 positive drivers",
      result.mismatchedDimensions.length === 0 ? "" : "matched expected no mismatched dimensions",
      result.legacyFitScore?.usage === "diagnostic_reference_only" ? "" : "matched expected legacyFitScore reference only",
      result.qualityFlags.includes("algorithm_pending_user_formula") ? "" : "matched must keep algorithm_pending_user_formula",
      result.qualityFlags.includes("legacy_fit_score_reference_only") ? "" : "matched expected legacy reference quality flag",
    ],
  },
  {
    name: "partial_mismatch",
    input: inputFixture("mock_sku_fit_partial", "mock_account_fit_partial", productTags(), accountTagsPartial(), { accountSampleSize: 900, productSampleSize: 900 }),
    check: (result) => [
      result.recommendation === "test_launch" || result.recommendation === "observe" ? "" : `partial expected test_launch or observe, got ${result.recommendation}`,
      result.positiveDrivers.length > 0 ? "" : "partial expected positive drivers",
      result.negativeDrivers.length > 0 ? "" : "partial expected negative drivers",
    ],
  },
  {
    name: "high_priority_adjustment",
    input: inputFixture("mock_sku_fit_gap", "mock_account_fit_gap", productTags(), accountTagsGap(), { accountSampleSize: 1000, productSampleSize: 1000 }, {
      adjustmentAdviceHints: [
        {
          adviceId: "authorized_bi_advice_age",
          priority: "high",
          dimension: "demo",
          currentProductTagId: "demo.age_35_44",
          targetAccountTagId: "demo.age_25_34",
          actionType: "content_angle_adjustment",
          direction: "款应从 [36-40] 调为 [24-30]",
          evidence: {
            productScore: 0.329,
            accountScore: 0.3483,
            gapScore: 0.0193,
            sourceField: "insightsSheet3.调整方向",
          },
        },
      ],
    }),
    check: (result) => [
      result.adjustmentAdvice.some((item) => item.priority === "high") ? "" : "gap expected high priority adjustment advice",
      result.negativeDrivers.some((driver) => driver.dimension === "price") ? "" : "gap expected price negative driver",
      result.adjustmentAdvice.every((item) => item.currentProductTagId?.includes(".") || item.targetAccountTagId?.includes(".")) ? "" : "gap advice must reference tagId",
      result.adjustmentAdvice.some((item) => item.evidence.sourceField === "insightsSheet3.调整方向") ? "" : "gap expected approved sourceField evidence",
    ],
  },
  {
    name: "low_confidence",
    input: inputFixture("mock_sku_fit_low_conf", "mock_account_fit_low_conf", productTags(0.45), productTags(0.45), {
      accountSampleSize: 120,
      productSampleSize: 180,
      accountProfileCoverageRate: 0.55,
      productProfileCoverageRate: 0.6,
    }),
    check: (result) => [
      result.qualityFlags.includes("low_fit_confidence") ? "" : "low_confidence expected low_fit_confidence flag",
      result.qualityFlags.includes("low_account_sample") ? "" : "low_confidence expected low_account_sample flag",
      result.recommendation !== "priority_launch" ? "" : "low_confidence must not recommend priority_launch",
    ],
  },
  {
    name: "unmapped_external_dimension",
    input: inputFixture("mock_sku_fit_external", "mock_account_fit_external", productTags(), productTags(), { accountSampleSize: 1000, productSampleSize: 1000 }, {
      externalDimensionDiagnostics: [
        {
          sourceField: "comparison_dimensions.八大消费群体",
          productTopLabel: "精致妈妈",
          accountTopLabel: "新锐白领",
          productScore: 0.2825,
          accountScore: 0.2462,
          gapScore: 3.63,
          confidence: 0.45,
        },
      ],
    }),
    check: (result) => [
      result.dimensionDiagnostics.some((item) => item.reasonCode === "unmapped_external_dimension") ? "" : "external expected unmapped dimension diagnostic",
      result.qualityFlags.includes("unmapped_external_dimension") ? "" : "external expected quality flag",
      result.risks.includes("unmapped_external_dimension") ? "" : "external expected risk",
      result.mismatchedDimensions.some((item) => item.sourceField === "comparison_dimensions.八大消费群体") ? "" : "external expected approved sourceField trace",
    ],
  },
];

const failures: string[] = [];
const scenarioResults: ScenarioResult[] = [];

for (const scenario of scenarios) {
  const result = diagnoseAccountFit(scenario.input);
  scenarioResults.push({
    scenario: scenario.name,
    fitScore: result.fitScore,
    fitConfidence: result.fitConfidence,
    recommendation: result.recommendation,
    matchedDimensionCount: result.matchedDimensions.length,
    mismatchedDimensionCount: result.mismatchedDimensions.length,
    adviceCount: result.adjustmentAdvice.length,
    qualityFlags: result.qualityFlags,
  });
  failures.push(...requiredFieldFailures(scenario.name, result));
  failures.push(...traceabilityFailures(scenario.name, result));
  failures.push(...scenario.check(result).filter((item) => item.length > 0));
}

const output: ContractResult = { ok: failures.length === 0, scenarios: scenarioResults, failures };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!output.ok) process.exitCode = 1;

function inputFixture(
  skuId: string,
  accountChannelId: string,
  productProfileTags: ProfileTagScore[],
  accountProfileTags: ProfileTagScore[],
  qualityMetadata: AccountFitAdapterInput["qualityMetadata"],
  overrides: Partial<Omit<AccountFitAdapterInput, "skuId" | "accountChannelId" | "productProfileTags" | "accountProfileTags" | "qualityMetadata">> = {},
): AccountFitAdapterInput {
  return { skuId, accountChannelId, productProfileTags, accountProfileTags, qualityMetadata, ...overrides };
}

function productTags(confidence = 0.84): ProfileTagScore[] {
  return [
    tag("demo.age_25_34", 0.82, confidence),
    tag("style.minimal", 0.78, confidence),
    tag("price.mid", 0.74, confidence),
    tag("occasion.work", 0.7, confidence),
    tag("intent.try_new", 0.62, confidence),
    tag("channel.short_video", 0.58, confidence),
  ];
}

function accountTagsPartial(): ProfileTagScore[] {
  return [
    tag("demo.age_25_34", 0.76, 0.82),
    tag("style.sweet", 0.7, 0.78),
    tag("price.mid", 0.72, 0.82),
    tag("occasion.travel", 0.64, 0.72),
    tag("intent.try_new", 0.6, 0.74),
    tag("channel.short_video", 0.66, 0.82),
  ];
}

function accountTagsGap(): ProfileTagScore[] {
  return [
    tag("demo.age_35_44", 0.86, 0.86),
    tag("style.elegant", 0.84, 0.86),
    tag("price.premium", 0.9, 0.9),
    tag("occasion.party", 0.78, 0.8),
    tag("intent.gift", 0.74, 0.8),
    tag("channel.live_stream", 0.72, 0.82),
  ];
}

function tag(tagId: string, score: number, confidence: number): ProfileTagScore {
  return { tagId, score, confidence, source: "mock_account_fit_contract", sampleSize: null, timeWindow: null };
}

function requiredFieldFailures(scenario: string, result: AccountFitDiagnostic): string[] {
  const failures: string[] = [];
  for (const field of ["skuId", "accountChannelId", "modelVersion", "adapterVersion", "fitScore", "fitConfidence", "matchedDimensions", "mismatchedDimensions", "positiveDrivers", "negativeDrivers", "adjustmentAdvice", "qualityFlags"] as const) {
    if (!(field in result)) failures.push(`${scenario} missing field ${field}`);
  }
  for (const field of ["dimensionDiagnostics", "risks"] as const) {
    if (!(field in result)) failures.push(`${scenario} missing field ${field}`);
  }
  if (result.fitScore < 0 || result.fitScore > 1) failures.push(`${scenario} fitScore out of range`);
  if (result.fitConfidence < 0 || result.fitConfidence > 1) failures.push(`${scenario} fitConfidence out of range`);
  if (!result.qualityFlags.includes("algorithm_pending_user_formula")) failures.push(`${scenario} missing algorithm_pending_user_formula`);
  return failures;
}

function traceabilityFailures(scenario: string, result: AccountFitDiagnostic): string[] {
  const failures: string[] = [];
  for (const driver of [...result.positiveDrivers, ...result.negativeDrivers]) {
    if (!driver.tagId.includes(".")) failures.push(`${scenario} driver tagId is not traceable: ${driver.tagId}`);
  }
  for (const item of [...result.matchedDimensions, ...result.mismatchedDimensions]) {
    if (item.productTopTagId && !item.productTopTagId.includes(".")) failures.push(`${scenario} productTopTagId is not traceable`);
    if (item.accountTopTagId && !item.accountTopTagId.includes(".")) failures.push(`${scenario} accountTopTagId is not traceable`);
    if (item.reasonCode === "unmapped_external_dimension" && !item.sourceField) failures.push(`${scenario} external dimension missing sourceField`);
  }
  for (const advice of result.adjustmentAdvice) {
    const hasTagTrace = Boolean(advice.currentProductTagId?.includes(".") || advice.targetAccountTagId?.includes("."));
    const hasSourceTrace = Boolean(advice.evidence.sourceField);
    if (!hasTagTrace && !hasSourceTrace) failures.push(`${scenario} advice missing tagId or sourceField trace`);
  }
  return failures;
}
