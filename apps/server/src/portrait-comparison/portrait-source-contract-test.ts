import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  resolveActivePortraitSource,
  PortraitSourceConfigError,
  PortraitSourceDataError,
  PortraitSourceSchemaError,
  PortraitSourceNotReadyError,
  PortraitSourceResolverError,
  PortraitSourceUnavailableError,
  AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
  PLS_PORTRAIT_SOURCE_CONTRACT_VERSION,
} from "./portrait-source/index.js";
import { createPlsWorkspacePortraitSource } from "./portrait-source/pls-workspace-adapter.js";
import { createAgentHarnessPortraitSource } from "./portrait-source/agentharness-adapter.js";
import { validateViewSchema, CORE_REQUIRED_VIEWS } from "./portrait-source/schema-gate.js";
import { SCHEMA_DDL, CHANNEL_OBJECT_LIBRARY_DDL, DATA_MANAGEMENT_DDL } from "../db/schema.js";

// --- Helpers ---

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pls-ps-"));
}

function createPlsDb(dir: string, wsId: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dir, wsId + ".sqlite"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_DDL);
  db.exec(CHANNEL_OBJECT_LIBRARY_DDL);
  db.exec(DATA_MANAGEMENT_DDL);
  db.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run(wsId, "Test");
  return db;
}

function insertChannelObject(db: DatabaseSync, wsId: string, key: string, otype: string, name: string, dv = "v1"): void {
  db.prepare(
    "INSERT INTO channel_object (workspace_id, object_type, source_stable_key, key_source, " +
    "canonical_object_key, object_version_id, data_version, source_batch_id, generated_at, " +
    "time_window, display_name, platform_name, platform_type, entity_status, target_object, " +
    "entity_attributes, quality_flags, raw) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'active', 'ChannelEntity', '{}', '[]', '{}')",
  ).run(wsId, otype, key, "src", key, wsId + ":" + key + ":" + dv, dv, "batch_t",
    "2026-07-01T00:00:00Z", "2026-06-01/2026-06-30", name);
}

function insertAudienceProfile(db: DatabaseSync, wsId: string, pid: string, objKey: string, o: {
  dv?: string; gen?: string; tw?: string; ss?: number | null; conf?: number | null;
  qf?: string; sb?: string;
} = {}): void {
  db.prepare(
    "INSERT INTO audience_profile (workspace_id, profile_id, canonical_object_key, profile_stage, " +
    "source, source_batch_id, data_version, generated_at, time_window, sample_size, confidence, " +
    "tags, unmapped_fields, quality_flags, raw) " +
    "VALUES (?, ?, ?, 'channel_audience', 'test', ?, ?, ?, ?, ?, ?, '[]', '[]', ?, '{}')",
  ).run(wsId, pid, objKey, o.sb ?? "batch_t", o.dv ?? "v1",
    o.gen ?? "2026-07-01T00:00:00Z", o.tw ?? "2026-06-01/2026-06-30",
    o.ss ?? null, o.conf ?? null, o.qf ?? "[]");
}

function insertSku(db: DatabaseSync, wsId: string, skuId: string, title: string): void {
  db.prepare("INSERT INTO sku (sku_id, workspace_id, title) VALUES (?, ?, ?)").run(skuId, wsId, title);
}

// --- AgentHarness test DB builder ---

