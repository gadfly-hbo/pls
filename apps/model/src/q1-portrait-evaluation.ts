/**
 * Evaluate Q1 supervised portrait predictions against 10 held-out real portraits.
 *
 * Inputs:
 * - /Users/huangbo/Downloads/Q1-10款/*.csv (real portraits)
 * - Predictions JSON from single-product-portrait-predict-batch
 *
 * Outputs per-dimension and aggregate metrics plus optimization recommendations.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { batchPredictSupervisedPortraits, SUPERVISED_TARGET_DIMENSIONS } from "./single-product-portrait-supervised.js";
import type { PlatformPortraitRow } from "./single-product-portrait.js";

const REAL_PORTRAIT_DIR = "/Users/huangbo/Downloads/Q1-10款";
const PREDICTIONS_PATH_DEFAULT = "/Users/huangbo/Desktop/Q1画像预测结果.json";
const Q1_PRODUCT_PATH = "/Users/huangbo/Downloads/Q1商品信息.xlsx";
const MODEL_PATH = "../../data/local/single-product-portrait-q2-73sample/model.json";

interface ParsedPortrait {
  skuId: string;
  rows: PlatformPortraitRow[];
}

interface PerDimensionMetrics {
  sampleCount: number;
  top1Accuracy: number;
  top3Accuracy: number;
  top1Hits: number;
  top3Hits: number;
  shareMae: number;
  massError: number;
  avgActualTop1Share: number;
  avgPredictedTop1Share: number;
}

interface EvaluationResult {
  evaluatedSamples: number;
  totalPossibleSamples: number;
  missingPredictions: string[];
  missingRealPortraits: string[];
  perDimension: Record<string, PerDimensionMetrics>;
  aggregate: {
    top1AccuracyMean: number;
    top3AccuracyMean: number;
    shareMaeMean: number;
    massErrorMean: number;
  };
  sampleDetails: Array<{
    skuId: string;
    perDimension: Record<string, {
      actualTop3: string[];
      predictedTop3: string[];
      top1Hit: boolean;
      top3Hit: boolean;
      shareMae: number;
    }>;
  }>;
}

function parseShare(value: string): number | null {
  const clean = value.trim().replace(/%/g, "");
  if (clean === "" || clean === "-" || clean === "—") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n / 100 : null;
}

function parseTgi(value: string): number | null {
  const clean = value.trim();
  if (clean === "" || clean === "-" || clean === "—") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function parsePortraitCsv(filePath: string): ParsedPortrait {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: PlatformPortraitRow[] = [];

  if (lines.length === 0) {
    return { skuId: "", rows };
  }

  const headerFieldCount = lines[0]!.split(",").length;
  const skuId = lines[0]!.split(",")[2]?.replace(/-占比$/, "").trim() ?? "";

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const fields = line.split(",");
    if (fields.length !== headerFieldCount) continue;

    const labelType = fields[0]!.trim();
    const label = fields[1]!.trim();
    const share = parseShare(fields[2]!);
    const tgi = parseTgi(fields[3]!);

    rows.push({
      labelType,
      label,
      share,
      tgi,
      source: "real_portrait_q1",
      confidence: 1,
      evidence: [],
      qualityFlags: [],
    });
  }

  return { skuId, rows };
}

function loadRealPortraits(dirPath: string): ParsedPortrait[] {
  const files = readdirSync(dirPath).filter((f) => f.endsWith("画像数据.csv"));
  return files.map((file) => parsePortraitCsv(join(dirPath, file)));
}

function loadPredictionsFromFile(path: string): Array<{ skuId: string; prediction: { platformPortraitRows: PlatformPortraitRow[] } }> {
  return JSON.parse(readFileSync(path, "utf-8")) as Array<{ skuId: string; prediction: { platformPortraitRows: PlatformPortraitRow[] } }>;
}

function evaluateDimension(actualRows: PlatformPortraitRow[], predictedRows: PlatformPortraitRow[]): {
  top1Hit: boolean;
  top3Hit: boolean;
  shareMae: number;
  massError: number;
  actualTop3: string[];
  predictedTop3: string[];
} {
  const actualSorted = [...actualRows].filter((r) => typeof r.share === "number").sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  const predictedSorted = [...predictedRows].filter((r) => typeof r.share === "number").sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

  const actualTop1 = actualSorted[0]?.label;
  const actualTop3 = actualSorted.slice(0, 3).map((r) => r.label);
  const predictedTop1 = predictedSorted[0]?.label;
  const predictedTop3 = predictedSorted.slice(0, 3).map((r) => r.label);

  const top1Hit = Boolean(actualTop1 && predictedTop1 && actualTop1 === predictedTop1);
  const top3Hit = actualTop3.some((label) => predictedTop3.includes(label));

  // Share MAE across union of labels
  const labelSet = new Set([...actualRows.map((r) => r.label), ...predictedRows.map((r) => r.label)]);
  let shareMae = 0;
  for (const label of labelSet) {
    const actualShare = actualRows.find((r) => r.label === label)?.share ?? 0;
    const predictedShare = predictedRows.find((r) => r.label === label)?.share ?? 0;
    shareMae += Math.abs((actualShare as number) - (predictedShare as number));
  }
  shareMae /= Math.max(1, labelSet.size);

  // Closed dimension mass error: predicted shares should sum to 1
  const predictedTotal = predictedSorted.reduce((sum, r) => sum + (r.share ?? 0), 0);
  const massError = Math.abs(predictedTotal - 1);

  return { top1Hit, top3Hit, shareMae, massError, actualTop3, predictedTop3 };
}

function evaluate(options: {
  realPortraits: ParsedPortrait[];
  predictions: Array<{ skuId: string; prediction: { platformPortraitRows: PlatformPortraitRow[] } }>;
}): EvaluationResult {
  const { realPortraits, predictions } = options;
  const predictionsBySku = new Map(predictions.map((p) => [p.skuId, p.prediction.platformPortraitRows]));

  const missingPredictions: string[] = [];
  const missingRealPortraits: string[] = [];
  const sampleDetails: EvaluationResult["sampleDetails"] = [];
  const dimAccumulators: Record<string, {
    top1Hits: number;
    top3Hits: number;
    shareMaeSum: number;
    massErrorSum: number;
    sampleCount: number;
    actualTop1ShareSum: number;
    predictedTop1ShareSum: number;
  }> = {};

  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    dimAccumulators[dim] = { top1Hits: 0, top3Hits: 0, shareMaeSum: 0, massErrorSum: 0, sampleCount: 0, actualTop1ShareSum: 0, predictedTop1ShareSum: 0 };
  }

  for (const portrait of realPortraits) {
    if (!portrait.skuId) continue;

    const predictedRows = predictionsBySku.get(portrait.skuId);
    if (!predictedRows) {
      missingPredictions.push(portrait.skuId);
      continue;
    }

    const perDimension: Record<string, {
      actualTop3: string[];
      predictedTop3: string[];
      top1Hit: boolean;
      top3Hit: boolean;
      shareMae: number;
    }> = {};

    for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
      const actualDimRows = portrait.rows.filter((r) => r.labelType === dim);
      const predictedDimRows = predictedRows.filter((r) => r.labelType === dim);

      if (actualDimRows.length === 0) continue;

      const result = evaluateDimension(actualDimRows, predictedDimRows);
      perDimension[dim] = result;

      const acc = dimAccumulators[dim]!;
      acc.sampleCount++;
      if (result.top1Hit) acc.top1Hits++;
      if (result.top3Hit) acc.top3Hits++;
      acc.shareMaeSum += result.shareMae;
      acc.massErrorSum += result.massError;

      const actualSorted = [...actualDimRows].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
      const predictedSorted = [...predictedDimRows].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
      acc.actualTop1ShareSum += actualSorted[0]?.share ?? 0;
      acc.predictedTop1ShareSum += predictedSorted[0]?.share ?? 0;
    }

    sampleDetails.push({ skuId: portrait.skuId, perDimension });
  }

  // Detect SKUs present in predictions but not in real portraits
  const realSkuSet = new Set(realPortraits.map((p) => p.skuId));
  for (const pred of predictions) {
    if (!realSkuSet.has(pred.skuId)) {
      missingRealPortraits.push(pred.skuId);
    }
  }

  const perDimension: Record<string, PerDimensionMetrics> = {};
  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    const acc = dimAccumulators[dim]!;
    perDimension[dim] = {
      sampleCount: acc.sampleCount,
      top1Accuracy: acc.sampleCount === 0 ? 0 : acc.top1Hits / acc.sampleCount,
      top3Accuracy: acc.sampleCount === 0 ? 0 : acc.top3Hits / acc.sampleCount,
      top1Hits: acc.top1Hits,
      top3Hits: acc.top3Hits,
      shareMae: acc.sampleCount === 0 ? 0 : acc.shareMaeSum / acc.sampleCount,
      massError: acc.sampleCount === 0 ? 0 : acc.massErrorSum / acc.sampleCount,
      avgActualTop1Share: acc.sampleCount === 0 ? 0 : acc.actualTop1ShareSum / acc.sampleCount,
      avgPredictedTop1Share: acc.sampleCount === 0 ? 0 : acc.predictedTop1ShareSum / acc.sampleCount,
    };
  }

  const dims = Object.values(perDimension);
  const aggregate = {
    top1AccuracyMean: dims.length === 0 ? 0 : dims.reduce((a, b) => a + b.top1Accuracy, 0) / dims.length,
    top3AccuracyMean: dims.length === 0 ? 0 : dims.reduce((a, b) => a + b.top3Accuracy, 0) / dims.length,
    shareMaeMean: dims.length === 0 ? 0 : dims.reduce((a, b) => a + b.shareMae, 0) / dims.length,
    massErrorMean: dims.length === 0 ? 0 : dims.reduce((a, b) => a + b.massError, 0) / dims.length,
  };

  return {
    evaluatedSamples: sampleDetails.length,
    totalPossibleSamples: realPortraits.length,
    missingPredictions,
    missingRealPortraits,
    perDimension,
    aggregate,
    sampleDetails,
  };
}

function printReport(result: EvaluationResult): void {
  console.log("=== Q1 Portrait Prediction Evaluation ===\n");
  console.log(`Evaluated samples: ${result.evaluatedSamples} / ${result.totalPossibleSamples}`);
  if (result.missingPredictions.length > 0) {
    console.log(`Missing predictions: ${result.missingPredictions.join(", ")}`);
  }
  if (result.missingRealPortraits.length > 0) {
    console.log(`SKUs in predictions without real portraits: ${result.missingRealPortraits.slice(0, 5).join(", ")}${result.missingRealPortraits.length > 5 ? "..." : ""}`);
  }

  console.log("\nAggregate:");
  console.log(`  top1 accuracy mean: ${(result.aggregate.top1AccuracyMean * 100).toFixed(1)}%`);
  console.log(`  top3 accuracy mean: ${(result.aggregate.top3AccuracyMean * 100).toFixed(1)}%`);
  console.log(`  share MAE mean: ${result.aggregate.shareMaeMean.toFixed(4)}`);
  console.log(`  closed dim mass error mean: ${result.aggregate.massErrorMean.toFixed(4)}`);

  console.log("\nPer-dimension:");
  for (const dim of SUPERVISED_TARGET_DIMENSIONS) {
    const m = result.perDimension[dim]!;
    console.log(
      `  ${dim}: top1=${(m.top1Accuracy * 100).toFixed(1)}% (${m.top1Hits}/${m.sampleCount}), ` +
      `top3=${(m.top3Accuracy * 100).toFixed(1)}% (${m.top3Hits}/${m.sampleCount}), ` +
      `shareMAE=${m.shareMae.toFixed(4)}, massError=${m.massError.toFixed(4)}, ` +
      `avgActualTop1Share=${(m.avgActualTop1Share * 100).toFixed(1)}%, ` +
      `avgPredictedTop1Share=${(m.avgPredictedTop1Share * 100).toFixed(1)}%`,
    );
  }

  console.log("\nSample-level top1 hits:");
  for (const sample of result.sampleDetails) {
    const hits = SUPERVISED_TARGET_DIMENSIONS.filter((dim) => sample.perDimension[dim]?.top1Hit);
    console.log(`  ${sample.skuId}: ${hits.length}/${SUPERVISED_TARGET_DIMENSIONS.length} dims top1 hit`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const predictionsFlag = args.indexOf("--predictions");
  const predictionsPath = predictionsFlag >= 0 ? args[predictionsFlag + 1] : PREDICTIONS_PATH_DEFAULT;

  const realPortraits = loadRealPortraits(REAL_PORTRAIT_DIR);
  console.log(`Loaded ${realPortraits.length} real portraits from ${REAL_PORTRAIT_DIR}`);

  let predictions: Array<{ skuId: string; prediction: { platformPortraitRows: PlatformPortraitRow[] } }>;
  if (predictionsPath && existsSync(predictionsPath)) {
    predictions = loadPredictionsFromFile(predictionsPath);
    console.log(`Loaded ${predictions.length} predictions from ${predictionsPath}`);
  } else {
    console.log(`Predictions file not found at ${predictionsPath}, regenerating...`);
    predictions = batchPredictSupervisedPortraits({
      inputPath: Q1_PRODUCT_PATH,
      modelPath: MODEL_PATH,
      outputTopNPerDimension: 3,
    });
  }

  const result = evaluate({ realPortraits, predictions });
  printReport(result);

  // Also write full JSON result for downstream analysis
  const outputPath = "/tmp/q1_portrait_evaluation.json";
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nFull evaluation JSON written to ${outputPath}`);
}

main();
