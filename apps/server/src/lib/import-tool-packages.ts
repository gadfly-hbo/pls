import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { DryRunResult, ImportJobResult } from "./import-packages.js";
import { toImportImpact } from "./import-packages.js";
import type { OperationImpact } from "./dangerous-ops.js";
import { isSafeRunId } from "./tools/types.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");
const TOOL_RUNS_ROOT = resolve(REPO_ROOT, "data/local/tool-runs");

function sv(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

interface ToolRunManifest {
  packageType: string;
  packageVersion: string;
  runId: string;
  toolId: string;
  workspaceId: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  outputDir: string;
  artifacts: string[];
  importAdapter: {
    packageType: string;
    sourceBatchId: string;
    dataVersion: string;
    targetTables: string[];
    futureTargetObjects?: string[];
    pendingSchemaObjects?: string[];
    confirmText: string;
    idempotencyScope: string[];
  };
  warnings: string[];
  errors: string[];
}

interface SourceManifest {
  packageType: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  sourceType: string;
  source: string;
  platform?: string;
  timeWindows: string[];
  sources?: unknown[];
  inputSources?: unknown[];
  entityCounts: Record<string, number>;
}

interface ToolPackage {
  runDir: string;
  runManifest: ToolRunManifest;
  sourceManifest: SourceManifest;
  qualityReport: Record<string, unknown>;
}

function runDir(runId: string): string {
  if (!isSafeRunId(runId)) throw new Error(`invalid tool run id "${runId}"`);
  return resolve(TOOL_RUNS_ROOT, runId);
}

function readJson<T>(runDir: string, name: string): T {
  const path = resolve(runDir, name);
  if (!existsSync(path)) throw new Error(`missing ${name} in tool run ${runDir}`);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readJsonl(runDir: string, name: string): Array<Record<string, unknown>> {
  const path = resolve(runDir, name);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l, i) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch (err) {
        throw new Error(`${name}:${i + 1} invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
}

function readToolPackage(runId: string): ToolPackage {
  const dir = runDir(runId);
  if (!existsSync(dir)) throw new Error(`tool run "${runId}" not found`);
  return {
    runDir: dir,
    runManifest: readJson<ToolRunManifest>(dir, "run_manifest.json"),
    sourceManifest: readJson<SourceManifest>(dir, "source_manifest.json"),
    qualityReport: readJson<Record<string, unknown>>(dir, "quality_report.json"),
  };
}

function firstTimeWindow(sourceManifest: SourceManifest): string | null {
  return sourceManifest.timeWindows[0] ?? null;
}

function assertValid(pkg: ToolPackage, runId: string, workspaceId?: string): string[] {
  const errors: string[] = [];
  if (pkg.runManifest.runId !== runId) errors.push("run_manifest.runId does not match requested runId");
  if (workspaceId && pkg.runManifest.workspaceId !== workspaceId) {
    errors.push("tool run does not belong to the current workspace");
  }
  if (!pkg.runManifest.importAdapter) errors.push("run_manifest.importAdapter is missing");
  if (!pkg.runManifest.importAdapter.sourceBatchId) errors.push("run_manifest.importAdapter.sourceBatchId is missing");
  if (!pkg.runManifest.importAdapter.dataVersion) errors.push("run_manifest.importAdapter.dataVersion is missing");
  if (!pkg.sourceManifest.sourceBatchId) errors.push("source_manifest.sourceBatchId is missing");
  if (!pkg.sourceManifest.dataVersion) errors.push("source_manifest.dataVersion is missing");
  if (pkg.sourceManifest.sourceBatchId !== pkg.runManifest.importAdapter.sourceBatchId) {
    errors.push("source_manifest.sourceBatchId does not match run_manifest.importAdapter.sourceBatchId");
  }
  if (pkg.sourceManifest.dataVersion !== pkg.runManifest.importAdapter.dataVersion) {
    errors.push("source_manifest.dataVersion does not match run_manifest.importAdapter.dataVersion");
  }
  return errors;
}

export function dryRunToolPackage(runId: string, workspaceId?: string): DryRunResult {
  const pkg = readToolPackage(runId);
  const errors = assertValid(pkg, runId, workspaceId);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  const { runManifest, sourceManifest, qualityReport } = pkg;
  const warnings: string[] = [
    ...(runManifest.warnings ?? []),
    ...((qualityReport.warnings as string[]) ?? []),
  ];

  const tables: Array<{ name: string; file: string; rowCount: number }> = [];
  let totalRows = 0;

  if (runManifest.packageType === "profile-extract") {
    const rows = readJsonl(pkg.runDir, "aggregate_profile.jsonl");
    const entityIds = new Set<string>();
    for (const r of rows) {
      const id = r.entityId ?? r.profileId;
      if (typeof id === "string") entityIds.add(id);
    }
    const rowCount = entityIds.size;
    tables.push({ name: "channel_profile", file: "aggregate_profile.jsonl", rowCount });
    totalRows = rowCount;
  } else if (runManifest.packageType === "business-aggregate") {
    const productRows = readJsonl(pkg.runDir, "product_aggregate.jsonl").length;
    const channelRows = readJsonl(pkg.runDir, "channel_aggregate.jsonl").length;
    const wideRows = readJsonl(pkg.runDir, "sku_channel_wide_table.jsonl").length;
    tables.push({ name: "sku", file: "product_aggregate.jsonl", rowCount: productRows });
    tables.push({ name: "channel_profile", file: "channel_aggregate.jsonl", rowCount: channelRows });
    tables.push({ name: "wide_table_row", file: "sku_channel_wide_table.jsonl", rowCount: wideRows });
    totalRows = productRows + channelRows + wideRows;
  } else {
    throw new Error(`unsupported tool package type: ${runManifest.packageType}`);
  }

  return {
    packageType: runManifest.packageType,
    source: sourceManifest.source,
    sourceType: sourceManifest.sourceType,
    batchId: sourceManifest.sourceBatchId,
    dataVersion: sourceManifest.dataVersion,
    timeWindow: firstTimeWindow(sourceManifest),
    tables,
    totalRows,
    qualityReport,
    warnings,
    errors: [],
  };
}

export function dryRunToolPackageImpact(runId: string, workspaceId?: string): OperationImpact {
  const pkg = readToolPackage(runId);
  const impact = toImportImpact(dryRunToolPackage(runId, workspaceId));
  impact.requiredConfirmText = pkg.runManifest.importAdapter.confirmText;
  return impact;
}

function executeProfileExtract(
  db: DatabaseSync,
  workspaceId: string,
  pkg: ToolPackage
): Omit<ImportJobResult, "jobId" | "dryRun" | "auditId"> {
  const { runManifest, sourceManifest, qualityReport } = pkg;
  const warnings: string[] = [...(runManifest.warnings ?? []), ...((qualityReport.warnings as string[]) ?? [])];
  const errors: string[] = [...(runManifest.errors ?? []), ...((qualityReport.blockingIssues as string[]) ?? [])];

  const rows = readJsonl(pkg.runDir, "aggregate_profile.jsonl");
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const id = String(r.entityId ?? r.profileId);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(r);
  }

  const stmt = db.prepare(`INSERT OR REPLACE INTO channel_profile (
    channel_id, workspace_id, batch_id, channel_name, channel_type, platform_type,
    time_window, sample_size, source, source_type, tags, traffic_index, conversion_index, quality_flags
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const tables: Array<{ name: string; rowCount: number }> = [];
  let totalRows = 0;

  for (const [channelId, groupRows] of groups) {
    const first = groupRows[0] ?? {};
    const tags = groupRows.map((r) => ({
      tagId: r.mappedTagId,
      score: r.score,
      confidence: r.confidence,
      sourceField: r.sourceField,
      sourceValue: r.sourceValue,
      mappingRuleId: r.mappingRuleId,
    }));
    stmt.run(
      channelId,
      workspaceId,
      sourceManifest.sourceBatchId,
      channelId,
      sv(first.profileType) ?? null,
      sv(first.platform) ?? null,
      sv(first.timeWindow) ?? firstTimeWindow(sourceManifest),
      sv(first.sampleSize) ?? null,
      sv(first.source) ?? sourceManifest.source,
      sv(first.sourceType) ?? sourceManifest.sourceType,
      JSON.stringify(tags),
      null,
      null,
      JSON.stringify(first.qualityFlags ?? [])
    );
    totalRows++;
  }

  tables.push({ name: "channel_profile", rowCount: totalRows });

  const afterSnapshot = { tableRowCounts: Object.fromEntries(tables.map((t) => [t.name, t.rowCount])), totalRows };

  return {
    packageType: runManifest.packageType,
    source: sourceManifest.source,
    sourceType: sourceManifest.sourceType,
    dataVersion: sourceManifest.dataVersion,
    status: errors.length > 0 ? "failed" : "succeeded",
    rowCount: totalRows,
    successCount: totalRows,
    errorCount: errors.length,
    warnings,
    errors,
    qualityReport,
    tables,
    afterSnapshot,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

function executeBusinessAggregate(
  db: DatabaseSync,
  workspaceId: string,
  pkg: ToolPackage
): Omit<ImportJobResult, "jobId" | "dryRun" | "auditId"> {
  const { runManifest, sourceManifest, qualityReport } = pkg;
  const warnings: string[] = [
    ...(runManifest.warnings ?? []),
    ...((qualityReport.warnings as string[]) ?? []),
    "product_master and channel_entity physical tables are not written yet; pending X schema approval",
  ];
  const errors: string[] = [...(runManifest.errors ?? []), ...((qualityReport.blockingIssues as string[]) ?? [])];

  const tables: Array<{ name: string; rowCount: number }> = [];
  let totalRows = 0;

  // sku from product_aggregate
  const productRows = readJsonl(pkg.runDir, "product_aggregate.jsonl");
  if (productRows.length > 0) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO sku (
      sku_id, workspace_id, spu_id, title, attributes, assets, mapped_product_tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const r of productRows) {
      stmt.run(
        sv(r.skuId) ?? sv(r.productId),
        workspaceId,
        sv(r.productId) ?? null,
        null,
        JSON.stringify(r.metrics ?? {}),
        JSON.stringify([]),
        JSON.stringify(r.buyerProfileTags ?? [])
      );
    }
    tables.push({ name: "sku", rowCount: productRows.length });
    totalRows += productRows.length;
  }

  // channel_profile from channel_aggregate
  const channelRows = readJsonl(pkg.runDir, "channel_aggregate.jsonl");
  if (channelRows.length > 0) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO channel_profile (
      channel_id, workspace_id, batch_id, channel_name, channel_type, platform_type,
      time_window, sample_size, source, source_type, tags, traffic_index, conversion_index, quality_flags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of channelRows) {
      stmt.run(
        sv(r.channelId),
        workspaceId,
        sourceManifest.sourceBatchId,
        sv(r.channelId),
        null,
        null,
        sv(r.timeWindow) ?? firstTimeWindow(sourceManifest),
        sv(r.sampleSize) ?? null,
        sv(r.source) ?? sourceManifest.source,
        sv(r.sourceType) ?? sourceManifest.sourceType,
        JSON.stringify(r.profileTags ?? []),
        (r.metrics as Record<string, number>)?.trafficIndex ?? null,
        (r.metrics as Record<string, number>)?.conversionIndex ?? null,
        JSON.stringify(r.qualityFlags ?? [])
      );
    }
    tables.push({ name: "channel_profile", rowCount: channelRows.length });
    totalRows += channelRows.length;
  }

  // wide_table_row from sku_channel_wide_table
  const wideRows = readJsonl(pkg.runDir, "sku_channel_wide_table.jsonl");
  if (wideRows.length > 0) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO wide_table_row (
      sku_id, channel_id, time_window, workspace_id, batch_id, full_row
    ) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const r of wideRows) {
      stmt.run(
        sv(r.skuId),
        sv(r.channelId),
        sv(r.timeWindow) ?? firstTimeWindow(sourceManifest),
        workspaceId,
        sourceManifest.sourceBatchId,
        JSON.stringify(r)
      );
    }
    tables.push({ name: "wide_table_row", rowCount: wideRows.length });
    totalRows += wideRows.length;
  }

  const afterSnapshot = { tableRowCounts: Object.fromEntries(tables.map((t) => [t.name, t.rowCount])), totalRows };

  return {
    packageType: runManifest.packageType,
    source: sourceManifest.source,
    sourceType: sourceManifest.sourceType,
    dataVersion: sourceManifest.dataVersion,
    status: errors.length > 0 ? "failed" : "succeeded",
    rowCount: totalRows,
    successCount: totalRows,
    errorCount: errors.length,
    warnings,
    errors,
    qualityReport,
    tables,
    afterSnapshot,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

export function executeToolPackage(
  db: DatabaseSync,
  workspaceId: string,
  runId: string
): ImportJobResult {
  const pkg = readToolPackage(runId);
  const validationErrors = assertValid(pkg, runId, workspaceId);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join("; "));
  }

  const { runManifest, sourceManifest } = pkg;
  const jobId = `imp_tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();

  db.prepare(`INSERT INTO data_import_job (
    job_id, workspace_id, import_type, source, source_type, data_version, status, dry_run, created_at, started_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, datetime('now'), ?)`).run(
    jobId, workspaceId, runManifest.packageType, sourceManifest.sourceBatchId, sourceManifest.sourceType,
    sourceManifest.dataVersion, startedAt
  );
  db.prepare("UPDATE data_import_job SET status = 'running' WHERE job_id = ?").run(jobId);

  try {
    let result: Omit<ImportJobResult, "jobId" | "dryRun" | "auditId">;
    if (runManifest.packageType === "profile-extract") {
      result = executeProfileExtract(db, workspaceId, pkg);
    } else if (runManifest.packageType === "business-aggregate") {
      result = executeBusinessAggregate(db, workspaceId, pkg);
    } else {
      throw new Error(`unsupported tool package type: ${runManifest.packageType}`);
    }

    db.prepare(`UPDATE data_import_job SET status = 'succeeded',
      row_count = ?, success_count = ?, error_count = ?, quality_report = ?, finished_at = datetime('now')
      WHERE job_id = ?`).run(
      result.rowCount, result.successCount, result.errorCount, JSON.stringify(result.qualityReport), jobId
    );

    const batchId = `${runManifest.packageType.replace(/-/g, "_")}_import_${sourceManifest.sourceBatchId}_${sourceManifest.dataVersion}`;
    db.prepare(`INSERT OR REPLACE INTO batch (
      batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts, quality_report, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      batchId, workspaceId, `${runManifest.packageType.replace(/-/g, "_")}_import`, sourceManifest.sourceBatchId,
      sourceManifest.sourceType, firstTimeWindow(sourceManifest), result.rowCount,
      JSON.stringify(Object.fromEntries(result.tables.map((t) => [t.name, t.rowCount]))),
      JSON.stringify(result.qualityReport)
    );

    const auditId = randomUUID();
    db.prepare(`INSERT INTO db_admin_audit (
      audit_id, workspace_id, actor, operation, target_type, target_name,
      before_snapshot, after_snapshot, status, created_at
    ) VALUES (?, ?, 'admin-api', 'import', 'package', ?, ?, ?, 'success', datetime('now'))`).run(
      auditId, workspaceId, runManifest.packageType,
      JSON.stringify({ tableRowCounts: Object.fromEntries(result.tables.map((t) => [t.name, 0])), totalRows: 0 }),
      JSON.stringify(result.afterSnapshot)
    );

    return { jobId, dryRun: false, auditId, ...result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE data_import_job SET status = 'failed', error = ?, finished_at = datetime('now') WHERE job_id = ?").run(errorMsg, jobId);
    db.prepare(`INSERT INTO db_admin_audit (
      audit_id, workspace_id, actor, operation, target_type, target_name, status, error, created_at
    ) VALUES (?, ?, 'admin-api', 'import', 'package', ?, 'failed', ?, datetime('now'))`).run(
      randomUUID(), workspaceId, runManifest.packageType, errorMsg
    );
    throw err;
  }
}