function createAhDb(dir: string, name: string, opts: {
  dropView?: string; extraCol?: string; missingCol?: string; reorder?: boolean;
} = {}): string {
  const dbPath = path.join(dir, name);
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE pls_channel_objects (id TEXT PRIMARY KEY, workspace_id TEXT, " +
    "object_type TEXT, target_object TEXT, source_stable_key TEXT, key_source TEXT, " +
    "canonical_object_key TEXT, object_version_id TEXT, data_version TEXT, source_batch_id TEXT, " +
    "generated_at TEXT, time_window TEXT, display_name TEXT, platform_name TEXT, platform_type TEXT, " +
    "entity_status TEXT, manual_review_status TEXT, possible_duplicate INTEGER, " +
    "quality_flags_json TEXT, entity_attributes_json TEXT, raw_json TEXT, status TEXT)");
  db.exec("CREATE TABLE pls_audience_profiles (id TEXT PRIMARY KEY, workspace_id TEXT, " +
    "profile_id TEXT, canonical_object_key TEXT, source TEXT, source_batch_id TEXT, " +
    "data_version TEXT, generated_at TEXT, time_window TEXT, sample_size INTEGER, confidence REAL, " +
    "tags_json TEXT, unmapped_fields_json TEXT, quality_flags_json TEXT, raw_json TEXT, status TEXT)");
  db.exec("CREATE TABLE pls_product_fit_profiles (id TEXT PRIMARY KEY, workspace_id TEXT, " +
    "profile_id TEXT, canonical_object_key TEXT, source TEXT, source_batch_id TEXT, " +
    "data_version TEXT, generated_at TEXT, time_window TEXT, sample_size INTEGER, confidence REAL, " +
    "fit_categories_json TEXT, fit_price_bands_json TEXT, fit_styles_json TEXT, " +
    "fit_occasions_json TEXT, fit_launch_types_json TEXT, evidence_json TEXT, " +
    "quality_flags_json TEXT, raw_json TEXT, status TEXT)");
  if (opts.dropView !== "v_pls_channel_profile_overview") {
    db.exec("CREATE VIEW v_pls_channel_profile_overview AS SELECT " +
      "objects.workspace_id, objects.canonical_object_key, objects.object_type, " +
      "objects.display_name, objects.data_version, objects.source_batch_id, " +
      "objects.generated_at AS object_generated_at, objects.time_window AS object_time_window, " +
      "objects.quality_flags_json AS object_quality_flags_json, objects.entity_attributes_json, " +
      "audience.profile_id AS audience_profile_id, audience.time_window AS audience_time_window, " +
      "audience.sample_size AS audience_sample_size, audience.confidence AS audience_confidence, " +
      "audience.quality_flags_json AS audience_quality_flags_json, " +
      "CASE WHEN audience.id IS NOT NULL THEN 'audience_only' ELSE 'object_only' END AS profile_coverage_status " +
      "FROM pls_channel_objects objects LEFT JOIN pls_audience_profiles audience " +
      "ON audience.workspace_id = objects.workspace_id " +
      "AND audience.canonical_object_key = objects.canonical_object_key " +
      "AND audience.data_version = objects.data_version AND audience.status = 'active' " +
      "WHERE objects.status = 'active'");
  }
  if (opts.dropView !== "v_pls_audience_profile_snapshots") {
    const baseCols = ["workspace_id","profile_id","canonical_object_key","data_version",
      "source_batch_id","generated_at","time_window","sample_size","confidence","quality_flags_json"];
    let cols: string[];
    if (opts.extraCol === "snapshots") cols = [...baseCols, "extra_col"];
    else if (opts.missingCol === "snapshots") cols = baseCols.filter(c => c !== "confidence");
    else cols = baseCols;
    // Qualify all columns with profiles. to avoid ambiguous column names in JOIN.
    const qualified = cols.map(c => c === "extra_col" ? "NULL AS extra_col" : "profiles." + c);
    db.exec("CREATE VIEW v_pls_audience_profile_snapshots AS SELECT " + qualified.join(", ") +
      " FROM pls_audience_profiles profiles JOIN pls_channel_objects objects " +
      "ON objects.workspace_id = profiles.workspace_id " +
      "AND objects.canonical_object_key = profiles.canonical_object_key " +
      "AND objects.data_version = profiles.data_version AND objects.status = 'active' " +
      "WHERE profiles.status = 'active'");
  }
  if (opts.dropView !== "v_workpls_dimension_evidence") {
    const std = ["workspace_id","snapshot_id","profile_id","canonical_object_key","data_version",
      "metric_name","metric_aggregation","dimension_key","dimension_label","value","unit",
      "profile_time_window","source_batch_id","source_quality_flags_json","source_evidence_refs_json",
      "metric_row_count","tag_type_count","tag_value_count","avg_mapping_confidence",
      "latest_metric_updated_at","latest_mapping_updated_at"];
    let cols: string[];
    if (opts.reorder) { cols = [...std]; const tmp = cols[0]!; cols[0] = cols[1]!; cols[1] = tmp; }
    else if (opts.extraCol === "evidence") cols = [...std, "extra_col"];
    else if (opts.missingCol === "evidence") cols = std.filter(c => c !== "metric_row_count");
    else cols = std;
    db.exec("CREATE TABLE _evidence_base (" + cols.map(c => {
      if (c === "value" || c === "avg_mapping_confidence") return c + " REAL";
      if (c === "metric_row_count" || c === "tag_type_count" || c === "tag_value_count") return c + " INTEGER";
      return c + " TEXT";
    }).join(", ") + ")");
    db.exec("CREATE VIEW v_workpls_dimension_evidence AS SELECT " + cols.join(", ") + " FROM _evidence_base");
  }
  db.close();
  return dbPath;
}

function insertAhObject(dbPath: string, wsId: string, key: string, otype: string, name: string, dv = "v1", opts: { id?: string } = {}): void {
  const db = new DatabaseSync(dbPath);
  db.prepare("INSERT INTO pls_channel_objects (id, workspace_id, object_type, target_object, " +
    "source_stable_key, key_source, canonical_object_key, object_version_id, data_version, " +
    "source_batch_id, generated_at, time_window, display_name, platform_name, platform_type, " +
    "entity_status, manual_review_status, possible_duplicate, quality_flags_json, " +
    "entity_attributes_json, raw_json, status) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active','unreviewed',0,'[]','{}','{}','active')").run(
    opts.id ?? ("pco_" + key + "_" + dv), wsId, otype, "ChannelEntity", key, "src", key,
    wsId + ":" + key + ":" + dv, dv, "batch_t", "2026-07-01T00:00:00Z",
    "2026-06-01/2026-06-30", name, null, null);
  db.close();
}

function insertAhSnapshot(dbPath: string, wsId: string, pid: string, objKey: string, o: {
  dv?: string; gen?: string; tw?: string; ss?: number | null; conf?: number | null;
  qf?: string; sb?: string; id?: string;
} = {}): void {
  const db = new DatabaseSync(dbPath);
  db.prepare("INSERT INTO pls_audience_profiles (id, workspace_id, profile_id, canonical_object_key, " +
    "source, source_batch_id, data_version, generated_at, time_window, sample_size, confidence, " +
    "tags_json, unmapped_fields_json, quality_flags_json, raw_json, status) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')").run(
    o.id ?? ("pap_" + pid + "_" + (o.dv ?? "v1")), wsId, pid, objKey, "test", o.sb ?? "batch_t", o.dv ?? "v1",
    o.gen ?? "2026-07-01T00:00:00Z", o.tw ?? "2026-06-01/2026-06-30",
    o.ss ?? null, o.conf ?? null, "[]", "[]", o.qf ?? "[]", "{}");
  db.close();
}

