import {
  parsePortraitCsv,
  parseProductXlsx,
  predictSingleProductPortrait,
  predictSingleProductPortraitFromRow,
  runSingleProductPortrait,
  ANCHOR_SKU_ID,
  SINGLE_PRODUCT_PORTRAIT_MODEL_VERSION,
  type SingleProductPortraitPrediction,
} from "./single-product-portrait.js";

const XLSX_PATH = "/Users/huangbo/Downloads/单款信息表.xlsx";
const CSV_PATH = "/Users/huangbo/Downloads/10A326100109画像数据（单款商品人群画像）.csv";

interface TestFailure {
  case: string;
  reason: string;
}

function assert(condition: boolean, message: string, failures: TestFailure[], caseName: string) {
  if (!condition) failures.push({ case: caseName, reason: message });
}

function hasRiskFlag(prediction: SingleProductPortraitPrediction, flag: string): boolean {
  return prediction.riskFlags.includes(flag as never);
}

function main() {
  const failures: TestFailure[] = [];

  // Case: parser reads 103 products
  const products = parseProductXlsx(XLSX_PATH);
  assert(products.length === 103, `Expected 103 products, got ${products.length}`, failures, "xlsx_parser_count");

  // Case: parser preserves original field names by mapping
  const firstProduct = products[0];
  assert(!!firstProduct?.skuId, "First product missing skuId", failures, "xlsx_parser_skuId");
  assert(!!firstProduct?.gender, "First product missing gender", failures, "xlsx_parser_gender");
  assert(!!firstProduct?.category, "First product missing category", failures, "xlsx_parser_category");

  // Case: csv parser reports exactly 1 anomaly with 6 fields
  const anchor = parsePortraitCsv(CSV_PATH);
  assert(anchor.anomalyRows.length === 1, `Expected 1 CSV anomaly, got ${anchor.anomalyRows.length}`, failures, "csv_anomaly_count");
  const anomaly = anchor.anomalyRows[0];
  assert(anomaly?.fieldCount === 6, `Expected anomaly fieldCount 6, got ${anomaly?.fieldCount}`, failures, "csv_anomaly_fields");
  assert(anomaly?.raw.includes("防晒护具"), "Anomaly row should contain the malformed label", failures, "csv_anomaly_content");
  assert(anchor.dimensions.length === 25, `Expected 25 dimensions, got ${anchor.dimensions.length}`, failures, "csv_dimension_count");

  // Case: single product prediction contains required risk flags
  const product = products[0]!;
  const prediction = predictSingleProductPortraitFromRow(product, anchor, {
    outputTopNPerDimension: 5,
    includeLongTailDimensions: true,
    bridgeToPlsTaxonomy: true,
  });
  assert(prediction.skuId === product.skuId, `skuId mismatch: ${prediction.skuId} vs ${product.skuId}`, failures, "single_skuId");
  assert(prediction.modelVersion === SINGLE_PRODUCT_PORTRAIT_MODEL_VERSION, "modelVersion mismatch", failures, "single_modelVersion");
  assert(hasRiskFlag(prediction, "baseline_not_trained_model"), "Missing baseline_not_trained_model", failures, "single_risk_baseline");
  assert(hasRiskFlag(prediction, "single_anchor_only"), "Missing single_anchor_only", failures, "single_risk_single_anchor");
  assert(hasRiskFlag(prediction, "manual_rule_weight"), "Missing manual_rule_weight", failures, "single_risk_manual_weight");
  assert(hasRiskFlag(prediction, "csv_source_row_anomaly"), "Missing csv_source_row_anomaly", failures, "single_risk_csv_anomaly");
  assert(hasRiskFlag(prediction, "platform_label_unmapped"), "Missing platform_label_unmapped", failures, "single_risk_unmapped");
  assert(prediction.platformPortraitRows.length > 0, "No platformPortraitRows generated", failures, "single_rows_non_empty");
  assert(prediction.dimensionSummaries.length > 0, "No dimensionSummaries generated", failures, "single_summaries_non_empty");
  assert(prediction.explanationSources.length > 0, "No explanationSources generated", failures, "single_evidence_non_empty");

  // Case: all platform rows preserve original labelType and label
  for (const row of prediction.platformPortraitRows) {
    assert(row.source === "single_product_portrait_rule_baseline", "Row source mismatch", failures, "single_row_source");
    assert(row.labelType.length > 0, "Empty labelType", failures, "single_row_labelType");
    assert(row.label.length > 0, "Empty label", failures, "single_row_label");
    assert(row.confidence >= 0 && row.confidence <= 1, "Confidence out of range", failures, "single_row_confidence");
  }

  // Case: closed dimensions sum to approximately 1
  const closedDimensions = ["预测性别", "预测年龄段", "预测消费能力", "城市等级", "预测人生阶段", "八大消费群体"];
  for (const dim of closedDimensions) {
    const rows = prediction.platformPortraitRows.filter((r) => r.labelType === dim);
    const total = rows.reduce((sum, r) => sum + (r.share ?? 0), 0);
    assert(Math.abs(total - 1) < 0.05 || rows.length === 0, `Closed dimension ${dim} sums to ${total}`, failures, `single_closed_dim_${dim}`);
  }

  // Case: PLS bridge exists and reports coverage
  assert(prediction.plsBridge !== undefined, "PLS bridge missing", failures, "single_pls_bridge_exists");
  assert((prediction.plsBridge?.bridgeCoverageRate ?? 0) >= 0, "Bridge coverage negative", failures, "single_pls_bridge_coverage");
  assert((prediction.plsBridge?.predictedProfileTags.length ?? 0) > 0, "No PLS bridge tags", failures, "single_pls_bridge_tags");
  for (const tag of prediction.plsBridge?.predictedProfileTags ?? []) {
    assert(tag.tagId.includes("."), `PLS tagId malformed: ${tag.tagId}`, failures, "single_pls_tagId");
  }

  // Case: evidence traceability
  const evidenceWithFields = prediction.explanationSources.filter((e) => e.sourceField && e.sourceValue && e.ruleId);
  assert(evidenceWithFields.length > 0, "No evidence with sourceField/sourceValue/ruleId", failures, "single_evidence_traceable");

  // Case: 5 different category products show differentiation
  const targetSkus = ["101124105002", "101524100201", "103124120002", "101524108206", "101524106001"];
  const predictions = targetSkus
    .map((skuId) => products.find((p) => p.skuId === skuId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map((p) => predictSingleProductPortraitFromRow(p, anchor));
  assert(predictions.length >= 5, `Expected 5 predictions, got ${predictions.length}`, failures, "batch_count");

  const categories = new Set(predictions.map((p, i) => {
    const product = products.find((x) => x.skuId === p.skuId);
    return product?.category;
  }));
  assert(categories.size >= 3, `Expected >=3 distinct categories, got ${categories.size}`, failures, "batch_category_diversity");

  const femaleShares = predictions.map((p) => {
    const row = p.platformPortraitRows.find((r) => r.labelType === "预测性别" && r.label === "女");
    return row?.share ?? 0;
  });
  assert(Math.max(...femaleShares) - Math.min(...femaleShares) > 0.1, "Gender shares should differ across products", failures, "batch_gender_differentiation");

  // Case: repeat stability
  const p1 = predictSingleProductPortraitFromRow(product, anchor);
  const p2 = predictSingleProductPortraitFromRow(product, anchor);
  assert(JSON.stringify(p1.platformPortraitRows) === JSON.stringify(p2.platformPortraitRows), "Predictions not stable across runs", failures, "repeat_stability");

  // Case: insufficient input handling
  const insufficientPrediction = predictSingleProductPortrait(
    {
      product: { skuId: "test-sku", gender: "", category: "", brand: "" },
      options: { bridgeToPlsTaxonomy: true },
    },
    anchor,
  );
  assert(insufficientPrediction.inputCoverage.requiredFieldCoverage < 1, "Expected low required field coverage", failures, "insufficient_coverage");
  assert(hasRiskFlag(insufficientPrediction, "low_input_coverage"), "Missing low_input_coverage", failures, "insufficient_risk");

  // Case: anchor backtest status
  const runResult = runSingleProductPortrait({ xlsxPath: XLSX_PATH, csvPath: CSV_PATH });
  assert(runResult.anchorStatus === "missing", `Expected anchor missing, got ${runResult.anchorStatus}`, failures, "anchor_missing_status");
  assert(runResult.anchorMissingRisk === "anchor_product_attributes_missing", "Missing anchor_product_attributes_missing", failures, "anchor_missing_risk");
  assert(runResult.predictions.length === 103, `Expected 103 batch predictions, got ${runResult.predictions.length}`, failures, "batch_all_count");

  // Case: top labels evidence
  for (const pred of predictions) {
    const topRows = pred.platformPortraitRows.filter((r) => r.evidence.length > 0);
    assert(topRows.length > 0, `No evidence rows for ${pred.skuId}`, failures, `evidence_${pred.skuId}`);
  }

  // Report
  console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
