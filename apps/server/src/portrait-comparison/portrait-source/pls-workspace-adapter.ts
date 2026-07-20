// PlsWorkspacePortraitSource - default portrait source adapter.
//
// Reads PLS's own workspace DB. Only real schema tables/views are queried.
// Evidence resolution is NOT READY (ledger S058): PLS has no unit-bearing
// Dimension Evidence, so resolvePortraitSnapshot throws.
//
// This adapter does NOT own the DB connection; close() only marks it closed.

import type { DatabaseSync } from "node:sqlite";

import {
  PLS_PORTRAIT_SOURCE_CONTRACT_VERSION,
  type PortraitObject,
  type PortraitObjectType,
  type PortraitSnapshot,
  type CloseablePortraitSource,
  type PortraitSourceCapability,
  type ResolvedPortraitSnapshot,
  type ListPortraitObjectsFilters,
  isApprovedChannelObjectType,
  familyForObjectType,
} from "./types.js";
import { PortraitSourceDataError, PortraitSourceNotReadyError } from "./errors.js";
import { parseTimeWindow, normalizeToUtcMs, parseSampleSize, parseConfidence, parseQualityFlags } from "./parsers.js";

export interface PlsWorkspacePortraitSourceOptions {
  readonly db: DatabaseSync;
  readonly workspaceId: string;
}

export function createPlsWorkspacePortraitSource(
  options: PlsWorkspacePortraitSourceOptions,
): CloseablePortraitSource {
  if (options.workspaceId.trim().length === 0) {
    throw new PortraitSourceDataError(`workspaceId must be non-blank`);
  }
  return new PlsWorkspacePortraitSource(options.db, options.workspaceId);
}

class PlsWorkspacePortraitSource implements CloseablePortraitSource {
  private readonly db: DatabaseSync;
  private readonly workspaceId: string;
  private closed = false;

  constructor(db: DatabaseSync, workspaceId: string) {
    this.db = db;
    this.workspaceId = workspaceId;
  }

  getCapabilities(workspaceId: string): PortraitSourceCapability {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    return {
      sourceSystem: "pls_workspace",
      sourceContractVersion: PLS_PORTRAIT_SOURCE_CONTRACT_VERSION,
      readiness: "not_ready",
      objectDiscoveryAvailable: true,
      snapshotDiscoveryAvailable: true,
      evidenceResolutionAvailable: false,
      blockingReasonCodes: ["evidence_pipeline_not_ready"],
      notes: [
        "PLS workspace object and snapshot discovery are available",
        "formal Dimension Evidence pipeline is not ready; resolvePortraitSnapshot is closed",
      ],
    };
  }

  listPortraitObjects(workspaceId: string, filters?: ListPortraitObjectsFilters): readonly PortraitObject[] {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    const objects: PortraitObject[] = [];
    const wantChannel = filters === undefined || filters.family === undefined || filters.family === "channel";
    const wantProduct = filters === undefined || filters.family === undefined || filters.family === "product";
    if (wantChannel && this.isChannelFilterCompatible(filters?.objectType)) {
      objects.push(...this.listChannelObjects(filters?.objectType));
    }
    if (wantProduct && this.isProductFilterCompatible(filters?.objectType)) {
      objects.push(...this.listProductObjects());
    }
    return objects.sort((a, b) => {
      if (a.family !== b.family) return a.family < b.family ? -1 : 1;
      return a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0;
    });
  }

  listPortraitSnapshots(workspaceId: string, objectId: string): readonly PortraitSnapshot[] {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    if (objectId.trim().length === 0) throw new PortraitSourceDataError(`objectId must be non-blank`);
    const channelObj = this.findChannelObject(objectId);
    if (channelObj === null) {
      if (this.findProductObject(objectId) === null) {
        throw new PortraitSourceDataError(`object not found in workspace`);
      }
      return [];
    }
    return this.listChannelSnapshots(objectId);
  }

  resolvePortraitSnapshot(workspaceId: string, objectId: string, snapshotId: string): ResolvedPortraitSnapshot {
    this.assertOpen();
    this.assertWorkspace(workspaceId);
    if (objectId.trim().length === 0) throw new PortraitSourceDataError(`objectId must be non-blank`);
    if (snapshotId.trim().length === 0) throw new PortraitSourceDataError(`snapshotId must be non-blank`);
    throw new PortraitSourceNotReadyError(
      `PLS workspace portrait source cannot resolve snapshot: formal Dimension Evidence pipeline is not ready`,
    );
  }

  close(): void {
    this.closed = true;
  }

  // --- private ---

  private assertOpen(): void {
    if (this.closed) throw new PortraitSourceDataError(`portrait source is closed`);
  }

  private assertWorkspace(workspaceId: string): void {
    if (workspaceId !== this.workspaceId) {
      throw new PortraitSourceDataError(`workspace mismatch: adapter is configured for a different workspace`);
    }
  }

  private isChannelFilterCompatible(ot?: PortraitObjectType): boolean {
    if (ot === undefined) return true;
    return familyForObjectType(ot) === "channel";
  }

  private isProductFilterCompatible(ot?: PortraitObjectType): boolean {
    if (ot === undefined) return true;
    return familyForObjectType(ot) === "product";
  }

