import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  buildDefaultTargetUserAgents,
  DEFAULT_QUALITY_FLAGS,
  runDeterministicSimulatedMarket,
  runLlmSimulatedMarket,
  type SimulatedMarketInput,
  type SimulatedMarketResult,
  type SimulationRun,
  type TargetAgentSourceType,
  type TargetUserAgent,
} from "../../../model/src/simulated-market.js";
import { callSimulatedMarketLlm } from "./simulated-market-provider.js";

export type {
  SimulatedMarketInput,
  SimulatedMarketResult,
  SimulationRun,
  TargetAgentSourceType,
  TargetUserAgent,
};

export interface SimulatedMarketSubagent {
  agentId: string;
  name: string;
  enabled: boolean;
  persona?: string;
  profile: TargetUserAgent["profile"];
  sourceType: TargetAgentSourceType;
  sourceRef?: TargetUserAgent["sourceRef"];
  weight?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubagentInput {
  name: string;
  enabled?: boolean;
  persona?: string;
  profile: TargetUserAgent["profile"];
  sourceType?: TargetAgentSourceType;
  sourceRef?: TargetUserAgent["sourceRef"];
  weight?: number;
}

export interface UpdateSubagentInput {
  name?: string;
  enabled?: boolean;
  persona?: string;
  profile?: TargetUserAgent["profile"];
  weight?: number;
}

export interface AudienceProfileRow {
  profile_id: string;
  canonical_object_key: string;
  source: string;
  source_batch_id: string;
  data_version: string;
  generated_at: string;
  time_window: string;
  sample_size: number | null;
  confidence: number;
  tags: string;
  unmapped_fields: string;
  quality_flags: string;
  raw: string;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function makeAgentId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function rowToSubagent(row: Record<string, unknown>): SimulatedMarketSubagent {
  return {
    agentId: row.agent_id as string,
    name: row.name as string,
    enabled: Boolean(row.enabled),
    persona: (row.persona as string | undefined) ?? undefined,
    profile: parseJson(row.profile as string, {}),
    sourceType: row.source_type as TargetAgentSourceType,
    sourceRef: parseJson(row.source_ref as string, undefined),
    weight: row.weight === null ? undefined : (row.weight as number),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function toTargetUserAgent(subagent: SimulatedMarketSubagent): TargetUserAgent {
  return {
    agentId: subagent.agentId,
    name: subagent.name,
    sourceType: subagent.sourceType,
    sourceRef: subagent.sourceRef,
    profile: subagent.profile,
    weight: subagent.weight ?? 1,
  };
}

export function buildAgentTemplates(): TargetUserAgent[] {
  return buildDefaultTargetUserAgents();
}

export function listSubagents(
  db: DatabaseSync,
  workspaceId: string,
  options: { enabled?: boolean } = {}
): SimulatedMarketSubagent[] {
  const conditions = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];

  if (options.enabled !== undefined) {
    conditions.push("enabled = ?");
    params.push(options.enabled ? 1 : 0);
  }

  const rows = db
    .prepare(
      `SELECT * FROM simulated_market_subagent
       WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(rowToSubagent);
}

export function getSubagentById(
  db: DatabaseSync,
  workspaceId: string,
  agentId: string
): SimulatedMarketSubagent | null {
  const row = db
    .prepare(
      "SELECT * FROM simulated_market_subagent WHERE workspace_id = ? AND agent_id = ?"
    )
    .get(workspaceId, agentId) as Record<string, unknown> | undefined;

  return row ? rowToSubagent(row) : null;
}

export function createSubagent(
  db: DatabaseSync,
  workspaceId: string,
  input: CreateSubagentInput
): SimulatedMarketSubagent {
  const agentId = makeAgentId();
  const now = nowIso();
  const enabled = input.enabled ?? true;
  const sourceType = input.sourceType ?? "saved_subagent";
  const sourceRef = input.sourceRef ?? { subagentId: agentId };
  const weight = input.weight ?? 1;

  db.prepare(
    `INSERT INTO simulated_market_subagent
     (workspace_id, agent_id, name, enabled, persona, profile, source_type, source_ref, weight, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    workspaceId,
    agentId,
    input.name,
    enabled ? 1 : 0,
    input.persona ?? null,
    JSON.stringify(input.profile),
    sourceType,
    JSON.stringify(sourceRef),
    weight,
    now,
    now
  );

  return {
    agentId,
    name: input.name,
    enabled,
    persona: input.persona,
    profile: input.profile,
    sourceType,
    sourceRef,
    weight,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSubagent(
  db: DatabaseSync,
  workspaceId: string,
  agentId: string,
  input: UpdateSubagentInput
): SimulatedMarketSubagent | null {
  const existing = getSubagentById(db, workspaceId, agentId);
  if (!existing) return null;

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    params.push(input.name);
  }
  if (input.enabled !== undefined) {
    updates.push("enabled = ?");
    params.push(input.enabled ? 1 : 0);
  }
  if (input.persona !== undefined) {
    updates.push("persona = ?");
    params.push(input.persona);
  }
  if (input.profile !== undefined) {
    updates.push("profile = ?");
    params.push(JSON.stringify(input.profile));
  }
  if (input.weight !== undefined) {
    updates.push("weight = ?");
    params.push(input.weight);
  }

  if (updates.length === 0) return existing;

  const now = nowIso();
  updates.push("updated_at = ?");
  params.push(now);
  params.push(workspaceId);
  params.push(agentId);

  db.prepare(
    `UPDATE simulated_market_subagent
     SET ${updates.join(", ")}
     WHERE workspace_id = ? AND agent_id = ?`
  ).run(...params);

  return getSubagentById(db, workspaceId, agentId);
}

export function deleteSubagent(
  db: DatabaseSync,
  workspaceId: string,
  agentId: string
): boolean {
  const result = db
    .prepare(
      "DELETE FROM simulated_market_subagent WHERE workspace_id = ? AND agent_id = ?"
    )
    .run(workspaceId, agentId);
  return result.changes > 0;
}

function deriveProfileFromAudienceTags(tags: Array<{ tagId: string; score?: number }>): TargetUserAgent["profile"] {
  const sorted = [...tags]
    .filter((t) => typeof t.tagId === "string" && t.tagId.length > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const allTagIds = sorted.map((t) => t.tagId);
  const topPreferences = allTagIds.slice(0, 5);

  return {
    demographics: [],
    preferences: topPreferences.length > 0 ? topPreferences.map((id) => `画像标签摘要：${id}`) : [],
    concerns: [],
    decisionFactors: allTagIds.length > 0 ? allTagIds.map((id) => `标签：${id}`) : [],
  };
}

export function deriveSubagentFromChannelObject(
  db: DatabaseSync,
  workspaceId: string,
  input: {
    canonicalObjectKey: string;
    profileId?: string;
    name?: string;
    enabled?: boolean;
  }
): SimulatedMarketSubagent | null {
  const object = db
    .prepare(
      "SELECT * FROM channel_object_latest WHERE workspace_id = ? AND canonical_object_key = ?"
    )
    .get(workspaceId, input.canonicalObjectKey) as Record<string, unknown> | undefined;

  if (!object) return null;

  const conditions = ["workspace_id = ?", "canonical_object_key = ?"];
  const params: (string | number)[] = [workspaceId, input.canonicalObjectKey];

  if (input.profileId) {
    conditions.push("profile_id = ?");
    params.push(input.profileId);
  }

  const profileRows = db
    .prepare(
      `SELECT * FROM audience_profile_latest
       WHERE ${conditions.join(" AND ")}
       ORDER BY generated_at DESC`
    )
    .all(...params) as unknown as Array<AudienceProfileRow>;

  const profileRow = profileRows[0];
  if (!profileRow) return null;

  const tags = parseJson<Array<{ tagId: string; score?: number }>>(profileRow.tags, []);
  const derivedProfile = deriveProfileFromAudienceTags(tags);

  const displayName = object.display_name as string | undefined;
  const agentName =
    input.name ??
    `${displayName || input.canonicalObjectKey} 受众画像`;

  const sourceRef = {
    canonicalObjectKey: input.canonicalObjectKey,
    profileId: profileRow.profile_id,
    dataVersion: profileRow.data_version,
    profileVersion: profileRow.data_version,
  };

  return createSubagent(db, workspaceId, {
    name: agentName,
    enabled: input.enabled ?? true,
    profile: derivedProfile,
    sourceType: "channel_audience_profile",
    sourceRef,
    weight: 1,
  });
}

export function buildAgentCandidates(
  db: DatabaseSync,
  workspaceId: string
): { templates: TargetUserAgent[]; subagents: TargetUserAgent[] } {
  const templates = buildAgentTemplates();
  const subagents = listSubagents(db, workspaceId, { enabled: true }).map(toTargetUserAgent);
  return { templates, subagents };
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
