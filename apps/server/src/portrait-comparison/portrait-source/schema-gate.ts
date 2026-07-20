// AgentHarness schema gate - validates that the upstream SQLite database has
// the exact views and columns required by the PLS portrait-source consumption
// contract (AgentHarness 0.3.0).
//
// The gate uses pragma_table_info to discover columns with their ordinal
// position.  It never uses SELECT * and never binds by ordinal position.
// Two views require EXACT column sets in the correct order (no extras, no
// reorder); the overview view only requires the listed columns to be present.

import type { DatabaseSync } from "node:sqlite";

import type { SchemaDiagnostic } from "./types.js";

// ---------------------------------------------------------------------------
// Required views (AgentHarness 0.3.0)
// ---------------------------------------------------------------------------

// Core required views - must exist with exact columns.
// Missing or incompatible core views cause schema gate failure.
export const CORE_REQUIRED_VIEWS = [
  "v_pls_channel_profile_overview",
  "v_pls_audience_profile_snapshots",
  "v_workpls_dimension_evidence",
] as const;

// Required columns per core view.  The schema gate checks exact presence of
// these columns - never SELECT * or bind by ordinal position.
//
// Evidence source: AgentHarness migrations 019, 029, 030 and validation 030.
export const REQUIRED_VIEW_COLUMNS: Record<string, readonly string[]> = {
  // v_pls_channel_profile_overview (migration 019): has many extra columns
  // beyond the required set.  We only require the listed columns to be
  // present (extras allowed) because the source view is a wide projection.
  v_pls_channel_profile_overview: [
    "workspace_id",
    "canonical_object_key",
    "object_type",
    "display_name",
    "data_version",
    "source_batch_id",
    "object_generated_at",
    "object_time_window",
    "object_quality_flags_json",
    "entity_attributes_json",
    "audience_profile_id",
    "audience_time_window",
    "audience_sample_size",
    "audience_confidence",
    "audience_quality_flags_json",
    "profile_coverage_status",
  ],
  // v_pls_audience_profile_snapshots (migration 029): exact 10-field order.
  v_pls_audience_profile_snapshots: [
    "workspace_id",
    "profile_id",
    "canonical_object_key",
    "data_version",
    "source_batch_id",
    "generated_at",
    "time_window",
    "sample_size",
    "confidence",
    "quality_flags_json",
  ],
  // v_workpls_dimension_evidence (migration 030, validation 030): exact
  // 21-field order.
  v_workpls_dimension_evidence: [
    "workspace_id",
    "snapshot_id",
    "profile_id",
    "canonical_object_key",
    "data_version",
    "metric_name",
    "metric_aggregation",
    "dimension_key",
    "dimension_label",
    "value",
    "unit",
    "profile_time_window",
    "source_batch_id",
    "source_quality_flags_json",
    "source_evidence_refs_json",
    "metric_row_count",
    "tag_type_count",
    "tag_value_count",
    "avg_mapping_confidence",
    "latest_metric_updated_at",
    "latest_mapping_updated_at",
  ],
};

// Views that must have EXACT columns in correct order (no extras, no reorder).
// The overview view only needs required columns present (can have extras).
const EXACT_COLUMN_VIEWS: ReadonlySet<string> = new Set([
  "v_pls_audience_profile_snapshots",
  "v_workpls_dimension_evidence",
]);

// ---------------------------------------------------------------------------
// validateViewSchema
// ---------------------------------------------------------------------------

export function validateViewSchema(db: DatabaseSync): SchemaDiagnostic {
  const viewsPresent: string[] = [];
  const viewsMissing: string[] = [];
  const columnsMissing: Array<{ view: string; columns: string[] }> = [];
  const columnsExtra: Array<{ view: string; columns: string[] }> = [];
  const columnsReordered: Array<{ view: string; expected: string[]; actual: string[] }> = [];

  for (const view of CORE_REQUIRED_VIEWS) {
    const columns = getViewColumnsOrdered(db, view);
    if (columns === null) {
      viewsMissing.push(view);
      continue;
    }
    viewsPresent.push(view);
    const required = REQUIRED_VIEW_COLUMNS[view];
    if (required === undefined) continue;

    const requiredSet = new Set(required);
    const columnNames = columns.map((c) => c.name);
    const columnSet = new Set(columnNames);

    // Check missing columns.
    const missing = required.filter((col) => !columnSet.has(col));
    if (missing.length > 0) {
      columnsMissing.push({ view, columns: missing });
    }

    // Only check extra columns and order for exact-column views.
    if (EXACT_COLUMN_VIEWS.has(view)) {
      const extra = columnNames.filter((col) => !requiredSet.has(col));
      if (extra.length > 0) {
        columnsExtra.push({ view, columns: extra.sort() });
      }

      // Check field order (only if column counts match).
      if (missing.length === 0 && extra.length === 0) {
        const isReordered = columnNames.some((col, i) => col !== required[i]);
        if (isReordered) {
          columnsReordered.push({ view, expected: [...required], actual: columnNames });
        }
      }
    }
  }

  const compatible =
    viewsMissing.length === 0 &&
    columnsMissing.length === 0 &&
    columnsExtra.length === 0 &&
    columnsReordered.length === 0;

  return {
    contractVersion: "0.3.0",
    viewsPresent: viewsPresent.sort(),
    viewsMissing,
    columnsMissing,
    columnsExtra,
    columnsReordered,
    compatible,
  };
}

// ---------------------------------------------------------------------------
// Column discovery via pragma_table_info
// ---------------------------------------------------------------------------

interface ColumnInfo {
  readonly cid: number;
  readonly name: string;
}

function getViewColumnsOrdered(db: DatabaseSync, viewName: string): ColumnInfo[] | null {
  // First verify the object exists AND is a VIEW (not a table masquerading).
  const typeStmt = db.prepare(
    "SELECT type FROM sqlite_master WHERE type IN ('view', 'table') AND name = ?",
  );
  let typeRow: { type: string } | undefined;
  try {
    typeRow = typeStmt.get(viewName) as { type: string } | undefined;
  } catch {
    return null;
  }
  if (typeRow === undefined || typeRow.type !== "view") return null;

  // Then read column info via pragma_table_info.
  const stmt = db.prepare("SELECT cid, name FROM pragma_table_info(?) ORDER BY cid");
  let rows: unknown[];
  try {
    rows = stmt.all(viewName) as unknown[];
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  return (rows as Array<{ cid: number; name: string }>).map((row) => ({
    cid: row.cid,
    name: row.name,
  }));
}
