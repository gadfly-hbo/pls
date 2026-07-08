import {
  buildSingleProductPortraitModelMetadata,
  evaluateSupervisedModel,
  loadSupervisedTrainingData,
  predictSingleProductPortraitFromCleanInput,
  SingleProductPortraitModelUnavailableError,
  SUPERVISED_PORTRAIT_MODEL_VERSION,
  SUPERVISED_TARGET_DIMENSIONS,
  trainSupervisedPortraitModel,
  predictSupervisedPortrait,
} from "./single-product-portrait-supervised.js";

const Q2_PACKAGE_PATH = "../../data/local/single-product-portrait-q2-73sample";

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

  // Case: load Q2 training data
  const { samples, targetsByDimension } = loadSupervisedTrainingData(Q2_PACKAGE_PATH);
  assert(samples.length === 73, `Expected 73 samples, got ${samples.length}`, failures, "load_sample_count");
  assert(samples.every((s) => s.fitType && s.fabric && s.fab), "Some samples missing fitType/fabric/fab", failures, "load_required_fields");

  // Case: target dimensions present
  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    assert(targetsByDimension.has(dim), `Missing target dimension ${dim}`, failures, `target_dim_${dim}`);
  }

  // Case: train model
  const model = trainSupervisedPortraitModel({ samples, targetsByDimension, alpha: 1.0 });
  assert(model.sampleCount === 73, `Expected sampleCount 73, got ${model.sampleCount}`, failures, "model_sample_count");
  assert(model.fitTypes.length > 0, "Expected fitTypes in trained model", failures, "model_fitTypes");
  assert(model.dimensionModels.length === SUPERVISED_TARGET_DIMENSIONS.length, "Unexpected dimension count", failures, "model_dimension_count");
  for (const dimModel of model.dimensionModels) {
    assert(dimModel.labels.length > 0, `No labels for ${dimModel.labelType}`, failures, `model_labels_${dimModel.labelType}`);
    assert(dimModel.featureNames.length > 0, `No features for ${dimModel.labelType}`, failures, `model_features_${dimModel.labelType}`);
    assert(dimModel.weights.length === dimModel.labels.length, "Weights/labels mismatch", failures, `model_weights_${dimModel.labelType}`);
  }

  // Case: predict new product
  const prediction = predictSupervisedPortrait({
    input: { skuId: "test_new", fitType: "修身型", fabric: "全棉", fab: "修身显瘦通勤T恤" },
    model,
    outputTopNPerDimension: 3,
  });
  assert(prediction.skuId === "test_new", "skuId mismatch", failures, "predict_skuId");
  assert(prediction.modelVersion === SUPERVISED_PORTRAIT_MODEL_VERSION, "modelVersion mismatch", failures, "predict_modelVersion");
  assert(prediction.modelPath === "supervised_ridge", "Unexpected modelPath", failures, "predict_modelPath");
  assert(prediction.riskFlags.includes("baseline_not_trained_model"), "Missing baseline_not_trained_model", failures, "predict_risk_baseline");
  assert(prediction.riskFlags.includes("small_sample_supervised_model"), "Missing small_sample_supervised_model", failures, "predict_risk_small");
  assert(prediction.riskFlags.includes("no_temporal_validation"), "Missing no_temporal_validation", failures, "predict_risk_temporal");

  const predictedDimensions = new Set(prediction.platformPortraitRows.map((r) => r.labelType));
  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    assert(predictedDimensions.has(dim), `Missing predicted dimension ${dim}`, failures, `predict_dim_${dim}`);
  }
  assert(prediction.dimensionSummaries.length === SUPERVISED_TARGET_DIMENSIONS.length, "Unexpected dimension summary count", failures, "predict_summary_count");
  for (const summary of prediction.dimensionSummaries) {
    assert(summary.topLabels.length > 0, `Missing top labels for ${summary.labelType}`, failures, `predict_top_labels_${summary.labelType}`);
  }

  // Case: closed dimensions approximately sum to 1
  const closedDims = new Set(["预测性别", "预测年龄段", "预测消费能力", "城市等级", "八大消费群体", "预测人生阶段"]);
  for (const dim of closedDims) {
    const rows = prediction.platformPortraitRows.filter((r) => r.labelType === dim);
    const total = rows.reduce((sum, r) => sum + (r.share ?? 0), 0);
    assert(Math.abs(total - 1) < 0.05 || rows.length === 0, `Closed dimension ${dim} sums to ${total}`, failures, `predict_closed_${dim}`);
  }

  // Case: evidence traceability
  assert(prediction.explanationSources.length > 0, "No explanation sources", failures, "predict_evidence");
  for (const ev of prediction.explanationSources) {
    assert(Boolean(ev.sourceField && ev.ruleId && ev.targetLabelType), "Malformed evidence", failures, "predict_evidence_fields");
  }

  // Case: server metadata import contract
  const metadata = buildSingleProductPortraitModelMetadata({ model });
  assert(metadata.modelAvailable === true, "Expected metadata modelAvailable true", failures, "metadata_available");
  if (metadata.modelAvailable) {
    assert(metadata.modelVersion === SUPERVISED_PORTRAIT_MODEL_VERSION, "metadata modelVersion mismatch", failures, "metadata_modelVersion");
    assert(metadata.fitTypes.length === model.fitTypes.length, "metadata fitTypes mismatch", failures, "metadata_fitTypes");
    assert(metadata.requiredColumns.join(",") === "款号,版型,面料,FAB", "metadata requiredColumns mismatch", failures, "metadata_requiredColumns");
    assert(metadata.maxBatchRows === 100, "metadata maxBatchRows mismatch", failures, "metadata_maxBatchRows");
    assert(metadata.maxFileBytes === 2097152, "metadata maxFileBytes mismatch", failures, "metadata_maxFileBytes");
    assert(metadata.sampleCount === 73, "metadata sampleCount mismatch", failures, "metadata_sampleCount");
    assert(metadata.riskFlags.includes("small_sample_supervised_model"), "metadata missing risk flag", failures, "metadata_riskFlags");
    assert(metadata.metricsSummary.length === SUPERVISED_TARGET_DIMENSIONS.length, "metadata metricsSummary mismatch", failures, "metadata_metricsSummary");
  }

  // Case: server clean-input prediction contract
  const servicePrediction = predictSingleProductPortraitFromCleanInput(
    { skuId: "service_new", fitType: "修身型", fabric: "全棉", fab: "修身显瘦通勤T恤" },
    { model },
  );
  assert(servicePrediction.skuId === "service_new", "service prediction skuId mismatch", failures, "service_predict_skuId");
  assert(servicePrediction.platformPortraitRows.length > 0, "service prediction has no rows", failures, "service_predict_rows");
  assert(
    new Set(servicePrediction.platformPortraitRows.map((row) => row.labelType)).size === SUPERVISED_TARGET_DIMENSIONS.length,
    "service prediction missing dimensions",
    failures,
    "service_predict_dimensions",
  );

  // Case: missing model path boundary for A-domain model_not_available mapping
  const missingMetadata = buildSingleProductPortraitModelMetadata({ modelPath: "/tmp/pls-missing-supervised-model.json" });
  assert(missingMetadata.modelAvailable === false, "Expected missing metadata unavailable", failures, "metadata_missing_unavailable");
  if (!missingMetadata.modelAvailable) {
    assert(missingMetadata.error.code === "model_not_available", "metadata missing error code mismatch", failures, "metadata_missing_error_code");
  }
  try {
    predictSingleProductPortraitFromCleanInput(
      { skuId: "missing_model", fitType: "修身型", fabric: "全棉", fab: "修身显瘦通勤T恤" },
      { modelPath: "/tmp/pls-missing-supervised-model.json" },
    );
    assert(false, "Expected missing model prediction to throw", failures, "service_predict_missing_model");
  } catch (error) {
    assert(
      error instanceof SingleProductPortraitModelUnavailableError && error.code === "model_not_available",
      "Missing model prediction did not throw model_not_available",
      failures,
      "service_predict_missing_model",
    );
  }

  // Case: LOO evaluation
  const evalResult = evaluateSupervisedModel({ packagePath: Q2_PACKAGE_PATH, alpha: 1.0 });
  assert(evalResult.status === "ok", `Expected ok, got ${evalResult.status}`, failures, "eval_status");
  assert(evalResult.folds.length === 73, `Expected 73 folds, got ${evalResult.folds.length}`, failures, "eval_fold_count");
  assertInRange(evalResult.aggregateMetrics.top1OverlapMean, 0, 1, failures, "eval_top1_range");
  assertInRange(evalResult.aggregateMetrics.top3OverlapMean, 0, 1, failures, "eval_top3_range");
  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    const dimMetrics = evalResult.aggregateMetrics.perDimension[dim];
    assert(dimMetrics !== undefined, `Missing eval metrics for ${dim}`, failures, `eval_perdim_${dim}`);
    assertInRange(dimMetrics.top1Overlap, 0, 1, failures, `eval_top1_${dim}`);
    assertInRange(dimMetrics.top3Overlap, 0, 1, failures, `eval_top3_${dim}`);
  }

  // Case: no fold uses held-out as training (implicit via LOO construction; here we verify folds exist)
  const heldOutSkus = new Set<string>();
  for (const fold of evalResult.folds) {
    assert(!heldOutSkus.has(fold.skuId), `Duplicate held-out ${fold.skuId}`, failures, `eval_unique_${fold.skuId}`);
    heldOutSkus.add(fold.skuId);
    assert(fold.actualRows.length > 0, `No actual rows for ${fold.skuId}`, failures, `eval_actual_${fold.skuId}`);
    assert(fold.predictedRows.length > 0, `No predicted rows for ${fold.skuId}`, failures, `eval_predicted_${fold.skuId}`);
  }

  // Report
  console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
