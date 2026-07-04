#!/usr/bin/env node
// A-P2-1: Seed the data_source registry with the known PLS data sources.
// Idempotent: re-runs only insert missing rows (INSERT OR IGNORE).
//
// Sources:
//   - douyin_bi        (active, adapter=douyin_bi, schema_prefix=douyin_)
//   - product_master   (stub, pending D-P2-2 schema)
//   - channel_profile  (stub, pending A-P2-3 projection strategy)
//   - action_feedback  (stub, pending A-P2-10 closed-loop design)

import { DatabaseSync } from "node:sqlite";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const workspaceId = process.env.PLS_WORKSPACE ?? "ws_demo";
const dbPath = join(repoRoot, "data/workspaces", workspaceId, "db.sqlite");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");

const SOURCES = [
  {
    sourceId: "douyin_bi",
    sourceKind: "douyin_bi",
    displayName: "抖音 BI 数据资产",
    adapter: "douyin_bi",
    schemaPrefix: "douyin_",
    status: "active",
    description: "D-P1-F1 assetized dashboard snapshot. Backed by douyin_* tables; imported via scripts/import-douyin-bi.mjs.",
    config: JSON.stringify({
      primaryTable: "douyin_account",
      importScript: "scripts/import-douyin-bi.mjs",
      qualityReportFile: "quality_report.json",
    }),
  },
  {
    sourceId: "product_master",
    sourceKind: "product_master",
    displayName: "商品主数据",
    adapter: "product_master",
    schemaPrefix: null,
    status: "stub",
    description: "Reserved for D-P2-2 product master schema. No backing tables yet.",
    config: JSON.stringify({ dependsOn: "D-P2-2" }),
  },
  {
    sourceId: "channel_profile",
    sourceKind: "channel_profile",
    displayName: "渠道画像",
    adapter: "channel_profile",
    schemaPrefix: null,
    status: "active",
    description: "A-P2-3: Channel entity projection from douyin_account + channel_profile. Synced via sync:channel-entities.",
    config: JSON.stringify({ projectionTable: "channel_entity", syncScript: "scripts/sync-channel-entities.mjs" }),
  },
  {
    sourceId: "action_feedback",
    sourceKind: "action_feedback",
    displayName: "行动反馈数据",
    adapter: "action_feedback",
    schemaPrefix: null,
    status: "stub",
    description: "Reserved for A-P2-10 operation flywheel closed loop. No backing tables yet.",
    config: JSON.stringify({ dependsOn: "A-P2-10" }),
  },
  {
    sourceId: "profile_extract",
    sourceKind: "profile_extract",
    displayName: "画像提取工具输出",
    adapter: "profile_extract",
    schemaPrefix: null,
    status: "active",
    description: "A-P4-TOOLS-4: profile-extract tool packages imported via /tools/runs/:runId/import.",
    config: JSON.stringify({ importType: "profile-extract", targetTable: "channel_profile" }),
  },
  {
    sourceId: "business_aggregate",
    sourceKind: "business_aggregate",
    displayName: "业务明细聚合工具输出",
    adapter: "business_aggregate",
    schemaPrefix: null,
    status: "active",
    description: "A-P4-TOOLS-4: business-aggregate tool packages imported via /tools/runs/:runId/import.",
    config: JSON.stringify({ importType: "business-aggregate", targetTables: ["sku", "channel_profile", "wide_table_row"] }),
  },
];

const stmt = db.prepare(`INSERT OR REPLACE INTO data_source
  (source_id, workspace_id, source_kind, display_name, adapter, schema_prefix, status, description, config, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);

db.exec("BEGIN");
try {
  for (const s of SOURCES) {
    stmt.run(
      s.sourceId,
      workspaceId,
      s.sourceKind,
      s.displayName,
      s.adapter,
      s.schemaPrefix,
      s.status,
      s.description,
      s.config
    );
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

const rows = db.prepare("SELECT source_id, source_kind, status FROM data_source WHERE workspace_id = ?").all(workspaceId);
console.log(`Seeded ${rows.length} data sources in ${workspaceId}:`);
for (const r of rows) console.log(`  ${r.source_id}  kind=${r.source_kind}  status=${r.status}`);
db.close();
