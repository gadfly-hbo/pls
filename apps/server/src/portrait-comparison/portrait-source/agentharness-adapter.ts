// AgentHarnessPortraitSource - optional adapter that reads from the
// AgentHarness SQLite database (0.3.0 consumption contract).
//
// Opens an independent read-only + query_only connection.  The adapter OWNS
// this connection and must close() it.  Construction fails closed if the path
// is invalid, the connection cannot be opened read-only, query_only cannot be
// verified, or the schema gate detects drift.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
  type PortraitObject,
  type PortraitObjectType,
  type PortraitSnapshot,
  type CloseablePortraitSource,
  type PortraitSourceCapability,
  type ResolvedPortraitSnapshot,
  type DimensionEvidenceRecord,
  type ListPortraitObjectsFilters,
  isApprovedChannelObjectType,
} from "./types.js";
import {
  PortraitSourceConfigError,
  PortraitSourceDataError,
  PortraitSourceUnavailableError,
  PortraitSourceNotReadyError,
  PortraitSourceSchemaError,
} from "./errors.js";
import { validateViewSchema } from "./schema-gate.js";
import { parseTimeWindow, normalizeToUtcMs, parseSampleSize, parseConfidence, parseQualityFlags, parseEvidenceRefs } from "./parsers.js";

export interface AgentHarnessPortraitSourceOptions {
  readonly dbPath: string;
  readonly workspaceId: string;
  /** REQUIRED: Path of the PLS workspace DB to reject (prevents self-DB coupling). */
  readonly plsWorkspaceDbPath: string;
  /** Internal test seam: override evidence probe. NOT part of public contract. */
  readonly _probeEvidence?: (db: DatabaseSync, workspaceId: string) => boolean;
  /** Internal test seam: override db.close(). NOT part of public contract. */
  readonly _closeDb?: (db: DatabaseSync) => void;
}

export function createAgentHarnessPortraitSource(
  options: AgentHarnessPortraitSourceOptions,
): CloseablePortraitSource {
  if (options.workspaceId.trim().length === 0) {
    throw new PortraitSourceConfigError(`workspaceId must be non-blank`);
  }
  if (typeof options.plsWorkspaceDbPath !== "string" || options.plsWorkspaceDbPath.trim().length === 0) {
    throw new PortraitSourceConfigError(`plsWorkspaceDbPath must be a non-empty string`);
  }
  const dbPath = validateAgentHarnessDbPath(options.dbPath, options.plsWorkspaceDbPath);

  // All owned-connection cleanup routes through one internal close seam.
  const closeDb = options._closeDb ?? ((d: DatabaseSync) => d.close());
  const cleanupDb = (db: DatabaseSync): void => {
    try { closeDb(db); } catch { /* best-effort on constructor cleanup */ }
  };

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    throw new PortraitSourceUnavailableError(
      `AgentHarness database cannot be opened read-only at the configured path`,
    );
  }

  // All post-open initialization in one ownership guard.
  // If any step fails, cleanupDb is called exactly once.
  // Ownership transfers to the adapter only on successful construction (return).
  try {
    // Set query_only and verify it on THIS connection.
    db.exec("PRAGMA query_only = ON");
    const verifyStmt = db.prepare("PRAGMA query_only");
    const row = verifyStmt.get() as { query_only: number } | undefined;
    if (row === undefined || row.query_only !== 1) {
      throw new PortraitSourceUnavailableError(
        `AgentHarness connection query_only verification failed`,
      );
    }

    // Schema gate.
    const diagnostic = validateViewSchema(db);
    if (!diagnostic.compatible) {
      throw new PortraitSourceSchemaError(diagnostic);
    }

    // Check if any evidence rows exist for this workspace (construction-gated).
    const probeEvidence = options._probeEvidence ?? defaultProbeEvidence;
    let hasEvidence = false;
    try {
      hasEvidence = probeEvidence(db, options.workspaceId);
    } catch {
      // Query failure is source unavailable/contract failure, not absence.
      throw new PortraitSourceUnavailableError(
        `AgentHarness evidence availability probe failed: source contract incompatible or unavailable`,
      );
    }

    // Ownership transfers to adapter on successful construction.
    return new AgentHarnessPortraitSource(db, options.workspaceId, hasEvidence, closeDb);
  } catch (error) {
    // Any failure before ownership transfer: cleanup exactly once.
    cleanupDb(db);
    throw error;
  }
}

function defaultProbeEvidence(db: DatabaseSync, workspaceId: string): boolean {
  const evStmt = db.prepare(`
    SELECT 1 FROM v_workpls_dimension_evidence
    WHERE workspace_id = ? LIMIT 1
  `);
  const evRow = evStmt.get(workspaceId);
  return evRow !== undefined;
}

