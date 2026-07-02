import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "../src/db/connection.js";
import { SCHEMA_DDL } from "../src/db/schema.js";
import { checkSafety } from "../src/lib/safety.js";
import { isValidTagId } from "../src/lib/taxonomy.js";

const DATA_DIR = resolve(import.meta.dirname, "../../../data/demo");

function loadJSONL(filename: string): Record<string, unknown>[] {
  const raw = readFileSync(resolve(DATA_DIR, filename), "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const wsId = "ws_demo";
const db = openDb(wsId);
db.exec(SCHEMA_DDL);
db.prepare("INSERT OR IGNORE INTO workspace (workspace_id, name) VALUES (?, ?)").run(wsId, "Demo Workspace");

// Seed SKUs
const skus = loadJSONL("skus.jsonl");
let skuCount = 0;
for (const s of skus) {
  const safety = checkSafety(s as Record<string, unknown>);
  if (!safety.safe) {
    console.error(`SKU ${s.skuId} failed safety:`, safety.violations);
    continue;
  }
  // Validate tagIds
  const tags = (s.mappedProductTags as Array<{ tagId: string }>) ?? [];
  for (const t of tags) {
    if (!isValidTagId(t.tagId)) {
      console.error(`SKU ${s.skuId} has invalid tagId: ${t.tagId}`);
      continue;
    }
  }

  db.prepare(`
    INSERT OR REPLACE INTO sku (sku_id, workspace_id, spu_id, category_lv1, category_lv2,
      season, title, attributes, assets, mapped_product_tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.skuId, wsId, s.spuId, s.categoryLv1, s.categoryLv2, s.season, s.title,
    JSON.stringify(s.attributes), JSON.stringify(s.assets), JSON.stringify(tags),
    s.createdAt, s.updatedAt
  );
  skuCount++;
}

// Seed Channels
const channels = loadJSONL("channel_profiles.jsonl");
let channelCount = 0;
for (const ch of channels) {
  const safety = checkSafety(ch as Record<string, unknown>);
  if (!safety.safe) {
    console.error(`Channel ${ch.channelId} failed safety:`, safety.violations);
    continue;
  }

  db.prepare(`
    INSERT OR REPLACE INTO channel_profile (channel_id, workspace_id, batch_id, channel_name,
      channel_type, platform_type, time_window, sample_size, source, source_type, tags,
      traffic_index, conversion_index, quality_flags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ch.channelId, wsId, ch.batchId, ch.channelName, ch.channelType, ch.platformType,
    ch.timeWindow, ch.sampleSize, ch.source, ch.sourceType, JSON.stringify(ch.tags),
    ch.trafficIndex, ch.conversionIndex, JSON.stringify(ch.qualityFlags ?? []),
    ch.generatedAt ?? new Date().toISOString(), new Date().toISOString()
  );
  channelCount++;
}

// Seed Batch
db.prepare(`
  INSERT OR REPLACE INTO batch (batch_id, workspace_id, batch_type, source, source_type,
    time_window, row_count, entity_counts, quality_report, created_by)
  VALUES (?, ?, 'dmp_aggregate', 'mock_dmp_aggregate', 'mock', '2026-05-01/2026-06-30', ?, ?, ?, 'user_demo')
`).run(
  "batch_demo_20260702", wsId,
  skus.length * channels.length,
  JSON.stringify({ sku: skus.length, channel: channels.length }),
  JSON.stringify({ profileCoverageRate: 0.92, missingFieldRate: 0.04, unmappedFieldCount: 2, lowConfidenceMappingCount: 3, qualityFlags: [] })
);

// Seed Wide Table
const wideTable = loadJSONL("wide_table.jsonl");
let wideCount = 0;
for (const row of wideTable) {
  db.prepare(`
    INSERT OR REPLACE INTO wide_table_row (sku_id, channel_id, time_window, workspace_id, batch_id, full_row)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.skuId, row.channelId, row.timeWindow, wsId, "batch_demo_20260702", JSON.stringify(row)
  );
  wideCount++;
}

db.close();

console.log(`Seed complete: ${skuCount} SKUs, ${channelCount} channels, ${wideCount} wide table rows`);
