import { randomUUID } from "node:crypto";

export type SimulatedMarketSourceType =
  | "manual_strategy"
  | "single_product_portrait"
  | "product_channel_match"
  | "campaign_product_strategy";

export type TargetAgentSourceType = "three_audience_segment" | "manual_persona";

export type SegmentCode = "A" | "B" | "C";

export type SegmentName = "质感流行派" | "都市体面家" | "百搭优选客";

export interface SimulatedMarketInput {
  sourceType: SimulatedMarketSourceType;
  sourceRef?: {
    id: string;
    type: string;
  };
  strategyText: string;
  marketContext: {
    channelEntityId?: string;
    marketingEventId?: string;
    businessScenarioId?: string;
    contextText?: string;
  };
  targetAgentSet: TargetUserAgent[];
}

export interface TargetUserAgent {
  agentId: string;
  name: string;
  sourceType: TargetAgentSourceType;
  sourceRef?: {
    segmentCode?: SegmentCode;
    segmentName?: SegmentName;
    profileVersion?: string;
  };
  profile: {
    demographics?: string[];
    preferences?: string[];
    concerns?: string[];
    decisionFactors?: string[];
  };
  weight?: number;
}

export interface SimulatedMarketResult {
  overall: {
    acceptanceScore: number;
    purchaseIntentScore: number;
    confidence: number;
    opportunitySummary: string[];
    riskSummary: string[];
    recommendedAdjustments: string[];
  };
  agentFeedback: Array<{
    agentId: string;
    acceptanceScore: number;
    purchaseIntentScore: number;
    positiveDrivers: string[];
    objections: string[];
    quoteSummary: string;
    suggestedAdjustment: string;
  }>;
}

export interface SimulationRun {
  runId: string;
  workspaceId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  inputSnapshot: SimulatedMarketInput;
  result?: SimulatedMarketResult;
  provider: "minimax" | "deterministic_fallback" | string;
  modelVersion: "minimax-m3" | string;
  generatedAt: string;
  qualityFlags: string[];
}

export interface SimulatedMarketOptions {
  workspaceId?: string;
  runId?: string;
  generatedAt?: string;
}

export const SIMULATED_MARKET_FALLBACK_PROVIDER = "deterministic_fallback";
export const SIMULATED_MARKET_FALLBACK_MODEL_VERSION = "deterministic-fallback-0.1";

export const DEFAULT_QUALITY_FLAGS = {
  strategyTextTooShort: "strategy_text_too_short",
  missingTargetAgentProfile: "missing_target_agent_profile",
  missingMarketContext: "missing_market_context",
  deterministicFallbackUsed: "deterministic_fallback_used",
} as const;

const MIN_STRATEGY_TEXT_LENGTH = 10;

interface AgentTemplateSeed {
  segmentCode: SegmentCode;
  segmentName: SegmentName;
  preferences: string[];
  concerns: string[];
  decisionFactors: string[];
}

const AGENT_TEMPLATE_SEEDS: AgentTemplateSeed[] = [
  {
    segmentCode: "A",
    segmentName: "质感流行派",
    preferences: ["设计感", "质感", "细节工艺", "潮流趋势", "小众风格"],
    concerns: ["撞款", "廉价感", "跟风"],
    decisionFactors: ["面料质感", "剪裁细节", "品牌调性", "潮流度"],
  },
  {
    segmentCode: "B",
    segmentName: "都市体面家",
    preferences: ["通勤", "商务休闲", "简约", "得体", "多场合适用"],
    concerns: ["不够正式", "难打理", "不适合上班"],
    decisionFactors: ["版型合体", "色彩稳重", "品牌信赖", "性价比"],
  },
  {
    segmentCode: "C",
    segmentName: "百搭优选客",
    preferences: ["基础款", "百搭", "舒适", "性价比", "耐穿"],
    concerns: ["难搭配", "易过时", "价格高"],
    decisionFactors: ["价格", "搭配率", "舒适度", "口碑"],
  },
];

export function buildDefaultTargetUserAgents(): TargetUserAgent[] {
  return AGENT_TEMPLATE_SEEDS.map((seed) => ({
    agentId: `agent-template-${seed.segmentCode.toLowerCase()}`,
    name: `${seed.segmentCode} / ${seed.segmentName}`,
    sourceType: "three_audience_segment",
    sourceRef: {
      segmentCode: seed.segmentCode,
      segmentName: seed.segmentName,
      profileVersion: "v1",
    },
    profile: {
      demographics: ["京东平台目标人群"],
      preferences: seed.preferences,
      concerns: seed.concerns,
      decisionFactors: seed.decisionFactors,
    },
    weight: 1,
  }));
}

