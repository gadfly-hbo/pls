import {
  buildDefaultTargetUserAgents,
  buildFakeSimulatedMarketLlmResponse,
  buildSimulatedMarketPrompt,
  parseSimulatedMarketLlmResponse,
  runDeterministicSimulatedMarket,
  runLlmSimulatedMarket,
  validateSimulatedMarketInput,
  SIMULATED_MARKET_FALLBACK_PROVIDER,
  SIMULATED_MARKET_FALLBACK_MODEL_VERSION,
  SIMULATED_MARKET_LLM_PROVIDER,
  SIMULATED_MARKET_LLM_MODEL_VERSION,
  DEFAULT_QUALITY_FLAGS,
  type SimulatedMarketInput,
  type TargetUserAgent,
} from "./simulated-market.js";

interface TestFailure {
  case: string;
  reason: string;
}

function assert(condition: boolean, message: string, failures: TestFailure[], caseName: string) {
  if (!condition) failures.push({ case: caseName, reason: message });
}

function makeValidInput(): SimulatedMarketInput {
  return {
    sourceType: "manual_strategy",
    strategyText: "本季主推凉感面料通勤衬衫，面向都市人群，定价中端，通过京东渠道配合新品折扣活动主推。",
    marketContext: {
      channelEntityId: "jd",
      marketingEventId: "new-season-launch",
      contextText: "新品上市期，重点提升搜索转化与加购率。",
    },
    targetAgentSet: buildDefaultTargetUserAgents(),
  };
}

