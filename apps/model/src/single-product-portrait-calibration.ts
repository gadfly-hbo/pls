/**
 * M-P5-PORTRAIT-7: rule weight calibration framework.
 *
 * Consumes D-P5-PORTRAIT-3 single-product portrait sample packages, runs
 * leave-one-out validation, and reports structured metrics per dimension.
 *
 * Constraints:
 * - Does not train neural networks.
 * - Does not remove `baseline_not_trained_model`.
 * - Never uses the same sample as both anchor/training and validation target.
 * - Refuses to emit fake metrics when fewer than 5 labeled samples are available.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANCHOR_SKU_ID,
  parsePortraitCsv,
  predictSingleProductPortrait,
  type ParsedPortraitAnchor,
  type ParsedProductRow,
  type PlatformPortraitRow,
  type PortraitEvidence,
  type SingleProductPortraitPrediction,
} from "./single-product-portrait.js";
import { type SingleProductPortraitRuleWeights } from "./single-product-portrait-weights.js";

export const MIN_SAMPLES_FOR_CALIBRATION = 5;

export interface PortraitSamplePackageProduct {
  skuId: string;
  sourceProductKey: string;
  brand: string;
  productName: string;
  gender: string;
  category: string;
  year: number | null;
  season: string;
  productLifecycle: string;
  mentalProduct: string;
  ipCollaboration: string;
  specialFunctionOrMaterial: string;
  memoryPoint: string;
  subCategory: string;
  groupTag: string;
  fitType: string;
  fabric: string;
  fab: string;
  specification: string;
  collarType: string;
  length: string;
  productNote: string;
  historicalSales25Q3: number | null;
  plannedSales26Q3: number | null;
  source: string;
  sourceType: string;
  sourceBatchId: string;
  dataVersion: string;
  timeWindow: string;
  qualityFlags: string[];
}

export interface PortraitSamplePackageManifest {
  packageType: string;
  packageVersion: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  source: string;
  sourceType: string;
  workspaceId: string;
  timeWindows: string[];
  allowedLabelTypes: string[];
  inputSources: Array<{
    sourceId: string;
    sourceName: string;
    sourceType: string;
    description: string;
  }>;
  entityCounts: {
    productAttributes: number;
    platformPortraitRows: number;
    fieldMappingRows: number;
    abnormalRows: number;
  };
  calibrationReadiness: {
    minimumValidProducts: number;
    currentValidProducts: number;
    readyForSmallSampleCalibration: boolean;
  };
}

export interface PortraitSamplePackageQualityReport {
  packageType: string;
  sourceBatchId: string;
  dataVersion: string;
  generatedAt: string;
  productAttributeCount: number;
  validProductCount: number;
  platformPortraitRowCount: number;
  fieldMappingRowCount: number;
  abnormalRowCount: number;
  missingRequiredAttributeCount: number;
  unboundPortraitRowCount: number;
  labelTypeCount: number;
  timeWindows: string[];
  qualityFlags: string[];
  calibrationReadiness: {
    minimumValidProducts: number;
    currentValidProducts: number;
    missingValidProducts: number;
    readyForSmallSampleCalibration: boolean;
  };
  shareable: boolean;
}

export interface PortraitSamplePackage {
  path: string;
  manifest: PortraitSamplePackageManifest;
  qualityReport: PortraitSamplePackageQualityReport;
  products: PortraitSamplePackageProduct[];
  portraitRows: PlatformPortraitRowWithSampleKey[];
}

export interface PlatformPortraitRowWithSampleKey {
  skuId: string;
  sourceProductKey: string;
  labelType: string;
  label: string;
  share: number | null;
  tgi: number | null;
  source: string;
  sourceType: string;
  sourceBatchId: string;
  dataVersion: string;
  timeWindow: string;
  qualityFlags: string[];
}

export interface PortraitCalibrationMetrics {
  /** Fraction of held-out samples whose top predicted label matches the actual top label, averaged across core dimensions. */
  anchorTopLabelOverlapAtK: { k: number; mean: number; perDimension: Record<string, number> };
  /** Predicted dimensions / actual dimensions per sample, averaged. */
  dimensionCoverageRate: { mean: number; perSample: Record<string, number> };
  /** Mean absolute deviation of closed-dimension share sums from 1. */
  closedDimensionMassError: { mean: number; perDimension: Record<string, number> };
  /** Fraction of predicted rows carrying at least one evidence item. */
  evidenceCoverageRate: { mean: number; perSample: Record<string, number> };
  /** Fraction of platform labels mapped to PLS taxonomy. */
  bridgeCoverageRate: { mean: number; perSample: Record<string, number> };
}

