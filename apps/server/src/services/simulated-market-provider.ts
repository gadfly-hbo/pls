import {
  buildFakeSimulatedMarketLlmResponse,
  buildSimulatedMarketPrompt,
  type SimulatedMarketInput,
} from "../../../model/src/simulated-market.js";

export interface SimulatedMarketProviderConfig {
  apiKey: string | undefined;
  apiHost: string;
  model: string;
  timeoutMs: number;
  useFake: boolean;
}

export interface LlmSuccess {
  success: true;
  raw: string;
  model: string;
}

export interface LlmFailure {
  success: false;
  reason: string;
}

export type LlmResult = LlmSuccess | LlmFailure;

function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return 30000;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return 30000;
  }
  const parsed = parseInt(trimmed, 10);
  if (parsed <= 0) {
    return 30000;
  }
  return parsed;
}

export function getSimulatedMarketProviderConfig(): SimulatedMarketProviderConfig {
  return {
    apiKey: process.env.MINIMAX_API_KEY,
    apiHost: process.env.MINIMAX_API_HOST ?? "https://api.minimaxi.com",
    model: process.env.SIMULATED_MARKET_MODEL ?? "minimax-m3",
    timeoutMs: parseTimeoutMs(process.env.SIMULATED_MARKET_LLM_TIMEOUT_MS),
    useFake: process.env.SIMULATED_MARKET_FAKE_LLM === "true",
  };
}

function hasKey<T extends object, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function extractMinimaxContent(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    throw new Error("Minimax response is not a JSON object");
  }

  if (!hasKey(data, "choices") || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error("Minimax response missing choices");
  }

  const firstChoice = data.choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    throw new Error("Minimax response choice is not an object");
  }

  if (!hasKey(firstChoice, "message")) {
    throw new Error("Minimax response missing message");
  }

  const message = firstChoice.message;
  if (typeof message !== "object" || message === null) {
    throw new Error("Minimax response message is not an object");
  }

  if (!hasKey(message, "content") || typeof message.content !== "string") {
    throw new Error("Minimax response missing content string");
  }

  return message.content;
}

export async function callSimulatedMarketLlm(
  input: SimulatedMarketInput
): Promise<LlmResult> {
  const config = getSimulatedMarketProviderConfig();

  if (config.useFake) {
    return { success: true, raw: buildFakeSimulatedMarketLlmResponse(input), model: config.model };
  }

  if (!config.apiKey) {
    return { success: false, reason: "MINIMAX_API_KEY not configured" };
  }

  const prompt = buildSimulatedMarketPrompt(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.apiHost}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        reason: `Minimax API returned status ${response.status}`,
      };
    }

    const data = (await response.json()) as unknown;
    const raw = extractMinimaxContent(data);

    return { success: true, raw, model: config.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}
