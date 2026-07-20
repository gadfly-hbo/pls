// PLS PortraitSource seam — neutral interface for portrait object/snapshot
// discovery and dimension evidence resolution.
//
// The interface is intentionally small (4 methods) so that W05
// application/persistence code never touches SQLite rows, SQL, view names, or
// adapter implementation details.  Source facts (quality flags, batch ids,
// confidence) are preserved as-is; PLS policy derivation (ready/limited
// status, eligibility) is NOT published by adapters — that is the algorithm
// layer's responsibility.

// ---------------------------------------------------------------------------
// Source system & contract version
// ---------------------------------------------------------------------------

export const PLS_PORTRAIT_SOURCE_CONTRACT_ID = "pls-portrait-source";
export const PLS_PORTRAIT_SOURCE_CONTRACT_VERSION = "1";

export const PORTRAIT_SOURCE_SYSTEMS = ["pls_workspace", "agentharness"] as const;
export type PortraitSourceSystem = (typeof PORTRAIT_SOURCE_SYSTEMS)[number];

export const AGENTHARNESS_PORTRAIT_CONTRACT_VERSION = "0.3.0";

// ---------------------------------------------------------------------------
// Object family & type enums (V005-approved, ledger S022)
// ---------------------------------------------------------------------------

export const PORTRAIT_OBJECT_FAMILIES = ["channel", "product"] as const;
export type PortraitObjectFamily = (typeof PORTRAIT_OBJECT_FAMILIES)[number];

export const APPROVED_CHANNEL_OBJECT_TYPES = [
  "platform",
  "trade_area",
  "store",
  "account",
  "marketing_event",
  "business_scenario",
] as const;
export type ApprovedChannelObjectType = (typeof APPROVED_CHANNEL_OBJECT_TYPES)[number];

export const APPROVED_PRODUCT_OBJECT_TYPES = ["sku"] as const;
export type ApprovedProductObjectType = (typeof APPROVED_PRODUCT_OBJECT_TYPES)[number];

export type PortraitObjectType = ApprovedChannelObjectType | ApprovedProductObjectType;

const APPROVED_CHANNEL_TYPE_SET: ReadonlySet<string> = new Set(APPROVED_CHANNEL_OBJECT_TYPES);
const APPROVED_PRODUCT_TYPE_SET: ReadonlySet<string> = new Set(APPROVED_PRODUCT_OBJECT_TYPES);

export function isApprovedChannelObjectType(value: string): value is ApprovedChannelObjectType {
  return APPROVED_CHANNEL_TYPE_SET.has(value);
}

export function isApprovedProductObjectType(value: string): value is ApprovedProductObjectType {
  return APPROVED_PRODUCT_TYPE_SET.has(value);
}

export function familyForObjectType(objectType: string): PortraitObjectFamily | null {
  if (APPROVED_CHANNEL_TYPE_SET.has(objectType)) return "channel";
  if (APPROVED_PRODUCT_TYPE_SET.has(objectType)) return "product";
  return null;
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export type PortraitCapabilityReadiness = "ready" | "not_ready";

export interface PortraitSourceCapability {
  readonly sourceSystem: PortraitSourceSystem;
  readonly sourceContractVersion: string;
  readonly readiness: PortraitCapabilityReadiness;
  readonly objectDiscoveryAvailable: boolean;
  readonly snapshotDiscoveryAvailable: boolean;
  readonly evidenceResolutionAvailable: boolean;
  readonly blockingReasonCodes: readonly string[];
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Portrait Object
// ---------------------------------------------------------------------------

export interface PortraitObject {
  readonly workspaceId: string;
  readonly family: PortraitObjectFamily;
  readonly objectType: PortraitObjectType;
  readonly objectId: string;
  readonly displayName: string;
}

// ---------------------------------------------------------------------------
// Portrait Snapshot
// ---------------------------------------------------------------------------

export interface PortraitSnapshot {
  readonly sourceSystem: PortraitSourceSystem;
  readonly sourceContractVersion: string;
  readonly snapshotId: string;
  readonly dataVersion: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly sourceGeneratedAt: string;
  readonly sourceBatchId: string | null;
  readonly sampleSize: number | null;
  readonly confidence: number | null;
  readonly sourceQualityFlags: readonly string[];
}

// ---------------------------------------------------------------------------
// Dimension Evidence (resolved snapshot computation input)
// ---------------------------------------------------------------------------

export interface DimensionEvidenceRecord {
  readonly dimensionKey: string;
  readonly dimensionLabel: string;
  readonly value: number;
  readonly unit: string;
  readonly metricName: string;
  readonly metricAggregation: string;
  readonly sourceBatchId: string;
  readonly sourceQualityFlags: readonly string[];
  readonly sourceEvidenceRefs: readonly Record<string, unknown>[];
}

export interface ResolvedPortraitSnapshot {
  readonly sourceSystem: PortraitSourceSystem;
  readonly sourceContractVersion: string;
  readonly workspaceId: string;
  readonly objectId: string;
  readonly snapshot: PortraitSnapshot;
  readonly dimensionEvidence: readonly DimensionEvidenceRecord[];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ListPortraitObjectsFilters {
  readonly family?: PortraitObjectFamily;
  readonly objectType?: PortraitObjectType;
}

// ---------------------------------------------------------------------------
// PortraitSource seam — the only interface W05 consumes
// ---------------------------------------------------------------------------

export interface PortraitSource {
  getCapabilities(workspaceId: string): PortraitSourceCapability;
  listPortraitObjects(workspaceId: string, filters?: ListPortraitObjectsFilters): readonly PortraitObject[];
  listPortraitSnapshots(workspaceId: string, objectId: string): readonly PortraitSnapshot[];
  resolvePortraitSnapshot(workspaceId: string, objectId: string, snapshotId: string): ResolvedPortraitSnapshot;
}

// Internal interface - NOT for W05 consumers.  Used by the resolver and
// adapter factories to manage lifecycle without exposing close() on the
// public PortraitSource seam.  NOT re-exported from index.ts.
export interface CloseablePortraitSource extends PortraitSource {
  close(): void;
}

// ---------------------------------------------------------------------------
// Schema diagnostic (for AgentHarness adapter construction-time gate)
// ---------------------------------------------------------------------------

export interface SchemaDiagnostic {
  readonly contractVersion: string;
  readonly viewsPresent: readonly string[];
  readonly viewsMissing: readonly string[];
  readonly columnsMissing: ReadonlyArray<{ view: string; columns: readonly string[] }>;
  readonly columnsExtra: ReadonlyArray<{ view: string; columns: readonly string[] }>;
  readonly columnsReordered: ReadonlyArray<{ view: string; expected: readonly string[]; actual: readonly string[] }>;
  readonly compatible: boolean;
}

// ---------------------------------------------------------------------------
// Active source resolution result
// ---------------------------------------------------------------------------

export interface ResolvedActiveSource {
  readonly workspaceId: string;
  readonly sourceSystem: PortraitSourceSystem;
  readonly source: PortraitSource;
  /** Release any resources held by the active source (e.g. external DB connections). */
  close(): void;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function dedupSorted(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}