function makeRef(sb?: string): string {
  return JSON.stringify([{
    sourceSystem: "agentharness", sourceRecordType: "platform_profile_tag_metric",
    sourceRecordId: "rec1", sourceBatchId: sb ?? "batch_t", sourceFile: "file.csv",
    sourceRow: 1, platformTagCatalogId: "ptag1",
  }]);
}

function insertAhEvidence(dbPath: string, wsId: string, snapId: string, objKey: string, o: {
  dimKey: string; dimLabel: string; value: number; unit: string; metricName?: string;
  metricAgg?: string; dv?: string; tw?: string; sb?: string; qf?: string; refs?: string;
  rowCount?: number; typeCount?: number; valueCount?: number; avgConf?: number;
}): void {
  const db = new DatabaseSync(dbPath);
  db.prepare("INSERT INTO _evidence_base (workspace_id, snapshot_id, profile_id, canonical_object_key, " +
    "data_version, metric_name, metric_aggregation, dimension_key, dimension_label, value, unit, " +
    "profile_time_window, source_batch_id, source_quality_flags_json, source_evidence_refs_json, " +
    "metric_row_count, tag_type_count, tag_value_count, avg_mapping_confidence, " +
    "latest_metric_updated_at, latest_mapping_updated_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    wsId, snapId, snapId, objKey, o.dv ?? "v1", o.metricName ?? "share", o.metricAgg ?? "sum",
    o.dimKey, o.dimLabel, o.value, o.unit, o.tw ?? "2026-06-01/2026-06-30", o.sb ?? "batch_t",
    o.qf ?? "[]", o.refs ?? makeRef(o.sb), o.rowCount ?? 1, o.typeCount ?? 1,
    o.valueCount ?? 1, o.avgConf ?? 1.0, "2026-07-18T00:00:00Z", "2026-07-18T00:00:00Z");
  db.close();
}

// ===========================================================================
// PLS Workspace Adapter Tests
// ===========================================================================