export function validateSimulatedMarketInput(input: SimulatedMarketInput): void {
  if (!input) {
    throw new Error("SimulatedMarketInput is required");
  }
  const validSourceTypes: SimulatedMarketSourceType[] = [
    "manual_strategy",
    "single_product_portrait",
    "product_channel_match",
    "campaign_product_strategy",
  ];
  if (!validSourceTypes.includes(input.sourceType)) {
    throw new Error(`Invalid sourceType: ${input.sourceType}`);
  }
  if (typeof input.strategyText !== "string") {
    throw new Error("strategyText must be a string");
  }
  if (!input.marketContext || typeof input.marketContext !== "object") {
    throw new Error("marketContext must be an object");
  }
  if (!Array.isArray(input.targetAgentSet) || input.targetAgentSet.length === 0) {
    throw new Error("targetAgentSet must be a non-empty array");
  }
  for (const agent of input.targetAgentSet) {
    if (!agent.agentId) {
      throw new Error("Each target agent must have an agentId");
    }
    if (!agent.name) {
      throw new Error("Each target agent must have a name");
    }
    if (agent.sourceType !== "three_audience_segment" && agent.sourceType !== "manual_persona") {
      throw new Error(`Invalid agent sourceType: ${agent.sourceType}`);
    }
  }
}

