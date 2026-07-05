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
} else {
  throw new Error("Usage: cli.ts <predict|match|backtest|validate-tags|segment-calibration|token-governance|single-product-portrait> [--sku ...] [--mode demo|cutoff] [--input path] [--cutoff timeWindow] [--xlsx path] [--csv path] [--output path]");
}
