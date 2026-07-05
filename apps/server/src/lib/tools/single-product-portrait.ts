// A-P5-PORTRAIT-5: Single product portrait prediction tool.
//
// Bridges the M-domain rule baseline into the tools artifact pipeline.
// Reads only from controlled sample packages under
// data/templates/single-product-portrait-<packageId>/sample_package/.
// The frontend never passes a local file path; it only passes skuId and an
// optional packageId selecting a pre-registered controlled package.
//
// Red lines (docs/p5-portrait-baseline-acceptance.md §6):
// - No arbitrary local file reads from the frontend.
// - No writes to main business portrait tables; output is a derived
//   prediction artifact stored under data/local/tool-runs/<runId>/.
// - Does not bypass Admin API / tools artifact / audit constraints.

import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  predictSingleProductPortraitFromRow,
  type ParsedProductRow,
  type ParsedPortraitAnchor,
  type SingleProductPortraitPrediction,
} from "../../../../model/src/single-product-portrait.js";
import {
  REPO_ROOT,
  type ToolArtifact,
  type ToolExecutionContext,
  type ToolExecutionResult,
  artifactSize,
} from "./types.js";

const TEMPLATES_ROOT = resolve(REPO_ROOT, "data/templates");

function isSafePackageId(packageId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(packageId);
}

function packageDirFor(packageId: string): string {
  return resolve(TEMPLATES_ROOT, `single-product-portrait-${packageId}`, "sample_package");
}

// ---------------------------------------------------------------------------
// Adapter: product_attributes.jsonl -> ParsedProductRow[]
// ---------------------------------------------------------------------------

interface PackageProductAttributes {
  skuId: string;
  sourceProductKey: string;
  brand?: string;
  productName?: string;
  gender: string;
  category: string;
  year?: number | null;
  season?: string;
  productLifecycle?: string;
  mentalProduct?: string;
  ipCollaboration?: string;
  specialFunctionOrMaterial?: string;
  memoryPoint?: string;
  subCategory?: string;
  groupTag?: string;
  fitType?: string;
  fabric?: string;
  fab?: string;
  specification?: string;
  collarType?: string;
  length?: string;
  productNote?: string;
  historicalSales25Q3?: number | null;
  plannedSales26Q3?: number | null;
}

interface PackageProductEntry {
  product: ParsedProductRow;
  sourceProductKey: string;
}

function toParsedProductRow(raw: PackageProductAttributes): ParsedProductRow {
  return {
    skuId: raw.skuId,
    gender: raw.gender,
    brand: raw.brand ?? "",
    productName: raw.productName ?? "",
    category: raw.category,
    year: raw.year ?? null,
    season: raw.season ?? "",
    productLifecycle: raw.productLifecycle ?? "",
    mentalProduct: raw.mentalProduct ?? "",
    ipCollaboration: raw.ipCollaboration ?? "",
    specialFunctionOrMaterial: raw.specialFunctionOrMaterial ?? "",
    memoryPoint: raw.memoryPoint ?? "",
    subCategory: raw.subCategory ?? "",
    groupTag: raw.groupTag ?? "",
    fitType: raw.fitType ?? "",
    fabric: raw.fabric ?? "",
    fab: raw.fab ?? "",
    specification: raw.specification ?? "",
    collarType: raw.collarType ?? "",
    length: raw.length ?? "",
    productNote: raw.productNote ?? "",
    historicalSales25Q3: raw.historicalSales25Q3 ?? null,
    plannedSales26Q3: raw.plannedSales26Q3 ?? null,
  };
}

export function loadPackageProducts(packageDir: string): PackageProductEntry[] {
  const filePath = resolve(packageDir, "product_attributes.jsonl");
  if (!existsSync(filePath)) {
    throw new Error(`product_attributes.jsonl not found in package ${packageDir}`);
  }
  const text = readFileSync(filePath, "utf-8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const raw = JSON.parse(line) as PackageProductAttributes;
      return { product: toParsedProductRow(raw), sourceProductKey: raw.sourceProductKey };
    });
}

// ---------------------------------------------------------------------------
// Adapter: platform_portrait.csv -> ParsedPortraitAnchor
// ---------------------------------------------------------------------------
// The sample package CSV uses a 0-1 decimal share (e.g. 0.72), NOT a percentage
// string like the baseline's parsePortraitCsv expects. This adapter parses the
// 12-column package CSV directly and builds a ParsedPortraitAnchor with numeric
// share values, bypassing baseline's parseShare (which divides by 100).

const PORTRAIT_CSV_FIELD_COUNT = 12;

