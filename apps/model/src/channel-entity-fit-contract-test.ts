import {
  explainChannelEntityFit,
  type BusinessScenario,
  type ChannelEntityFit,
  type ChannelEntityProfileV2,
  type MarketingEvent,
  type ProductFitProfile,
  type ProductProfileForChannelEntityFit,
} from "./channel-entity-fit.js";
import type { ProfileTagScore } from "./baseline.js";

interface ContractResult {
  ok: boolean;
  scenarios: string[];
  failures: string[];
}

const failures: string[] = [];
const checkedScenarios: string[] = [];

const scenarios: Array<{ name: string; input: Parameters<typeof explainChannelEntityFit>[0]; check: (fit: ChannelEntityFit) => string[] }> = [
  {
    name: "with_product_fit",
    input: {
      productProfile: productProfile({
        tags: productTagsFull(),
        productDNA: { categoryLv1: "apparel", categoryLv2: "dress", priceBand: "mid", styleKeywords: ["minimal"], launchType: "new_arrival" },
      }),
      channelProfile: channelProfile({
        audienceTags: audienceTagsMatch(),
        productFitProfile: fullProductFitProfile(),
      }),
    },
    check: (fit) => [
      fit.audienceFit > 0 ? "" : "with_product_fit expected positive audienceFit",
      fit.productFit !== null && fit.productFit > 0 ? "" : "with_product_fit expected positive productFit",
      fit.baseScore === round(0.7 * fit.audienceFit + 0.3 * (fit.productFit ?? 0)) ? "" : `with_product_fit baseScore formula mismatch: ${fit.baseScore}`,
      fit.contextAdjustedScore === fit.baseScore ? "" : "with_product_fit without context expected contextAdjustedScore == baseScore",
      fit.recommendation === "priority_launch" ? "" : `with_product_fit expected priority_launch, got ${fit.recommendation}`,
      fit.audienceDrivers.length > 0 ? "" : "with_product_fit expected audienceDrivers",
      fit.productFitDrivers.length > 0 ? "" : "with_product_fit expected productFitDrivers",
      fit.qualityFlags.includes("algorithm_pending_user_formula") ? "" : "with_product_fit expected algorithm_pending_user_formula",
    ],
  },
  {
    name: "missing_product_fit",
    input: {
      productProfile: productProfile({
        tags: productTagsFull(),
        productDNA: { categoryLv1: "apparel", categoryLv2: "dress", priceBand: "mid", styleKeywords: ["minimal"], launchType: "new_arrival" },
      }),
      channelProfile: channelProfile({ audienceTags: audienceTagsMatch() }),
    },
    check: (fit) => [
      fit.productFit === null ? "" : "missing_product_fit expected productFit null",
      fit.baseScore === fit.audienceFit ? "" : "missing_product_fit expected baseScore == audienceFit",
      fit.qualityFlags.includes("missing_product_fit_profile") ? "" : "missing_product_fit expected missing_product_fit_profile flag",
      fit.riskFlags.includes("missing_product_fit_profile") ? "" : "missing_product_fit expected missing_product_fit_profile risk",
      fit.recommendation !== "avoid" ? "" : "missing_product_fit should not default to avoid for matching audience",
    ],
  },
  {
    name: "new_product_launch",
    input: {
      productProfile: productProfile({
        tags: productTagsFull(),
        productDNA: { categoryLv1: "apparel", categoryLv2: "dress", priceBand: "mid", styleKeywords: ["minimal"], launchType: "new_arrival" },
      }),
      channelProfile: channelProfile({
        audienceTags: audienceTagsMatch(),
        productFitProfile: fullProductFitProfile(),
      }),
      businessScenario: { scenarioType: "new_product_launch" },
    },
    check: (fit) => [
      fit.contextWeightAdjustments.some((item) => item.active && item.dimension === "intent") ? "" : "new_product_launch expected active intent adjustment",
      fit.contextAdjustedScore > fit.baseScore ? "" : "new_product_launch expected contextAdjustedScore > baseScore",
      fit.contextDrivers.length > 0 ? "" : "new_product_launch expected contextDrivers",
      !("eventScore" in fit) ? "" : "new_product_launch must not expose eventScore",
      !("scenarioScore" in fit) ? "" : "new_product_launch must not expose scenarioScore",
    ],
  },
  {
    name: "member_repurchase",
    input: {
      productProfile: productProfile({
        tags: [tag("demo.female", 0.8), tag("style.basic", 0.78), tag("price.mid", 0.74), tag("occasion.daily", 0.7), tag("intent.repeat_purchase", 0.72)],
        productDNA: { categoryLv1: "apparel", categoryLv2: "top", priceBand: "mid", styleKeywords: ["basic"], launchType: "regular" },
      }),
      channelProfile: channelProfile({
        audienceTags: [tag("demo.female", 0.78), tag("style.basic", 0.76), tag("price.mid", 0.72), tag("occasion.daily", 0.68)],
        productFitProfile: {
          fitCategories: ["apparel"],
          fitPriceBands: ["mid"],
          fitStyles: ["basic"],
          fitOccasions: ["daily"],
          fitLaunchTypes: ["regular"],
          confidence: 0.82,
          qualityFlags: [],
        },
      }),
      businessScenario: { scenarioType: "member_repurchase" },
    },
    check: (fit) => [
      fit.contextWeightAdjustments.some((item) => item.active && item.dimension === "intent" && item.tagId === "intent.repeat_purchase")
        ? ""
        : "member_repurchase expected active repeat_purchase intent adjustment",
      fit.contextAdjustedScore > fit.baseScore ? "" : "member_repurchase expected contextAdjustedScore > baseScore",
      fit.contextDrivers.some((driver) => driver.dimension === "intent") ? "" : "member_repurchase expected intent contextDriver",
    ],
  },
  {
    name: "traditional_holiday",
    input: {
      productProfile: productProfile({
        tags: [tag("demo.female", 0.8), tag("style.elegant", 0.78), tag("price.premium", 0.74), tag("occasion.seasonal", 0.7), tag("intent.gift", 0.72)],
        productDNA: { categoryLv1: "apparel", categoryLv2: "dress", priceBand: "premium", styleKeywords: ["elegant"], launchType: "new_arrival" },
      }),
      channelProfile: channelProfile({
        audienceTags: [tag("demo.female", 0.78), tag("style.elegant", 0.76), tag("price.premium", 0.72), tag("occasion.seasonal", 0.68)],
        productFitProfile: {
          fitCategories: ["apparel", "dress"],
          fitPriceBands: ["premium"],
          fitStyles: ["elegant"],
          fitOccasions: ["seasonal"],
          fitLaunchTypes: ["new_arrival"],
          confidence: 0.85,
          qualityFlags: [],
        },
      }),
      marketingEvent: { eventType: "traditional_holiday" },
    },
    check: (fit) => [
      fit.contextWeightAdjustments.some((item) => item.active && item.dimension === "intent" && item.tagId === "intent.gift")
        ? ""
        : "traditional_holiday expected active gift intent adjustment",
      fit.contextAdjustedScore > fit.baseScore ? "" : "traditional_holiday expected contextAdjustedScore > baseScore",
      fit.contextDrivers.some((driver) => driver.dimension === "intent" || driver.dimension === "occasion")
        ? ""
        : "traditional_holiday expected intent or occasion contextDriver",
    ],
  },
  {
    name: "platform_promotion",
    input: {
      productProfile: productProfile({
        tags: [tag("demo.female", 0.8), tag("style.basic", 0.78), tag("price.value", 0.74), tag("price.promo_sensitive", 0.72), tag("intent.repeat_purchase", 0.66)],
        productDNA: { categoryLv1: "apparel", categoryLv2: "top", priceBand: "value", styleKeywords: ["basic"], launchType: "regular" },
      }),
      channelProfile: channelProfile({
        audienceTags: [tag("demo.female", 0.78), tag("style.basic", 0.76), tag("price.value", 0.72)],
        productFitProfile: {
          fitCategories: ["apparel"],
          fitPriceBands: ["value", "promo_sensitive"],
          fitStyles: ["basic"],
          fitOccasions: ["daily"],
          fitLaunchTypes: ["regular"],
          confidence: 0.85,
          qualityFlags: [],
        },
      }),
      marketingEvent: { eventType: "platform_promotion" },
    },
    check: (fit) => [
      fit.contextWeightAdjustments.some((item) => item.active && item.dimension === "price")
        ? ""
        : "platform_promotion expected active price adjustment",
      fit.contextAdjustedScore > fit.baseScore ? "" : "platform_promotion expected contextAdjustedScore > baseScore",
      fit.contextDrivers.some((driver) => driver.dimension === "price" || driver.dimension === "intent")
        ? ""
        : "platform_promotion expected price or intent contextDriver",
    ],
  },
];

