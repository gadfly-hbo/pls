#!/usr/bin/env node
// Sync channel_entity rows from douyin_account_latest + channel_profile.
//
// Safety: this script writes to the configured workspace. By default it refuses to
// write to ws_demo. Pass a different workspace as argv[2] or set PLS_WORKSPACE, or
// set PLS_ALLOW_WS_DEMO_WRITE=1 (controller-only override) to bypass.

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guardWriteWorkspace } from "./lib/workspace-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const wsId = process.argv[2] ?? process.env.PLS_WORKSPACE ?? "ws_demo";

guardWriteWorkspace(wsId, { purpose: "sync channel entities" });
const dbPath = join(repoRoot, "data/workspaces", wsId, "db.sqlite");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");

// Columns: 37 total. created_at + updated_at use datetime('now'), so 35 bind params.
const COLS = [
  "workspace_id","channel_entity_id","entity_type","source_entity_key","display_name",
  "platform_type","platform_name","parent_entity_id","entity_path","entity_status",
  "shop_id","account_id","account_kind","content_format",
  "country","province","city","district","trade_area","mall_name","store_id","store_format",
  "profile_tags","benchmark_tags","performance_metrics","unmapped_profile_fields","raw_business_fields",
  "source_id","source_batch_id","data_version","generated_at","time_window","source_type",
  "quality_flags","upsert_key"
];
const PH = Array(35).fill("?").join(",");
const INSERT_SQL = `INSERT OR REPLACE INTO channel_entity (${COLS.join(",")},created_at,updated_at) VALUES (${PH},datetime('now'),datetime('now'))`;
const stmt = db.prepare(INSERT_SQL);

function etFromDouyin(k) {
  return k==="douyin_shop"?"shop":k==="douyin_short_video_account"?"content_account":k==="douyin_live_room"?"livestream_room":"account";
}
function etFromMock(ch) {
  return ch==="shelf_ecommerce"?"shop":ch==="short_video"?"content_account":ch==="live_stream"?"livestream_room":"account";
}

// Load benchmark tags grouped by channelId
const benchRows = db.prepare("SELECT * FROM douyin_account_benchmark_tag_latest WHERE workspace_id=?").all(wsId);
const benchByCh = new Map();
for (const r of benchRows) {
  if (!benchByCh.has(r.channel_id)) benchByCh.set(r.channel_id, []);
  benchByCh.get(r.channel_id).push({
    dimension:r.dimension, dimensionTaxonomy:r.dimension_taxonomy,
    optionLabel:r.option_label, sharePercent:r.share_percent,
    top1Flag:r.top1_flag, mappedTagId:r.mapped_tag_id,
    mappingConfidence:r.mapping_confidence, businessInterpretation:r.business_interpretation
  });
}

let douyinN=0, mockN=0;
db.exec("BEGIN");
try {
  // --- douyin accounts ---
  const accounts = db.prepare("SELECT * FROM douyin_account_latest WHERE workspace_id=?").all(wsId);
  for (const a of accounts) {
    const et = etFromDouyin(a.account_kind);
    const eid = `douyin:${et}:${a.channel_id}`;
    const bt = JSON.stringify(benchByCh.get(a.channel_id) ?? []);
    stmt.run(
      wsId, eid, et, a.channel_id, a.display_name??a.account_name,
      a.platform_type, "抖音", null, "[]", "active",
      et==="shop"?a.channel_id:null, et!=="shop"?a.channel_id:null, a.account_kind, "[]",
      null, null, null, null, null, null, null, null,
      "[]", bt, "{}", "[]", "{}",
      "douyin_bi", a.source_batch_id, a.data_version, a.generated_at, a.time_window, a.source_type,
      "[]", JSON.stringify({fields:["channelEntityId","dataVersion"],hash:eid.slice(0,16)})
    );
    douyinN++;
  }
  // --- mock channel_profile ---
  const channels = db.prepare("SELECT * FROM channel_profile WHERE workspace_id=?").all(wsId);
  for (const ch of channels) {
    const et = etFromMock(ch.channel_type);
    const eid = `mock:${et}:${ch.channel_id}`;
    stmt.run(
      wsId, eid, et, ch.channel_id, ch.channel_name,
      ch.platform_type, null, null, "[]", "active",
      et==="shop"?ch.channel_id:null, et!=="shop"?ch.channel_id:null, null, "[]",
      null, null, null, null, null, null, null, null,
      ch.tags??"[]", "[]", JSON.stringify({trafficIndex:ch.traffic_index,conversionIndex:ch.conversion_index,sampleSize:ch.sample_size}), "[]", "{}",
      "channel_profile", ch.batch_id??"latest", "latest", ch.created_at, ch.time_window, ch.source_type,
      ch.quality_flags??"[]", JSON.stringify({fields:["channelEntityId","dataVersion"],hash:eid})
    );
    mockN++;
  }
  db.exec("COMMIT");
} catch(e) { db.exec("ROLLBACK"); throw e; }

const total = db.prepare("SELECT COUNT(*) c FROM channel_entity WHERE workspace_id=?").get(wsId).c;
const latest = db.prepare("SELECT COUNT(*) c FROM channel_entity_latest WHERE workspace_id=?").get(wsId).c;
const byType = db.prepare("SELECT entity_type, COUNT(*) c FROM channel_entity_latest WHERE workspace_id=? GROUP BY entity_type").all(wsId);
console.log(`Sync: ${douyinN} douyin + ${mockN} mock = ${total} rows, ${latest} latest entities`);
for (const r of byType) console.log(`  ${r.entity_type}: ${r.c}`);
db.close();