function parseShareDecimal(value: string): number | null {
  const clean = value.trim();
  if (clean === "" || clean === "-" || clean === "—") return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function parseTgiValue(value: string): number | null {
  const clean = value.trim();
  if (clean === "" || clean === "-" || clean === "—") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export interface AnchorSkuFilter {
  skuId: string;
  sourceProductKey: string;
}

export function loadPackageAnchor(packageDir: string, filter?: AnchorSkuFilter): ParsedPortraitAnchor {
  const filePath = resolve(packageDir, "platform_portrait.csv");
  if (!existsSync(filePath)) {
    throw new Error(`platform_portrait.csv not found in package ${packageDir}`);
  }
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");

  const rows: ParsedPortraitAnchor["rows"] = [];
  const anomalyRows: ParsedPortraitAnchor["anomalyRows"] = [];
  let totalParsedRows = 0;
  let matchedRows = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.includes("labelType")) continue;

    const fields = line.split(",");
    if (fields.length !== PORTRAIT_CSV_FIELD_COUNT) {
      anomalyRows.push({ rowIndex: i, raw: line, fieldCount: fields.length });
      continue;
    }

    const skuId = fields[0]!;
    const sourceProductKey = fields[1]!;
    const labelType = fields[2]!;
    const label = fields[3]!;
    const shareStr = fields[4]!;
    const tgiStr = fields[5]!;
    if (!skuId.trim() || !sourceProductKey.trim() || !labelType.trim() || !label.trim()) {
      anomalyRows.push({ rowIndex: i, raw: line, fieldCount: fields.length });
      continue;
    }

    const share = parseShareDecimal(shareStr);
    if (share === null) {
      anomalyRows.push({ rowIndex: i, raw: line, fieldCount: fields.length });
      continue;
    }

    totalParsedRows++;
    if (filter) {
      if (skuId.trim() !== filter.skuId || sourceProductKey.trim() !== filter.sourceProductKey) {
        continue;
      }
      matchedRows++;
    }

    rows.push({
      labelType: labelType.trim(),
      label: label.trim(),
      share,
      tgi: parseTgiValue(tgiStr),
    });
  }

  const dimensions = [...new Set(rows.map((r) => r.labelType))];
  return { rows, dimensions, anomalyRows };
}

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

interface PortraitToolParameters {
  skuId?: unknown;
  packageId?: unknown;
  outputTopNPerDimension?: unknown;
  includeLongTailDimensions?: unknown;
  bridgeToPlsTaxonomy?: unknown;
}

interface ParsedParameters {
  errors: string[];
  skuId: string | null;
  packageId: string;
  outputTopNPerDimension: number;
  includeLongTailDimensions: boolean;
  bridgeToPlsTaxonomy: boolean;
}

function readParameters(params: Record<string, unknown>): ParsedParameters {
  const errors: string[] = [];
  const p = params as PortraitToolParameters;

  if (typeof p.skuId !== "string" || p.skuId.trim().length === 0) {
    errors.push("skuId is required and must be a non-empty string");
  }
  if (p.packageId !== undefined && (typeof p.packageId !== "string" || !isSafePackageId(p.packageId))) {
    errors.push("packageId must be alphanumeric/underscore/dash when provided");
  }

  let outputTopNPerDimension = 10;
  if (p.outputTopNPerDimension !== undefined) {
    const n = Number(p.outputTopNPerDimension);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      errors.push("outputTopNPerDimension must be an integer between 1 and 50");
    } else {
      outputTopNPerDimension = n;
    }
  }

  return {
    errors,
    skuId: typeof p.skuId === "string" ? p.skuId.trim() : null,
    packageId: typeof p.packageId === "string" && isSafePackageId(p.packageId) ? p.packageId : "sample",
    outputTopNPerDimension,
    includeLongTailDimensions: p.includeLongTailDimensions !== false,
    bridgeToPlsTaxonomy: p.bridgeToPlsTaxonomy !== false,
  };
}

