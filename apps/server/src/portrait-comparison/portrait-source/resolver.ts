// Active portrait source resolver.
//
// Reads the `data_source` table in the workspace DB to determine which
// portrait source adapter to use for a given workspace.  The fixed source_id
// is `portrait_source` (ledger S064).
//
// Resolution rules (ledger S057, S064, S085):
// - No ROW for (workspace_id, 'portrait_source'): default to pls_workspace.
//   This is the ONLY fallback - it only happens when the config row is absent.
// - Missing data_source TABLE is NOT a missing row: fail closed.
// - Row exists but status != active, adapter is unknown, config is invalid
//   JSON or wrong shape, or adapter construction fails: FAIL CLOSED.  Never
//   silently fall back to pls_workspace.
// - pls_workspace config must be an empty object {}.
// - agentharness config must have a non-empty dbPath string.
// - plsWorkspaceDbPath is REQUIRED so self-DB coupling is never bypassable.

import type { DatabaseSync } from "node:sqlite";

import type { PortraitSourceSystem, ResolvedActiveSource, CloseablePortraitSource } from "./types.js";
import { PortraitSourceResolverError } from "./errors.js";
import { createPlsWorkspacePortraitSource } from "./pls-workspace-adapter.js";
import { createAgentHarnessPortraitSource } from "./agentharness-adapter.js";

export const PORTRAIT_SOURCE_ID = "portrait_source";
const ALLOWED_ADAPTERS: ReadonlySet<string> = new Set(["pls_workspace", "agentharness"]);

export interface ResolveActiveSourceOptions {
  readonly db: DatabaseSync;
  readonly workspaceId: string;
  /** REQUIRED: PLS workspace DB path, used to reject AgentHarness self-DB coupling. */
  readonly plsWorkspaceDbPath: string;
}

export function resolveActivePortraitSource(options: ResolveActiveSourceOptions): ResolvedActiveSource {
  if (options.workspaceId.trim().length === 0) {
    throw new PortraitSourceResolverError(`workspaceId must be non-blank`);
  }
  if (typeof options.plsWorkspaceDbPath !== "string" || options.plsWorkspaceDbPath.trim().length === 0) {
    throw new PortraitSourceResolverError(`plsWorkspaceDbPath must be a non-empty string`);
  }

  const row = readDataSourceRow(options.db, options.workspaceId);
  if (row === null) {
    // No config ROW: default to pls_workspace.  This is the ONLY fallback.
    const source = createPlsWorkspacePortraitSource({
      db: options.db,
      workspaceId: options.workspaceId,
    });
    return {
      workspaceId: options.workspaceId,
      sourceSystem: "pls_workspace",
      source,
      close: () => { source.close(); },
    };
  }

  // Row exists: validate every field.  No fallback on invalid records.
  validateRowShape(row);

  const adapter = row.adapter;
  // config is already validated as a non-null object by validateRowShape.
  const config = JSON.parse(row.config) as Record<string, unknown>;

  if (adapter === "pls_workspace") {
    validatePlsWorkspaceConfig(config);
    const source = createPlsWorkspacePortraitSource({
      db: options.db,
      workspaceId: options.workspaceId,
    });
    return {
      workspaceId: options.workspaceId,
      sourceSystem: "pls_workspace",
      source,
      close: () => { source.close(); },
    };
  }

  // adapter === "agentharness" (guaranteed by validateRowShape + ALLOWED_ADAPTERS)
  validateAgentHarnessConfig(config);
  const dbPath = config["dbPath"] as string;
  let source: CloseablePortraitSource;
  try {
    source = createAgentHarnessPortraitSource({
      dbPath,
      workspaceId: options.workspaceId,
      plsWorkspaceDbPath: options.plsWorkspaceDbPath,
    });
  } catch (error) {
    // Adapter construction failed - fail closed, do NOT fall back to pls_workspace.
    if (error instanceof PortraitSourceResolverError) throw error;
    const message = error instanceof Error ? error.message : "unknown construction failure";
    throw new PortraitSourceResolverError(
      `active portrait source adapter "${adapter}" could not be constructed: ${message}`,
    );
  }
  return {
    workspaceId: options.workspaceId,
    sourceSystem: "agentharness",
    source,
    close: () => { source.close(); },
  };
}

// ---------------------------------------------------------------------------
// data_source row reader
// ---------------------------------------------------------------------------

interface DataSourceRow {
  readonly source_id: string;
  readonly workspace_id: string;
  readonly adapter: string;
  readonly status: string;
  readonly config: string;
}

function readDataSourceRow(db: DatabaseSync, workspaceId: string): DataSourceRow | null {
  // Missing data_source TABLE is a schema problem, NOT a missing config row.
  // Fail closed instead of defaulting to pls_workspace.
  const tableCheck = db.prepare(`
    SELECT COUNT(*) AS c FROM sqlite_master
    WHERE type = 'table' AND name = 'data_source'
  `);
  const tableRow = tableCheck.get() as { c: number } | undefined;
  if (tableRow === undefined || tableRow.c === 0) {
    throw new PortraitSourceResolverError(
      `data_source table does not exist in workspace DB; missing required schema is not a missing config row`,
    );
  }

  const stmt = db.prepare(`
    SELECT source_id, workspace_id, adapter, status, config
    FROM data_source
    WHERE workspace_id = ? AND source_id = ?
  `);
  const rows = stmt.all(workspaceId, PORTRAIT_SOURCE_ID) as unknown as DataSourceRow[];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new PortraitSourceResolverError(
      `data_source has ${rows.length} rows for source_id="${PORTRAIT_SOURCE_ID}"; expected at most 1`,
    );
  }
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

function validateRowShape(row: DataSourceRow): void {
  if (row.status !== "active") {
    throw new PortraitSourceResolverError(
      `portrait_source data_source row is not active (status="${row.status}"); fail closed`,
    );
  }
  if (!ALLOWED_ADAPTERS.has(row.adapter)) {
    throw new PortraitSourceResolverError(
      `portrait_source data_source row has unknown adapter "${row.adapter}"; allowed: pls_workspace, agentharness`,
    );
  }
  // config must be valid JSON object.  Do NOT use ?? {} - keep null/undefined
  // to the final validation point so missing config is caught, not defaulted.
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.config);
  } catch {
    throw new PortraitSourceResolverError(
      `portrait_source data_source row has invalid JSON config; fail closed`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PortraitSourceResolverError(
      `portrait_source data_source row config must be a JSON object; fail closed`,
    );
  }
}

function validatePlsWorkspaceConfig(config: Record<string, unknown>): void {
  const keys = Object.keys(config);
  if (keys.length > 0) {
    throw new PortraitSourceResolverError(
      `pls_workspace config must be an empty object; unexpected keys: ${keys.join(", ")}`,
    );
  }
}

function validateAgentHarnessConfig(config: Record<string, unknown>): void {
  const dbPath = config["dbPath"];
  if (typeof dbPath !== "string" || dbPath.trim().length === 0) {
    throw new PortraitSourceResolverError(
      `agentharness config must have a non-empty dbPath string`,
    );
  }
  const knownKeys = new Set(["dbPath"]);
  const extra = Object.keys(config).filter((k) => !knownKeys.has(k));
  if (extra.length > 0) {
    throw new PortraitSourceResolverError(
      `agentharness config has unexpected keys: ${extra.join(", ")}; only dbPath is allowed`,
    );
  }
}
