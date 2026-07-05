import {
  buildAnchorFromSamples,
  getAnchorSourceKeys,
  loadSingleProductPortraitSamplePackage,
  MIN_SAMPLES_FOR_CALIBRATION,
  runSmallSampleRuleCalibration,
  type PortraitCalibrationResult,
} from "./single-product-portrait-calibration.js";
import { defaultSingleProductPortraitRuleWeights } from "./single-product-portrait-weights.js";
import { predictSingleProductPortrait } from "./single-product-portrait.js";

const MOCK_PACKAGE_PATH = "../../data/templates/single-product-portrait-sample/sample_package";
const SYNTHETIC_PACKAGE_PATH = "../../data/demo/single-product-portrait-calibration-synthetic-5sample";

interface TestFailure {
  case: string;
  reason: string;
}

function assert(condition: boolean, message: string, failures: TestFailure[], caseName: string) {
  if (!condition) failures.push({ case: caseName, reason: message });
}

function assertInRange(value: number, min: number, max: number, failures: TestFailure[], caseName: string) {
  if (value < min || value > max) {
    failures.push({ case: caseName, reason: `Expected ${value} in [${min}, ${max}]` });
  }
}

function main() {
  const failures: TestFailure[] = [];

  // Case: reader loads mock package structure
  const mockPackage = loadSingleProductPortraitSamplePackage(MOCK_PACKAGE_PATH);
  assert(mockPackage.manifest.packageType === "single-product-portrait-sample", "Unexpected package type", failures, "reader_package_type");
  assert(mockPackage.products.length === 1, `Expected 1 product, got ${mockPackage.products.length}`, failures, "reader_product_count");
  assert(mockPackage.portraitRows.length === 6, `Expected 6 portrait rows, got ${mockPackage.portraitRows.length}`, failures, "reader_portrait_row_count");
  assert(mockPackage.manifest.allowedLabelTypes.length === 6, "Expected 6 allowed label types", failures, "reader_label_type_count");

  // Case: mock package (1 sample) refuses calibration
  const mockResult = runSmallSampleRuleCalibration({ packagePath: MOCK_PACKAGE_PATH });
  assert(mockResult.status === "not_enough_labeled_samples", `Expected not_enough_labeled_samples, got ${mockResult.status}`, failures, "mock_status");
  assert(mockResult.sampleCount === 1, `Expected sampleCount 1, got ${mockResult.sampleCount}`, failures, "mock_sample_count");
  assert(mockResult.validSampleCount < MIN_SAMPLES_FOR_CALIBRATION, "Valid samples should be below threshold", failures, "mock_below_threshold");
  assert(mockResult.aggregateMetrics === undefined, "Metrics must not be generated for insufficient samples", failures, "mock_no_metrics");
  assert(mockResult.notEnoughSamplesReason !== undefined, "Expected reason for insufficient samples", failures, "mock_reason");
  assert(mockResult.riskFlags.includes("baseline_not_trained_model"), "Missing baseline_not_trained_model", failures, "mock_risk_baseline");
  assert(mockResult.riskFlags.includes("manual_rule_weight"), "Missing manual_rule_weight", failures, "mock_risk_manual");
  assert(mockResult.riskFlags.includes("single_anchor_only"), "Missing single_anchor_only", failures, "mock_risk_single_anchor");
  assert(mockResult.riskFlags.includes("mock_sample_only"), "Missing mock_sample_only", failures, "mock_risk_mock");

  // Case: synthetic package (5 samples) runs LOO
  const syntheticPackage = loadSingleProductPortraitSamplePackage(SYNTHETIC_PACKAGE_PATH);
  const syntheticResult = runSmallSampleRuleCalibration({
    packagePath: SYNTHETIC_PACKAGE_PATH,
    weights: defaultSingleProductPortraitRuleWeights(),
    outputTopNPerDimension: 10,
    bridgeToPlsTaxonomy: true,
  });
  assert(syntheticResult.status === "ok", `Expected ok, got ${syntheticResult.status}`, failures, "synthetic_status");
  assert(syntheticResult.sampleCount === 5, `Expected 5 samples, got ${syntheticResult.sampleCount}`, failures, "synthetic_sample_count");
  assert(syntheticResult.validSampleCount === 5, `Expected 5 valid samples, got ${syntheticResult.validSampleCount}`, failures, "synthetic_valid_count");
  assert((syntheticResult.folds?.length ?? 0) === 5, `Expected 5 folds, got ${syntheticResult.folds?.length}`, failures, "synthetic_fold_count");
  assert(syntheticResult.aggregateMetrics !== undefined, "Aggregate metrics missing", failures, "synthetic_aggregate_exists");

  const metrics = syntheticResult.aggregateMetrics!;

  // Case: aggregate metric structure and ranges
  assert(metrics.anchorTopLabelOverlapAtK.k === 3, "Expected overlap @K=3", failures, "synthetic_overlap_k");
  assertInRange(metrics.anchorTopLabelOverlapAtK.mean, 0, 1, failures, "synthetic_overlap_mean_range");
  assert(Object.keys(metrics.anchorTopLabelOverlapAtK.perDimension).length > 0, "No per-dimension overlap", failures, "synthetic_overlap_per_dim");

  assertInRange(metrics.dimensionCoverageRate.mean, 0, 1, failures, "synthetic_coverage_mean_range");
  assert(Object.keys(metrics.dimensionCoverageRate.perSample).length > 0, "No per-sample coverage", failures, "synthetic_coverage_per_sample");

  assertInRange(metrics.closedDimensionMassError.mean, 0, 1, failures, "synthetic_mass_error_range");
  assert(Object.keys(metrics.closedDimensionMassError.perDimension).length > 0, "No per-dimension mass error", failures, "synthetic_mass_error_per_dim");

  assertInRange(metrics.evidenceCoverageRate.mean, 0, 1, failures, "synthetic_evidence_range");
  assert(Object.keys(metrics.evidenceCoverageRate.perSample).length === 5, "Expected 5 per-sample evidence rates", failures, "synthetic_evidence_per_sample");

  assertInRange(metrics.bridgeCoverageRate.mean, 0, 1, failures, "synthetic_bridge_range");
  assert(Object.keys(metrics.bridgeCoverageRate.perSample).length === 5, "Expected 5 per-sample bridge rates", failures, "synthetic_bridge_per_sample");

  // Case: each fold uses a distinct held-out sample and has actual rows
  const heldOutSkus = new Set<string>();
  for (const fold of syntheticResult.folds ?? []) {
    assert(fold.skuId.length > 0, "Empty fold skuId", failures, `fold_${fold.skuId}_skuId`);
    assert(!heldOutSkus.has(fold.skuId), `Duplicate held-out skuId ${fold.skuId}`, failures, `fold_${fold.skuId}_unique`);
    heldOutSkus.add(fold.skuId);
    assert(fold.actualRows.length > 0, `No actual rows for ${fold.skuId}`, failures, `fold_${fold.skuId}_actual_rows`);
    assert(fold.predicted.platformPortraitRows.length > 0, `No predicted rows for ${fold.skuId}`, failures, `fold_${fold.skuId}_predicted_rows`);
    assert(fold.predicted.riskFlags.includes("baseline_not_trained_model"), `Missing baseline risk in ${fold.skuId}`, failures, `fold_${fold.skuId}_risk`);
  }

  // Case: no fold uses itself as anchor (implicit via LOO; here we check predicted anchorSkuId remains the constant)
  for (const fold of syntheticResult.folds ?? []) {
    assert(fold.predicted.anchorSkuId === "10A326100109", "Unexpected anchorSkuId", failures, `fold_${fold.skuId}_anchor`);
  }

  // Case: custom weights produce deterministic result
  const customWeights = defaultSingleProductPortraitRuleWeights();
  customWeights.gender.femalePrior = 0.8;
  const customResult = runSmallSampleRuleCalibration({
    packagePath: SYNTHETIC_PACKAGE_PATH,
    weights: customWeights,
  });
  assert(customResult.status === "ok", "Custom weights should run", failures, "custom_weights_status");
  assert(customResult.aggregateMetrics !== undefined, "Custom weights metrics missing", failures, "custom_weights_metrics");

  // Case: fit->age weights are configurable and affect predictions
  const fitProduct = syntheticPackage.products.find((p) => p.skuId === "synthetic_portrait_002")!;
  const baseWeights = defaultSingleProductPortraitRuleWeights();
  const heavyFitWeights = { ...baseWeights, fitToAgeRules: baseWeights.fitToAgeRules.map((r) => ({ ...r, score: r.score * 5 })) };

  const fitInput = {
    product: {
      skuId: fitProduct.skuId,
      gender: fitProduct.gender,
      brand: fitProduct.brand,
      category: fitProduct.category,
      fitType: fitProduct.fitType,
      fabric: fitProduct.fabric,
      fab: fitProduct.fab,
      memoryPoint: fitProduct.memoryPoint,
      subCategory: fitProduct.subCategory,
    },
    options: { includeLongTailDimensions: false, bridgeToPlsTaxonomy: false, weights: baseWeights },
  };
  const fitInputHeavy = {
    ...fitInput,
    options: { ...fitInput.options, weights: heavyFitWeights },
  };

  const baseAnchor = buildAnchorFromSamples(syntheticPackage.products, syntheticPackage.portraitRows, fitProduct.skuId);
  const basePred = predictSingleProductPortrait(fitInput as never, baseAnchor);
  const heavyPred = predictSingleProductPortrait(fitInputHeavy as never, baseAnchor);

  const baseAgeShare = basePred.platformPortraitRows.find((r) => r.labelType === "预测年龄段" && r.label === "24-30")?.share ?? 0;
  const heavyAgeShare = heavyPred.platformPortraitRows.find((r) => r.labelType === "预测年龄段" && r.label === "24-30")?.share ?? 0;
  assert(heavyAgeShare > baseAgeShare, `Expected heavier fit->age weight to increase 24-30 share, got base=${baseAgeShare} heavy=${heavyAgeShare}`, failures, "fit_age_weight_observable");

  // Case: LOO aggregate anchor excludes the held-out sample
  for (const heldOut of syntheticPackage.products) {
    const sourceKeys = getAnchorSourceKeys(syntheticPackage.products, heldOut.skuId);
    const heldOutKey = `${heldOut.skuId}::${heldOut.sourceProductKey}`;
    assert(!sourceKeys.has(heldOutKey), `Held-out sample ${heldOut.skuId} must not be a source of its LOO anchor`, failures, `loo_excludes_key_${heldOut.skuId}`);

    const anchor = buildAnchorFromSamples(syntheticPackage.products, syntheticPackage.portraitRows, heldOut.skuId);
    const sourceRows = syntheticPackage.portraitRows.filter((r) => sourceKeys.has(`${r.skuId}::${r.sourceProductKey}`));
    assert(sourceRows.length > 0, `LOO anchor for ${heldOut.skuId} must include rows from other samples`, failures, `loo_includes_others_${heldOut.skuId}`);
    assert(anchor.rows.length > 0, `LOO anchor for ${heldOut.skuId} must produce aggregate rows`, failures, `loo_aggregate_rows_${heldOut.skuId}`);
  }

  // Report
  console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
