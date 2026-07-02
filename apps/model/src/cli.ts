import {
  loadChannelProfiles,
  loadDemoSkus,
  matchChannels,
  predictProductProfile,
  runBacktest,
  runCutoffBacktest,
  toProductDNA,
  validateDemoTagIds,
} from "./baseline.js";

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
} else {
  throw new Error("Usage: cli.ts <predict|match|backtest|validate-tags> [--sku mock_sku_101] [--mode demo|cutoff] [--input path] [--cutoff timeWindow]");
}