export interface PortraitCalibrationFoldResult {
  skuId: string;
  sourceProductKey: string;
  predicted: SingleProductPortraitPrediction;
  actualRows: PlatformPortraitRowWithSampleKey[];
  metrics: PortraitCalibrationMetrics;
}

export type PortraitCalibrationStatus =
  | "not_enough_labeled_samples"
  | "insufficient_real_samples"
  | "mock_sample_only"
  | "ok";

export interface PortraitCalibrationResult {
  status: PortraitCalibrationStatus;
  packagePath: string;
  sourceBatchId: string;
  dataVersion: string;
  sampleCount: number;
  validSampleCount: number;
  minimumRequired: number;
  riskFlags: string[];
  folds?: PortraitCalibrationFoldResult[];
  aggregateMetrics?: PortraitCalibrationMetrics;
  notEnoughSamplesReason?: string;
}

export interface RunCalibrationOptions {
  packagePath: string;
  weights?: SingleProductPortraitRuleWeights;
  outputTopNPerDimension?: number;
  bridgeToPlsTaxonomy?: boolean;
}

// ---------------------------------------------------------------------------
// Sample package reader
// ---------------------------------------------------------------------------

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function readJsonl<T>(filePath: string): T[] {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function parsePlatformPortraitCsv(filePath: string): PlatformPortraitRowWithSampleKey[] {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: PlatformPortraitRowWithSampleKey[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.includes("skuId")) continue; // skip header
    const fields = line.split(",");
    if (fields.length < 6) continue;
    const shareStr = fields[4]!;
    const tgiStr = fields[5]!;
    const share = shareStr.trim() === "" || shareStr.trim() === "-" ? null : Number(shareStr);
    const tgi = tgiStr.trim() === "" || tgiStr.trim() === "-" ? null : Number(tgiStr);
    rows.push({
      skuId: fields[0]!.trim(),
      sourceProductKey: fields[1]!.trim(),
      labelType: fields[2]!.trim(),
      label: fields[3]!.trim(),
      share: Number.isFinite(share) ? share : null,
      tgi: Number.isFinite(tgi) ? tgi : null,
      source: fields[6]?.trim() ?? "",
      sourceType: fields[7]?.trim() ?? "",
      sourceBatchId: fields[8]?.trim() ?? "",
      dataVersion: fields[9]?.trim() ?? "",
      timeWindow: fields[10]?.trim() ?? "",
      qualityFlags: fields[11]?.split(";").map((s) => s.trim()).filter(Boolean) ?? [],
    });
  }

  return rows;
}

export function loadSingleProductPortraitSamplePackage(packagePath: string): PortraitSamplePackage {
  const manifest = readJson<PortraitSamplePackageManifest>(join(packagePath, "source_manifest.json"));
  const qualityReport = readJson<PortraitSamplePackageQualityReport>(join(packagePath, "quality_report.json"));
  const products = readJsonl<PortraitSamplePackageProduct>(join(packagePath, "product_attributes.jsonl"));
  const portraitRows = parsePlatformPortraitCsv(join(packagePath, "platform_portrait.csv"));

  return {
    path: packagePath,
    manifest,
    qualityReport,
    products,
    portraitRows,
  };
}

// ---------------------------------------------------------------------------
// Anchor construction from sample package
// ---------------------------------------------------------------------------

export function getAnchorSourceKeys(
  samples: PortraitSamplePackageProduct[],
  excludeSkuId?: string,
): Set<string> {
  const keys = new Set(samples.map((p) => `${p.skuId}::${p.sourceProductKey}`));
  if (excludeSkuId) {
    for (const sample of samples) {
      if (sample.skuId === excludeSkuId) keys.delete(`${sample.skuId}::${sample.sourceProductKey}`);
    }
  }
  return keys;
}

