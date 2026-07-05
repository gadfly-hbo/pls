import { parsePortraitCsv, parseProductXlsx, predictSingleProductPortraitFromRow, ANCHOR_SKU_ID } from "./single-product-portrait.js";

const XLSX_PATH = "/Users/huangbo/Downloads/单款信息表.xlsx";
const CSV_PATH = "/Users/huangbo/Downloads/10A326100109画像数据（单款商品人群画像）.csv";

function fmtPct(value: number | null): string {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function main() {
  console.log("=== Single Product Portrait Smoke ===\n");

  const products = parseProductXlsx(XLSX_PATH);
  console.log(`Parsed ${products.length} products from ${XLSX_PATH}`);

  const anchor = parsePortraitCsv(CSV_PATH);
  console.log(`Parsed ${anchor.rows.length} portrait rows across ${anchor.dimensions.length} dimensions`);
  console.log(`CSV anomalies: ${anchor.anomalyRows.length}`);
  for (const anomaly of anchor.anomalyRows) {
    console.log(`  row ${anomaly.rowIndex}: ${anomaly.fieldCount} fields -> ${anomaly.raw}`);
  }

  // Pick 5 diverse products
  const targetSkus = ["101124105002", "101524100201", "103124120002", "101524108206", "101524106001"];
  const selected = products.filter((p) => targetSkus.includes(p.skuId));
  console.log(`\nSelected ${selected.length} products for portrait generation`);

  for (const product of selected) {
    const prediction = predictSingleProductPortraitFromRow(product, anchor, {
      outputTopNPerDimension: 5,
      includeLongTailDimensions: true,
      bridgeToPlsTaxonomy: true,
    });
    console.log(`\n--- ${prediction.skuId} ---`);
    console.log(`Gender: ${product.gender}, Category: ${product.category}, Fit: ${product.fitType}, Fabric: ${product.fabric}`);
    console.log(`Risk flags: ${prediction.riskFlags.join(", ")}`);
    console.log(`Input coverage: required=${prediction.inputCoverage.requiredFieldCoverage}, optional=${prediction.inputCoverage.optionalSignalCoverage}`);
    console.log("Dimension summaries:");
    for (const dim of prediction.dimensionSummaries.slice(0, 8)) {
      const top = dim.topLabels.map((l) => `${l.label}(${fmtPct(l.share)})`).join(", ");
      console.log(`  ${dim.labelType}: ${top}`);
    }
    if (prediction.plsBridge) {
      console.log(`PLS bridge tags: ${prediction.plsBridge.predictedProfileTags.map((t) => t.tagId).join(", ")}`);
      console.log(`PLS bridge coverage: ${(prediction.plsBridge.bridgeCoverageRate * 100).toFixed(1)}%`);
    }
  }

  // Anchor backtest
  const anchorProduct = products.find((p) => p.skuId === ANCHOR_SKU_ID);
  if (anchorProduct) {
    const anchorPrediction = predictSingleProductPortraitFromRow(anchorProduct, anchor, {
      outputTopNPerDimension: 3,
      includeLongTailDimensions: true,
      bridgeToPlsTaxonomy: false,
    });
    console.log(`\n=== Anchor Backtest: ${ANCHOR_SKU_ID} ===`);
    console.log("Predicted top labels:");
    for (const dim of anchorPrediction.dimensionSummaries.slice(0, 8)) {
      console.log(`  ${dim.labelType}: ${dim.topLabels[0]?.label} (${fmtPct(dim.topLabels[0]?.share)})`);
    }
  } else {
    console.log(`\n=== Anchor product ${ANCHOR_SKU_ID} attributes missing ===`);
  }

  console.log("\n=== Smoke complete ===");
}

main();