class AgentHarnessPortraitSource implements CloseablePortraitSource {
  private readonly db: DatabaseSync;
  private readonly workspaceId: string;
  private readonly hasEvidence: boolean;
  private readonly closeDb: (db: DatabaseSync) => void;
  private closed = false;

  constructor(db: DatabaseSync, workspaceId: string, hasEvidence: boolean, closeDb?: (db: DatabaseSync) => void) {
    this.db = db;
    this.workspaceId = workspaceId;
    this.hasEvidence = hasEvidence;
    this.closeDb = closeDb ?? ((d) => d.close());
  }

  getCapabilities(workspaceId: string): PortraitSourceCapability {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    if (!this.hasEvidence) {
      return {
        sourceSystem: "agentharness",
        sourceContractVersion: AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
        readiness: "not_ready",
        objectDiscoveryAvailable: true,
        snapshotDiscoveryAvailable: true,
        evidenceResolutionAvailable: false,
        blockingReasonCodes: ["no_unit_bearing_evidence_available"],
        notes: [
          "AgentHarness 0.3.0 source is available for object and snapshot discovery",
          "no unit-bearing Dimension Evidence found for this workspace; resolvePortraitSnapshot is closed",
        ],
      };
    }
    return {
      sourceSystem: "agentharness",
      sourceContractVersion: AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
      readiness: "ready",
      objectDiscoveryAvailable: true,
      snapshotDiscoveryAvailable: true,
      evidenceResolutionAvailable: true,
      blockingReasonCodes: [],
      notes: [
        "AgentHarness 0.3.0 read-only source is available",
        "evidence resolution is available for comparable snapshots",
      ],
    };
  }

  listPortraitObjects(workspaceId: string, filters?: ListPortraitObjectsFilters): readonly PortraitObject[] {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    // AgentHarness only maps channel objects (no product family).
    if (filters !== undefined) {
      if (filters.family === "product") return [];
      if (filters.objectType !== undefined && familyForObjectTypeSafe(filters.objectType) === "product") return [];
    }
    const stmt = this.db.prepare(`
      SELECT workspace_id, canonical_object_key, object_type, display_name
      FROM v_pls_channel_profile_overview
      WHERE workspace_id = ?
      ORDER BY canonical_object_key
    `);
    const rows = stmt.all(this.workspaceId) as unknown as OverviewRow[];
    const objects: PortraitObject[] = [];
    const seenIds = new Set<string>();
    for (const row of rows) {
      if (!isApprovedChannelObjectType(row.object_type)) {
        throw new PortraitSourceDataError(
          `workspace contains object with unapproved type "${row.object_type}"; cannot list portrait objects`,
        );
      }
      if (filters?.objectType !== undefined && row.object_type !== filters.objectType) continue;
      const obj = this.mapOverviewObject(row);
      if (seenIds.has(obj.objectId)) {
        throw new PortraitSourceDataError(
          `ambiguous objectId "${obj.objectId}"; duplicate rows not allowed`,
        );
      }
      seenIds.add(obj.objectId);
      objects.push(obj);
    }
    return objects;
  }

  listPortraitSnapshots(workspaceId: string, objectId: string): readonly PortraitSnapshot[] {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    if (objectId.trim().length === 0) throw new PortraitSourceDataError(`objectId must be non-blank`);

    // Verify the object exists.
    const obj = this.findObject(objectId);
    if (obj === null) throw new PortraitSourceDataError(`object not found`);

    const stmt = this.db.prepare(`
      SELECT profile_id, data_version, source_batch_id, generated_at, time_window,
             sample_size, confidence, quality_flags_json
      FROM v_pls_audience_profile_snapshots
      WHERE workspace_id = ? AND canonical_object_key = ?
      ORDER BY profile_id
    `);
    const rows = stmt.all(this.workspaceId, objectId) as unknown as SnapshotRow[];
    const snapshots = rows.map((row) => this.mapSnapshot(row));
    // Reject duplicate snapshotId (ambiguous identity).
    const seen = new Set<string>();
    for (const snap of snapshots) {
      if (seen.has(snap.snapshotId)) {
        throw new PortraitSourceDataError(
          `ambiguous snapshotId "${snap.snapshotId}" for object "${objectId}"; duplicate rows not allowed`,
        );
      }
      seen.add(snap.snapshotId);
    }
    return snapshots;
  }

