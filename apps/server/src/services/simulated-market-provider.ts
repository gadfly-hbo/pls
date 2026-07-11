import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  buildFakeSimulatedMarketLlmResponse,
  buildSimulatedMarketPrompt,
  type SimulatedMarketInput,
} from "../../../model/src/simulated-market.js";

export interface SimulatedMarketProviderConfig {
  model: string;
  timeoutMs: number;
  useFake: boolean;
  disablePiLlm: boolean;
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
    model: process.env.SIMULATED_MARKET_MODEL ?? "minimax-m3",
    timeoutMs: parseTimeoutMs(process.env.SIMULATED_MARKET_LLM_TIMEOUT_MS),
    useFake: process.env.SIMULATED_MARKET_FAKE_LLM === "true",
    disablePiLlm: process.env.SIMULATED_MARKET_DISABLE_PI_LLM === "true",
  };
}

export async function callSimulatedMarketLlm(
  input: SimulatedMarketInput
): Promise<LlmResult> {
  const config = getSimulatedMarketProviderConfig();

  if (config.useFake) {
    return { success: true, raw: buildFakeSimulatedMarketLlmResponse(input), model: config.model };
  }

  if (config.disablePiLlm) {
    return { success: false, reason: "pi LLM disabled" };
  }

  return callPiSimulatedMarketLlm(input, config);
}

function extractPiMessageText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part !== "object" || part === null) return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

function runPiPrompt(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PLS_PI_BIN ?? "pi", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`pi prompt timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    let stderr = "";
    let output = "";
    let exitCode: number | null = null;
    const events: string[] = [];
    const rl = createInterface({ input: child.stdout });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      events.push(trimmed);
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        if (event.type === "message_end" || event.type === "turn_end") {
          const message = event.message as Record<string, unknown> | undefined;
          if (message?.role === "assistant") {
            output = extractPiMessageText(message.content) || output;
          }
        }
      } catch {
        // Ignore non-JSON process noise.
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      exitCode = code;
    });
    rl.on("close", () => {
      clearTimeout(timer);
      if (exitCode !== 0 && exitCode !== null) {
        reject(new Error(`pi exited with code ${String(exitCode)}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
        return;
      }
      const result = output.trim();
      if (!result) {
        reject(new Error(`pi returned empty output${events.length > 0 ? `: ${events.slice(-3).join("\n")}` : ""}`));
        return;
      }
      resolve(result);
    });
  });
}

async function callPiSimulatedMarketLlm(
  input: SimulatedMarketInput,
  config: SimulatedMarketProviderConfig
): Promise<LlmResult> {
  const prompt = buildSimulatedMarketPrompt(input);
  const piModel = process.env.SIMULATED_MARKET_PI_MODEL ?? "minimax-cn/MiniMax-M3";
  const args = [
    "-p",
    "--mode",
    "json",
    "--no-skills",
    "--no-tools",
    "--no-context-files",
    "--model",
    piModel,
    "--system-prompt",
    prompt.systemPrompt,
    prompt.userPrompt,
  ];

  try {
    const raw = await runPiPrompt(args, config.timeoutMs);
    return { success: true, raw, model: config.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { success: false, reason };
  }
}