for (const scenario of scenarios) {
  const fit = explainChannelEntityFit(scenario.input);
  checkedScenarios.push(scenario.name);
  failures.push(...requiredFieldFailures(scenario.name, fit));
  failures.push(...traceabilityFailures(scenario.name, fit));
  failures.push(...scenario.check(fit).filter((item) => item.length > 0));
}

const output: ContractResult = { ok: failures.length === 0, scenarios: checkedScenarios, failures };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!output.ok) process.exitCode = 1;

function requiredFieldFailures(scenario: string, fit: ChannelEntityFit): string[] {
  const requiredFields = [
    "skuId",
    "channelId",
    "channelType",
    "modelVersion",
    "contractVersion",
    "audienceFit",
    "productFit",
    "baseScore",
    "contextWeightAdjustments",
    "contextAdjustedScore",
    "confidence",
    "recommendation",
    "audienceDrivers",
    "productFitDrivers",
    "contextDrivers",
    "riskFlags",
    "qualityFlags",
  ] as const;
  const fieldFailures: string[] = [];
  for (const field of requiredFields) {
    if (!(field in fit)) fieldFailures.push(`${scenario} missing ChannelEntityFit field: ${field}`);
  }
  if (fit.audienceFit < 0 || fit.audienceFit > 1) fieldFailures.push(`${scenario} audienceFit out of range`);
  if (fit.productFit !== null && (fit.productFit < 0 || fit.productFit > 1)) fieldFailures.push(`${scenario} productFit out of range`);
  if (fit.baseScore < 0 || fit.baseScore > 1) fieldFailures.push(`${scenario} baseScore out of range`);
  if (fit.contextAdjustedScore < 0 || fit.contextAdjustedScore > 1) fieldFailures.push(`${scenario} contextAdjustedScore out of range`);
  if (fit.confidence < 0 || fit.confidence > 1) fieldFailures.push(`${scenario} confidence out of range`);
  if (!fit.riskFlags.includes("algorithm_pending_user_formula")) fieldFailures.push(`${scenario} missing algorithm_pending_user_formula risk`);
  if (!fit.qualityFlags.includes("algorithm_pending_user_formula")) fieldFailures.push(`${scenario} missing algorithm_pending_user_formula quality flag`);
  if ("eventScore" in fit) fieldFailures.push(`${scenario} must not expose eventScore`);
  if ("scenarioScore" in fit) fieldFailures.push(`${scenario} must not expose scenarioScore`);
  return fieldFailures;
}