// ---------------------------------------------------------------------------
// Report markdown
// ---------------------------------------------------------------------------

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function buildReport(prediction: SingleProductPortraitPrediction, sourceFiles: string[]): string {
  const lines: string[] = [];
  lines.push("# Single Product Portrait Prediction");
  lines.push("");
  lines.push(`- skuId: ${prediction.skuId}`);
  lines.push(`- modelVersion: ${prediction.modelVersion}`);
  lines.push(`- modelPath: ${prediction.modelPath}`);
  lines.push(`- sourceType: ${prediction.sourceType}`);
  lines.push(`- anchorSkuId: ${prediction.anchorSkuId}`);
  lines.push(`- generatedAt: ${prediction.generatedAt}`);
  lines.push(`- sourceFiles: ${sourceFiles.join(", ")}`);
  lines.push("");
  lines.push("## Risk Flags");
  lines.push("");
  for (const flag of prediction.riskFlags) {
    lines.push(`- ${flag}`);
  }
  lines.push("");
  lines.push("## Input Coverage");
  lines.push("");
  lines.push(`- requiredFieldCoverage: ${fmtPct(prediction.inputCoverage.requiredFieldCoverage)}`);
  lines.push(`- optionalSignalCoverage: ${fmtPct(prediction.inputCoverage.optionalSignalCoverage)}`);
  lines.push(`- usedFields: ${prediction.inputCoverage.usedFields.join(", ")}`);
  lines.push(`- missingFields: ${prediction.inputCoverage.missingFields.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## Dimension Summaries");
  lines.push("");
  for (const dim of prediction.dimensionSummaries) {
    lines.push(`### ${dim.labelType}`);
    for (const top of dim.topLabels) {
      const tgiStr = top.tgi === null ? "N/A" : String(top.tgi);
      lines.push(`- ${top.label}: share=${fmtPct(top.share)}, tgi=${tgiStr}, confidence=${top.confidence}`);
    }
    if (dim.qualityFlags.length > 0) {
      lines.push(`- qualityFlags: ${dim.qualityFlags.join(", ")}`);
    }
    lines.push("");
  }
  if (prediction.plsBridge) {
    lines.push("## PLS Bridge");
    lines.push("");
    lines.push(`- bridgeCoverageRate: ${fmtPct(prediction.plsBridge.bridgeCoverageRate)}`);
    lines.push(`- mappedTags: ${prediction.plsBridge.predictedProfileTags.length}`);
    lines.push(`- unmappedPlatformLabels: ${prediction.plsBridge.unmappedPlatformLabels.length}`);
    lines.push("");
  }
  lines.push("> This is a rule baseline, NOT a trained model. Do not claim generalization.");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export async function executeSingleProductPortrait(ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
  const { errors, skuId, packageId, outputTopNPerDimension, includeLongTailDimensions, bridgeToPlsTaxonomy } =
    readParameters(ctx.parameters);

  if (errors.length > 0) {
    return { status: "failed", artifacts: [], warnings: [], errors };
  }

  const packageDir = packageDirFor(packageId);
  if (!existsSync(packageDir)) {
    return {
      status: "failed",
      artifacts: [],
      warnings: [],
      errors: [`controlled package "${packageId}" not found at ${packageDir}`],
    };
  }

  let entries: PackageProductEntry[];
  const sourceFiles = [
    `data/templates/single-product-portrait-${packageId}/sample_package/product_attributes.jsonl`,
    `data/templates/single-product-portrait-${packageId}/sample_package/platform_portrait.csv`,
  ];

  try {
    entries = loadPackageProducts(packageDir);
  } catch (err) {
    return {
      status: "failed",
      artifacts: [],
      warnings: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const entry = entries.find((e) => e.product.skuId === skuId);
  if (!entry) {
    return {
      status: "failed",
      artifacts: [],
      warnings: [`available skus: ${entries.map((e) => e.product.skuId).join(", ") || "(none)"}`],
      errors: [`skuId "${skuId}" not found in package "${packageId}"`],
    };
  }

  let anchor: ParsedPortraitAnchor;
  try {
    anchor = loadPackageAnchor(packageDir, { skuId: entry.product.skuId, sourceProductKey: entry.sourceProductKey });
  } catch (err) {
    return {
      status: "failed",
      artifacts: [],
      warnings: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  if (anchor.rows.length === 0) {
    return {
      status: "failed",
      artifacts: [],
      warnings: [],
      errors: [`no platform portrait rows matched skuId "${entry.product.skuId}" + sourceProductKey "${entry.sourceProductKey}" in package "${packageId}"`],
    };
  }

  const prediction = predictSingleProductPortraitFromRow(entry.product, anchor, {
    outputTopNPerDimension,
    includeLongTailDimensions,
    bridgeToPlsTaxonomy,
  });

  const artifactRecord = { ...prediction, sourceFiles };

  const artifactsDir = resolve(ctx.runDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  const predictionPath = resolve(artifactsDir, "prediction.json");
  writeFileSync(predictionPath, JSON.stringify(artifactRecord, null, 2));

  const reportPath = resolve(artifactsDir, "report.md");
  writeFileSync(reportPath, buildReport(prediction, sourceFiles));

  const artifacts: ToolArtifact[] = [
    {
      artifactId: "prediction.json",
      name: "prediction.json",
      contentType: "application/json",
      size: artifactSize(ctx.runDir, "artifacts/prediction.json"),
      path: "artifacts/prediction.json",
    },
    {
      artifactId: "report.md",
      name: "report.md",
      contentType: "text/markdown",
      size: artifactSize(ctx.runDir, "artifacts/report.md"),
      path: "artifacts/report.md",
    },
  ];

  const warnings: string[] = [];
  if (anchor.anomalyRows.length > 0) {
    warnings.push(`csv_source_row_anomaly: ${anchor.anomalyRows.length} malformed row(s) in platform_portrait.csv`);
  }

  return {
    status: "succeeded",
    artifacts,
    warnings,
    errors: [],
  };
}
