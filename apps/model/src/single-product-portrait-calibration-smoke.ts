import {
  loadSingleProductPortraitSamplePackage,
  runSmallSampleRuleCalibration,
} from "./single-product-portrait-calibration.js";

const MOCK_PACKAGE_PATH = "../../data/templates/single-product-portrait-sample/sample_package";
const SYNTHETIC_PACKAGE_PATH = "../../data/demo/single-product-portrait-calibration-synthetic-5sample";

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function main() {
  console.log("=== Single Product Portrait Calibration Smoke ===\n");

  // Mock package: should refuse calibration
  const mockPackage = loadSingleProductPortraitSamplePackage(MOCK_PACKAGE_PATH);
  console.log(`Loaded mock package: ${mockPackage.products.length} product(s), ${mockPackage.portraitRows.length} portrait row(s)`);
  console.log(`Manifest sourceType: ${mockPackage.manifest.sourceType}`);

  const mockResult = runSmallSampleRuleCalibration({ packagePath: MOCK_PACKAGE_PATH });
  console.log(`\nMock calibration status: ${mockResult.status}`);
  console.log(`Reason: ${mockResult.notEnoughSamplesReason}`);
  console.log(`Risk flags: ${mockResult.riskFlags.join(", ")}`);

  // Synthetic package: should run LOO and emit metrics
  const syntheticPackage = loadSingleProductPortraitSamplePackage(SYNTHETIC_PACKAGE_PATH);
  console.log(`\nLoaded synthetic package: ${syntheticPackage.products.length} product(s), ${syntheticPackage.portraitRows.length} portrait row(s)`);

  const syntheticResult = runSmallSampleRuleCalibration({ packagePath: SYNTHETIC_PACKAGE_PATH });
  console.log(`\nSynthetic calibration status: ${syntheticResult.status}`);
  console.log(`Folds: ${syntheticResult.folds?.length ?? 0}`);
  console.log(`Risk flags: ${syntheticResult.riskFlags.join(", ")}`);

  if (syntheticResult.aggregateMetrics) {
    const m = syntheticResult.aggregateMetrics;
    console.log("\nAggregate metrics:");
    console.log(`  anchorTopLabelOverlap@3: ${fmtPct(m.anchorTopLabelOverlapAtK.mean)}`);
    console.log(`  dimensionCoverageRate: ${fmtPct(m.dimensionCoverageRate.mean)}`);
    console.log(`  closedDimensionMassError: ${m.closedDimensionMassError.mean.toFixed(4)}`);
    console.log(`  evidenceCoverageRate: ${fmtPct(m.evidenceCoverageRate.mean)}`);
    console.log(`  bridgeCoverageRate: ${fmtPct(m.bridgeCoverageRate.mean)}`);

    console.log("\nPer-dimension anchorTopLabelOverlap@3:");
    for (const [dim, value] of Object.entries(m.anchorTopLabelOverlapAtK.perDimension).sort()) {
      console.log(`  ${dim}: ${fmtPct(value)}`);
    }

    console.log("\nPer-fold top-label overlap:");
    for (const fold of syntheticResult.folds ?? []) {
      console.log(
        `  ${fold.skuId}: ${fmtPct(fold.metrics.anchorTopLabelOverlapAtK.mean)} (actual rows: ${fold.actualRows.length}, predicted rows: ${fold.predicted.platformPortraitRows.length})`,
      );
    }
  }

  console.log("\n=== Smoke complete ===");
}

main();