function traceabilityFailures(scenario: string, fit: ChannelEntityFit): string[] {
  const traceFailures: string[] = [];
  for (const driver of [...fit.audienceDrivers, ...fit.productFitDrivers, ...fit.contextDrivers]) {
    if (driver.tagId && !driver.tagId.includes(".")) traceFailures.push(`${scenario} driver tagId not traceable: ${driver.tagId}`);
    if (driver.contextReason && driver.reasonCode !== "context_boost" && driver.reasonCode !== "context_penalty") {
      traceFailures.push(`${scenario} context driver must use context reason code`);
    }
  }
  for (const adjustment of fit.contextWeightAdjustments) {
    if (!adjustment.dimension) traceFailures.push(`${scenario} context adjustment missing dimension`);
    if (adjustment.adjustment <= 0) traceFailures.push(`${scenario} context adjustment must be positive`);
  }
  return traceFailures;
}

function productProfile(options: {
  tags: ProfileTagScore[];
  productDNA?: ProductProfileForChannelEntityFit["productDNA"];
  sampleSize?: number;
}): ProductProfileForChannelEntityFit {
  return {
    skuId: "mock_p6_sku",
    predictedProfileTags: options.tags,
    productDNA: options.productDNA,
    sampleSize: options.sampleSize ?? 1000,
    qualityFlags: [],
  };
}

function channelProfile(options: {
  audienceTags: ProfileTagScore[];
  productFitProfile?: ProductFitProfile;
  audienceSampleSize?: number;
}): ChannelEntityProfileV2 {
  return {
    channelId: "mock_p6_channel",
    channelType: "short_video",
    audienceProfile: { tags: options.audienceTags, sampleSize: options.audienceSampleSize ?? 1000, qualityFlags: [] },
    productFitProfile: options.productFitProfile,
    qualityFlags: [],
  };
}

function fullProductFitProfile(): ProductFitProfile {
  return {
    fitCategories: ["apparel", "dress"],
    fitPriceBands: ["mid"],
    fitStyles: ["minimal"],
    fitOccasions: ["work"],
    fitLaunchTypes: ["new_arrival"],
    confidence: 0.85,
    qualityFlags: [],
  };
}

function productTagsFull(): ProfileTagScore[] {
  return [
    tag("demo.female", 0.82),
    tag("style.minimal", 0.78),
    tag("price.mid", 0.74),
    tag("occasion.work", 0.7),
    tag("intent.try_new", 0.66),
    tag("price.new_arrival_sensitive", 0.6),
  ];
}

function audienceTagsMatch(): ProfileTagScore[] {
  return [
    tag("demo.female", 0.8),
    tag("style.minimal", 0.76),
    tag("price.mid", 0.72),
    tag("occasion.work", 0.68),
  ];
}

function tag(tagId: string, score: number, confidence = 0.84): ProfileTagScore {
  return { tagId, score, confidence, source: `p6_contract.${tagId}`, sampleSize: null, timeWindow: null };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
