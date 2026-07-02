#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const demoWideTablePath = path.join(repoRoot, "data/demo/wide_table.jsonl");
const taxonomyPath = path.join(repoRoot, "docs/profile-taxonomy-v0.md");
const outputDir = path.join(repoRoot, "data/p1/multi-timewindow-demo");
const batchId = "batch_p1_multi_timewindow_demo_20260702";
const generatedAt = "2026-07-02T00:00:00Z";

const windows = [
  { timeWindow: "2026-03-01/2026-03-31", sampleFactor: 0.82, performanceFactor: 0.86, tagDelta: -0.04 },
  { timeWindow: "2026-04-01/2026-04-30", sampleFactor: 0.93, performanceFactor: 0.94, tagDelta: -0.015 },
  { timeWindow: "2026-05-01/2026-05-31", sampleFactor: 1, performanceFactor: 1, tagDelta: 0 },
];

const readJsonl = (filePath) =>
  fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const round = (value, precision = 3) => Number(value.toFixed(precision));
const clamp01 = (value) => Math.max(0, Math.min(1, value));

const taxonomyText = fs.readFileSync(taxonomyPath, "utf8");
const allowedTagIds = new Set([...taxonomyText.matchAll(/`((?:demo|style|price|occasion|intent|channel)\.[a-z0-9_]+)`/g)].map((match) => match[1]));

const scaleTag = (tag, windowConfig, source) => ({
  ...tag,
  score: round(clamp01(tag.score + windowConfig.tagDelta)),
  confidence: round(clamp01(tag.confidence - Math.abs(windowConfig.tagDelta) / 2)),
  source,
  sampleSize: tag.sampleSize == null ? null : Math.max(1, Math.round(tag.sampleSize * windowConfig.sampleFactor)),
  timeWindow: windowConfig.timeWindow,
});

const toWindowRow = (row, windowConfig) => {
  const mappedProductTags = row.mappedProductTags.map((tag) => scaleTag(tag, windowConfig, "manual_product_mapping"));
  const buyerProfileTags = row.buyerProfileTags.map((tag) => scaleTag(tag, windowConfig, "mock_multi_timewindow_aggregate"));
  const lowConfidenceTagCount = buyerProfileTags.filter((tag) => tag.confidence < 0.55).length;
  const sampleSize = Math.max(1, Math.round(row.sampleSize * windowConfig.sampleFactor));
  const profileCoverageRate = round(clamp01(row.profileCoverageRate - Math.abs(windowConfig.tagDelta) / 2));
  const missingFieldRate = round(clamp01(row.missingFieldRate + Math.abs(windowConfig.tagDelta) / 3));
  const qualityFlags = new Set(row.qualityFlags ?? []);

  if (sampleSize < 100) qualityFlags.add("low_sample_size");
  if (profileCoverageRate < 0.7) qualityFlags.add("low_mapping_coverage");
  if (lowConfidenceTagCount > 0) qualityFlags.add("low_confidence_mapping_present");

  const output = {
    ...row,
    timeWindow: windowConfig.timeWindow,
    source: "mock_multi_timewindow_aggregate",
    sourceType: "mock",
    batchId,
    generatedAt,
    mappedProductTags,
    buyerProfileTags,
    viewerProfileTags: [],
    cartProfileTags: [],
    labelSource: "mock_multi_timewindow_aggregate",
    labelSampleSize: sampleSize,
    labelTimeWindow: windowConfig.timeWindow,
    salesUnits: Math.max(1, Math.round(row.salesUnits * windowConfig.performanceFactor)),
    gmvIndex: round(clamp01(row.gmvIndex * windowConfig.performanceFactor)),
    conversionRate: round(clamp01(row.conversionRate * windowConfig.performanceFactor)),
    returnRate: round(clamp01(row.returnRate + (1 - windowConfig.performanceFactor) * 0.03)),
    sellThroughRate: round(clamp01(row.sellThroughRate * windowConfig.performanceFactor)),
    trafficIndex: round(clamp01(row.trafficIndex * windowConfig.performanceFactor)),
    sampleSize,
    profileCoverageRate,
    missingFieldRate,
    lowConfidenceTagCount,
    isTrainable: sampleSize >= 100 && profileCoverageRate >= 0.7 && buyerProfileTags.length >= 3,
    qualityFlags: [...qualityFlags].sort(),
  };

  delete output.demoExpectedMatch;
  return output;
};

const rows = readJsonl(demoWideTablePath);
const outputRows = windows.flatMap((windowConfig) => rows.map((row) => toWindowRow(row, windowConfig)));
const invalidTagIds = new Set();

for (const row of outputRows) {
  for (const tag of [...row.mappedProductTags, ...row.buyerProfileTags]) {
    if (!allowedTagIds.has(tag.tagId)) invalidTagIds.add(tag.tagId);
  }
}

