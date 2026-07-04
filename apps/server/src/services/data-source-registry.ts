import type { DatabaseSync } from "node:sqlite";

// A-P2-1: Data source adapter registry.
//
// Each adapter knows how to project import batches, versions, row counts,
// latest status and quality reports for one source_kind. The registry is
// the single place that encodes "where does this kind of data live", so the
// data-management API stays generic and is not coupled to douyin BI.

export interface DataVersionSummary {
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string | null;
  timeWindow: string | null;
  isLatest: boolean;
  rowCount: number;
  entityCounts: Record<string, number>;
}

export interface DataSourceVersions {
  sourceId: string;
  versions: DataVersionSummary[];
  latestDataVersion: string | null;
}

export interface QualityReportSummary {
  sourceBatchId: string;
  dataVersion: string;
  qualityFlags: string[];
  coverage: Record<string, unknown>;
  objectCounts: Record<string, number>;
  totalRows: number;
  admissionPolicy: string | null;
  notes: string[];
}

export interface DataSourceAdapter {
  sourceKind: string;
  // Enumerate distinct (source_batch_id, data_version) snapshots stored for
  // this source in the given workspace, with row counts derived from the
  // source's primary table. Latest is derived by MAX(generated_at).
  listVersions(db: DatabaseSync, wsId: string, sourceId: string): DataSourceVersions;
  // Pull a stored quality report for a specific version, if any.
  getQualityReport(
    db: DatabaseSync,
    wsId: string,
    sourceId: string,
    dataVersion: string
  ): QualityReportSummary | null;
}

// ---------------------------------------------------------------------------
// Douyin BI adapter. Projects the douyin_account table (the canonical
// per-account row that every imported BI object joins on) as the source of
// truth for versions, and reads the D-P1-F1 quality_report.json that was
// embedded into the batch row's quality_report column at import time.
// ---------------------------------------------------------------------------

const DOUYIN_ENTITY_TABLES = [
  "douyin_account",
  "douyin_account_benchmark_tag",
  "douyin_account_report",
  "douyin_product",
  "douyin_product_account_fit",
  "douyin_comparison_dimension",
  "douyin_adjustment_advice",
  "douyin_summary_metric",
] as const;

