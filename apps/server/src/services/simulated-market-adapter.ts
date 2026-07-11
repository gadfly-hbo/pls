import {
  buildDefaultTargetUserAgents,
  runDeterministicSimulatedMarket,
  type SimulatedMarketInput,
  type SimulatedMarketResult,
  type SimulationRun,
  type TargetUserAgent,
} from "../../../model/src/simulated-market.js";

export type { SimulatedMarketInput, SimulatedMarketResult, SimulationRun, TargetUserAgent };

export function buildAgentTemplates(): TargetUserAgent[] {
  return buildDefaultTargetUserAgents();
}

export function runSimulatedMarket(
  input: SimulatedMarketInput,
  options: { workspaceId: string; runId: string; generatedAt: string }
): SimulationRun {
  return runDeterministicSimulatedMarket(input, options);
}
