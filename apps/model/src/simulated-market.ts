import { randomUUID } from "node:crypto";

export type SimulatedMarketSourceType =
  | "manual_strategy"
  | "single_product_portrait"
  | "product_channel_match"
  | "campaign_product_strategy";

export type TargetAgentSourceType =
  | "three_audience_segment"
  | "manual_persona"
  | "saved_subagent"
  | "channel_audience_profile";

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
    subagentId?: string;
    canonicalObjectKey?: string;
    profileId?: string;
    dataVersion?: string;
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

export interface SimulatedMarketPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface SimulatedMarketLlmResponseShape {
  raw: string;
}

export const SIMULATED_MARKET_FALLBACK_PROVIDER = "deterministic_fallback";
export const SIMULATED_MARKET_FALLBACK_MODEL_VERSION = "deterministic-fallback-0.1";
export const SIMULATED_MARKET_LLM_PROVIDER = "minimax";
export const SIMULATED_MARKET_LLM_MODEL_VERSION = "minimax-m3";

export const DEFAULT_QUALITY_FLAGS = {
  strategyTextTooShort: "strategy_text_too_short",
  missingTargetAgentProfile: "missing_target_agent_profile",
  missingMarketContext: "missing_market_context",
  deterministicFallbackUsed: "deterministic_fallback_used",
  llmUnavailableFallbackUsed: "llm_unavailable_fallback_used",
} as const;

export const MIN_STRATEGY_TEXT_LENGTH = 10;

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
    const validAgentSourceTypes: TargetAgentSourceType[] = [
      "three_audience_segment",
      "manual_persona",
      "saved_subagent",
      "channel_audience_profile",
    ];
    if (!validAgentSourceTypes.includes(agent.sourceType)) {
      throw new Error(`Invalid agent sourceType: ${agent.sourceType}`);
    }
  }
}