export function buildAnchorFromSamples(
  samples: PortraitSamplePackageProduct[],
  allRows: PlatformPortraitRowWithSampleKey[],
  excludeSkuId?: string,
): ParsedPortraitAnchor {
  const sampleKeys = getAnchorSourceKeys(samples, excludeSkuId);
  const relevantRows = allRows.filter((r) => sampleKeys.has(`${r.skuId}::${r.sourceProductKey}`));

  // Aggregate by labelType+label using mean share and mean tgi.
  const grouped = new Map<string, { labelType: string; label: string; shares: number[]; tgis: number[] }>();
  for (const row of relevantRows) {
    if (row.share === null) continue;
    const key = `${row.labelType}::${row.label}`;
    const current = grouped.get(key) ?? { labelType: row.labelType, label: row.label, shares: [], tgis: [] };
    current.shares.push(row.share);
    if (row.tgi !== null) current.tgis.push(row.tgi);
    grouped.set(key, current);
  }

  const rows: ParsedPortraitAnchor["rows"] = [...grouped.values()].map((g) => ({
    labelType: g.labelType,
    label: g.label,
    share: g.shares.reduce((a, b) => a + b, 0) / g.shares.length,
    tgi: g.tgis.length > 0 ? g.tgis.reduce((a, b) => a + b, 0) / g.tgis.length : null,
  }));

  const dimensions = [...new Set(rows.map((r) => r.labelType))];
  return { rows, dimensions, anomalyRows: [] };
}

