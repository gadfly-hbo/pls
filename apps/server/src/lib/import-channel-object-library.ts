import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PackageConfig, DryRunResult } from "./import-packages.js";
import { readJsonl } from "./import-packages.js";
import { isValidTagId } from "./taxonomy.js";

// Re-export for callers that need the same helper.
export { readJsonl };

const REPO_ROOT = resolve(import.meta.dirname, "../../../../");

const VALID_OBJECT_TYPES = new Set([
  "platform",
  "trade_area",
  "store",
  "account",
  "marketing_event",
  "business_scenario",
]);

const VALID_TARGET_OBJECTS: Record<string, string> = {
  platform: "ChannelEntity",
  trade_area: "ChannelEntity",
  store: "ChannelEntity",
  account: "ChannelEntity",
  marketing_event: "MarketingEvent",
  business_scenario: "BusinessScenario",
};

interface ValidationIssue {
  ruleId: string;
  severity: "blocking" | "warning";
  message: string;
  exampleObjectType?: string;
  exampleCanonicalObjectKey?: string;
}

interface DryRunSummary {
  packageType: string;
  source: string;
  sourceType: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  timeWindows: string[];
  rowCounts: {
    channelObjects: number;
    bindings: number;
    audienceProfiles: number;
    productFitProfiles: number;
  };
  objectTypeCounts: Record<string, number>;
  qualityRuleCounts: Record<string, number>;
  blockingIssues: ValidationIssue[];
  warnings: ValidationIssue[];
  failureExamples: ValidationIssue[];
  qualityFlags: string[];
  shareable: boolean;
  admissionPolicy: string;
}

function boolInt(v: unknown): number {
  return v ? 1 : 0;
}

function jsonVal(v: unknown): string {
  return JSON.stringify(v ?? {});
}

function arrVal(v: unknown): string {
  return JSON.stringify(Array.isArray(v) ? v : []);
}

function packageDir(pkg: PackageConfig): string {
  return resolve(REPO_ROOT, pkg.basePath);
}