test("PLS adapter: capability is not_ready, resolve fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_cap";
    const db = createPlsDb(dir, wsId);
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const cap = source.getCapabilities(wsId);
    assert.equal(cap.sourceSystem, "pls_workspace");
    assert.equal(cap.sourceContractVersion, PLS_PORTRAIT_SOURCE_CONTRACT_VERSION);
    assert.equal(cap.readiness, "not_ready");
    assert.equal(cap.evidenceResolutionAvailable, false);
    assert.equal(cap.objectDiscoveryAvailable, true);
    assert.ok(cap.blockingReasonCodes.length > 0);
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "obj1", "snap1"), PortraitSourceNotReadyError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: lists channel objects and products with stable sort", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_list";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:beta", "account", "Beta Account");
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha Account");
    insertSku(db, wsId, "sku_002", "Product Two");
    insertSku(db, wsId, "sku_001", "Product One");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const all = source.listPortraitObjects(wsId);
    assert.equal(all.length, 4);
    assert.equal(all[0]!.family, "channel");
    assert.equal(all[0]!.objectId, "account:alpha");
    assert.equal(all[1]!.objectId, "account:beta");
    assert.equal(all[2]!.family, "product");
    assert.equal(all[2]!.objectId, "sku_001");
    assert.equal(all[3]!.objectId, "sku_002");
    const channels = source.listPortraitObjects(wsId, { family: "channel" });
    assert.equal(channels.length, 2);
    const products = source.listPortraitObjects(wsId, { family: "product", objectType: "sku" });
    assert.equal(products.length, 2);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: fail closed on unapproved channel object type", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_badtype";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "bad:obj", "unknown_type", "Bad Object");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitObjects(wsId), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: fail closed on blank display name", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_blank";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:blank", "account", "  ");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitObjects(wsId), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: lists channel snapshots with period, confidence, quality flags", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_snap";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha Account");
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", {
      dv: "v1", tw: "2026-06-01/2026-06-30", ss: 1000, conf: 0.82, qf: '["mock_sample"]',
    });
    insertAudienceProfile(db, wsId, "profile_002", "account:alpha", {
      dv: "v2", tw: "2026-07-01/2026-07-31", ss: 500, conf: 0.75, qf: "[]",
    });
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const snaps = source.listPortraitSnapshots(wsId, "account:alpha");
    assert.equal(snaps.length, 2);
    assert.equal(snaps[0]!.snapshotId, "profile_001");
    assert.equal(snaps[0]!.sourceSystem, "pls_workspace");
    assert.equal(snaps[0]!.periodStart, "2026-06-01");
    assert.equal(snaps[0]!.periodEnd, "2026-06-30");
    assert.equal(snaps[0]!.sampleSize, 1000);
    assert.equal(snaps[0]!.confidence, 0.82);
    assert.deepEqual(snaps[0]!.sourceQualityFlags, ["mock_sample"]);
    assert.equal(snaps[1]!.confidence, 0.75);
    assert.equal(snaps[1]!.sampleSize, 500);
    assert.deepEqual(snaps[1]!.sourceQualityFlags, []);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: product objects have no snapshots, unknown object fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_prod_snap";
    const db = createPlsDb(dir, wsId);
    insertSku(db, wsId, "sku_001", "Product One");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const snaps = source.listPortraitSnapshots(wsId, "sku_001");
    assert.equal(snaps.length, 0);
    assert.throws(() => source.listPortraitSnapshots(wsId, "nonexistent"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: workspace mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_mismatch";
    const db = createPlsDb(dir, wsId);
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.getCapabilities("ws_other"), PortraitSourceDataError);
    assert.throws(() => source.listPortraitObjects("ws_other"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: IDs preserved case-sensitive, no trim", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_case";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "Account:Alpha", "account", "Alpha Account");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const objs = source.listPortraitObjects(wsId);
    assert.equal(objs[0]!.objectId, "Account:Alpha");
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: close marks as closed, further calls fail", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_close";
    const db = createPlsDb(dir, wsId);
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    source.close();
    assert.throws(() => source.getCapabilities(wsId), PortraitSourceDataError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: invalid time_window fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_badtw";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha Account");
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", { tw: "invalid", conf: 0.5 });
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// AgentHarness Adapter Tests
// ===========================================================================

test("AH adapter: schema gate rejects missing core view", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_missing_view.sqlite", { dropView: "v_workpls_dimension_evidence" });
    assert.throws(() => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }), PortraitSourceSchemaError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: schema gate rejects missing column", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_missing_col.sqlite", { missingCol: "snapshots" });
    assert.throws(() => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }), PortraitSourceSchemaError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: schema gate rejects extra column on exact-column view", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_extra_col.sqlite", { extraCol: "snapshots" });
    assert.throws(() => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }), PortraitSourceSchemaError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: schema gate rejects reordered columns", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_reorder.sqlite", { reorder: true });
    assert.throws(() => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }), PortraitSourceSchemaError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: rejects relative path", () => {
  const dir = makeTempDir();
  try {
    assert.throws(
      () => createAgentHarnessPortraitSource({ dbPath: "relative/path.sqlite", workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }),
      PortraitSourceConfigError,
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: rejects symlink path", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_real.sqlite");
    const linkPath = path.join(dir, "ah_link.sqlite");
    fs.symlinkSync(dbPath, linkPath);
    assert.throws(
      () => createAgentHarnessPortraitSource({ dbPath: linkPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }),
      PortraitSourceConfigError,
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: rejects directory path", () => {
  const dir = makeTempDir();
  try {
    assert.throws(
      () => createAgentHarnessPortraitSource({ dbPath: dir, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }),
      PortraitSourceConfigError,
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: rejects self-DB (PLS workspace DB path)", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_self.sqlite");
    assert.throws(
      () => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: dbPath }),
      PortraitSourceConfigError,
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: capability reports not_ready when no evidence", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_cap_no_ev.sqlite");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const cap = source.getCapabilities("ws_ah");
    assert.equal(cap.sourceSystem, "agentharness");
    assert.equal(cap.readiness, "not_ready");
    assert.equal(cap.evidenceResolutionAvailable, false);
    assert.equal(cap.objectDiscoveryAvailable, true);
    assert.equal(cap.snapshotDiscoveryAvailable, true);
    assert.ok(cap.blockingReasonCodes.includes("no_unit_bearing_evidence_available"));
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: capability reports ready with evidence resolution", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_cap";
    const dbPath = createAhDb(dir, "ah_cap.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const cap = source.getCapabilities(wsId);
    assert.equal(cap.sourceSystem, "agentharness");
    assert.equal(cap.readiness, "ready");
    assert.equal(cap.evidenceResolutionAvailable, true);
    assert.equal(cap.objectDiscoveryAvailable, true);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: lists objects, snapshots, and resolves evidence", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_full";
    const dbPath = createAhDb(dir, "ah_full.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha Account");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", {
      dv: "v1", tw: "2026-06-01/2026-06-30", ss: 1000, conf: 0.82, qf: '["mock_sample"]',
    });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demographics", value: 47.28, unit: "percent",
      qf: '["mock_sample"]',
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const objs = source.listPortraitObjects(wsId);
    assert.equal(objs.length, 1);
    assert.equal(objs[0]!.objectId, "account:alpha");
    assert.equal(objs[0]!.displayName, "Alpha Account");
    assert.equal(objs[0]!.family, "channel");
    const snaps = source.listPortraitSnapshots(wsId, "account:alpha");
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0]!.snapshotId, "profile_001");
    assert.equal(snaps[0]!.sourceSystem, "agentharness");
    assert.equal(snaps[0]!.sourceContractVersion, AGENTHARNESS_PORTRAIT_CONTRACT_VERSION);
    assert.equal(snaps[0]!.periodStart, "2026-06-01");
    const resolved = source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001");
    assert.equal(resolved.sourceSystem, "agentharness");
    assert.equal(resolved.objectId, "account:alpha");
    assert.equal(resolved.snapshot.snapshotId, "profile_001");
    assert.equal(resolved.dimensionEvidence.length, 1);
    const ev = resolved.dimensionEvidence[0]!;
    assert.equal(ev.dimensionKey, "P_DEMOGRAPHICS");
    assert.equal(ev.dimensionLabel, "Demographics");
    assert.equal(ev.value, 47.28);
    assert.equal(ev.unit, "percent");
    assert.equal(ev.metricName, "share");
    assert.equal(ev.metricAggregation, "sum");
    assert.equal(ev.sourceEvidenceRefs.length, 1);
    assert.equal(ev.sourceEvidenceRefs[0]!["sourceSystem"], "agentharness");
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: workspace mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_mismatch";
    const dbPath = createAhDb(dir, "ah_mismatch.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.listPortraitObjects("ws_other"), PortraitSourceConfigError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: cross-workspace query returns empty (workspace_id filter)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_xws";
    const dbPath = createAhDb(dir, "ah_xws.sqlite");
    insertAhObject(dbPath, "ws_other", "account:other", "account", "Other Account");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const objs = source.listPortraitObjects(wsId);
    assert.equal(objs.length, 0);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: object not found fail closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_notfound";
    const dbPath = createAhDb(dir, "ah_notfound.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:nonexistent"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: snapshot not found fail closed (with evidence)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_snapnotfound";
    const dbPath = createAhDb(dir, "ah_snapnotfound.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "snap_nonexistent"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: resolve fails closed when no evidence (not_ready)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_noevresolve";
    const dbPath = createAhDb(dir, "ah_noevresolve.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceNotReadyError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: close marks as closed", () => {
  const dir = makeTempDir();
  try {
    const dbPath = createAhDb(dir, "ah_close.sqlite");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    source.close();
    assert.throws(() => source.getCapabilities("ws_ah"), PortraitSourceDataError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence with empty refs fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_emptyrefs";
    const dbPath = createAhDb(dir, "ah_emptyrefs.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha");
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", refs: "[]",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence with invalid refs (wrong sourceSystem) fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_badref";
    const dbPath = createAhDb(dir, "ah_badref.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha");
    const badRef = JSON.stringify([{ sourceSystem: "wrong", sourceRecordType: "x", sourceRecordId: "r",
      sourceBatchId: "b", sourceFile: "f.csv", sourceRow: 1, platformTagCatalogId: "p" }]);
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", refs: badRef,
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: blank display name fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_blankname";
    const dbPath = createAhDb(dir, "ah_blankname.sqlite");
    insertAhObject(dbPath, wsId, "account:blank", "account", "  ");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.listPortraitObjects(wsId), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: IDs preserved case-sensitive", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_case";
    const dbPath = createAhDb(dir, "ah_case.sqlite");
    insertAhObject(dbPath, wsId, "Account:Alpha", "account", "Alpha Account");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const objs = source.listPortraitObjects(wsId);
    assert.equal(objs[0]!.objectId, "Account:Alpha");
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: unapproved object type fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_badtype";
    const dbPath = createAhDb(dir, "ah_badtype.sqlite");
    insertAhObject(dbPath, wsId, "bad:obj", "unknown_type", "Bad Object");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.listPortraitObjects(wsId), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: filter by family=product returns empty (no product in AH)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_prod_filter";
    const dbPath = createAhDb(dir, "ah_prod_filter.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    const products = source.listPortraitObjects(wsId, { family: "product" });
    assert.equal(products.length, 0);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Resolver Tests
// ===========================================================================

test("Resolver: no data_source row defaults to pls_workspace", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_default";
    const db = createPlsDb(dir, wsId);
    const result = resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") });
    assert.equal(result.sourceSystem, "pls_workspace");
    assert.equal(result.workspaceId, wsId);
    const cap = result.source.getCapabilities(wsId);
    assert.equal(cap.sourceSystem, "pls_workspace");
    assert.equal(cap.readiness, "not_ready");
    result.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: pls_workspace with empty config resolves", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_pls";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "pls_workspace", "active", "{}");
    const result = resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") });
    assert.equal(result.sourceSystem, "pls_workspace");
    result.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: pls_workspace with non-empty config fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_pls_bad";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "pls_workspace", "active", '{"foo":"bar"}');
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with valid dbPath resolves", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah";
    const db = createPlsDb(dir, wsId);
    const ahDbPath = createAhDb(dir, "ah_res_valid.sqlite");
    insertAhObject(ahDbPath, wsId, "account:alpha", "account", "Alpha");
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active",
      JSON.stringify({ dbPath: ahDbPath }));
    const result = resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") });
    assert.equal(result.sourceSystem, "agentharness");
    const objs = result.source.listPortraitObjects(wsId);
    assert.equal(objs.length, 1);
    assert.equal(objs[0]!.objectId, "account:alpha");
    result.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: inactive status fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_inactive";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "pls_workspace", "inactive", "{}");
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: unknown adapter fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_unknown";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "unknown_adapter", "active", "{}");
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: invalid JSON config fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_badjson";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "pls_workspace", "active", "not json");
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: JSON array config fails closed (must be object)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_arrconfig";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "pls_workspace", "active", "[]");
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with missing dbPath fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah_nopath";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active", "{}");
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with empty dbPath fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah_emptypath";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active",
      JSON.stringify({ dbPath: "" }));
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with extra config keys fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah_extra";
    const db = createPlsDb(dir, wsId);
    const ahDbPath = createAhDb(dir, "ah_res_extra.sqlite");
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active",
      JSON.stringify({ dbPath: ahDbPath, extraKey: "bad" }));
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with nonexistent dbPath fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah_nonexist";
    const db = createPlsDb(dir, wsId);
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active",
      JSON.stringify({ dbPath: path.join(dir, "nonexistent.sqlite") }));
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: agentharness with schema drift fails closed, no fallback", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_ah_drift";
    const db = createPlsDb(dir, wsId);
    const ahDbPath = createAhDb(dir, "ah_res_drift.sqlite", { dropView: "v_workpls_dimension_evidence" });
    db.prepare("INSERT INTO data_source (source_id, workspace_id, source_kind, adapter, status, config) " +
      "VALUES (?, ?, ?, ?, ?, ?)").run("portrait_source", wsId, "portrait", "agentharness", "active",
      JSON.stringify({ dbPath: ahDbPath }));
    assert.throws(() => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }), PortraitSourceResolverError);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Resolver: data_source table absent fails closed (not a missing row)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_res_notable";
    const db = new DatabaseSync(path.join(dir, wsId + ".sqlite"));
    db.exec("CREATE TABLE workspace (workspace_id TEXT PRIMARY KEY, name TEXT, created_at TEXT, updated_at TEXT)");
    db.prepare("INSERT INTO workspace (workspace_id, name) VALUES (?, ?)").run(wsId, "Test");
    assert.throws(
      () => resolveActivePortraitSource({ db, workspaceId: wsId, plsWorkspaceDbPath: path.join(dir, wsId + ".sqlite") }),
      PortraitSourceResolverError,
    );
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Revision 1: New negative tests for 7 review blockers
// ===========================================================================

test("AH schema gate: table masquerading as view is rejected", () => {
  const dir = makeTempDir();
  try {
    const dbPath = path.join(dir, "ah_table_masquerade.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE v_pls_audience_profile_snapshots (workspace_id TEXT, profile_id TEXT, " +
      "canonical_object_key TEXT, data_version TEXT, source_batch_id TEXT, generated_at TEXT, " +
      "time_window TEXT, sample_size INTEGER, confidence REAL, quality_flags_json TEXT)");
    db.exec("CREATE VIEW v_pls_channel_profile_overview AS SELECT NULL AS workspace_id, " +
      "NULL AS canonical_object_key, NULL AS object_type, NULL AS display_name, NULL AS data_version, " +
      "NULL AS source_batch_id, NULL AS object_generated_at, NULL AS object_time_window, " +
      "NULL AS object_quality_flags_json, NULL AS entity_attributes_json, NULL AS audience_profile_id, " +
      "NULL AS audience_time_window, NULL AS audience_sample_size, NULL AS audience_confidence, " +
      "NULL AS audience_quality_flags_json, NULL AS profile_coverage_status WHERE 1=0");
    db.exec("CREATE TABLE _evidence_base (workspace_id TEXT)");
    db.exec("CREATE VIEW v_workpls_dimension_evidence AS SELECT workspace_id FROM _evidence_base");
    db.close();
    assert.throws(
      () => createAgentHarnessPortraitSource({ dbPath, workspaceId: "ws_ah", plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" }),
      PortraitSourceSchemaError,
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Timestamp parser: date-only format rejected", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ts_dateonly";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    db.prepare("INSERT INTO audience_profile (workspace_id, profile_id, canonical_object_key, " +
      "profile_stage, source, source_batch_id, data_version, generated_at, time_window, " +
      "sample_size, confidence, tags, unmapped_fields, quality_flags, raw) " +
      "VALUES (?, ?, ?, 'channel_audience', 'test', 'batch_t', 'v1', '2026-01-01', " +
      "'2026-06-01/2026-06-30', NULL, 0.5, '[]', '[]', '[]', '{}')").run(wsId, "profile_001", "account:alpha");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: duplicate snapshotId fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_dupsnap";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", { dv: "v1", conf: 0.5 });
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", { dv: "v2", conf: 0.6 });
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("PLS adapter: non-channel_audience profile_stage excluded", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_pls_stage";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    db.prepare("INSERT INTO audience_profile (workspace_id, profile_id, canonical_object_key, " +
      "profile_stage, source, source_batch_id, data_version, generated_at, time_window, " +
      "sample_size, confidence, tags, unmapped_fields, quality_flags, raw) " +
      "VALUES (?, ?, ?, 'product_fit', 'test', 'batch_t', 'v1', '2026-07-01T00:00:00Z', " +
      "'2026-06-01/2026-06-30', NULL, 0.5, '[]', '[]', '[]', '{}')").run(wsId, "profile_other", "account:alpha");
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", { conf: 0.5 });
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const snaps = source.listPortraitSnapshots(wsId, "account:alpha");
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0]!.snapshotId, "profile_001");
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: duplicate snapshotId fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_dupsnap";
    const dbPath = createAhDb(dir, "ah_dupsnap.sqlite");
    // Insert channel objects for both data versions so the view JOIN matches both profiles.
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha", "v1");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha", "v2");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1" });
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v2" });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: ambiguous snapshotId in resolve fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_ambsnap";
    const dbPath = createAhDb(dir, "ah_ambsnap.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha", "v1");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha", "v2");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1" });
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v2" });
    // Add evidence so the adapter reports ready (hasEvidence=true).
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", dv: "v1",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence data_version mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evdv";
    const dbPath = createAhDb(dir, "ah_evdv.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30" });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", dv: "WRONG_VERSION",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence profile_time_window mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evtw";
    const dbPath = createAhDb(dir, "ah_evtw.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30" });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", tw: "2026-07-01/2026-07-31",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence source_batch_id mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evsb";
    const dbPath = createAhDb(dir, "ah_evsb.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30", sb: "snap_batch" });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", sb: "WRONG_BATCH",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence metric_aggregation != sum fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evagg";
    const dbPath = createAhDb(dir, "ah_evagg.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30" });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", metricAgg: "avg",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence ref sourceBatchId mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evrefbatch";
    const dbPath = createAhDb(dir, "ah_evrefbatch.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30", sb: "snap_batch" });
    const badRef = JSON.stringify([{
      sourceSystem: "agentharness", sourceRecordType: "platform_profile_tag_metric",
      sourceRecordId: "rec1", sourceBatchId: "WRONG_REF_BATCH", sourceFile: "file.csv",
      sourceRow: 1, platformTagCatalogId: "ptag1",
    }]);
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
      sb: "snap_batch", tw: "2026-06-01/2026-06-30", dv: "v1", refs: badRef,
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: duplicate dimension_key fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_dupdim";
    const dbPath = createAhDb(dir, "ah_dupdim.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { dv: "v1", tw: "2026-06-01/2026-06-30" });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo2", value: 60, unit: "percent",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Revision 2: New negative tests for 4 review blockers
// ===========================================================================

test("Timestamp parser: invalid leap year rejected", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ts_leap";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    db.prepare("INSERT INTO audience_profile (workspace_id, profile_id, canonical_object_key, " +
      "profile_stage, source, source_batch_id, data_version, generated_at, time_window, " +
      "sample_size, confidence, tags, unmapped_fields, quality_flags, raw) " +
      "VALUES (?, ?, ?, 'channel_audience', 'test', 'batch_t', 'v1', '2026-02-29T00:00:00Z', " +
      "'2026-06-01/2026-06-30', NULL, 0.5, '[]', '[]', '[]', '{}')").run(wsId, "profile_001", "account:alpha");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Timestamp parser: invalid hour 24 rejected", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ts_hour24";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    db.prepare("INSERT INTO audience_profile (workspace_id, profile_id, canonical_object_key, " +
      "profile_stage, source, source_batch_id, data_version, generated_at, time_window, " +
      "sample_size, confidence, tags, unmapped_fields, quality_flags, raw) " +
      "VALUES (?, ?, ?, 'channel_audience', 'test', 'batch_t', 'v1', '2026-01-01T24:00:00Z', " +
      "'2026-06-01/2026-06-30', NULL, 0.5, '[]', '[]', '[]', '{}')").run(wsId, "profile_001", "account:alpha");
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    assert.throws(() => source.listPortraitSnapshots(wsId, "account:alpha"), PortraitSourceDataError);
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence ref sourceRecordType must be exactly platform_profile_tag_metric", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_badrectype";
    const dbPath = createAhDb(dir, "ah_badrectype.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    const badRef = JSON.stringify([{
      sourceSystem: "agentharness", sourceRecordType: "wrong_type",
      sourceRecordId: "rec1", sourceBatchId: "batch_t", sourceFile: "file.csv",
      sourceRow: 1, platformTagCatalogId: "ptag1",
    }]);
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", refs: badRef,
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: evidence source_quality_flags_json mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_evqf";
    const dbPath = createAhDb(dir, "ah_evqf.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8, qf: '["mock_sample"]' });
    // Evidence has different quality flags than snapshot.
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent", qf: "[]",
    });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Revision 3: New negative tests for 6 review blockers
