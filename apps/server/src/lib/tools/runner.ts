import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import {
  type ToolRun,
  type ToolExecutionContext,
  type ToolExecutionResult,
  runDirPath,
  writeRunManifest,
  writeQualityReport,
  ensureRunsRoot,
} from "./types.js";
import { getTool } from "./registry.js";

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface DryRunPlan {
  runId: string;
  toolId: string;
  dryRun: true;
  status: "planned";
  outputDir: string;
  plannedArtifacts: string[];
  warnings: string[];
  errors: string[];
}

export interface RunOptions {
  toolId: string;
  workspaceId: string;
  parameters?: Record<string, unknown>;
  inputPath?: string;
  requestId: string;
  actor: string;
  dryRun?: boolean;
}

function buildInitialRun(
  runId: string,
  opts: RunOptions,
  outputDir: string
): ToolRun {
  return {
    runId,
    toolId: opts.toolId,
    workspaceId: opts.workspaceId,
    status: "queued",
    inputPath: opts.inputPath,
    outputDir,
    parameters: opts.parameters ?? {},
    artifacts: [],
    warnings: [],
    errors: [],
    audit: {
      requestId: opts.requestId,
      actor: opts.actor,
      event: opts.dryRun ? "tool_dry_run" : "tool_run",
    },
  };
}

export function planDryRun(opts: RunOptions): { ok: true; plan: DryRunPlan } | { ok: false; errors: string[] } {
  const tool = getTool(opts.toolId);
  if (!tool) {
    return { ok: false, errors: [`tool "${opts.toolId}" is not registered`] };
  }

  const runId = `dry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = runDirPath(runId);
  const plannedArtifacts = tool.definition.plannedArtifacts ?? tool.definition.outputFormats.map((format) =>
    format === "json"
      ? "artifacts/aggregate_profile.json"
      : format === "markdown"
      ? "artifacts/report.md"
      : `artifacts/artifact.${format}`
  );

  return {
    ok: true,
    plan: {
      runId,
      toolId: opts.toolId,
      dryRun: true,
      status: "planned",
      outputDir,
      plannedArtifacts,
      warnings: ["dry run: no files were written"],
      errors: [],
    },
  };
}

export async function runTool(opts: RunOptions): Promise<{ run: ToolRun; result: ToolExecutionResult }> {
  const tool = getTool(opts.toolId);
  if (!tool) {
    throw new Error(`tool "${opts.toolId}" is not registered`);
  }

  ensureRunsRoot();
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = runDirPath(runId);
  mkdirSync(outputDir, { recursive: true });

  const run = buildInitialRun(runId, opts, outputDir);
  run.status = "running";
  run.startedAt = nowIso();
  writeRunManifest(run);

  const ctx: ToolExecutionContext = {
    runId,
    toolId: opts.toolId,
    workspaceId: opts.workspaceId,
    runDir: outputDir,
    parameters: opts.parameters ?? {},
    requestId: opts.requestId,
    actor: opts.actor,
  };

  let result: ToolExecutionResult;
  try {
    result = await tool.execute(ctx);
  } catch (err) {
    result = {
      status: "failed",
      artifacts: [],
      warnings: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  run.status = result.status;
  run.finishedAt = nowIso();
  run.artifacts = result.artifacts;
  run.warnings = result.warnings;
  run.errors = result.errors;

  writeRunManifest(run);
  writeQualityReport(runId, {
    runId,
    toolId: opts.toolId,
    status: result.status,
    sampleSize: 0,
    warnings: result.warnings,
    errors: result.errors,
    generatedAt: run.finishedAt,
  });

  return { run, result };
}

export function dryRunTool(opts: RunOptions): DryRunPlan {
  const plan = planDryRun(opts);
  if (!plan.ok) {
    throw new Error(plan.errors.join("; "));
  }
  return plan.plan;
}
