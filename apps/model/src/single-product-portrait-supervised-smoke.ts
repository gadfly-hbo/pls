import {
  evaluateSupervisedModel,
  loadSupervisedTrainingData,
  trainSupervisedPortraitModel,
  predictSupervisedPortrait,
} from "./single-product-portrait-supervised.js";

const Q2_PACKAGE_PATH = "../../data/local/single-product-portrait-q2-73sample";

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function main() {
  console.log("=== Single Product Portrait Supervised Smoke ===\n");

  const { samples, targetsByDimension } = loadSupervisedTrainingData(Q2_PACKAGE_PATH);
  console.log(`Loaded ${samples.length} training samples from ${Q2_PACKAGE_PATH}`);
  console.log(`Target dimensions: ${[...targetsByDimension.keys()].join(", ")}`);

  const model = trainSupervisedPortraitModel({ samples, targetsByDimension, alpha: 1.0 });
  console.log(`\nTrained model: ${model.version}`);
  console.log(`Features: ${model.dimensionModels[0]?.featureNames.length ?? 0}`);
  for (const dim of model.dimensionModels) {
    console.log(`  ${dim.labelType}: ${dim.labels.length} labels`);
  }

  const evalResult = evaluateSupervisedModel({ packagePath: Q2_PACKAGE_PATH, alpha: 1.0 });
  console.log(`\nLOO evaluation:`);
  console.log(`  status: ${evalResult.status}`);
  console.log(`  folds: ${evalResult.folds.length}`);
  console.log(`  top1 overlap: ${fmtPct(evalResult.aggregateMetrics.top1OverlapMean)}`);
  console.log(`  top3 overlap: ${fmtPct(evalResult.aggregateMetrics.top3OverlapMean)}`);
  console.log(`  closed dim mass error: ${evalResult.aggregateMetrics.closedDimensionMassErrorMean.toFixed(4)}`);
  console.log("\nPer-dimension top1 overlap:");
  for (const [dim, metrics] of Object.entries(evalResult.aggregateMetrics.perDimension).sort()) {
    console.log(`  ${dim}: ${fmtPct(metrics.top1Overlap)} (top3: ${fmtPct(metrics.top3Overlap)}, mass error: ${metrics.massError.toFixed(4)})`);
  }

  console.log("\nPredict new product:");
  const prediction = predictSupervisedPortrait({
    input: { skuId: "new_product_smoke", fitType: "修身型", fabric: "全棉", fab: "修身显瘦通勤T恤，舒适亲肤" },
    model,
    outputTopNPerDimension: 3,
  });
  console.log(`  risk flags: ${prediction.riskFlags.join(", ")}`);
  for (const dim of prediction.dimensionSummaries) {
    const top = dim.topLabels.map((l) => `${l.label}(${fmtPct(l.share ?? 0)})`).join(", ");
    console.log(`  ${dim.labelType}: ${top}`);
  }

  console.log("\n=== Smoke complete ===");
}

main();