  private listChannelObjects(filterObjectType?: PortraitObjectType): PortraitObject[] {
    const stmt = this.db.prepare(`
      SELECT workspace_id, canonical_object_key, object_type, display_name
      FROM channel_object_latest
      WHERE workspace_id = ?
      ORDER BY canonical_object_key
    `);
    const rows = stmt.all(this.workspaceId) as unknown as ChannelObjectRow[];
    const objects: PortraitObject[] = [];
    for (const row of rows) {
      if (!isApprovedChannelObjectType(row.object_type)) {
        throw new PortraitSourceDataError(
          `workspace contains channel object with unapproved type "${row.object_type}"; cannot list portrait objects`,
        );
      }
      if (filterObjectType !== undefined && row.object_type !== filterObjectType) continue;
      objects.push(this.mapChannelObject(row));
    }
    return objects;
  }

  private listProductObjects(): PortraitObject[] {
    const stmt = this.db.prepare(`
      SELECT workspace_id, sku_id, title
      FROM sku
      WHERE workspace_id = ?
      ORDER BY sku_id
    `);
    const rows = stmt.all(this.workspaceId) as unknown as SkuRow[];
    const objects: PortraitObject[] = [];
    for (const row of rows) {
      objects.push(this.mapSkuObject(row));
    }
    return objects;
  }

  private findChannelObject(objectId: string): PortraitObject | null {
    const stmt = this.db.prepare(`
      SELECT workspace_id, canonical_object_key, object_type, display_name
      FROM channel_object_latest
      WHERE workspace_id = ? AND canonical_object_key = ?
      LIMIT 1
    `);
    const row = stmt.get(this.workspaceId, objectId) as ChannelObjectRow | undefined;
    if (row === undefined) return null;
    if (!isApprovedChannelObjectType(row.object_type)) {
      throw new PortraitSourceDataError(`object has unapproved type "${row.object_type}"`);
    }
    return this.mapChannelObject(row);
  }

  private findProductObject(objectId: string): PortraitObject | null {
    const stmt = this.db.prepare(`
      SELECT workspace_id, sku_id, title
      FROM sku
      WHERE workspace_id = ? AND sku_id = ?
      LIMIT 1
    `);
    const row = stmt.get(this.workspaceId, objectId) as SkuRow | undefined;
    if (row === undefined) return null;
    return this.mapSkuObject(row);
  }

  private listChannelSnapshots(objectId: string): PortraitSnapshot[] {
    // Query the base audience_profile table filtered to the approved comparable
    // profile_stage ('channel_audience').  The _latest view returns only one
    // row per (canonical_object_key, profile_stage), which is too restrictive
    // for listing all comparable snapshots across data_versions.
    const stmt = this.db.prepare(`
      SELECT profile_id, data_version, source_batch_id, generated_at, time_window,
             sample_size, confidence, quality_flags
      FROM audience_profile
      WHERE workspace_id = ? AND canonical_object_key = ? AND profile_stage = 'channel_audience'
      ORDER BY profile_id, data_version
    `);
    const rows = stmt.all(this.workspaceId, objectId) as unknown as AudienceProfileRow[];
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

  private mapChannelObject(row: ChannelObjectRow): PortraitObject {
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

  private mapSkuObject(row: SkuRow): PortraitObject {
    if (typeof row.workspace_id !== "string" || row.workspace_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source product has blank workspace_id`);
    }
    if (typeof row.sku_id !== "string" || row.sku_id.trim().length === 0) {
      throw new PortraitSourceDataError(`source product has blank sku_id`);
    }
    if (typeof row.title !== "string" || row.title.trim().length === 0) {
      throw new PortraitSourceDataError(`source product has blank title`);
    }
    return {
      workspaceId: row.workspace_id,
      family: "product",
      objectType: "sku",
      objectId: row.sku_id,
      displayName: row.title,
    };
  }

  private mapSnapshot(row: AudienceProfileRow): PortraitSnapshot {
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
    // source_batch_id: PLS schema is NOT NULL, but could be blank string. Reject blank.
    if (row.source_batch_id !== null && (typeof row.source_batch_id !== "string" || row.source_batch_id.trim().length === 0)) {
      throw new PortraitSourceDataError(`source snapshot has blank source_batch_id`);
    }
    const { periodStart, periodEnd } = parseTimeWindow(row.time_window);
    return {
      sourceSystem: "pls_workspace",
      sourceContractVersion: PLS_PORTRAIT_SOURCE_CONTRACT_VERSION,
      snapshotId: row.profile_id,
      dataVersion: row.data_version,
      periodStart,
      periodEnd,
      sourceGeneratedAt: normalizeToUtcMs(row.generated_at),
      sourceBatchId: row.source_batch_id ?? null,
      sampleSize: parseSampleSize(row.sample_size ?? null),
      confidence: parseConfidence(row.confidence ?? null),
      sourceQualityFlags: parseQualityFlags(row.quality_flags ?? null),
    };
  }
}

// --- View row types (internal, never leaked) ---

interface ChannelObjectRow {
  workspace_id: string;
  canonical_object_key: string;
  object_type: string;
  display_name: string | null;
}

interface SkuRow {
  workspace_id: string;
  sku_id: string;
  title: string | null;
}

interface AudienceProfileRow {
  profile_id: string;
  data_version: string;
  source_batch_id: string | null;
  generated_at: string;
  time_window: string;
  sample_size: number | null;
  confidence: number | null;
  quality_flags: string | null;
}