export function runDeterministicSimulatedMarket(
  input: SimulatedMarketInput,
  options: SimulatedMarketOptions = {},
): SimulationRun {
  validateSimulatedMarketInput(input);

  const qualityFlags: string[] = [];

  if (input.strategyText.trim().length < MIN_STRATEGY_TEXT_LENGTH) {
    qualityFlags.push(DEFAULT_QUALITY_FLAGS.strategyTextTooShort);
  }

  const hasAgentProfile = input.targetAgentSet.every(
    (agent) =>
      agent.profile &&
      (Array.isArray(agent.profile.preferences) ||
        Array.isArray(agent.profile.concerns) ||
        Array.isArray(agent.profile.decisionFactors)),
  );
  if (!hasAgentProfile) {
    qualityFlags.push(DEFAULT_QUALITY_FLAGS.missingTargetAgentProfile);
  }

  const marketContextText = [
    input.marketContext.channelEntityId,
    input.marketContext.marketingEventId,
    input.marketContext.businessScenarioId,
    input.marketContext.contextText,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  if (marketContextText.length === 0) {
    qualityFlags.push(DEFAULT_QUALITY_FLAGS.missingMarketContext);
  }

  qualityFlags.push(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed);

  const agentFeedback = input.targetAgentSet.map((agent) =>
    simulateAgentFeedback(agent, input.strategyText),
  );

  const overall = buildOverallResult(agentFeedback, input.strategyText, marketContextText);

  return {
    runId: options.runId ?? randomUUID(),
    workspaceId: options.workspaceId ?? "default",
    status: "succeeded",
    inputSnapshot: input,
    result: {
      overall,
      agentFeedback,
    },
    provider: SIMULATED_MARKET_FALLBACK_PROVIDER,
    modelVersion: SIMULATED_MARKET_FALLBACK_MODEL_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    qualityFlags: [...new Set(qualityFlags)].sort(),
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, " ")
    .trim();
}

function matchKeywordCoverage(text: string, keywords: string[] | undefined): number {
  if (!keywords || keywords.length === 0) return 0;
  const normalizedText = normalizeText(text);
  const tokens = new Set(normalizedText.split(/\s+/));
  const matches = keywords.filter((keyword) => {
    const normalized = normalizeText(keyword);
    return normalized.length > 0 && (tokens.has(normalized) || normalizedText.includes(normalized));
  });
  return matches.length / keywords.length;
}

function simulateAgentFeedback(agent: TargetUserAgent, strategyText: string): SimulatedMarketResult["agentFeedback"][number] {
  const preferences = agent.profile?.preferences ?? [];
  const concerns = agent.profile?.concerns ?? [];
  const decisionFactors = agent.profile?.decisionFactors ?? [];

  const preferenceCoverage = matchKeywordCoverage(strategyText, preferences);
  const concernCoverage = matchKeywordCoverage(strategyText, concerns);
  const factorCoverage = matchKeywordCoverage(strategyText, decisionFactors);

  const baseAcceptance = 50;
  const preferenceBoost = Math.round(preferenceCoverage * 30);
  const concernPenalty = Math.round(concernCoverage * 15);
  const detailBoost = Math.min(15, Math.max(0, Math.round((strategyText.length - 30) / 20)));
  const acceptanceScore = clampScore(baseAcceptance + preferenceBoost - concernPenalty + detailBoost);

  const purchaseBase = 40;
  const purchaseBoost = Math.round(factorCoverage * 35 + preferenceCoverage * 15);
  const purchasePenalty = Math.round(concernCoverage * 20);
  const purchaseIntentScore = clampScore(purchaseBase + purchaseBoost - purchasePenalty + detailBoost);

  const positiveDrivers = preferences
    .filter((keyword) => matchKeywordCoverage(strategyText, [keyword]) > 0)
    .slice(0, 3)
    .map((keyword) => `策略提及 ${keyword}，与该人群偏好契合`);

  if (positiveDrivers.length === 0) {
    positiveDrivers.push("策略未明确触发核心偏好，但基础定位可接受");
  }

  const objections = concerns
    .filter((keyword) => matchKeywordCoverage(strategyText, [keyword]) > 0)
    .slice(0, 2)
    .map((keyword) => `策略可能触发 ${keyword} 顾虑`);

  if (objections.length === 0) {
    objections.push("未在策略文本中识别到明显顾虑触发点");
  }

  const suggestedAdjustment = acceptanceScore < 60
    ? `建议针对 ${agent.name} 补充 ${preferences.slice(0, 2).join("、") || "偏好关键词"} 相关描述，以提升接受度。`
    : `建议维持当前对 ${preferences.slice(0, 2).join("、") || "核心偏好"} 的表述，并可适度强化决策因素。`;

  return {
    agentId: agent.agentId,
    acceptanceScore,
    purchaseIntentScore,
    positiveDrivers,
    objections,
    quoteSummary: `${agent.name} 对策略整体接受度为 ${acceptanceScore}，购买意向为 ${purchaseIntentScore}。`,
    suggestedAdjustment,
  };
}

function buildOverallResult(
  agentFeedback: SimulatedMarketResult["agentFeedback"],
  strategyText: string,
  marketContextText: string,
): SimulatedMarketResult["overall"] {
  const totalWeight = 1;
  const averageAcceptance =
    agentFeedback.reduce((sum, agent) => sum + agent.acceptanceScore, 0) / agentFeedback.length || 0;
  const averagePurchaseIntent =
    agentFeedback.reduce((sum, agent) => sum + agent.purchaseIntentScore, 0) / agentFeedback.length || 0;

  const acceptanceScore = clampScore(Math.round(averageAcceptance));
  const purchaseIntentScore = clampScore(Math.round(averagePurchaseIntent));

  const contextBoost = Math.min(0.15, marketContextText.length / 400);
  const textBoost = Math.min(0.15, strategyText.length / 400);
  let confidence = clampConfidence(0.5 + contextBoost + textBoost);
  if (strategyText.trim().length < MIN_STRATEGY_TEXT_LENGTH) {
    confidence = clampConfidence(confidence - 0.2);
  }

  const opportunitySummary: string[] = [];
  const riskSummary: string[] = [];
  const recommendedAdjustments: string[] = [];

  if (acceptanceScore >= 50) {
    opportunitySummary.push("目标人群整体接受度处于可推进区间，可作为策略压力测试基础。");
  }
  if (acceptanceScore >= 65) {
    opportunitySummary.push("目标人群整体接受度良好，具备进一步压力测试条件。");
  }
  if (purchaseIntentScore >= 55) {
    opportunitySummary.push("购买或互动意向处于正向区间，可关注转化抓手。");
  }
  const highIntentAgents = agentFeedback.filter((agent) => agent.purchaseIntentScore >= 60);
  if (highIntentAgents.length > 0) {
    opportunitySummary.push(`${highIntentAgents.length} 个 agent 的购买意向超过 60，可作为优先沟通人群。`);
  }

  if (acceptanceScore < 55) {
    riskSummary.push("目标人群整体接受度偏低，建议回到策略输入重新调整。");
  }
  if (purchaseIntentScore < 45) {
    riskSummary.push("购买或互动意向不足，需补充价格、场景或信任状信息。");
  }
  if (strategyText.length < MIN_STRATEGY_TEXT_LENGTH) {
    riskSummary.push("策略文本过短，模拟结果置信度受限。");
  }
  if (marketContextText.length === 0) {
    riskSummary.push("缺少市场场景描述，模拟反馈可能脱离实际渠道语境。");
  }
  const lowAcceptanceAgents = agentFeedback.filter((agent) => agent.acceptanceScore < 50);
  if (lowAcceptanceAgents.length > 0) {
    riskSummary.push(`${lowAcceptanceAgents.length} 个 agent 接受度低于 50，存在显著人群分歧。`);
  }

  recommendedAdjustments.push("补充策略文本中的商品、价格、渠道、活动卖点细节，以提升模拟置信度。");
  if (agentFeedback.some((agent) => agent.objections.length > 0)) {
    recommendedAdjustments.push("针对分人群顾虑点增加解释或缓解话术。");
  }
  recommendedAdjustments.push("在市场场景中补充渠道、活动类型和预算/库存约束，以提高反馈针对性。");

  return {
    acceptanceScore,
    purchaseIntentScore,
    confidence,
    opportunitySummary,
    riskSummary,
    recommendedAdjustments,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
