import { writeFileSync } from "node:fs";
import {
  loadChannelProfiles,
  loadDemoSkus,
  matchChannels,
  predictProductProfile,
  runBacktest,
  runCutoffBacktest,
  runSegmentCalibrationReport,
  runTokenGovernanceReport,
  toProductDNA,
  validateDemoTagIds,
} from "./baseline.js";
import { runSingleProductPortrait } from "./single-product-portrait.js";
import { runSmallSampleRuleCalibration } from "./single-product-portrait-calibration.js";
import {
  evaluateSupervisedModel,
  loadSupervisedModel,
  predictSupervisedPortrait,
  saveSupervisedModel,
  trainSupervisedPortraitModel,
  loadSupervisedTrainingData,
  batchPredictSupervisedPortraits,
  calibrateSupervisedTemperatures,
  applySupervisedTemperatures,
} from "./single-product-portrait-supervised.js";

const [command, ...args] = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function findSku(skuId: string) {
  const sku = loadDemoSkus().find((item) => item.skuId === skuId);
  if (!sku) {
    throw new Error(`Unknown demo skuId: ${skuId}`);
  }
  return sku;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (command === "predict") {
  const skuId = getArg("--sku") ?? "mock_sku_101";
  printJson(predictProductProfile(toProductDNA(findSku(skuId))));
} else if (command === "match") {
  const skuId = getArg("--sku") ?? "mock_sku_101";
  const profile = predictProductProfile(toProductDNA(findSku(skuId)));
  printJson({ skuId, channelMatches: matchChannels(profile, loadChannelProfiles()) });
} else if (command === "backtest") {
  const mode = getArg("--mode") ?? "demo";
  if (mode === "cutoff") {
    printJson(runCutoffBacktest({ inputPath: getArg("--input"), cutoffTimeWindow: getArg("--cutoff") }));
  } else if (mode === "demo") {
    printJson(runBacktest());
  } else {
    throw new Error(`Unknown backtest mode: ${mode}`);
  }
} else if (command === "validate-tags") {
  const result = validateDemoTagIds();
  printJson(result);
  if (!result.ok) process.exitCode = 1;
} else if (command === "segment-calibration") {
  printJson(runSegmentCalibrationReport({ inputPath: getArg("--input"), cutoffTimeWindow: getArg("--cutoff") }));
} else if (command === "token-governance") {
  printJson(runTokenGovernanceReport());
} else if (command === "single-product-portrait") {
  const xlsxPath = getArg("--xlsx") ?? "/Users/huangbo/Downloads/单款信息表.xlsx";
  const csvPath = getArg("--csv") ?? "/Users/huangbo/Downloads/10A326100109画像数据（单款商品人群画像）.csv";
  const skuId = getArg("--sku");
  const outputPath = getArg("--output");
  printJson(runSingleProductPortrait({ xlsxPath, csvPath, skuId, outputPath }));
} else if (command === "single-product-portrait-calibrate") {
  const packagePath = getArg("--package") ?? "../../data/templates/single-product-portrait-sample/sample_package";
  printJson(runSmallSampleRuleCalibration({ packagePath }));
} else if (command === "single-product-portrait-train") {
  const packagePath = getArg("--package") ?? "../../data/local/single-product-portrait-q2-73sample";
  const outputPath = getArg("--output") ?? "../../data/local/single-product-portrait-q2-73sample/model.json";
  const alpha = Number(getArg("--alpha") ?? "1.0");
  const { samples, targetsByDimension } = loadSupervisedTrainingData(packagePath);
  const model = trainSupervisedPortraitModel({ samples, targetsByDimension, alpha });
  saveSupervisedModel(model, outputPath);
  printJson({ trained: true, outputPath, sampleCount: model.sampleCount, dimensions: model.dimensionModels.map((d) => d.labelType) });
} else if (command === "single-product-portrait-train-calibrated") {
  const packagePath = getArg("--package") ?? "../../data/local/single-product-portrait-q2-73sample";
  const outputPath = getArg("--output") ?? "../../data/local/single-product-portrait-q2-73sample/model-calibrated.json";
  const alpha = Number(getArg("--alpha") ?? "1.0");
  const { samples, targetsByDimension } = loadSupervisedTrainingData(packagePath);
  const model = trainSupervisedPortraitModel({ samples, targetsByDimension, alpha });
  const calibration = calibrateSupervisedTemperatures({ packagePath, alpha });
  const calibratedModel = applySupervisedTemperatures(model, calibration.temperatures);
  saveSupervisedModel(calibratedModel, outputPath);
  printJson({ trained: true, calibrated: true, outputPath, sampleCount: calibratedModel.sampleCount, temperatures: calibration.temperatures, perDimensionMse: calibration.perDimensionMse });
} else if (command === "single-product-portrait-eval") {
  const packagePath = getArg("--package") ?? "../../data/local/single-product-portrait-q2-73sample";
  const alpha = Number(getArg("--alpha") ?? "1.0");
  printJson(evaluateSupervisedModel({ packagePath, alpha }));
} else if (command === "single-product-portrait-predict-supervised") {
  const modelPath = getArg("--model") ?? "../../data/local/single-product-portrait-q2-73sample/model.json";
  const skuId = getArg("--sku") ?? "new_product";
  const fitType = getArg("--fit") ?? "修身型";
  const fabric = getArg("--fabric") ?? "全棉";
  const fab = getArg("--fab") ?? "舒适修身T恤";
  const model = loadSupervisedModel(modelPath);
  printJson(predictSupervisedPortrait({ input: { skuId, fitType, fabric, fab }, model }));
} else if (command === "single-product-portrait-predict-batch") {
  const inputPath = getArg("--input");
  if (!inputPath) throw new Error("--input is required for batch prediction");
  const modelPath = getArg("--model") ?? "../../data/local/single-product-portrait-q2-73sample/model.json";
  const outputPath = getArg("--output");
  const topN = Number(getArg("--topN") ?? "3");
  const results = batchPredictSupervisedPortraits({ inputPath, modelPath, outputTopNPerDimension: topN });
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(results, null, 2));
    printJson({ count: results.length, outputPath });
  } else {
    printJson(results);
  }
} else {
  throw new Error("Usage: cli.ts <predict|match|backtest|validate-tags|segment-calibration|token-governance|single-product-portrait|single-product-portrait-calibrate|single-product-portrait-train|single-product-portrait-train-calibrated|single-product-portrait-eval|single-product-portrait-predict-supervised|single-product-portrait-predict-batch> [--sku ...] [--mode demo|cutoff] [--input path] [--cutoff timeWindow] [--xlsx path] [--csv path] [--output path] [--package path] [--model path] [--fit ...] [--fabric ...] [--fab ...] [--alpha number] [--topN number]");
}