  resolvePortraitSnapshot(workspaceId: string, objectId: string, snapshotId: string): ResolvedPortraitSnapshot {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    if (!this.hasEvidence) {
      throw new PortraitSourceNotReadyError(
        `AgentHarness portrait source cannot resolve snapshot: no unit-bearing Dimension Evidence found for this workspace`,
      );
    }
    if (objectId.trim().length === 0) throw new PortraitSourceDataError(`objectId must be non-blank`);
    if (snapshotId.trim().length === 0) throw new PortraitSourceDataError(`snapshotId must be non-blank`);

    // Verify object exists.
    const obj = this.findObject(objectId);
    if (obj === null) throw new PortraitSourceDataError(`object not found`);

    // Get the snapshot (rejects ambiguous snapshotId).
    const snapshot = this.getSnapshot(objectId, snapshotId);

    // Read dimension evidence with ALL binding fields for cross-validation.
    const stmt = this.db.prepare(`
      SELECT profile_id, dimension_key, dimension_label, value, unit, metric_name, metric_aggregation,
             data_version, profile_time_window, source_batch_id,
             source_quality_flags_json, source_evidence_refs_json
      FROM v_workpls_dimension_evidence
      WHERE workspace_id = ? AND canonical_object_key = ? AND snapshot_id = ?
      ORDER BY dimension_key
    `);
    const rows = stmt.all(this.workspaceId, objectId, snapshotId) as unknown as EvidenceRow[];

    // Blocker 2: require non-empty evidence for this specific snapshot.
    if (rows.length === 0) {
      throw new PortraitSourceDataError(
        `no dimension evidence found for object "${objectId}" snapshot "${snapshotId}"; cannot resolve`,
      );
    }

    const evidence: DimensionEvidenceRecord[] = [];
    const seenDimensions = new Set<string>();
    for (const row of rows) {
      const ev = this.mapEvidence(row);
      // Validate evidence binding fields against the resolved snapshot.
      // profile_id must equal snapshot_id (the evidence view aliases snapshot_id = profile_id).
      if (row.profile_id !== snapshotId) {
        throw new PortraitSourceDataError(
          `evidence profile_id "${row.profile_id}" does not match snapshotId "${snapshotId}" for dimension "${row.dimension_key}"`,
        );
      }
      if (row.data_version !== snapshot.dataVersion) {
        throw new PortraitSourceDataError(
          `evidence data_version "${row.data_version}" does not match snapshot dataVersion "${snapshot.dataVersion}" for dimension "${row.dimension_key}"`,
        );
      }
      // profile_time_window must match snapshot period (time_window format: YYYY-MM-DD/YYYY-MM-DD).
      const expectedWindow = snapshot.periodStart + "/" + snapshot.periodEnd;
      if (row.profile_time_window !== expectedWindow) {
        throw new PortraitSourceDataError(
          `evidence profile_time_window "${row.profile_time_window}" does not match snapshot period "${expectedWindow}" for dimension "${row.dimension_key}"`,
        );
      }
      if (row.source_batch_id !== snapshot.sourceBatchId) {
        throw new PortraitSourceDataError(
          `evidence source_batch_id "${row.source_batch_id}" does not match snapshot sourceBatchId "${snapshot.sourceBatchId}" for dimension "${row.dimension_key}"`,
        );
      }
      // metric_aggregation must be 'sum' (the only approved value per validation 030).
      if (row.metric_aggregation !== "sum") {
        throw new PortraitSourceDataError(
          `evidence metric_aggregation "${row.metric_aggregation}" is not approved; only "sum" is allowed`,
        );
      }
      // source_quality_flags_json must equal the resolved snapshot's quality flags.
      const evFlags = parseQualityFlags(row.source_quality_flags_json);
      const snapFlags = [...snapshot.sourceQualityFlags].sort();
      const evFlagsSorted = [...evFlags].sort();
      if (evFlagsSorted.length !== snapFlags.length || evFlagsSorted.some((f, i) => f !== snapFlags[i])) {
        throw new PortraitSourceDataError(
          `evidence source_quality_flags_json does not match snapshot quality flags for dimension "${row.dimension_key}"`,
        );
      }
      // Reject duplicate dimension_key (ambiguous).
      if (seenDimensions.has(ev.dimensionKey)) {
        throw new PortraitSourceDataError(
          `ambiguous dimension_key "${ev.dimensionKey}"; duplicate evidence rows not allowed`,
        );
      }
      seenDimensions.add(ev.dimensionKey);
      // Validate evidence-ref sourceBatchId matches the evidence row's source_batch_id.
      for (let i = 0; i < ev.sourceEvidenceRefs.length; i++) {
        const ref = ev.sourceEvidenceRefs[i]!;
        const refBatch = ref["sourceBatchId"];
        if (typeof refBatch !== "string" || refBatch !== row.source_batch_id) {
          throw new PortraitSourceDataError(
            `evidence ref[${i}] sourceBatchId "${refBatch}" does not match evidence source_batch_id "${row.source_batch_id}" for dimension "${ev.dimensionKey}"`,
          );
        }
      }
      evidence.push(ev);
    }

    return {
      sourceSystem: "agentharness",
      sourceContractVersion: AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
      workspaceId: this.workspaceId,
      objectId,
      snapshot,
      dimensionEvidence: evidence,
    };
  }

