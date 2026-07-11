import {
  buildDefaultTargetUserAgents,
  DEFAULT_QUALITY_FLAGS,
  runDeterministicSimulatedMarket,
  runLlmSimulatedMarket,
  type SimulatedMarketInput,
  type SimulatedMarketResult,
  type SimulationRun,
  type TargetUserAgent,
} from "../../../model/src/simulated-market.js";
import { callSimulatedMarketLlm } from "./simulated-market-provider.js";

export type { SimulatedMarketInput, SimulatedMarketResult, SimulationRun, TargetUserAgent };

export function buildAgentTemplates(): TargetUserAgent[] {
  return buildDefaultTargetUserAgents();
}

export async function runSimulatedMarket(
  input: SimulatedMarketInput,
  options: { workspaceId: string; runId: string; generatedAt: string }
): Promise<SimulationRun> {
  const llmResult = await callSimulatedMarketLlm(input);

  if (llmResult.success) {
    try {
      const run = runLlmSimulatedMarket(input, llmResult.raw, options);
      return { ...run, modelVersion: llmResult.model };
    } catch {
      // Parser rejected the LLM response; fall through to deterministic fallback.
    }
  }

  const fallbackRun = runDeterministicSimulatedMarket(input, options);
  const fallbackFlags = new Set(fallbackRun.qualityFlags);
  fallbackFlags.add(DEFAULT_QUALITY_FLAGS.llmUnavailableFallbackUsed);

  return {
    ...fallbackRun,
    qualityFlags: [...fallbackFlags].sort(),
  };
}