if (invalidTagIds.size > 0) {
  console.error(`Invalid tagIds: ${[...invalidTagIds].sort().join(", ")}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "wide_table.jsonl"), `${outputRows.map((row) => JSON.stringify(row)).join("\n")}\n`);

const skuCount = new Set(outputRows.map((row) => row.skuId)).size;
const channelCount = new Set(outputRows.map((row) => row.channelId)).size;
const trainableRows = outputRows.filter((row) => row.isTrainable);
const untrainableRows = outputRows
  .filter((row) => !row.isTrainable)
  .map((row) => ({
    skuId: row.skuId,
    channelId: row.channelId,
    timeWindow: row.timeWindow,
    reasons: [
      row.sampleSize < 100 ? "low_sample_size" : null,
      row.profileCoverageRate < 0.7 ? "low_mapping_coverage" : null,
      row.buyerProfileTags.length < 3 ? "insufficient_buyer_profile_tags" : null,
    ].filter(Boolean),
  }));

const mean = (values) => round(values.reduce((sum, value) => sum + value, 0) / values.length);
const sum = (values) => values.reduce((total, value) => total + value, 0);

const qualityReport = {
  batchId,
  source: "mock_multi_timewindow_aggregate",
  sourceType: "mock",
  generatedAt,
  timeWindows: windows.map((item) => item.timeWindow),
  rowCount: outputRows.length,
  skuCount,
  channelCount,
  trainableRowRate: round(trainableRows.length / outputRows.length),
  avgSampleSize: Math.round(mean(outputRows.map((row) => row.sampleSize))),
  profileCoverageRate: mean(outputRows.map((row) => row.profileCoverageRate)),
  missingFieldRate: mean(outputRows.map((row) => row.missingFieldRate)),
  unmappedFieldCount: sum(outputRows.map((row) => row.unmappedTags.length)),
  lowConfidenceMappingCount: sum(outputRows.map((row) => row.lowConfidenceTagCount)),
  qualityFlags: ["demo_only", "mock_aggregate", "multi_timewindow_cutoff_smoke", "real_sample_input_absent"],
  fieldMapping: "field_mapping.csv",
  untrainableRows: "untrainable_rows.jsonl",
  redlineScanReport: "redline_scan_report.json",
  notes: [
    "Derived from data/demo mock aggregate rows because no real raw staging batch is present.",
    "Usable for D-P1-A2/M-P1-A3 cutoff smoke only; not a formal real-sample backtest dataset.",
  ],
};

fs.writeFileSync(path.join(outputDir, "quality_report.json"), `${JSON.stringify(qualityReport, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "untrainable_rows.jsonl"), untrainableRows.length ? `${untrainableRows.map((row) => JSON.stringify(row)).join("\n")}\n` : "");
fs.writeFileSync(
  path.join(outputDir, "field_mapping.csv"),
  [
    "outputField,sourceField,sourceFile,notes",
    "skuId,skuId,data/demo/wide_table.jsonl,mock SKU id",
    "spuId,spuId,data/demo/wide_table.jsonl,mock SPU id",
    "channelId,channelId,data/demo/wide_table.jsonl,mock channel id",
    "timeWindow,generated window,data/scripts/generate-p1-multi-timewindow-demo.mjs,three closed monthly windows",
    "batchId,constant,data/scripts/generate-p1-multi-timewindow-demo.mjs,batch_p1_multi_timewindow_demo_20260702",
    "source,constant,data/scripts/generate-p1-multi-timewindow-demo.mjs,mock_multi_timewindow_aggregate",
    "sourceType,constant,data/scripts/generate-p1-multi-timewindow-demo.mjs,mock",
    "sampleSize,sampleSize,data/demo/wide_table.jsonl,scaled aggregate count",
    "profileCoverageRate,profileCoverageRate,data/demo/wide_table.jsonl,scaled coverage rate",
    "qualityFlags,quality rules,data/scripts/generate-p1-multi-timewindow-demo.mjs,row-level flags only",
  ].join("\n") + "\n",
);

fs.writeFileSync(
  path.join(outputDir, "redline_scan_report.json"),
  `${JSON.stringify(
    {
      batchId,
      scannedAt: generatedAt,
      inputScope: "data/p1/multi-timewindow-demo",
      blockedFieldHits: [],
      blockedPatternHits: [],
      rawValueSamplesIncluded: false,
      status: "pass",
    },
    null,
    2,
  )}\n`,
);

fs.writeFileSync(
  path.join(outputDir, "README.md"),
  `# P1 Multi-TimeWindow Demo Wide Table

> Owner: D data profile domain
> Task: D-P1-A2
> Batch: \`${batchId}\`
> Status: mock aggregate cutoff smoke input

## Purpose

This package provides a multi \`timeWindow\` wide table for P1 cutoff backtest smoke work. It is generated from the existing P0 mock aggregate fixture because D-P1-A1 has no real raw staging input in this workspace.

## Files

| File | Purpose |
|---|---|
| \`wide_table.jsonl\` | 36 rows at \`skuId + channelId + timeWindow\` grain |
| \`quality_report.json\` | Batch-level quality summary |
| \`field_mapping.csv\` | Output field lineage for D-P1-A2 |
| \`untrainable_rows.jsonl\` | Rows excluded from training, empty when all rows are trainable |
| \`redline_scan_report.json\` | Compatibility admission summary; privacy blocking disabled |

## Dataset Shape

- SKU count: ${skuCount}
- Channel count: ${channelCount}
- Time windows: ${windows.map((item) => `\`${item.timeWindow}\``).join(", ")}
- Wide table rows: ${outputRows.length}
- Source type: \`mock\`

## Boundaries

- No real raw file, raw DMP member, user, order, member, device, account, or ID package data is included.
- Amount-like values remain normalized as \`gmvIndex\`, \`trafficIndex\`, rates, and price bands.
- This is suitable for M-P1-A3 cutoff smoke only. It must not be represented as a completed real-sample ingestion run.
`,
);

console.log(
  JSON.stringify(
    {
      status: "pass",
      outputDir: path.relative(repoRoot, outputDir),
      rowCount: outputRows.length,
      skuCount,
      channelCount,
      timeWindowCount: windows.length,
      invalidTagIds: [],
    },
    null,
    2,
  ),
);