  close(): void {
    if (this.closed) return;
    try {
      this.closeDb(this.db);
    } catch {
      // Do NOT mark as closed on failure - the connection may still be retryable.
      throw new PortraitSourceUnavailableError(
        `AgentHarness connection close failed: resource release error`,
      );
    }
    // Only mark as closed after successful close.
    this.closed = true;
  }

  // --- private ---

  private assertOpen(): void {
    if (this.closed) throw new PortraitSourceDataError(`portrait source is closed`);
  }

  private assertWorkspace(workspaceId: string): void {
    if (workspaceId !== this.workspaceId) {
      throw new PortraitSourceConfigError(`workspace mismatch: adapter is configured for a different workspace`);
    }
  }

  private findObject(objectId: string): PortraitObject | null {
    const stmt = this.db.prepare(`
      SELECT workspace_id, canonical_object_key, object_type, display_name
      FROM v_pls_channel_profile_overview
      WHERE workspace_id = ? AND canonical_object_key = ?
    `);
    const rows = stmt.all(this.workspaceId, objectId) as unknown as OverviewRow[];
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new PortraitSourceDataError(
        `ambiguous objectId "${objectId}"; ${rows.length} rows found, expected at most 1`,
      );
    }
    const row = rows[0]!;
    if (!isApprovedChannelObjectType(row.object_type)) {
      throw new PortraitSourceDataError(`object has unapproved type "${row.object_type}"`);
    }
    return this.mapOverviewObject(row);
  }

  private getSnapshot(objectId: string, snapshotId: string): PortraitSnapshot {
    const stmt = this.db.prepare(`
      SELECT profile_id, data_version, source_batch_id, generated_at, time_window,
             sample_size, confidence, quality_flags_json
      FROM v_pls_audience_profile_snapshots
      WHERE workspace_id = ? AND canonical_object_key = ? AND profile_id = ?
    `);
    const rows = stmt.all(this.workspaceId, objectId, snapshotId) as unknown as SnapshotRow[];
    if (rows.length === 0) throw new PortraitSourceDataError(`snapshot not found for object "${objectId}" and snapshotId "${snapshotId}"`);
    if (rows.length > 1) {
      throw new PortraitSourceDataError(
        `ambiguous snapshotId "${snapshotId}" for object "${objectId}"; ${rows.length} rows found, expected at most 1`,
      );
    }
    const row = rows[0]!;
    return this.mapSnapshot(row);
  }

  private mapOverviewObject(row: OverviewRow): PortraitObject {
    if (typeof row.workspace_id !== "string" || row.workspace_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source object has blank workspace_id`);
    }
    if (typeof row.canonical_object_key !== "string" || row.canonical_object_key.trim().length === 0) {
      throw new PortraitSourceDataError(`source object has blank canonical_object_key`);
    }
    if (typeof row.display_name !== "string" || row.display_name.trim().length === 0) {
      throw new PortraitSourceDataError(`source object has blank display_name`);
    }
    return {
      workspaceId: row.workspace_id,
      family: "channel",
      objectType: row.object_type as PortraitObjectType,
      objectId: row.canonical_object_key,
      displayName: row.display_name,
    };
  }

  private mapSnapshot(row: SnapshotRow): PortraitSnapshot {
    if (typeof row.profile_id !== "string" || row.profile_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source snapshot has blank profile_id`);
    }
    if (typeof row.data_version !== "string" || row.data_version.trim().length === 0) {
      throw new PortraitSourceDataError(`source snapshot has blank data_version`);
    }
    if (typeof row.time_window !== "string" || row.time_window.trim().length === 0) {
      throw new PortraitSourceDataError(`source snapshot has blank time_window`);
    }
    if (typeof row.generated_at !== "string" || row.generated_at.trim().length === 0) {
      throw new PortraitSourceDataError(`source snapshot has blank generated_at`);
    }
    if (row.source_batch_id !== null && typeof row.source_batch_id === "string" && row.source_batch_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source snapshot has blank source_batch_id; use NULL for missing batch`);
    }
    const { periodStart, periodEnd } = parseTimeWindow(row.time_window);
    return {
      sourceSystem: "agentharness",
      sourceContractVersion: AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
      snapshotId: row.profile_id,
      dataVersion: row.data_version,
      periodStart,
      periodEnd,
      sourceGeneratedAt: normalizeToUtcMs(row.generated_at),
      sourceBatchId: row.source_batch_id ?? null,
      sampleSize: parseSampleSize(row.sample_size ?? null),
      confidence: parseConfidence(row.confidence ?? null),
      sourceQualityFlags: parseQualityFlags(row.quality_flags_json),
    };
  }

  private mapEvidence(row: EvidenceRow): DimensionEvidenceRecord {
    if (typeof row.dimension_key !== "string" || row.dimension_key.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank dimension_key`);
    }
    if (typeof row.dimension_label !== "string" || row.dimension_label.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank dimension_label`);
    }
    if (typeof row.unit !== "string" || row.unit.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank unit`);
    }
    if (typeof row.metric_name !== "string" || row.metric_name.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank metric_name`);
    }
    if (typeof row.metric_aggregation !== "string" || row.metric_aggregation.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank metric_aggregation`);
    }
    if (typeof row.source_batch_id !== "string" || row.source_batch_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source dimension evidence has blank source_batch_id`);
    }
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      throw new PortraitSourceDataError(`source dimension evidence has non-finite value for dimension "${row.dimension_key}"`);
    }
    const flags = parseQualityFlags(row.source_quality_flags_json);
    const refs = parseEvidenceRefs(row.source_evidence_refs_json, row.dimension_key);
    return {
      dimensionKey: row.dimension_key,
      dimensionLabel: row.dimension_label,
      value: row.value,
      unit: row.unit,
      metricName: row.metric_name,
      metricAggregation: row.metric_aggregation,
      sourceBatchId: row.source_batch_id,
      sourceQualityFlags: flags,
      sourceEvidenceRefs: refs,
    };
  }
}

function familyForObjectTypeSafe(objectType: string): "channel" | "product" | null {
  if (isApprovedChannelObjectType(objectType)) return "channel";
  if (objectType === "sku") return "product";
  return null;
}

// --- View row types (internal) ---

interface OverviewRow {
  workspace_id: string;
  canonical_object_key: string;
  object_type: string;
  display_name: string | null;
}

interface SnapshotRow {
  profile_id: string;
  data_version: string;
  source_batch_id: string | null;
  generated_at: string;
  time_window: string;
  sample_size: number | null;
  confidence: number | null;
  quality_flags_json: string | null;
}

interface EvidenceRow {
  profile_id: string;
  dimension_key: string;
  dimension_label: string;
  value: number;
  unit: string;
  metric_name: string;
  metric_aggregation: string;
  data_version: string;
  profile_time_window: string;
  source_batch_id: string;
  source_quality_flags_json: string;
  source_evidence_refs_json: string;
}

// --- DB path validation ---

function validateAgentHarnessDbPath(dbPath: string, plsWorkspaceDbPath: string): string {
  if (dbPath.trim().length === 0) {
    throw new PortraitSourceConfigError(`AgentHarness database path must be configured explicitly`);
  }
  if (!path.isAbsolute(dbPath)) {
    throw new PortraitSourceConfigError(`AgentHarness database path must be absolute`);
  }
  const normalized = path.normalize(dbPath);
  try {
    const stat = fs.lstatSync(normalized);
    if (stat.isSymbolicLink()) {
      throw new PortraitSourceConfigError(`AgentHarness database path must not be a symlink`);
    }
    if (!stat.isFile()) {
      throw new PortraitSourceConfigError(`AgentHarness database path is not a regular file`);
    }
  } catch (error) {
    if (error instanceof PortraitSourceConfigError) throw error;
    throw new PortraitSourceConfigError(`AgentHarness database is not accessible`);
  }
  if (plsWorkspaceDbPath.trim().length > 0 && fs.existsSync(plsWorkspaceDbPath)) {
    const plsReal = fs.realpathSync(plsWorkspaceDbPath);
    const harnessReal = fs.realpathSync(normalized);
    if (plsReal === harnessReal) {
      throw new PortraitSourceConfigError(
        `AgentHarness database path resolves to the same file as the PLS workspace database`,
      );
    }
  }
  try {
    fs.accessSync(normalized, fs.constants.R_OK);
  } catch {
    throw new PortraitSourceConfigError(`AgentHarness database is not readable`);
  }
  return normalized;
}
