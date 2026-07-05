import { resolve, sep } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

export type ToolRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ToolParameterSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  toolId: string;
  name: string;
  category: "profile_extract" | "business_aggregate" | "format_convert" | "single_product_portrait";
  version: string;
  riskLevel: "L1" | "L2" | "L3";
  description: string;
  inputFormats: string[];
  outputFormats: string[];
  parameterSchema: ToolParameterSchema;
  runner: string;
  packageType?: string;
  plannedArtifacts?: string[];
}

export interface ToolArtifact {
  artifactId: string;
  name: string;
  contentType: string;
  size: number;
  path: string;
}

export interface ToolAuditSummary {
  requestId: string;
  actor: string;
  event: string;
}

export interface ToolRun {
  runId: string;
  toolId: string;
  workspaceId: string;
  status: ToolRunStatus;
  inputPath?: string;
  outputDir: string;
  parameters: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  artifacts: ToolArtifact[];
  warnings: string[];
  errors: string[];
  audit: ToolAuditSummary;
}

export interface ToolExecutionContext {
  runId: string;
  toolId: string;
  workspaceId: string;
  runDir: string;
  parameters: Record<string, unknown>;
  requestId: string;
  actor: string;
}

export interface ToolExecutionResult {
  status: ToolRunStatus;
  artifacts: ToolArtifact[];
  warnings: string[];
  errors: string[];
}

export type ToolExecutor = (ctx: ToolExecutionContext) => Promise<ToolExecutionResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

export const REPO_ROOT = resolve(import.meta.dirname, "../../../../../");
export const RUNS_ROOT = resolve(REPO_ROOT, "data/local/tool-runs");

export function runDirPath(runId: string): string {
  return resolve(RUNS_ROOT, runId);
}

export function manifestPath(runId: string): string {
  return resolve(runDirPath(runId), "run_manifest.json");
}

export function qualityReportPath(runId: string): string {
  return resolve(runDirPath(runId), "quality_report.json");
}

export function artifactPath(runDir: string, artifactId: string): string {
  return resolve(runDir, artifactId);
}

export function ensureRunsRoot(): void {
  if (!existsSync(RUNS_ROOT)) {
    mkdirSync(RUNS_ROOT, { recursive: true });
  }
}

export function writeRunManifest(run: ToolRun): void {
  const dir = runDirPath(run.runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "run_manifest.json"), JSON.stringify(run, null, 2));
}

export function writeQualityReport(runId: string, report: Record<string, unknown>): void {
  const dir = runDirPath(runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "quality_report.json"), JSON.stringify(report, null, 2));
}

export function readRunManifest(runId: string): ToolRun | null {
  if (!isSafeRunId(runId)) return null;
  const path = manifestPath(runId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ToolRun;
  } catch {
    return null;
  }
}

export function listRuns(workspaceId?: string): ToolRun[] {
  ensureRunsRoot();
  const entries = readdirSync(RUNS_ROOT);
  const runs: ToolRun[] = [];
  for (const entry of entries) {
    const run = readRunManifest(entry);
    if (run && (!workspaceId || run.workspaceId === workspaceId)) runs.push(run);
  }
  return runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export function isSafeRunId(runId: string): boolean {
  return /^run_[A-Za-z0-9_-]+$/.test(runId);
}

export function isSafeArtifactId(artifactId: string): boolean {
  if (typeof artifactId !== "string" || artifactId.length === 0) return false;
  if (artifactId.includes("..") || artifactId.includes("//") || artifactId.startsWith("/")) return false;
  return /^[A-Za-z0-9_.\-/]+$/.test(artifactId);
}

export function readArtifact(
  runId: string,
  artifactId: string,
  workspaceId?: string
): { buffer: Buffer; artifact: ToolArtifact } | null {
  const runDir = runDirPath(runId);
  if (!existsSync(runDir)) return null;
  const run = readRunManifest(runId);
  if (!run) return null;
  if (workspaceId && run.workspaceId !== workspaceId) return null;
  const artifact = run.artifacts.find((a) => a.artifactId === artifactId);
  if (!artifact) return null;
  const path = artifactPath(runDir, artifact.path);
  const resolved = resolve(path);
  if (resolved !== runDir && !resolved.startsWith(`${runDir}${sep}`)) return null;
  if (!existsSync(resolved)) return null;
  const buffer = readFileSync(resolved);
  return { buffer, artifact };
}

export function artifactSize(runDir: string, relPath: string): number {
  try {
    return statSync(resolve(runDir, relPath)).size;
  } catch {
    return 0;
  }
}
