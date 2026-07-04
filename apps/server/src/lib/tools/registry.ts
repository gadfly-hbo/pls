import {
  type RegisteredTool,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolArtifact,
  artifactSize,
} from "./types.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

function sampleProfileExtractParameters(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      platform: { type: "string", description: "Platform name, e.g. sycm, douyin" },
      source: { type: "string", description: "Source name or identifier" },
      timeWindow: { type: "string", description: "Time window in YYYY-MM-DD/YYYY-MM-DD format" },
    },
    required: ["platform", "source"],
  };
}

function validateParameters(params: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!params.platform || typeof params.platform !== "string") {
    errors.push("platform is required and must be a string");
  }
  if (!params.source || typeof params.source !== "string") {
    errors.push("source is required and must be a string");
  }
  if (params.timeWindow && typeof params.timeWindow !== "string") {
    errors.push("timeWindow must be a string");
  }
  return errors;
}

function buildSampleProfile(
  platform: string,
  source: string,
  timeWindow: string | undefined
): Record<string, unknown> {
  return {
    platform,
    source,
    timeWindow,
    sampleSize: 0,
    note: "This is a mock/sample profile for tool smoke testing. No real business data is extracted.",
    tags: [
      { tagId: "demo_gender_female", score: 0.52, confidence: 0.6, sourceField: "sample", sourceValue: "sample" },
      { tagId: "demo_age_25_34", score: 0.31, confidence: 0.5, sourceField: "sample", sourceValue: "sample" },
    ],
    unmappedFields: [],
  };
}

async function executeSampleProfileExtract(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const errors = validateParameters(ctx.parameters);
  if (errors.length > 0) {
    return { status: "failed", artifacts: [], warnings: [], errors };
  }

  const platform = String(ctx.parameters.platform);
  const source = String(ctx.parameters.source);
  const timeWindow = ctx.parameters.timeWindow ? String(ctx.parameters.timeWindow) : undefined;

  const profile = buildSampleProfile(platform, source, timeWindow);

  const profilePath = resolve(ctx.runDir, "artifacts/aggregate_profile.json");
  mkdirSync(resolve(ctx.runDir, "artifacts"), { recursive: true });
  writeFileSync(profilePath, JSON.stringify(profile, null, 2));

  const reportPath = resolve(ctx.runDir, "artifacts/report.md");
  writeFileSync(
    reportPath,
    `# Sample Profile Extract\n\n` +
      `- platform: ${platform}\n` +
      `- source: ${source}\n` +
      `- timeWindow: ${timeWindow ?? "not specified"}\n\n` +
      `This is a mock/sample profile for smoke testing.\n`
  );

  const artifacts: ToolArtifact[] = [
    {
      artifactId: "aggregate_profile.json",
      name: "aggregate_profile.json",
      contentType: "application/json",
      size: artifactSize(ctx.runDir, "artifacts/aggregate_profile.json"),
      path: "artifacts/aggregate_profile.json",
    },
    {
      artifactId: "report.md",
      name: "report.md",
      contentType: "text/markdown",
      size: artifactSize(ctx.runDir, "artifacts/report.md"),
      path: "artifacts/report.md",
    },
  ];

  return {
    status: "succeeded",
    artifacts,
    warnings: ["sample data: no real platform file was read"],
    errors: [],
  };
}

export const TOOL_REGISTRY: Record<string, RegisteredTool> = {
  "sample-profile-extract": {
    definition: {
      toolId: "sample-profile-extract",
      name: "Sample Profile Extract",
      category: "profile_extract",
      version: "0.1.0",
      riskLevel: "L1",
      description:
        "A safe, read-only sample tool that produces a mock profile_extract package. No external platform file is read.",
      inputFormats: ["none"],
      outputFormats: ["json", "markdown"],
      parameterSchema: sampleProfileExtractParameters() as unknown as {
        type: string;
        properties: Record<string, unknown>;
        required: string[];
      },
      runner: "sample-profile-extract",
      packageType: "profile-extract",
    },
    execute: executeSampleProfileExtract,
  },
};

export function listTools(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map((t) => t.definition);
}

export function getTool(toolId: string): RegisteredTool | undefined {
  return TOOL_REGISTRY[toolId];
}