// ===========================================================================

test("AH adapter: evidence profile_id mismatch fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_pid_mismatch";
    const dbPath = createAhDb(dir, "ah_pid_mismatch.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    // Insert evidence with snapshot_id='profile_001' (matches query) but
    // profile_id='profile_other' (mismatches the profile_id binding check).
    // The view aliases snapshot_id = profile_id, so we insert directly into
    // the base table with different values to exercise the binding check.
    const db = new DatabaseSync(dbPath);
    db.exec("INSERT INTO _evidence_base (workspace_id, snapshot_id, profile_id, canonical_object_key, " +
      "data_version, metric_name, metric_aggregation, dimension_key, dimension_label, value, unit, " +
      "profile_time_window, source_batch_id, source_quality_flags_json, source_evidence_refs_json, " +
      "metric_row_count, tag_type_count, tag_value_count, avg_mapping_confidence, " +
      "latest_metric_updated_at, latest_mapping_updated_at) VALUES (" +
      "'" + wsId + "', 'profile_001', 'profile_other', 'account:alpha', 'v1', 'share', 'sum', " +
      "'P_DEMOGRAPHICS', 'Demo', 50, 'percent', '2026-06-01/2026-06-30', 'batch_t', '[]', " +
      "'" + makeRef() + "', 1, 1, 1, 1.0, '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z')");
    db.close();
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    // The query returns one row (snapshot_id='profile_001' matches), but
    // profile_id='profile_other' !== snapshotId='profile_001' triggers the binding check.
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: mixed workspace - snapshot without evidence fails closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_mixed";
    const dbPath = createAhDb(dir, "ah_mixed.sqlite");
    // Object 1 with snapshot that has evidence.
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    // Object 2 with snapshot that has NO evidence.
    insertAhObject(dbPath, wsId, "account:beta", "account", "Beta");
    insertAhSnapshot(dbPath, wsId, "profile_002", "account:beta", { conf: 0.7 });
    const source = createAgentHarnessPortraitSource({ dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite" });
    // Resolving object 1 should succeed (has evidence).
    const resolved = source.resolvePortraitSnapshot(wsId, "account:alpha", "profile_001");
    assert.equal(resolved.dimensionEvidence.length, 1);
    // Resolving object 2 should fail (no evidence for this specific snapshot).
    assert.throws(() => source.resolvePortraitSnapshot(wsId, "account:beta", "profile_002"), PortraitSourceDataError);
    source.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Timestamp parser: preserves non-zero milliseconds", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ts_ms";
    const db = createPlsDb(dir, wsId);
    insertChannelObject(db, wsId, "account:alpha", "account", "Alpha");
    insertAudienceProfile(db, wsId, "profile_001", "account:alpha", {
      gen: "2026-07-01T12:30:45.123Z", conf: 0.5,
    });
    const source = createPlsWorkspacePortraitSource({ db, workspaceId: wsId });
    const snaps = source.listPortraitSnapshots(wsId, "account:alpha");
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0]!.sourceGeneratedAt, "2026-07-01T12:30:45.123Z");
    source.close();
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===========================================================================
// Revision 5: Lifecycle regression tests (probe failure, close failure/retry)
// ===========================================================================

test("AH adapter: evidence-probe failure closes connection and throws controlled error", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_probe_fail";
    const dbPath = createAhDb(dir, "ah_probe_fail.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    // Inject a probe that always throws (simulating query failure).
    // Also inject _closeDb to capture and assert the exact DatabaseSync identity.
    let probeCallCount = 0;
    let closeDbCallCount = 0;
    let closedDbIdentity: unknown = null;
    const failingProbe = (db: unknown, _wsId: string): boolean => {
      probeCallCount++;
      // Capture the db identity passed to the probe.
      closedDbIdentity = db;
      throw new Error("simulated SQLite query failure");
    };
    const identityAssertingClose = (db: DatabaseSync): void => {
      closeDbCallCount++;
      // Assert the cleanup receives the exact same DatabaseSync as the probe.
      assert.strictEqual(db, closedDbIdentity, "cleanup should receive the same DatabaseSync as the probe");
      db.close();
    };
    assert.throws(
      () => createAgentHarnessPortraitSource({
        dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite",
        _probeEvidence: failingProbe,
        _closeDb: identityAssertingClose,
      }),
      PortraitSourceUnavailableError,
    );
    assert.equal(probeCallCount, 1, "probe should have been called once");
    assert.equal(closeDbCallCount, 1, "cleanup should have been called exactly once");
    assert.notStrictEqual(closedDbIdentity, null, "cleanup should have received a DatabaseSync");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: schema gate failure triggers cleanup via injected close", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_schema_cleanup";
    // Create DB with missing view to trigger schema gate failure.
    const dbPath = createAhDb(dir, "ah_schema_cleanup.sqlite", { dropView: "v_workpls_dimension_evidence" });
    let closeDbCallCount = 0;
    let closedDbIdentity: unknown = null;
    const identityAssertingClose = (db: DatabaseSync): void => {
      closeDbCallCount++;
      closedDbIdentity = db;
      db.close();
    };
    assert.throws(
      () => createAgentHarnessPortraitSource({
        dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite",
        _closeDb: identityAssertingClose,
      }),
      PortraitSourceSchemaError,
    );
    assert.equal(closeDbCallCount, 1, "cleanup should have been called exactly once on schema gate failure");
    assert.notStrictEqual(closedDbIdentity, null, "cleanup should have received a DatabaseSync");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: close failure is controlled, retryable, then success marks closed", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_close_retry";
    const dbPath = createAhDb(dir, "ah_close_retry.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    // Inject a close that fails on first call, succeeds on second (actually closes DB).
    let closeCallCount = 0;
    const failingThenSucceedingClose = (db: DatabaseSync): void => {
      closeCallCount++;
      if (closeCallCount === 1) {
        throw new Error("simulated close failure");
      }
      // Second call: actually close the real connection.
      db.close();
    };
    const source = createAgentHarnessPortraitSource({
      dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite",
      _closeDb: failingThenSucceedingClose,
    });
    // First close should throw controlled error.
    assert.throws(() => source.close(), PortraitSourceUnavailableError);
    assert.equal(closeCallCount, 1);
    // Connection should still be retryable (not marked closed).
    const cap = source.getCapabilities(wsId);
    assert.equal(cap.sourceSystem, "agentharness");
    // Second close should succeed and mark as closed.
    source.close();
    assert.equal(closeCallCount, 2);
    // Now the source should be marked closed.
    assert.throws(() => source.getCapabilities(wsId), PortraitSourceDataError);
    // Verify the real connection was released: opening the same file again succeeds
    // (SQLite permits concurrent read-only, but the original FD is released).
    const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
    verifyDb.exec("PRAGMA query_only = ON");
    const check = verifyDb.prepare("SELECT 1 AS c").get() as { c: number };
    assert.equal(check.c, 1);
    verifyDb.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("AH adapter: probe and close errors use stable public messages (no injected provider text)", () => {
  const dir = makeTempDir();
  try {
    const wsId = "ws_ah_stable_msgs";
    const dbPath = createAhDb(dir, "ah_stable_msgs.sqlite");
    insertAhObject(dbPath, wsId, "account:alpha", "account", "Alpha");
    insertAhSnapshot(dbPath, wsId, "profile_001", "account:alpha", { conf: 0.8 });
    insertAhEvidence(dbPath, wsId, "profile_001", "account:alpha", {
      dimKey: "P_DEMOGRAPHICS", dimLabel: "Demo", value: 50, unit: "percent",
    });
    // Probe failure should use stable message.
    const failingProbe = (): boolean => { throw new Error("RAW_SQLITE_ERROR_MESSAGE"); };
    try {
      createAgentHarnessPortraitSource({
        dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite",
        _probeEvidence: failingProbe,
      });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof PortraitSourceUnavailableError);
      assert.ok(!error.message.includes("RAW_SQLITE_ERROR_MESSAGE"), "probe error should not include raw provider text");
      assert.ok(error.message.includes("source contract incompatible or unavailable"), "probe error should use stable message");
    }
    // Close failure should use stable message.
    // Use a close that fails first then succeeds to ensure the real connection is released.
    let closeCallCount = 0;
    const failingThenRealClose = (db: DatabaseSync): void => {
      closeCallCount++;
      if (closeCallCount === 1) {
        throw new Error("RAW_CLOSE_ERROR");
      }
      db.close();
    };
    const source = createAgentHarnessPortraitSource({
      dbPath, workspaceId: wsId, plsWorkspaceDbPath: "/tmp/pls_nonexistent.sqlite",
      _closeDb: failingThenRealClose,
    });
    try {
      source.close();
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof PortraitSourceUnavailableError);
      assert.ok(!error.message.includes("RAW_CLOSE_ERROR"), "close error should not include raw provider text");
      assert.ok(error.message.includes("resource release error"), "close error should use stable message");
    }
    // Retry close to actually release the connection.
    source.close();
    assert.equal(closeCallCount, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