function countRows(db: DatabaseSync, table: string, wsId: string, dataVersion: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE workspace_id = ? AND data_version = ?`)
    .get(wsId, dataVersion) as { c: number } | undefined;
  return row?.c ?? 0;
}

export const douyinBiAdapter: DataSourceAdapter = {
  sourceKind: "douyin_bi",

  listVersions(db, wsId, sourceId) {
    const rows = db
      .prepare(
        `SELECT DISTINCT source_batch_id, data_version, generated_at, time_window
         FROM douyin_account
         WHERE workspace_id = ?
         ORDER BY generated_at DESC, data_version DESC`
      )
      .all(wsId) as Array<{
        source_batch_id: string;
        data_version: string;
        generated_at: string;
        time_window: string | null;
      }>;

    if (rows.length === 0) {
      return { sourceId, versions: [], latestDataVersion: null };
    }

    const latestVersion: string = rows[0]!.data_version;
    const versions: DataVersionSummary[] = rows.map((r) => {
      const entityCounts: Record<string, number> = {};
      let rowCount = 0;
      for (const t of DOUYIN_ENTITY_TABLES) {
        const c = countRows(db, t, wsId, r.data_version);
        entityCounts[t] = c;
        rowCount += c;
      }
      return {
        sourceBatchId: r.source_batch_id,
        dataVersion: r.data_version,
        generatedAt: r.generated_at,
        timeWindow: r.time_window,
        isLatest: r.data_version === latestVersion,
        rowCount,
        entityCounts,
      };
    });

    return { sourceId, versions, latestDataVersion: latestVersion };
  },

  getQualityReport(db, wsId, sourceId, dataVersion) {
    // The import script stored the D-P1-F1 quality_report.json contents into
    // the batch row's quality_report column (batch_type = 'douyin_bi_import').
    // We look up the batch matching this data_version via its batch_id suffix
    // convention: douyin_bi_import_<sourceBatchId>_<dataVersion>.
    const versionRow = db
      .prepare(
        `SELECT DISTINCT source_batch_id FROM douyin_account
         WHERE workspace_id = ? AND data_version = ?`
      )
      .get(wsId, dataVersion) as { source_batch_id?: string } | undefined;
    if (!versionRow?.source_batch_id) return null;

    const batchId = `douyin_bi_import_${versionRow.source_batch_id}_${dataVersion}`;
    const batch = db
      .prepare(
        `SELECT quality_report, row_count, entity_counts FROM batch
         WHERE batch_id = ? AND workspace_id = ?`
      )
      .get(batchId, wsId) as
      | { quality_report?: string; row_count?: number; entity_counts?: string }
      | undefined;
    if (!batch) return null;

    let qr: Record<string, unknown> = {};
    try {
      qr = batch.quality_report ? JSON.parse(batch.quality_report) : {};
    } catch {
      qr = {};
    }
    let ec: Record<string, number> = {};
    try {
      ec = batch.entity_counts ? JSON.parse(batch.entity_counts) : {};
    } catch {
      ec = {};
    }

    return {
      sourceBatchId: versionRow.source_batch_id,
      dataVersion,
      qualityFlags: (qr.qualityFlags as string[]) ?? [],
      coverage: (qr.coverage as Record<string, unknown>) ?? {},
      objectCounts: (qr.objectCounts as Record<string, number>) ?? ec,
      totalRows: (qr.totalRows as number) ?? batch.row_count ?? 0,
      admissionPolicy: (qr.admissionPolicy as string) ?? null,
      notes: Array.isArray(qr.notes) ? (qr.notes as string[]) : [],
    };
  },
};

// ---------------------------------------------------------------------------
// Stub adapters for future sources. They participate in the registry so the
// data-management API can surface them as "known but not yet imported", but
// they have no backing tables yet.
// ---------------------------------------------------------------------------

function emptyVersions(sourceId: string): DataSourceVersions {
  return { sourceId, versions: [], latestDataVersion: null };
}

export const productMasterStubAdapter: DataSourceAdapter = {
  sourceKind: "product_master",
  listVersions: (_db, _ws, sourceId) => emptyVersions(sourceId),
  getQualityReport: () => null,
};

export const channelProfileStubAdapter: DataSourceAdapter = {
  sourceKind: "channel_profile",
  listVersions: (_db, _ws, sourceId) => emptyVersions(sourceId),
  getQualityReport: () => null,
};

export const actionFeedbackStubAdapter: DataSourceAdapter = {
  sourceKind: "action_feedback",
  listVersions: (_db, _ws, sourceId) => emptyVersions(sourceId),
  getQualityReport: () => null,
};

// ---------------------------------------------------------------------------
// A-P4-TOOLS-4: Tool package adapters.
// profile_extract and business_aggregate imports are recorded in data_import_job
// and batch. Versions are derived from data_import_job; quality reports are read
// from the same row.
// ---------------------------------------------------------------------------

function importTypeForSourceKind(sourceKind: string): string {
  return sourceKind.replace(/_/g, "-");
}

function listImportJobVersions(
  db: DatabaseSync,
  wsId: string,
  sourceId: string,
  importType: string
): DataSourceVersions {
  const rows = db
    .prepare(
      `SELECT DISTINCT data_version, source, source_type, finished_at
       FROM data_import_job
       WHERE workspace_id = ? AND import_type = ? AND status = 'succeeded'
       ORDER BY finished_at DESC, data_version DESC`
    )
    .all(wsId, importType) as Array<{
      data_version: string;
      source: string;
      source_type: string;
      finished_at: string;
    }>;

  if (rows.length === 0) {
    return { sourceId, versions: [], latestDataVersion: null };
  }

  const latestDataVersion: string = rows[0]!.data_version;
  const versions: DataVersionSummary[] = rows.map((r) => ({
    sourceBatchId: r.source,
    dataVersion: r.data_version,
    generatedAt: r.finished_at,
    timeWindow: null,
    isLatest: r.data_version === latestDataVersion,
    rowCount: 0,
    entityCounts: {},
  }));

  return { sourceId, versions, latestDataVersion };
}

function getImportJobQualityReport(
  db: DatabaseSync,
  wsId: string,
  _sourceId: string,
  importType: string,
  dataVersion: string
): QualityReportSummary | null {
  const job = db
    .prepare(
      `SELECT source, source_type, quality_report, row_count
       FROM data_import_job
       WHERE workspace_id = ? AND import_type = ? AND data_version = ? AND status = 'succeeded'
       ORDER BY finished_at DESC LIMIT 1`
    )
    .get(wsId, importType, dataVersion) as
    | { source?: string; source_type?: string; quality_report?: string; row_count?: number }
    | undefined;
  if (!job) return null;

  let qr: Record<string, unknown> = {};
  try {
    qr = job.quality_report ? JSON.parse(job.quality_report) : {};
  } catch {
    qr = {};
  }

  return {
    sourceBatchId: (qr.sourceBatchId as string) ?? job.source ?? "",
    dataVersion,
    qualityFlags: (qr.qualityFlags as string[]) ?? [],
    coverage: (qr.coverage as Record<string, unknown>) ?? {},
    objectCounts: (qr.objectCounts as Record<string, number>) ??
      (qr.rowCounts as Record<string, number>) ?? {},
    totalRows: (qr.totalRows as number) ?? job.row_count ?? 0,
    admissionPolicy: (qr.admissionPolicy as string) ?? null,
    notes: Array.isArray(qr.notes) ? (qr.notes as string[]) : [],
  };
}

export const profileExtractAdapter: DataSourceAdapter = {
  sourceKind: "profile_extract",
  listVersions: (db, wsId, sourceId) =>
    listImportJobVersions(db, wsId, sourceId, "profile-extract"),
  getQualityReport: (db, wsId, sourceId, dataVersion) =>
    getImportJobQualityReport(db, wsId, sourceId, "profile-extract", dataVersion),
};

export const businessAggregateAdapter: DataSourceAdapter = {
  sourceKind: "business_aggregate",
  listVersions: (db, wsId, sourceId) =>
    listImportJobVersions(db, wsId, sourceId, "business-aggregate"),
  getQualityReport: (db, wsId, sourceId, dataVersion) =>
    getImportJobQualityReport(db, wsId, sourceId, "business-aggregate", dataVersion),
};

export const ADAPTERS: Record<string, DataSourceAdapter> = {
  douyin_bi: douyinBiAdapter,
  product_master: productMasterStubAdapter,
  channel_profile: channelProfileStubAdapter,
  action_feedback: actionFeedbackStubAdapter,
  profile_extract: profileExtractAdapter,
  business_aggregate: businessAggregateAdapter,
};

export function adapterFor(sourceKind: string): DataSourceAdapter | undefined {
  return ADAPTERS[sourceKind];
}