function readPackageJson<T = unknown>(dir: string, file: string): T | null {
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readPackageJsonl(dir: string, file: string): Array<Record<string, unknown>> {
  const path = join(dir, file);
  if (!existsSync(path)) return [];
  try {
    return readJsonl(path);
  } catch {
    return [];
  }
}

function sv(r: Record<string, unknown>, key: string): string | number | null {
  const v = r[key];
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

function validateObjectType(row: Record<string, unknown>, issues: ValidationIssue[]): void {
  const objectType = String(row.objectType ?? "");
  if (!VALID_OBJECT_TYPES.has(objectType)) {
    issues.push({
      ruleId: "invalid_object_type",
      severity: "blocking",
      message: `objectType "${objectType}" is not one of the six P6 object types`,
      exampleObjectType: objectType,
      exampleCanonicalObjectKey: String(row.canonicalObjectKey ?? ""),
    });
    return;
  }
  const targetObject = String(row.targetObject ?? "");
  if (targetObject && targetObject !== VALID_TARGET_OBJECTS[objectType]) {
    issues.push({
      ruleId: "event_or_scenario_as_channel_entity",
      severity: "blocking",
      message: `objectType "${objectType}" must have targetObject "${VALID_TARGET_OBJECTS[objectType]}", got "${targetObject}"`,
      exampleObjectType: objectType,
      exampleCanonicalObjectKey: String(row.canonicalObjectKey ?? ""),
    });
  }
}

function validateObjectKey(row: Record<string, unknown>, issues: ValidationIssue[]): void {
  const keySource = String(row.keySource ?? "");
  if (keySource === "generated_from_name") {
    issues.push({
      ruleId: "generated_key_needs_review",
      severity: "warning",
      message: `sourceStableKey was generated from displayName/scenarioType and requires manual review`,
      exampleObjectType: String(row.objectType ?? ""),
      exampleCanonicalObjectKey: String(row.canonicalObjectKey ?? ""),
    });
  }
}

function validateDuplicate(row: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (row.possibleDuplicate === true) {
    issues.push({
      ruleId: "possible_duplicate",
      severity: "warning",
      message: `Possible duplicate found by name/platform similarity; import must not auto-merge`,
      exampleObjectType: String(row.objectType ?? ""),
      exampleCanonicalObjectKey: String(row.canonicalObjectKey ?? ""),
    });
  }
}

function validateProfileLineage(
  profile: Record<string, unknown>,
  type: "audience" | "product_fit",
  issues: ValidationIssue[]
): void {
  const required = ["source", "confidence", "sourceBatchId"];
  if (type !== "product_fit" || profile.source !== "manual_config") {
    required.push("sampleSize", "timeWindow");
  }
  const missing = required.filter((k) => profile[k] === undefined || profile[k] === null || profile[k] === "");
  if (missing.length > 0) {
    issues.push({
      ruleId: "missing_profile_lineage",
      severity: "blocking",
      message: `Profile ${profile.profileId} missing lineage fields: ${missing.join(", ")}`,
      exampleCanonicalObjectKey: String(profile.canonicalObjectKey ?? ""),
    });
  }
}

function validateProfileTags(profile: Record<string, unknown>, issues: ValidationIssue[]): void {
  const tags = Array.isArray(profile.tags) ? profile.tags : [];
  const invalid: string[] = [];
  for (const tag of tags) {
    const tagId = typeof tag === "object" && tag !== null ? String((tag as Record<string, unknown>).tagId ?? "") : "";
    if (!tagId || !isValidTagId(tagId)) {
      invalid.push(tagId || "<missing>");
    }
  }
  if (invalid.length > 0) {
    issues.push({
      ruleId: "unapproved_tag_id",
      severity: "blocking",
      message: `Audience profile ${profile.profileId} has unapproved tagIds: ${invalid.join(", ")}`,
      exampleCanonicalObjectKey: String(profile.canonicalObjectKey ?? ""),
    });
  }
}

export function dryRunChannelObjectLibrary(pkg: PackageConfig): DryRunResult {
  const dir = packageDir(pkg);
  const sourceManifest = readPackageJson<Record<string, unknown>>(dir, "source_manifest.json") ?? {};
  const runManifest = readPackageJson<Record<string, unknown>>(dir, "run_manifest.json") ?? {};
  const qualityReport = readPackageJson<Record<string, unknown>>(dir, "quality_report.json") ?? {};

  const sourceBatchId = String(sourceManifest.sourceBatchId ?? runManifest.sourceBatchId ?? "unknown");
  const dataVersion = String(sourceManifest.dataVersion ?? runManifest.dataVersion ?? "unknown");
  const source = String(sourceManifest.source ?? runManifest.source ?? pkg.source);
  const sourceType = String(sourceManifest.sourceType ?? runManifest.sourceType ?? pkg.sourceType);
  const timeWindows = Array.isArray(sourceManifest.timeWindows) ? sourceManifest.timeWindows : [];
  const timeWindow = (timeWindows[0] as string | undefined) ?? null;

  const objects = readPackageJsonl(dir, "channel_objects.jsonl");
  const bindings = readPackageJsonl(dir, "bindings.jsonl");
  const audienceProfiles = readPackageJsonl(dir, "audience_profiles.jsonl");
  const productFitProfiles = readPackageJsonl(dir, "product_fit_profiles.jsonl");

  const objectTypeCounts: Record<string, number> = {};
  const issues: ValidationIssue[] = [];
  const objectKeys = new Set<string>();

  for (const row of objects) {
    const objectType = String(row.objectType ?? "");
    objectTypeCounts[objectType] = (objectTypeCounts[objectType] ?? 0) + 1;
    objectKeys.add(String(row.canonicalObjectKey ?? ""));
    validateObjectType(row, issues);
    validateObjectKey(row, issues);
    validateDuplicate(row, issues);
  }

  for (const row of bindings) {
    const from = String(row.fromCanonicalObjectKey ?? "");
    const to = String(row.toCanonicalObjectKey ?? "");
    const missing = [from, to].filter((key) => !objectKeys.has(key));
    if (missing.length > 0) {
      issues.push({
        ruleId: "missing_parent_reference",
        severity: "blocking",
        message: `Binding ${row.bindingId} references missing objects: ${missing.join(", ")}`,
        exampleCanonicalObjectKey: String(row.bindingId ?? ""),
      });
    }
  }

  for (const row of audienceProfiles) {
    validateProfileLineage(row, "audience", issues);
    validateProfileTags(row, issues);
  }
  for (const row of productFitProfiles) {
    validateProfileLineage(row, "product_fit", issues);
  }

  const blockingIssues = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const failureExamples = issues.slice(0, 3);

  const qualityRuleCounts: Record<string, number> = {
    missing_parent_reference: 0,
    generated_key_needs_review: 0,
    manual_entity_without_profile: 0,
    possible_duplicate: 0,
    unapproved_tag_id: 0,
    invalid_object_type: 0,
    event_or_scenario_as_channel_entity: 0,
    missing_profile_lineage: 0,
  };
  for (const i of issues) {
    qualityRuleCounts[i.ruleId] = (qualityRuleCounts[i.ruleId] ?? 0) + 1;
  }

  const channelEntityKeys = new Set(
    objects
      .filter((r) => ["platform", "trade_area", "store", "account"].includes(String(r.objectType ?? "")))
      .map((r) => String(r.canonicalObjectKey ?? ""))
  );
  const profiledKeys = new Set(
    [...audienceProfiles, ...productFitProfiles].map((p) => String(p.canonicalObjectKey ?? ""))
  );
  for (const key of channelEntityKeys) {
    if (!profiledKeys.has(key)) {
      qualityRuleCounts.manual_entity_without_profile = (qualityRuleCounts.manual_entity_without_profile ?? 0) + 1;
      warnings.push({
        ruleId: "manual_entity_without_profile",
        severity: "warning",
        message: `Manual or imported channel entity ${key} has no audience or product-fit profile`,
        exampleCanonicalObjectKey: key,
      });
    }
  }

  const qualityReportSummary: DryRunSummary = {
    packageType: pkg.type,
    source,
    sourceType,
    sourceBatchId,
    dataVersion,
    generatedAt: String(sourceManifest.generatedAt ?? new Date().toISOString()),
    timeWindows: timeWindows as string[],
    rowCounts: {
      channelObjects: objects.length,
      bindings: bindings.length,
      audienceProfiles: audienceProfiles.length,
      productFitProfiles: productFitProfiles.length,
    },
    objectTypeCounts,
    qualityRuleCounts,
    blockingIssues,
    warnings,
    failureExamples,
    qualityFlags: ["channel_profile_object_library_sample", ...blockingIssues.map((i) => i.ruleId)],
    shareable: blockingIssues.length === 0,
    admissionPolicy: "user_authorized_full_passthrough",
  };

  const tables = [
    { name: "channel_object", file: "channel_objects.jsonl", rowCount: objects.length },
    { name: "channel_object_binding", file: "bindings.jsonl", rowCount: bindings.length },
    { name: "audience_profile", file: "audience_profiles.jsonl", rowCount: audienceProfiles.length },
    { name: "product_fit_profile", file: "product_fit_profiles.jsonl", rowCount: productFitProfiles.length },
  ];
  const totalRows = objects.length + bindings.length + audienceProfiles.length + productFitProfiles.length;

  return {
    packageType: pkg.type,
    source,
    sourceType,
    sourceBatchId,
    batchId: sourceBatchId,
    dataVersion,
    timeWindow,
    tables,
    totalRows,
    qualityReport: qualityReportSummary as unknown as Record<string, unknown>,
    warnings: [...warnings.map((i) => i.message), ...((qualityReport.warnings as string[]) ?? [])],
    errors: [...blockingIssues.map((i) => i.message), ...((qualityReport.blockingIssues as string[]) ?? [])],
  };
}

export function executeChannelObjectLibrary(
  db: DatabaseSync,
  workspaceId: string,
  pkg: PackageConfig
): {
  packageType: string;
  source: string;
  sourceType: string;
  dataVersion: string | null;
  status: "succeeded";
  rowCount: number;
  successCount: number;
  errorCount: number;
  warnings: string[];
  errors: string[];
  qualityReport: Record<string, unknown>;
  tables: Array<{ name: string; rowCount: number }>;
  afterSnapshot: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
} {
  const dir = packageDir(pkg);
  const sourceManifest = readPackageJson<Record<string, unknown>>(dir, "source_manifest.json") ?? {};
  const runManifest = readPackageJson<Record<string, unknown>>(dir, "run_manifest.json") ?? {};
  const qualityReport = readPackageJson<Record<string, unknown>>(dir, "quality_report.json") ?? {};

  const sourceBatchId = String(sourceManifest.sourceBatchId ?? runManifest.sourceBatchId ?? "unknown");
  const dataVersion = String(sourceManifest.dataVersion ?? runManifest.dataVersion ?? "unknown");
  const source = String(sourceManifest.source ?? runManifest.source ?? pkg.source);
  const sourceType = String(sourceManifest.sourceType ?? runManifest.sourceType ?? pkg.sourceType);
  const timeWindows = Array.isArray(sourceManifest.timeWindows) ? sourceManifest.timeWindows : [];
  const timeWindow = (timeWindows[0] as string | undefined) ?? null;
  const generatedAt = String(sourceManifest.generatedAt ?? runManifest.createdAt ?? new Date().toISOString());

  const objects = readPackageJsonl(dir, "channel_objects.jsonl");
  const bindings = readPackageJsonl(dir, "bindings.jsonl");
  const audienceProfiles = readPackageJsonl(dir, "audience_profiles.jsonl");
  const productFitProfiles = readPackageJsonl(dir, "product_fit_profiles.jsonl");

  const warnings: string[] = [];
  const errors: string[] = [];
  const tables: Array<{ name: string; rowCount: number }> = [];
  let total = 0;

  db.exec("BEGIN");
  try {
    if (objects.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO channel_object (
        workspace_id, object_type, source_stable_key, key_source, canonical_object_key, object_version_id,
        data_version, source_batch_id, generated_at, time_window, display_name, platform_name, platform_type,
        entity_status, target_object, entity_attributes, possible_duplicate, duplicate_candidate_keys,
        manual_review_status, quality_flags, source, source_type, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of objects) {
        const attrs = { ...((r.attributes ?? {}) as Record<string, unknown>) };
        if (r.eventType) attrs.eventType = r.eventType;
        if (r.scenarioType) attrs.scenarioType = r.scenarioType;
        if (r.customTags) attrs.customTags = r.customTags;
        if (r.description) attrs.description = r.description;

        stmt.run(
          workspaceId,
          sv(r, "objectType") ?? "",
          sv(r, "sourceStableKey") ?? "",
          sv(r, "keySource") ?? "",
          sv(r, "canonicalObjectKey") ?? "",
          sv(r, "objectVersionId") ?? "",
          sv(r, "dataVersion") ?? dataVersion,
          sv(r, "sourceBatchId") ?? sourceBatchId,
          sv(r, "generatedAt") ?? generatedAt,
          sv(r, "timeWindow"),
          sv(r, "displayName"),
          sv(r, "platformName"),
          sv(r, "platformType"),
          sv(r, "entityStatus") ?? "active",
          sv(r, "targetObject") ?? VALID_TARGET_OBJECTS[String(r.objectType ?? "")] ?? "",
          jsonVal(attrs),
          boolInt(r.possibleDuplicate),
          arrVal(r.duplicateCandidateKeys),
          sv(r, "manualReviewStatus") ?? "unreviewed",
          arrVal(r.qualityFlags),
          sv(r, "source") ?? source,
          sv(r, "sourceType") ?? sourceType,
          jsonVal(r)
        );
      }
      tables.push({ name: "channel_object", rowCount: objects.length });
      total += objects.length;
    }

    if (bindings.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO channel_object_binding (
        workspace_id, binding_id, binding_type, from_canonical_object_key, to_canonical_object_key,
        source_batch_id, data_version, generated_at, quality_flags, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of bindings) {
        stmt.run(
          workspaceId,
          sv(r, "bindingId") ?? "",
          sv(r, "bindingType") ?? "",
          sv(r, "fromCanonicalObjectKey") ?? "",
          sv(r, "toCanonicalObjectKey") ?? "",
          sv(r, "sourceBatchId") ?? sourceBatchId,
          sv(r, "dataVersion") ?? dataVersion,
          sv(r, "generatedAt") ?? generatedAt,
          arrVal(r.qualityFlags),
          jsonVal(r)
        );
      }
      tables.push({ name: "channel_object_binding", rowCount: bindings.length });
      total += bindings.length;
    }

    if (audienceProfiles.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO audience_profile (
        workspace_id, profile_id, canonical_object_key, profile_stage, source, source_batch_id,
        data_version, generated_at, time_window, sample_size, confidence, tags, unmapped_fields,
        quality_flags, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of audienceProfiles) {
        stmt.run(
          workspaceId,
          sv(r, "profileId") ?? "",
          sv(r, "canonicalObjectKey") ?? "",
          sv(r, "profileStage") ?? "channel_audience",
          sv(r, "source") ?? source,
          sv(r, "sourceBatchId") ?? sourceBatchId,
          sv(r, "dataVersion") ?? dataVersion,
          sv(r, "generatedAt") ?? generatedAt,
          sv(r, "timeWindow"),
          r.sampleSize == null ? null : Number(r.sampleSize),
          Number(r.confidence ?? 0),
          arrVal(r.tags),
          arrVal(r.unmappedFields),
          arrVal(r.qualityFlags),
          jsonVal(r)
        );
      }
      tables.push({ name: "audience_profile", rowCount: audienceProfiles.length });
      total += audienceProfiles.length;
    }

    if (productFitProfiles.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO product_fit_profile (
        workspace_id, profile_id, canonical_object_key, source, source_batch_id, data_version,
        generated_at, time_window, sample_size, confidence, fit_categories, fit_price_bands,
        fit_styles, fit_occasions, fit_launch_types, evidence, quality_flags, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of productFitProfiles) {
        stmt.run(
          workspaceId,
          sv(r, "profileId") ?? "",
          sv(r, "canonicalObjectKey") ?? "",
          sv(r, "source") ?? source,
          sv(r, "sourceBatchId") ?? sourceBatchId,
          sv(r, "dataVersion") ?? dataVersion,
          sv(r, "generatedAt") ?? generatedAt,
          sv(r, "timeWindow"),
          r.sampleSize == null ? null : Number(r.sampleSize),
          Number(r.confidence ?? 0),
          arrVal(r.fitCategories),
          arrVal(r.fitPriceBands),
          arrVal(r.fitStyles),
          arrVal(r.fitOccasions),
          arrVal(r.fitLaunchTypes),
          arrVal(r.evidence),
          arrVal(r.qualityFlags),
          jsonVal(r)
        );
      }
      tables.push({ name: "product_fit_profile", rowCount: productFitProfiles.length });
      total += productFitProfiles.length;
    }

    const importBatchId = `channel_object_library_import_${sourceBatchId}_${dataVersion}`;
    db.prepare(`INSERT OR REPLACE INTO batch (
      batch_id, workspace_id, batch_type, source, source_type, time_window, row_count, entity_counts,
      quality_report, created_at
    ) VALUES (?, ?, 'channel_object_library_import', ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      importBatchId,
      workspaceId,
      source,
      sourceType,
      timeWindow,
      total,
      JSON.stringify({
        channel_object: objects.length,
        channel_object_binding: bindings.length,
        audience_profile: audienceProfiles.length,
        product_fit_profile: productFitProfiles.length,
      }),
      JSON.stringify(qualityReport)
    );

    db.prepare(`INSERT INTO audit_event (
      audit_id, workspace_id, actor, request_id, resource_type, resource_id, event, meta, occurred_at
    ) VALUES (?, ?, 'admin-api', ?, 'channel_object_library_batch', ?, 'import_completed', ?, datetime('now'))`).run(
      randomUUID(),
      workspaceId,
      importBatchId,
      importBatchId,
      JSON.stringify({ sourceBatchId, dataVersion, totalRows: total, entityCounts: tables })
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    packageType: pkg.type,
    source,
    sourceType,
    dataVersion,
    status: "succeeded",
    rowCount: total,
    successCount: total,
    errorCount: errors.length,
    warnings,
    errors,
    qualityReport,
    tables,
    afterSnapshot: {
      tableRowCounts: Object.fromEntries(tables.map((t) => [t.name, t.rowCount])),
      totalRows: total,
      dataVersion,
    },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}