function main() {
  const failures: TestFailure[] = [];

  // Case: default agents cover three segments
  const defaultAgents = buildDefaultTargetUserAgents();
  assert(defaultAgents.length === 3, `Expected 3 default agents, got ${defaultAgents.length}`, failures, "default_agent_count");
  const segmentNames = new Set(defaultAgents.map((agent) => agent.sourceRef?.segmentName));
  assert(segmentNames.has("质感流行派"), "Missing segment 质感流行派", failures, "default_agent_segment_a");
  assert(segmentNames.has("都市体面家"), "Missing segment 都市体面家", failures, "default_agent_segment_b");
  assert(segmentNames.has("百搭优选客"), "Missing segment 百搭优选客", failures, "default_agent_segment_c");
  const segmentCodes = new Set(defaultAgents.map((agent) => agent.sourceRef?.segmentCode));
  assert(segmentCodes.has("A"), "Missing segment code A", failures, "default_agent_code_a");
  assert(segmentCodes.has("B"), "Missing segment code B", failures, "default_agent_code_b");
  assert(segmentCodes.has("C"), "Missing segment code C", failures, "default_agent_code_c");
  assert(defaultAgents.every((agent) => agent.sourceType === "three_audience_segment"), "Default agents must be from three_audience_segment", failures, "default_agent_source_type");

  // Case: valid input succeeds and uses deterministic fallback
  const validInput = makeValidInput();
  const run = runDeterministicSimulatedMarket(validInput, { workspaceId: "ws-test", runId: "run-test-1" });
  assert(run.runId === "run-test-1", `runId mismatch: ${run.runId}`, failures, "run_runId");
  assert(run.workspaceId === "ws-test", `workspaceId mismatch: ${run.workspaceId}`, failures, "run_workspaceId");
  assert(run.status === "succeeded", `Expected status succeeded, got ${run.status}`, failures, "run_status");
  assert(run.provider === SIMULATED_MARKET_FALLBACK_PROVIDER, `Expected provider ${SIMULATED_MARKET_FALLBACK_PROVIDER}, got ${run.provider}`, failures, "run_provider");
  assert(run.modelVersion === SIMULATED_MARKET_FALLBACK_MODEL_VERSION, `Expected modelVersion ${SIMULATED_MARKET_FALLBACK_MODEL_VERSION}, got ${run.modelVersion}`, failures, "run_modelVersion");
  assert(run.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed), "Missing deterministic_fallback_used quality flag", failures, "run_quality_flag_fallback");
  assert(new Date(run.generatedAt).getTime() > 0, "Invalid generatedAt", failures, "run_generatedAt");
  assert(run.result !== undefined, "Missing result", failures, "run_result_exists");

  const result = run.result!;

  // Case: overall scores are in valid ranges
  assert(result.overall.acceptanceScore >= 0 && result.overall.acceptanceScore <= 100, `acceptanceScore out of range: ${result.overall.acceptanceScore}`, failures, "overall_acceptance_range");
  assert(result.overall.purchaseIntentScore >= 0 && result.overall.purchaseIntentScore <= 100, `purchaseIntentScore out of range: ${result.overall.purchaseIntentScore}`, failures, "overall_purchase_intent_range");
  assert(result.overall.confidence >= 0 && result.overall.confidence <= 1, `confidence out of range: ${result.overall.confidence}`, failures, "overall_confidence_range");
  assert(result.overall.opportunitySummary.length > 0, "Expected opportunitySummary", failures, "overall_opportunity_summary");
  assert(result.overall.riskSummary.length >= 0, "Expected riskSummary array", failures, "overall_risk_summary");
  assert(result.overall.recommendedAdjustments.length > 0, "Expected recommendedAdjustments", failures, "overall_recommended_adjustments");

  // Case: agent feedback covers all agents
  assert(result.agentFeedback.length === validInput.targetAgentSet.length, `agentFeedback count mismatch: ${result.agentFeedback.length}`, failures, "agent_feedback_count");
  for (const agent of result.agentFeedback) {
    assert(agent.acceptanceScore >= 0 && agent.acceptanceScore <= 100, `agent acceptanceScore out of range: ${agent.acceptanceScore}`, failures, `agent_acceptance_range_${agent.agentId}`);
    assert(agent.purchaseIntentScore >= 0 && agent.purchaseIntentScore <= 100, `agent purchaseIntentScore out of range: ${agent.purchaseIntentScore}`, failures, `agent_intent_range_${agent.agentId}`);
    assert(agent.positiveDrivers.length > 0, `agent positiveDrivers empty: ${agent.agentId}`, failures, `agent_positive_drivers_${agent.agentId}`);
    assert(agent.objections.length > 0, `agent objections empty: ${agent.agentId}`, failures, `agent_objections_${agent.agentId}`);
    assert(agent.quoteSummary.length > 0, `agent quoteSummary empty: ${agent.agentId}`, failures, `agent_quote_summary_${agent.agentId}`);
    assert(agent.suggestedAdjustment.length > 0, `agent suggestedAdjustment empty: ${agent.agentId}`, failures, `agent_suggested_adjustment_${agent.agentId}`);
  }

  // Case: short strategy text triggers quality flag
  const shortInput: SimulatedMarketInput = {
    ...validInput,
    strategyText: "短",
  };
  const shortRun = runDeterministicSimulatedMarket(shortInput, { runId: "run-short" });
  assert(shortRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.strategyTextTooShort), "Missing strategy_text_too_short for short input", failures, "short_strategy_quality_flag");
  assert(shortRun.result!.overall.confidence < 0.6, "Expected lower confidence for short input", failures, "short_strategy_confidence");

  // Case: missing market context triggers quality flag
  const noContextInput: SimulatedMarketInput = {
    ...validInput,
    marketContext: {},
  };
  const noContextRun = runDeterministicSimulatedMarket(noContextInput, { runId: "run-no-context" });
  assert(noContextRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.missingMarketContext), "Missing missing_market_context flag", failures, "missing_context_quality_flag");

  // Case: missing agent profile triggers quality flag
  const emptyProfileAgent: TargetUserAgent = {
    agentId: "agent-empty",
    name: "Empty Agent",
    sourceType: "manual_persona",
    profile: {},
  };
  const emptyProfileInput: SimulatedMarketInput = {
    ...validInput,
    targetAgentSet: [emptyProfileAgent],
  };
  const emptyProfileRun = runDeterministicSimulatedMarket(emptyProfileInput, { runId: "run-empty-profile" });
  assert(emptyProfileRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.missingTargetAgentProfile), "Missing missing_target_agent_profile flag", failures, "missing_profile_quality_flag");

  // Case: deterministic repeatability
  const run1 = runDeterministicSimulatedMarket(validInput, { runId: "run-repeat-1", generatedAt: "2026-01-01T00:00:00.000Z" });
  const run2 = runDeterministicSimulatedMarket(validInput, { runId: "run-repeat-2", generatedAt: "2026-01-01T00:00:00.000Z" });
  assert(
    JSON.stringify(run1.result) === JSON.stringify(run2.result),
    "Deterministic output should be stable for same input",
    failures,
    "repeat_stability",
  );

  // Case: invalid inputs throw explicit errors
  assertThrows(() => validateSimulatedMarketInput({} as SimulatedMarketInput), "Expected error for empty input", failures, "validate_empty_input");
  assertThrows(() => validateSimulatedMarketInput({ ...validInput, sourceType: "invalid" as never }), "Expected error for invalid sourceType", failures, "validate_invalid_source_type");
  assertThrows(() => validateSimulatedMarketInput({ ...validInput, targetAgentSet: [] }), "Expected error for empty targetAgentSet", failures, "validate_empty_agents");
  assertThrows(() => validateSimulatedMarketInput({ ...validInput, targetAgentSet: [{ agentId: "", name: "", sourceType: "manual_persona", profile: {} }] }), "Expected error for missing agentId", failures, "validate_missing_agent_id");

  // Case: manual persona agent works
  const manualAgent: TargetUserAgent = {
    agentId: "agent-manual",
    name: "手写 Persona",
    sourceType: "manual_persona",
    profile: {
      preferences: ["环保", "可持续"],
      concerns: ["价格高"],
      decisionFactors: ["材质说明"],
    },
  };
  const manualInput: SimulatedMarketInput = {
    ...validInput,
    targetAgentSet: [manualAgent],
  };
  const manualRun = runDeterministicSimulatedMarket(manualInput, { runId: "run-manual" });
  assert(manualRun.result!.agentFeedback.length === 1, "Expected one manual agent feedback", failures, "manual_agent_feedback_count");
  assert(manualRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed), "Missing fallback flag for manual agent", failures, "manual_agent_fallback_flag");

  // Case: saved subagent passes validation and joins deterministic fallback run
  const savedSubagent: TargetUserAgent = {
    agentId: "agent-sub-001",
    name: "夏季通勤高潜人群",
    sourceType: "saved_subagent",
    sourceRef: { subagentId: "sub_001", profileVersion: "v1" },
    profile: {
      demographics: ["25-34 岁一线城市白领"],
      preferences: ["通勤", "透气", "简约"],
      concerns: ["闷热", "打理麻烦"],
      decisionFactors: ["面料舒适度", "版型合体"],
    },
  };
  const savedSubagentInput: SimulatedMarketInput = {
    ...validInput,
    targetAgentSet: [savedSubagent],
  };
  const savedSubagentRun = runDeterministicSimulatedMarket(savedSubagentInput, { runId: "run-saved-subagent" });
  assert(savedSubagentRun.status === "succeeded", `Expected saved_subagent run to succeed, got ${savedSubagentRun.status}`, failures, "saved_subagent_run_status");
  assert(savedSubagentRun.result!.agentFeedback.length === 1, "Expected one saved subagent feedback", failures, "saved_subagent_feedback_count");
  assert(savedSubagentRun.result!.agentFeedback[0].agentId === "agent-sub-001", "Saved subagent feedback must map to correct agentId", failures, "saved_subagent_agent_id");

  // Case: channel audience profile agent passes validation and joins deterministic fallback run
  const channelProfileAgent: TargetUserAgent = {
    agentId: "agent-channel-001",
    name: "抖音账号高活粉丝画像",
    sourceType: "channel_audience_profile",
    sourceRef: {
      canonicalObjectKey: "douyin:account:mock_account_douyin_style",
      profileId: "profile_001",
      dataVersion: "v1_20260701",
      profileVersion: "v1",
    },
    profile: {
      demographics: ["18-30 岁兴趣电商活跃用户"],
      preferences: ["直播互动", "新品首发", "内容种草"],
      concerns: ["发货慢", "与主播描述不符"],
      decisionFactors: ["主播信任", "价格优势", "场景共鸣"],
    },
  };
  const channelProfileInput: SimulatedMarketInput = {
    ...validInput,
    targetAgentSet: [channelProfileAgent],
  };
  const channelProfileRun = runDeterministicSimulatedMarket(channelProfileInput, { runId: "run-channel-profile" });
  assert(channelProfileRun.status === "succeeded", `Expected channel_audience_profile run to succeed, got ${channelProfileRun.status}`, failures, "channel_profile_run_status");
  assert(channelProfileRun.result!.agentFeedback.length === 1, "Expected one channel profile agent feedback", failures, "channel_profile_feedback_count");
  assert(channelProfileRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed), "Missing fallback flag for channel profile agent", failures, "channel_profile_fallback_flag");

  // Case: invalid agent sourceType still rejected
  assertThrows(
    () => validateSimulatedMarketInput({ ...validInput, targetAgentSet: [{ agentId: "agent-bad", name: "Bad Source", sourceType: "unknown_source" as never, profile: {} }] }),
    "Expected error for unknown agent sourceType",
    failures,
    "validate_unknown_agent_source_type",
  );

  // Case: LLM prompt includes all target agents and strategy text
  const prompt = buildSimulatedMarketPrompt(validInput);
  assert(prompt.systemPrompt.length > 0, "Expected non-empty system prompt", failures, "llm_prompt_system_non_empty");
  assert(prompt.userPrompt.includes(validInput.strategyText), "User prompt must include strategy text", failures, "llm_prompt_strategy_text");
  for (const agent of validInput.targetAgentSet) {
    assert(prompt.userPrompt.includes(agent.agentId), `User prompt must include agent ${agent.agentId}`, failures, `llm_prompt_agent_${agent.agentId}`);
    assert(prompt.userPrompt.includes(agent.name), `User prompt must include agent name ${agent.name}`, failures, `llm_prompt_agent_name_${agent.agentId}`);
  }
  assert(prompt.userPrompt.includes("agentFeedback"), "User prompt must include agentFeedback schema", failures, "llm_prompt_schema");
  assert(prompt.userPrompt.includes("Derived Result"), "User prompt must remind derived result", failures, "llm_prompt_derived_result");

  // Case: LLM fake response success
  const fakeResponse = buildFakeSimulatedMarketLlmResponse(validInput);
  const llmRun = runLlmSimulatedMarket(validInput, fakeResponse, { workspaceId: "ws-llm", runId: "run-llm-1" });
  assert(llmRun.runId === "run-llm-1", `runId mismatch: ${llmRun.runId}`, failures, "llm_run_runId");
  assert(llmRun.workspaceId === "ws-llm", `workspaceId mismatch: ${llmRun.workspaceId}`, failures, "llm_run_workspaceId");
  assert(llmRun.status === "succeeded", `Expected status succeeded, got ${llmRun.status}`, failures, "llm_run_status");
  assert(llmRun.provider === SIMULATED_MARKET_LLM_PROVIDER, `Expected provider ${SIMULATED_MARKET_LLM_PROVIDER}, got ${llmRun.provider}`, failures, "llm_run_provider");
  assert(llmRun.modelVersion === SIMULATED_MARKET_LLM_MODEL_VERSION, `Expected modelVersion ${SIMULATED_MARKET_LLM_MODEL_VERSION}, got ${llmRun.modelVersion}`, failures, "llm_run_modelVersion");
  assert(!llmRun.qualityFlags.includes(DEFAULT_QUALITY_FLAGS.deterministicFallbackUsed), "LLM run must not contain deterministic fallback flag", failures, "llm_run_no_fallback_flag");
  assert(llmRun.result !== undefined, "Missing LLM result", failures, "llm_run_result_exists");
  const llmResult = llmRun.result!;
  assert(llmResult.overall.acceptanceScore === 72, `Expected overall acceptance 72, got ${llmResult.overall.acceptanceScore}`, failures, "llm_overall_acceptance");
  assert(llmResult.overall.purchaseIntentScore === 65, `Expected overall purchase intent 65, got ${llmResult.overall.purchaseIntentScore}`, failures, "llm_overall_purchase_intent");
  assert(llmResult.overall.confidence === 0.75, `Expected confidence 0.75, got ${llmResult.overall.confidence}`, failures, "llm_overall_confidence");
  assert(llmResult.agentFeedback.length === validInput.targetAgentSet.length, `LLM agentFeedback count mismatch: ${llmResult.agentFeedback.length}`, failures, "llm_agent_feedback_count");
  const llmAgentIds = llmResult.agentFeedback.map((agent) => agent.agentId);
  const expectedAgentIds = validInput.targetAgentSet.map((agent) => agent.agentId);
  assert(
    llmAgentIds.length === expectedAgentIds.length && llmAgentIds.every((id) => expectedAgentIds.includes(id)),
    "LLM agentFeedback must cover all expected agents",
    failures,
    "llm_agent_feedback_coverage",
  );

  // Case: LLM response wrapped in markdown code fence
  const fencedResponse = "```json\n" + fakeResponse + "\n```";
  const fencedRun = runLlmSimulatedMarket(validInput, fencedResponse, { runId: "run-llm-fenced" });
  assert(fencedRun.status === "succeeded", "Expected fenced response to parse successfully", failures, "llm_fenced_response_success");
  assert(fencedRun.result!.agentFeedback.length === validInput.targetAgentSet.length, "Fenced response must cover all agents", failures, "llm_fenced_agent_count");

  // Case: LLM response with thinking preamble before JSON parses
  const preambleResponse = `<think>reasoning omitted</think>\n\n${fakeResponse}`;
  const preambleRun = runLlmSimulatedMarket(validInput, preambleResponse, { runId: "run-llm-preamble" });
  assert(preambleRun.status === "succeeded", "Expected preamble response to parse successfully", failures, "llm_preamble_response_success");
  assert(preambleRun.result!.agentFeedback.length === validInput.targetAgentSet.length, "Preamble response must cover all agents", failures, "llm_preamble_agent_count");

  // Case: invalid JSON fails with explicit error
  assertThrows(
    () => parseSimulatedMarketLlmResponse("not-json", expectedAgentIds),
    "Expected error for invalid JSON",
    failures,
    "llm_invalid_json_error",
  );

  // Case: missing agentFeedback field fails
  assertThrows(
    () => parseSimulatedMarketLlmResponse(JSON.stringify({ overall: llmResult.overall }), expectedAgentIds),
    "Expected error for missing agentFeedback",
    failures,
    "llm_missing_agent_feedback_error",
  );

  // Case: agent mismatch (unknown agent) fails
  const unknownAgentResponse = JSON.stringify({
    overall: llmResult.overall,
    agentFeedback: [
      ...llmResult.agentFeedback,
      {
        agentId: "agent-unknown",
        acceptanceScore: 50,
        purchaseIntentScore: 50,
        positiveDrivers: ["x"],
        objections: ["y"],
        quoteSummary: "unknown",
        suggestedAdjustment: "unknown",
      },
    ],
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(unknownAgentResponse, expectedAgentIds),
    "Expected error for unknown agentId",
    failures,
    "llm_unknown_agent_error",
  );

  // Case: missing agent in feedback fails
  const missingAgentResponse = JSON.stringify({
    overall: llmResult.overall,
    agentFeedback: llmResult.agentFeedback.slice(1),
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(missingAgentResponse, expectedAgentIds),
    "Expected error for missing agent",
    failures,
    "llm_missing_agent_error",
  );

  // Case: duplicate agent in feedback fails
  const duplicateAgentResponse = JSON.stringify({
    overall: llmResult.overall,
    agentFeedback: [llmResult.agentFeedback[0], llmResult.agentFeedback[0]],
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(duplicateAgentResponse, [expectedAgentIds[0], expectedAgentIds[0]]),
    "Expected error for duplicate agentId",
    failures,
    "llm_duplicate_agent_error",
  );

  // Case: out-of-range scores fail (reject strategy, not clamp)
  const outOfRangeScoreResponse = JSON.stringify({
    overall: {
      ...llmResult.overall,
      acceptanceScore: 150,
    },
    agentFeedback: llmResult.agentFeedback,
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(outOfRangeScoreResponse, expectedAgentIds),
    "Expected error for out-of-range overall acceptance score",
    failures,
    "llm_score_out_of_range_error",
  );

  // Case: negative agent score fails
  const negativeAgentScoreResponse = JSON.stringify({
    overall: llmResult.overall,
    agentFeedback: [
      {
        ...llmResult.agentFeedback[0],
        acceptanceScore: -5,
      },
      ...llmResult.agentFeedback.slice(1),
    ],
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(negativeAgentScoreResponse, expectedAgentIds),
    "Expected error for negative agent acceptance score",
    failures,
    "llm_negative_agent_score_error",
  );

  // Case: confidence out of range fails
  const outOfRangeConfidenceResponse = JSON.stringify({
    overall: {
      ...llmResult.overall,
      confidence: 1.5,
    },
    agentFeedback: llmResult.agentFeedback,
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(outOfRangeConfidenceResponse, expectedAgentIds),
    "Expected error for out-of-range confidence",
    failures,
    "llm_confidence_out_of_range_error",
  );

  // Case: empty agent feedback array fails
  const emptyFeedbackResponse = JSON.stringify({
    overall: llmResult.overall,
    agentFeedback: [],
  });
  assertThrows(
    () => parseSimulatedMarketLlmResponse(emptyFeedbackResponse, expectedAgentIds),
    "Expected error for empty agentFeedback",
    failures,
    "llm_empty_feedback_error",
  );

  // Report
  console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

function assertThrows(fn: () => void, message: string, failures: TestFailure[], caseName: string) {
  try {
    fn();
    failures.push({ case: caseName, reason: message });
  } catch (error) {
    if (error instanceof Error) {
      assert(error.message.length > 0, "Thrown error should have a message", failures, caseName);
    }
  }
}

main();
