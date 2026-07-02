// P1-B4: End-to-end API smoke script.
//
// Usage:
//   npm run smoke
//   npm run smoke -- --base http://localhost:3100 --token pls-p0-demo-token --json
//
// Exits non-zero on any failure. Emits a machine-readable JSON summary when
// --json is set, otherwise a human-readable table + summary.
//
// Data admission: user-provided data is allowed by default in PLS. Smoke
// includes privacy-shaped fields to verify the API does not reintroduce
// privacy blocking.

import { argv, exit, stdout } from "node:process";

interface Args {
  base: string;
  token: string;
  workspace: string;
  json: boolean;
  verbose: boolean;
}

interface StepResult {
  name: string;
  ok: boolean;
  status?: number;
  ms: number;
  reason?: string;
  detail?: unknown;
}

interface StepReturn {
  ok: boolean;
  status?: number;
  reason?: string;
  detail?: unknown;
}

function parseArgs(): Args {
  const args = argv.slice(2);
  const flag = (name: string, def: string): string => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && typeof args[i + 1] === "string" ? (args[i + 1] as string) : def;
  };
  return {
    base: flag("base", "http://localhost:3100"),
    token: flag("token", "pls-p0-demo-token"),
    workspace: flag("workspace", "ws_demo"),
    json: args.includes("--json"),
    verbose: args.includes("--verbose"),
  };
}

const ARGS = parseArgs();
const results: StepResult[] = [];

async function request(
  method: string,
  path: string,
  init: {
    body?: unknown;
    auth?: boolean;
    workspace?: boolean;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth !== false) headers["Authorization"] = `Bearer ${ARGS.token}`;
  if (init.workspace !== false) headers["X-PLS-Workspace"] = ARGS.workspace;

  const res = await fetch(`${ARGS.base}${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave as text */
  }
  return { status: res.status, body };
}

async function step(name: string, fn: () => Promise<StepReturn>): Promise<StepResult> {
  const start = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - start;
    const result: StepResult = { name, ok: r.ok, ms, ...r };
    results.push(result);
    if (!ARGS.json) {
      const flag = r.ok ? "PASS" : "FAIL";
      stdout.write(`[${flag}] ${name}  (${ms}ms)${r.reason ? " - " + r.reason : ""}\n`);
      if (!r.ok && ARGS.verbose && r.detail !== undefined) {
        stdout.write("    detail: " + JSON.stringify(r.detail).slice(0, 500) + "\n");
      }
    }
    return result;
  } catch (error) {
    const ms = Date.now() - start;
    const result: StepResult = {
      name,
      ok: false,
      ms,
      reason: error instanceof Error ? error.message : String(error),
    };
    results.push(result);
    if (!ARGS.json) stdout.write(`[FAIL] ${name}  (${ms}ms) - ${result.reason}\n`);
    return result;
  }
}

function envelopeData<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return {} as T;
}

// The steps are large; they live in ./smoke-steps.ts
export { request, step, envelopeData, results, ARGS };
export type { StepResult, StepReturn };

async function main(): Promise<void> {
  const { runSteps } = await import("./smoke-steps.js");
  await runSteps();

  const failed = results.filter((r) => !r.ok);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    steps: results,
  };

  if (ARGS.json) {
    stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    stdout.write(
      `\nsummary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed\n`
    );
  }

  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  stdout.write(`fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  exit(2);
});