function toParsedProductRow(product: PortraitSamplePackageProduct): ParsedProductRow {
  return {
    skuId: product.skuId,
    gender: product.gender,
    brand: product.brand,
    productName: product.productName,
    category: product.category,
    year: product.year,
    season: product.season,
    productLifecycle: product.productLifecycle,
    mentalProduct: product.mentalProduct,
    ipCollaboration: product.ipCollaboration,
    specialFunctionOrMaterial: product.specialFunctionOrMaterial,
    memoryPoint: product.memoryPoint,
    subCategory: product.subCategory,
    groupTag: product.groupTag,
    fitType: product.fitType,
    fabric: product.fabric,
    fab: product.fab,
    specification: product.specification,
    collarType: product.collarType,
    length: product.length,
    productNote: product.productNote,
    historicalSales25Q3: product.historicalSales25Q3,
    plannedSales26Q3: product.plannedSales26Q3,
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const CLOSED_DIMENSIONS = new Set(["预测性别", "预测年龄段", "预测消费能力", "城市等级", "预测人生阶段", "八大消费群体"]);

function topKOverlap(
  predicted: PlatformPortraitRow[],
  actual: PlatformPortraitRowWithSampleKey[],
  k: number,
): { mean: number; perDimension: Record<string, number> } {
  const actualByDimension = new Map<string, PlatformPortraitRowWithSampleKey[]>();
  for (const row of actual) {
    const list = actualByDimension.get(row.labelType) ?? [];
    list.push(row);
    actualByDimension.set(row.labelType, list);
  }

  const predictedByDimension = new Map<string, PlatformPortraitRow[]>();
  for (const row of predicted) {
    const list = predictedByDimension.get(row.labelType) ?? [];
    list.push(row);
    predictedByDimension.set(row.labelType, list);
  }

  const perDimension: Record<string, number> = {};
  const overlaps: number[] = [];

  for (const [labelType, actualRows] of actualByDimension) {
    const actualTop = actualRows
      .filter((r) => r.share !== null)
      .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
      .slice(0, k)
      .map((r) => r.label);
    const predictedTop = (predictedByDimension.get(labelType) ?? [])
      .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
      .slice(0, k)
      .map((r) => r.label);

    const actualSet = new Set(actualTop);
    const overlap = predictedTop.filter((l) => actualSet.has(l)).length;
    const rate = actualTop.length === 0 ? 0 : overlap / actualTop.length;
    perDimension[labelType] = rate;
    overlaps.push(rate);
  }

  const mean = overlaps.length === 0 ? 0 : overlaps.reduce((a, b) => a + b, 0) / overlaps.length;
  return { mean, perDimension };
}

function dimensionCoverage(
  predicted: PlatformPortraitRow[],
  actual: PlatformPortraitRowWithSampleKey[],
): { rate: number; perDimension: Record<string, number> } {
  const actualDimensions = [...new Set(actual.map((r) => r.labelType))];
  const predictedDimensions = new Set(predicted.map((r) => r.labelType));

  const perDimension: Record<string, number> = {};
  for (const dim of actualDimensions) {
    perDimension[dim] = predictedDimensions.has(dim) ? 1 : 0;
  }

  const rate = actualDimensions.length === 0 ? 0 : actualDimensions.filter((d) => predictedDimensions.has(d)).length / actualDimensions.length;
  return { rate, perDimension };
}

function closedDimensionMassError(
  predicted: PlatformPortraitRow[],
): { mean: number; perDimension: Record<string, number> } {
  const byDimension = new Map<string, PlatformPortraitRow[]>();
  for (const row of predicted) {
    if (!CLOSED_DIMENSIONS.has(row.labelType)) continue;
    const list = byDimension.get(row.labelType) ?? [];
    list.push(row);
    byDimension.set(row.labelType, list);
  }

  const perDimension: Record<string, number> = {};
  const errors: number[] = [];

  for (const [labelType, rows] of byDimension) {
    const total = rows.reduce((sum, r) => sum + (r.share ?? 0), 0);
    const error = Math.abs(total - 1);
    perDimension[labelType] = error;
    errors.push(error);
  }

  const mean = errors.length === 0 ? 0 : errors.reduce((a, b) => a + b, 0) / errors.length;
  return { mean, perDimension };
}

function evidenceCoverage(predicted: PlatformPortraitRow[]): { rate: number; evidenceCount: number; totalCount: number } {
  const totalCount = predicted.length;
  const evidenceCount = predicted.filter((r) => r.evidence.length > 0).length;
  const rate = totalCount === 0 ? 0 : evidenceCount / totalCount;
  return { rate, evidenceCount, totalCount };
}

function computeFoldMetrics(
  predicted: SingleProductPortraitPrediction,
  actualRows: PlatformPortraitRowWithSampleKey[],
): PortraitCalibrationMetrics {
  const topK = topKOverlap(predicted.platformPortraitRows, actualRows, 3);
  const coverage = dimensionCoverage(predicted.platformPortraitRows, actualRows);
  const massError = closedDimensionMassError(predicted.platformPortraitRows);
  const evidence = evidenceCoverage(predicted.platformPortraitRows);
  const bridgeRate = predicted.plsBridge?.bridgeCoverageRate ?? 0;

  return {
    anchorTopLabelOverlapAtK: { k: 3, mean: topK.mean, perDimension: topK.perDimension },
    dimensionCoverageRate: { mean: coverage.rate, perSample: coverage.perDimension },
    closedDimensionMassError: { mean: massError.mean, perDimension: massError.perDimension },
    evidenceCoverageRate: { mean: evidence.rate, perSample: { [predicted.skuId]: evidence.rate } },
    bridgeCoverageRate: { mean: bridgeRate, perSample: { [predicted.skuId]: bridgeRate } },
  };
}

function aggregateMetrics(folds: PortraitCalibrationFoldResult[]): PortraitCalibrationMetrics {
  const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

  const mergePerDimension = (extract: (f: PortraitCalibrationFoldResult) => Record<string, number>): Record<string, number> => {
    const sums = new Map<string, { sum: number; count: number }>();
    for (const fold of folds) {
      for (const [dim, value] of Object.entries(extract(fold))) {
        const current = sums.get(dim) ?? { sum: 0, count: 0 };
        current.sum += value;
        current.count += 1;
        sums.set(dim, current);
      }
    }
    const result: Record<string, number> = {};
    for (const [dim, { sum, count }] of sums) {
      result[dim] = sum / count;
    }
    return result;
  };

  return {
    anchorTopLabelOverlapAtK: {
      k: 3,
      mean: mean(folds.map((f) => f.metrics.anchorTopLabelOverlapAtK.mean)),
      perDimension: mergePerDimension((f) => f.metrics.anchorTopLabelOverlapAtK.perDimension),
    },
    dimensionCoverageRate: {
      mean: mean(folds.map((f) => f.metrics.dimensionCoverageRate.mean)),
      perSample: mergePerDimension((f) => f.metrics.dimensionCoverageRate.perSample),
    },
    closedDimensionMassError: {
      mean: mean(folds.map((f) => f.metrics.closedDimensionMassError.mean)),
      perDimension: mergePerDimension((f) => f.metrics.closedDimensionMassError.perDimension),
    },
    evidenceCoverageRate: {
      mean: mean(folds.map((f) => f.metrics.evidenceCoverageRate.mean)),
      perSample: mergePerDimension((f) => f.metrics.evidenceCoverageRate.perSample),
    },
    bridgeCoverageRate: {
      mean: mean(folds.map((f) => f.metrics.bridgeCoverageRate.mean)),
      perSample: mergePerDimension((f) => f.metrics.bridgeCoverageRate.perSample),
    },
  };
}

// ---------------------------------------------------------------------------
// Leave-one-out calibration
// ---------------------------------------------------------------------------

export function runSmallSampleRuleCalibration(options: RunCalibrationOptions): PortraitCalibrationResult {
  const pkg = loadSingleProductPortraitSamplePackage(options.packagePath);
  const weights = options.weights;
  const topN = options.outputTopNPerDimension ?? 10;
  const bridge = options.bridgeToPlsTaxonomy ?? true;

  const riskFlags: string[] = [
    "baseline_not_trained_model",
    "manual_rule_weight",
    "single_anchor_only",
  ];

  const isMock = pkg.manifest.sourceType === "mock_sample" || pkg.qualityReport.qualityFlags.includes("mock_sample");
  if (isMock) riskFlags.push("mock_sample_only");

  const validSamples = pkg.products.filter((p) => {
    const hasPortrait = pkg.portraitRows.some((r) => r.skuId === p.skuId && r.sourceProductKey === p.sourceProductKey);
    return hasPortrait && p.skuId && p.gender && p.category;
  });

  if (validSamples.length < MIN_SAMPLES_FOR_CALIBRATION) {
    return {
      status: "not_enough_labeled_samples",
      packagePath: pkg.path,
      sourceBatchId: pkg.manifest.sourceBatchId,
      dataVersion: pkg.manifest.dataVersion,
      sampleCount: pkg.products.length,
      validSampleCount: validSamples.length,
      minimumRequired: MIN_SAMPLES_FOR_CALIBRATION,
      riskFlags,
      notEnoughSamplesReason: `Only ${validSamples.length} valid sample(s) available; small-sample calibration requires at least ${MIN_SAMPLES_FOR_CALIBRATION}.`,
    };
  }

  if (isMock) {
    // Even if there are 5+ mock rows, we do not claim real calibration readiness.
    riskFlags.push("insufficient_real_samples");
  }

  const folds: PortraitCalibrationFoldResult[] = [];

  for (const heldOut of validSamples) {
    const anchor = buildAnchorFromSamples(validSamples, pkg.portraitRows, heldOut.skuId);
    const inputProduct = toParsedProductRow(heldOut);

    const predicted = predictSingleProductPortrait(
      {
        product: {
          skuId: inputProduct.skuId,
          gender: inputProduct.gender,
          brand: inputProduct.brand,
          productName: inputProduct.productName,
          category: inputProduct.category,
          year: inputProduct.year ?? undefined,
          season: inputProduct.season,
          productLifecycle: inputProduct.productLifecycle,
          mentalProduct: inputProduct.mentalProduct,
          ipCollaboration: inputProduct.ipCollaboration,
          specialFunctionOrMaterial: inputProduct.specialFunctionOrMaterial,
          memoryPoint: inputProduct.memoryPoint,
          subCategory: inputProduct.subCategory,
          groupTag: inputProduct.groupTag,
          fitType: inputProduct.fitType,
          fabric: inputProduct.fabric,
          fab: inputProduct.fab,
          specification: inputProduct.specification,
          collarType: inputProduct.collarType,
          length: inputProduct.length,
          productNote: inputProduct.productNote,
          historicalSales25Q3: inputProduct.historicalSales25Q3,
          plannedSales26Q3: inputProduct.plannedSales26Q3,
        },
        options: {
          outputTopNPerDimension: topN,
          includeLongTailDimensions: true,
          bridgeToPlsTaxonomy: bridge,
          weights,
        },
      },
      anchor,
    );

    const actualRows = pkg.portraitRows.filter(
      (r) => r.skuId === heldOut.skuId && r.sourceProductKey === heldOut.sourceProductKey,
    );

    folds.push({
      skuId: heldOut.skuId,
      sourceProductKey: heldOut.sourceProductKey,
      predicted,
      actualRows,
      metrics: computeFoldMetrics(predicted, actualRows),
    });
  }

  const aggregate = aggregateMetrics(folds);

  return {
    status: isMock ? "mock_sample_only" : "ok",
    packagePath: pkg.path,
    sourceBatchId: pkg.manifest.sourceBatchId,
    dataVersion: pkg.manifest.dataVersion,
    sampleCount: pkg.products.length,
    validSampleCount: validSamples.length,
    minimumRequired: MIN_SAMPLES_FOR_CALIBRATION,
    riskFlags,
    folds,
    aggregateMetrics: aggregate,
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

export { ANCHOR_SKU_ID };