export function runDeterministicSimulatedMarket(
  input: SimulatedMarketInput,
  options: SimulatedMarketOptions = {},
): SimulationRun {
  validateSimulatedMarketInput(input);

  const qualityFlags: string[] = collectInputQualityFlags(input);
  qualityFlags.push(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed);

  const marketContextText = buildMarketContextText(input);

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

function buildMarketContextText(input: SimulatedMarketInput): string {
  return [
    input.marketContext.channelEntityId,
    input.marketContext.marketingEventId,
    input.marketContext.businessScenarioId,
    input.marketContext.contextText,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function collectInputQualityFlags(input: SimulatedMarketInput): string[] {
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

  const marketContextText = buildMarketContextText(input);
  if (marketContextText.length === 0) {
    qualityFlags.push(DEFAULT_QUALITY_FLAGS.missingMarketContext);
  }

  return qualityFlags;
}

export function buildSimulatedMarketPrompt(input: SimulatedMarketInput): SimulatedMarketPrompt {
  validateSimulatedMarketInput(input);

  const systemPrompt = `你是 PLS 模拟市场引擎。你的任务是以多个目标用户 agent 的身份，对给定的商品/渠道/活动策略进行投放前模拟反馈。

你必须逐一扮演输入中的每一个目标用户 agent，分别输出他们对该策略的接受度、购买或互动意向、正面驱动因素、主要顾虑、代表性反馈摘要和可行动调整建议。

输出必须是严格合法的 JSON，且完全符合指定的 schema。不要添加 schema 以外的字段，不要输出解释性文字，只输出 JSON。

重要约束：
- 模拟结果是 Derived Result，仅用于策略压力测试，不是真实销售事实、真实用户反馈或 AB test 结果。
- 每个 agent 的反馈必须独立、具体，反映该 agent 的画像偏好、顾虑和决策因素。
- agentFeedback 数组必须包含且仅包含输入中的全部 agent，不得遗漏、重复或引入未知 agent。
- 分数必须合法：acceptanceScore / purchaseIntentScore 为 0-100 的数值；confidence 为 0-1 的数值。`;

  const marketContextLines = [
    input.marketContext.channelEntityId ? `渠道对象: ${input.marketContext.channelEntityId}` : "",
    input.marketContext.marketingEventId ? `活动类型: ${input.marketContext.marketingEventId}` : "",
    input.marketContext.businessScenarioId ? `业务场景: ${input.marketContext.businessScenarioId}` : "",
    input.marketContext.contextText ? `场景补充: ${input.marketContext.contextText}` : "",
  ].filter((line) => line.length > 0);

  const agentDescriptions = input.targetAgentSet
    .map((agent) => {
      const lines: string[] = [`agentId: ${agent.agentId}`, `name: ${agent.name}`, `sourceType: ${agent.sourceType}`];
      if (agent.sourceRef?.segmentCode) lines.push(`segmentCode: ${agent.sourceRef.segmentCode}`);
      if (agent.sourceRef?.segmentName) lines.push(`segmentName: ${agent.sourceRef.segmentName}`);
      if (agent.sourceRef?.subagentId) lines.push(`subagentId: ${agent.sourceRef.subagentId}`);
      if (agent.sourceRef?.canonicalObjectKey) lines.push(`canonicalObjectKey: ${agent.sourceRef.canonicalObjectKey}`);
      if (agent.sourceRef?.profileId) lines.push(`profileId: ${agent.sourceRef.profileId}`);
      if (agent.sourceRef?.dataVersion) lines.push(`dataVersion: ${agent.sourceRef.dataVersion}`);
      if (agent.sourceRef?.profileVersion) lines.push(`profileVersion: ${agent.sourceRef.profileVersion}`);
      if (agent.profile?.demographics?.length) lines.push(`demographics: ${agent.profile.demographics.join("、")}`);
      if (agent.profile?.preferences?.length) lines.push(`preferences: ${agent.profile.preferences.join("、")}`);
      if (agent.profile?.concerns?.length) lines.push(`concerns: ${agent.profile.concerns.join("、")}`);
      if (agent.profile?.decisionFactors?.length) lines.push(`decisionFactors: ${agent.profile.decisionFactors.join("、")}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const jsonSchema = JSON.stringify(
    {
      overall: {
        acceptanceScore: 0,
        purchaseIntentScore: 0,
        confidence: 0,
        opportunitySummary: ["string"],
        riskSummary: ["string"],
        recommendedAdjustments: ["string"],
      },
      agentFeedback: [
        {
          agentId: "string",
          acceptanceScore: 0,
          purchaseIntentScore: 0,
          positiveDrivers: ["string"],
          objections: ["string"],
          quoteSummary: "string",
          suggestedAdjustment: "string",
        },
      ],
    },
    null,
    2,
  );

  const userPrompt = `## 策略方案
${input.strategyText}

## 市场场景
${marketContextLines.length > 0 ? marketContextLines.join("\n") : "（未提供额外场景描述）"}

## 目标用户 agent
${agentDescriptions}

## 输出要求
请严格输出以下 JSON schema，不要添加 schema 以外的字段，只返回 JSON 对象。模拟结果是 Derived Result，不是真实销售或 AB test 事实。

\`\`\`json
${jsonSchema}
\`\`\``;

  return { systemPrompt, userPrompt };
}

export function buildFakeSimulatedMarketLlmResponse(input: SimulatedMarketInput): string {
  const overall = {
    acceptanceScore: 72,
    purchaseIntentScore: 65,
    confidence: 0.75,
    opportunitySummary: ["目标人群整体接受度处于可推进区间。", "购买意向正向，可进一步测试转化抓手。"],
    riskSummary: ["需补充更具体的价格和渠道场景描述。"],
    recommendedAdjustments: ["补充商品细节以提升置信度。", "针对分人群偏好增加解释。"],
  };

  const agentFeedback = input.targetAgentSet.map((agent) => ({
    agentId: agent.agentId,
    acceptanceScore: 70,
    purchaseIntentScore: 63,
    positiveDrivers: [`策略与 ${agent.name} 的偏好方向一致`],
    objections: ["希望看到更多具体场景说明"],
    quoteSummary: `${agent.name} 认为策略整体可接受，但期待更多细节。`,
    suggestedAdjustment: `针对 ${agent.name} 补充其关注的核心决策因素说明。`,
  }));

  return JSON.stringify({ overall, agentFeedback }, null, 2);
}

export function parseSimulatedMarketLlmResponse(raw: string, expectedAgentIds: string[]): SimulatedMarketResult {
  if (typeof raw !== "string") {
    throw new Error("LLM response must be a string");
  }

  const parsed = parseJsonFromRaw(raw);

  if (!isRecord(parsed)) {
    throw new Error("LLM response must be a JSON object");
  }

  const overall = parseOverall(parsed.overall);
  const agentFeedback = parseAgentFeedback(parsed.agentFeedback, expectedAgentIds);

  return { overall, agentFeedback };
}

export function runLlmSimulatedMarket(
  input: SimulatedMarketInput,
  llmResponse: string,
  options: SimulatedMarketOptions = {},
): SimulationRun {
  validateSimulatedMarketInput(input);

  const expectedAgentIds = input.targetAgentSet.map((agent) => agent.agentId);
  const result = parseSimulatedMarketLlmResponse(llmResponse, expectedAgentIds);
  const qualityFlags = collectInputQualityFlags(input);

  return {
    runId: options.runId ?? randomUUID(),
    workspaceId: options.workspaceId ?? "default",
    status: "succeeded",
    inputSnapshot: input,
    result,
    provider: SIMULATED_MARKET_LLM_PROVIDER,
    modelVersion: SIMULATED_MARKET_LLM_MODEL_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    qualityFlags: [...new Set(qualityFlags)].sort(),
  };
}

function parseJsonFromRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const codeFenceMatch = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
    if (codeFenceMatch?.[1]) {
      try {
        return JSON.parse(codeFenceMatch[1]);
      } catch {
        throw new Error("LLM response contains invalid JSON inside code fence");
      }
    }
    const objectStart = raw.indexOf("{");
    const objectEnd = raw.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(raw.slice(objectStart, objectEnd + 1));
      } catch {
        throw new Error("LLM response contains invalid JSON object");
      }
    }
    throw new Error("LLM response is not valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseOverall(value: unknown): SimulatedMarketResult["overall"] {
  if (!isRecord(value)) {
    throw new Error("overall must be a JSON object");
  }

  const acceptanceScore = value.acceptanceScore;
  if (!isValidScore(acceptanceScore)) {
    throw new Error(`overall.acceptanceScore must be a finite number between 0 and 100, got ${acceptanceScore}`);
  }

  const purchaseIntentScore = value.purchaseIntentScore;
  if (!isValidScore(purchaseIntentScore)) {
    throw new Error(`overall.purchaseIntentScore must be a finite number between 0 and 100, got ${purchaseIntentScore}`);
  }

  const confidence = value.confidence;
  if (!isValidConfidence(confidence)) {
    throw new Error(`overall.confidence must be a finite number between 0 and 1, got ${confidence}`);
  }

  const opportunitySummary = value.opportunitySummary;
  if (!isStringArray(opportunitySummary)) {
    throw new Error("overall.opportunitySummary must be an array of strings");
  }

  const riskSummary = value.riskSummary;
  if (!isStringArray(riskSummary)) {
    throw new Error("overall.riskSummary must be an array of strings");
  }

  const recommendedAdjustments = value.recommendedAdjustments;
  if (!isStringArray(recommendedAdjustments)) {
    throw new Error("overall.recommendedAdjustments must be an array of strings");
  }

  return { acceptanceScore, purchaseIntentScore, confidence, opportunitySummary, riskSummary, recommendedAdjustments };
}

function parseAgentFeedback(value: unknown, expectedAgentIds: string[]): SimulatedMarketResult["agentFeedback"] {
  if (!Array.isArray(value)) {
    throw new Error("agentFeedback must be an array");
  }

  if (value.length !== expectedAgentIds.length) {
    throw new Error(`agentFeedback must contain exactly ${expectedAgentIds.length} agents, got ${value.length}`);
  }

  const seenAgentIds = new Set<string>();
  const result: SimulatedMarketResult["agentFeedback"] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      throw new Error("Each agentFeedback item must be a JSON object");
    }

    const agentId = item.agentId;
    if (typeof agentId !== "string" || agentId.length === 0) {
      throw new Error("Each agentFeedback item must have a non-empty string agentId");
    }

    if (!expectedAgentIds.includes(agentId)) {
      throw new Error(`Unexpected agentId in agentFeedback: ${agentId}`);
    }

    if (seenAgentIds.has(agentId)) {
      throw new Error(`Duplicate agentId in agentFeedback: ${agentId}`);
    }
    seenAgentIds.add(agentId);

    const feedback = parseAgentFeedbackItem(item);
    result.push({ agentId, ...feedback });
  }

  const missingAgentIds = expectedAgentIds.filter((id) => !seenAgentIds.has(id));
  if (missingAgentIds.length > 0) {
    throw new Error(`Missing agentFeedback for agents: ${missingAgentIds.join(", ")}`);
  }

  return result;
}

function parseAgentFeedbackItem(
  item: Record<string, unknown>,
): Omit<SimulatedMarketResult["agentFeedback"][number], "agentId"> {
  const acceptanceScore = item.acceptanceScore;
  if (!isValidScore(acceptanceScore)) {
    throw new Error(`agentFeedback.acceptanceScore must be a finite number between 0 and 100, got ${acceptanceScore}`);
  }

  const purchaseIntentScore = item.purchaseIntentScore;
  if (!isValidScore(purchaseIntentScore)) {
    throw new Error(`agentFeedback.purchaseIntentScore must be a finite number between 0 and 100, got ${purchaseIntentScore}`);
  }

  const positiveDrivers = item.positiveDrivers;
  if (!isStringArray(positiveDrivers)) {
    throw new Error("agentFeedback.positiveDrivers must be an array of strings");
  }

  const objections = item.objections;
  if (!isStringArray(objections)) {
    throw new Error("agentFeedback.objections must be an array of strings");
  }

  const quoteSummary = item.quoteSummary;
  if (typeof quoteSummary !== "string" || quoteSummary.length === 0) {
    throw new Error("agentFeedback.quoteSummary must be a non-empty string");
  }

  const suggestedAdjustment = item.suggestedAdjustment;
  if (typeof suggestedAdjustment !== "string" || suggestedAdjustment.length === 0) {
    throw new Error("agentFeedback.suggestedAdjustment must be a non-empty string");
  }

  return { acceptanceScore, purchaseIntentScore, positiveDrivers, objections, quoteSummary, suggestedAdjustment };
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
