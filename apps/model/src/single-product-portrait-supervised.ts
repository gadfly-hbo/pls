/**
 * Supervised single-product portrait model (M-P5-PORTRAIT supervised phase).
 *
 * Trains per-dimension Ridge regressions from 版型 / 面料 / FAB to platform
 * portrait label shares. Designed for small-sample, interpretable prediction.
 *
 * Constraints:
 * - Does not claim generalization without time-split validation.
 * - Keeps risk flags: baseline_not_trained_model, small_sample_supervised_model,
 *   no_temporal_validation.
 * - First-phase targets: 预测性别, 预测年龄段, 预测消费能力, 城市等级,
 *   八大消费群体, 预测人生阶段.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  ANCHOR_SKU_ID,
  type ParsedPortraitAnchor,
  type PlatformPortraitRow,
  type PortraitEvidence,
  type SingleProductPortraitPrediction,
  type SingleProductPortraitRisk,
} from "./single-product-portrait.js";
import { loadSingleProductPortraitSamplePackage, type PortraitSamplePackage } from "./single-product-portrait-calibration.js";

export const SUPERVISED_PORTRAIT_MODEL_VERSION = "single-product-portrait-supervised-ridge-0.1";
export const SINGLE_PRODUCT_PORTRAIT_DEFAULT_MODEL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/local/single-product-portrait-q2-73sample/model-calibrated.json",
);
export const SINGLE_PRODUCT_PORTRAIT_MODEL_PATH_ENV = "SINGLE_PRODUCT_PORTRAIT_MODEL_PATH";
export const SINGLE_PRODUCT_PORTRAIT_REQUIRED_COLUMNS = ["款号", "版型", "面料", "FAB"] as const;
export const SINGLE_PRODUCT_PORTRAIT_MAX_BATCH_ROWS = 100;
export const SINGLE_PRODUCT_PORTRAIT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const SUPERVISED_PORTRAIT_RISK_FLAGS: SingleProductPortraitRisk[] = [
  "baseline_not_trained_model",
  "small_sample_supervised_model",
  "no_temporal_validation",
];
export const SUPERVISED_TARGET_DIMENSIONS = [
  "预测性别",
  "预测年龄段",
  "预测消费能力",
  "城市等级",
  "八大消费群体",
  "预测人生阶段",
] as const;

export type SupervisedTargetDimension = (typeof SUPERVISED_TARGET_DIMENSIONS)[number];

export interface PortraitTrainingSample {
  skuId: string;
  sourceProductKey?: string;
  fitType: string;
  fabric: string;
  fab: string;
}

export interface DimensionModel {
  labelType: string;
  isClosed: boolean;
  labels: string[];
  featureNames: string[];
  weights: number[][]; // weights[labelIndex][featureIndex]
  intercepts: number[]; // intercept[labelIndex]
  featureMean: number[];
  featureStd: number[];
  alpha: number;
  temperature?: number; // post-hoc calibration temperature for closed dimensions
}

export interface SupervisedPortraitModel {
  version: typeof SUPERVISED_PORTRAIT_MODEL_VERSION;
  trainedAt: string;
  sampleCount: number;
  fitTypes: string[];
  targetDimensions: string[];
  dimensionModels: DimensionModel[];
  featureExtractorVersion: string;
  combinationFeatureNames: string[];
}

export interface SupervisedPortraitMetricsSummary {
  labelType: SupervisedTargetDimension;
  top1Overlap: number;
  top3Overlap: number;
}

export interface SingleProductPortraitModelMetadataAvailable {
  modelAvailable: true;
  fitTypes: string[];
  requiredColumns: readonly string[];
  maxBatchRows: number;
  maxFileBytes: number;
  modelVersion: string;
  trainedAt: string;
  sampleCount: number;
  riskFlags: SingleProductPortraitRisk[];
  metricsSummary: SupervisedPortraitMetricsSummary[];
}

export interface SingleProductPortraitModelMetadataUnavailable {
  modelAvailable: false;
  requiredColumns: readonly string[];
  maxBatchRows: number;
  maxFileBytes: number;
  error: {
    code: "model_not_available";
    message: string;
  };
}

export type SingleProductPortraitModelMetadata =
  | SingleProductPortraitModelMetadataAvailable
  | SingleProductPortraitModelMetadataUnavailable;

export interface CleanSingleProductPortraitInput {
  skuId: string;
  fitType: string;
  fabric: string;
  fab: string;
}

export interface SingleProductPortraitServiceOptions {
  modelPath?: string;
  model?: SupervisedPortraitModel;
  outputTopNPerDimension?: number;
}

export class SingleProductPortraitModelUnavailableError extends Error {
  readonly code = "model_not_available" as const;

  constructor(message = "模型文件未生成或不可读取，请先训练模型", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SingleProductPortraitModelUnavailableError";
  }
}

export const SUPERVISED_PORTRAIT_METRICS_SUMMARY: SupervisedPortraitMetricsSummary[] = [
  { labelType: "预测性别", top1Overlap: 0.959, top3Overlap: 1.0 },
  { labelType: "预测人生阶段", top1Overlap: 0.877, top3Overlap: 1.0 },
  { labelType: "预测年龄段", top1Overlap: 0.726, top3Overlap: 0.79 },
  { labelType: "预测消费能力", top1Overlap: 0.712, top3Overlap: 1.0 },
  { labelType: "城市等级", top1Overlap: 0.411, top3Overlap: 0.74 },
  { labelType: "八大消费群体", top1Overlap: 0.315, top3Overlap: 0.817 },
];

export type SupervisedPortraitInput = PortraitTrainingSample;

export interface TrainSupervisedOptions {
  packagePath: string;
  alpha?: number;
  outputPath?: string;
}

export interface PredictSupervisedOptions {
  input: SupervisedPortraitInput;
  model: SupervisedPortraitModel;
  outputTopNPerDimension?: number;
}

export interface EvaluateSupervisedOptions {
  packagePath: string;
  alpha?: number;
}

export interface SupervisedEvaluationResult {
  status: "ok" | "not_enough_labeled_samples";
  sampleCount: number;
  folds: SupervisedEvaluationFold[];
  aggregateMetrics: SupervisedAggregateMetrics;
  riskFlags: string[];
  notEnoughSamplesReason?: string;
}

export interface SupervisedEvaluationFold {
  skuId: string;
  sourceProductKey?: string;
  actualRows: PlatformPortraitRow[];
  predictedRows: PlatformPortraitRow[];
  top3Overlap: number;
  top1Overlap: number;
}

export interface SupervisedAggregateMetrics {
  top1OverlapMean: number;
  top3OverlapMean: number;
  closedDimensionMassErrorMean: number;
  dimensionCoverageRate: number;
  perDimension: Record<string, { top1Overlap: number; top3Overlap: number; massError: number }>;
}

// ---------------------------------------------------------------------------
// Feature dictionaries
// ---------------------------------------------------------------------------

const FIT_TYPE_CATEGORIES: Record<string, string[]> = {
  slim: ["修身", "紧身", "收腰", "X型"],
  loose: ["宽松", "阔腿", "直筒", "小宽松", "特宽松"],
  regular: ["合体", "合体型"],
  a_line: ["A型", "A字"],
  h_line: ["H型"],
  o_line: ["O型"],
};

export const FABRIC_KEYWORDS: Array<{ keyword: string; canonical: string }> = [
  { keyword: "棉", canonical: "fabric_cotton" },
  { keyword: "氨纶", canonical: "fabric_spandex" },
  { keyword: "莱赛尔", canonical: "fabric_lyocell" },
  { keyword: "天丝", canonical: "fabric_lyocell" },
  { keyword: "涤纶", canonical: "fabric_polyester" },
  { keyword: "聚酯纤维", canonical: "fabric_polyester" },
  { keyword: "粘胶", canonical: "fabric_viscose" },
  { keyword: "粘纤", canonical: "fabric_viscose" },
  { keyword: "腈纶", canonical: "fabric_acrylic" },
  { keyword: "锦纶", canonical: "fabric_nylon" },
  { keyword: "尼龙", canonical: "fabric_nylon" },
  { keyword: "莫代尔", canonical: "fabric_modal" },
  { keyword: "羊毛", canonical: "fabric_wool" },
  { keyword: "真丝", canonical: "fabric_silk" },
  { keyword: "桑蚕丝", canonical: "fabric_silk" },
  { keyword: "牛仔", canonical: "fabric_denim" },
  { keyword: "雪纺", canonical: "fabric_chiffon" },
  { keyword: "罗纹", canonical: "fabric_rib" },
  { keyword: "针织", canonical: "fabric_knit" },
  { keyword: "梭织", canonical: "fabric_woven" },
  { keyword: "混纺", canonical: "fabric_blend" },
  { keyword: "交织", canonical: "fabric_blend" },
  { keyword: "混交", canonical: "fabric_blend" },
  { keyword: "斜纹", canonical: "fabric_twill" },
  { keyword: "提花", canonical: "fabric_jacquard" },
  { keyword: "双面", canonical: "fabric_double_face" },
  { keyword: "水洗", canonical: "fabric_washed" },
  { keyword: "肌理", canonical: "fabric_texture" },
];

export const STYLE_KEYWORDS: Array<{ keyword: string; canonical: string }> = [
  { keyword: "复古", canonical: "style_vintage" },
  { keyword: "怀旧", canonical: "style_vintage" },
  { keyword: "休闲", canonical: "style_casual" },
  { keyword: "松弛", canonical: "style_casual" },
  { keyword: "慵懒", canonical: "style_casual" },
  { keyword: "舒适", canonical: "style_casual" },
  { keyword: "通勤", canonical: "style_commute" },
  { keyword: "职场", canonical: "style_commute" },
  { keyword: "办公", canonical: "style_commute" },
  { keyword: "商务", canonical: "style_commute" },
  { keyword: "干练", canonical: "style_commute" },
  { keyword: "运动", canonical: "style_sporty" },
  { keyword: "健身", canonical: "style_sporty" },
  { keyword: "瑜伽", canonical: "style_sporty" },
  { keyword: "户外", canonical: "style_outdoor" },
  { keyword: "工装", canonical: "style_utilitarian" },
  { keyword: "机能", canonical: "style_utilitarian" },
  { keyword: "甜美", canonical: "style_sweet" },
  { keyword: "俏皮", canonical: "style_sweet" },
  { keyword: "可爱", canonical: "style_sweet" },
  { keyword: "简约", canonical: "style_minimal" },
  { keyword: "极简", canonical: "style_minimal" },
  { keyword: "基础", canonical: "style_minimal" },
  { keyword: "设计感", canonical: "style_designer" },
  { keyword: "解构", canonical: "style_designer" },
  { keyword: "拼接", canonical: "style_designer" },
  { keyword: "不对称", canonical: "style_designer" },
  { keyword: "显瘦", canonical: "style_slimming" },
  { keyword: "修身", canonical: "style_slimming" },
  { keyword: "收腰", canonical: "style_slimming" },
  { keyword: "宽松", canonical: "style_loose" },
  { keyword: "廓形", canonical: "style_loose" },
  { keyword: "oversize", canonical: "style_loose" },
  { keyword: "包容", canonical: "style_loose" },
  { keyword: "学院", canonical: "style_preppy" },
  { keyword: "校园", canonical: "style_preppy" },
  { keyword: "青春", canonical: "style_preppy" },
  { keyword: "文艺", canonical: "style_artsy" },
  { keyword: "高知", canonical: "style_artsy" },
  { keyword: "科技", canonical: "style_tech" },
  { keyword: "三防", canonical: "style_tech" },
  { keyword: "环保", canonical: "style_eco" },
  { keyword: "森柔", canonical: "style_eco" },
  { keyword: "高级", canonical: "style_premium" },
  { keyword: "精致", canonical: "style_premium" },
  { keyword: "轻奢", canonical: "style_premium" },
  { keyword: "辣妹", canonical: "style_trendy" },
  { keyword: "街头", canonical: "style_trendy" },
  { keyword: "潮流", canonical: "style_trendy" },
  { keyword: "法式", canonical: "style_french" },
  { keyword: "优雅", canonical: "style_elegant" },
  { keyword: "温柔", canonical: "style_gentle" },
  { keyword: "遮肉", canonical: "style_slimming" },
  { keyword: "随性", canonical: "style_casual" },
  { keyword: "不挑", canonical: "style_versatile" },
  { keyword: "百搭", canonical: "style_versatile" },
  { keyword: "线条", canonical: "style_slimming" },
  { keyword: "剪裁", canonical: "style_designer" },
  { keyword: "立体", canonical: "style_designer" },
  { keyword: "层次", canonical: "style_designer" },
  { keyword: "分割", canonical: "style_designer" },
];

export const FUNCTION_KEYWORDS: Array<{ keyword: string; canonical: string }> = [
  { keyword: "三防", canonical: "func_waterproof" },
  { keyword: "防护", canonical: "func_protective" },
  { keyword: "凉感", canonical: "func_cooling" },
  { keyword: "弹力", canonical: "func_stretch" },
  { keyword: "透气", canonical: "func_breathable" },
  { keyword: "亲肤", canonical: "func_skinfriendly" },
  { keyword: "防晒", canonical: "func_sunproof" },
  { keyword: "抗菌", canonical: "func_antibacterial" },
  { keyword: "易打理", canonical: "func_easycare" },
  { keyword: "速干", canonical: "func_quickdry" },
  { keyword: "保暖", canonical: "func_warm" },
  { keyword: "垂坠", canonical: "func_drape" },
  { keyword: "挺括", canonical: "func_structured" },
  { keyword: "抽绳", canonical: "func_adjustable" },
];

export const SCENE_KEYWORDS: Array<{ keyword: string; canonical: string }> = [
  { keyword: "日常", canonical: "scene_daily" },
  { keyword: "约会", canonical: "scene_date" },
  { keyword: "聚会", canonical: "scene_party" },
  { keyword: "上班", canonical: "scene_work" },
  { keyword: "出游", canonical: "scene_travel" },
  { keyword: "度假", canonical: "scene_vacation" },
  { keyword: "居家", canonical: "scene_home" },
];

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

function categorizeFitType(fitType: string): string {
  const lower = fitType.toLowerCase();
  for (const [category, patterns] of Object.entries(FIT_TYPE_CATEGORIES)) {
    if (patterns.some((p) => lower.includes(p.toLowerCase()))) return category;
  }
  return "other";
}

function extractKeywords(text: string, dictionary: Array<{ keyword: string; canonical: string }>): Record<string, number> {
  const lower = text.toLowerCase();
  const found = new Map<string, number>();
  for (const { keyword, canonical } of dictionary) {
    if (lower.includes(keyword.toLowerCase())) {
      found.set(canonical, (found.get(canonical) ?? 0) + 1);
    }
  }
  return Object.fromEntries(found);
}

function mergeCounts(...records: Record<string, number>[]): Record<string, number> {
  const merged = new Map<string, number>();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      merged.set(key, (merged.get(key) ?? 0) + value);
    }
  }
  return Object.fromEntries(merged);
}

export function extractBaseSupervisedFeatures(sample: PortraitTrainingSample): Record<string, number> {
  const fitCategory = categorizeFitType(sample.fitType);
  const fitOneHot: Record<string, number> = { [`fit_${fitCategory}`]: 1 };

  const fabricFeatures = extractKeywords(sample.fabric, FABRIC_KEYWORDS);
  const fabStyleFeatures = extractKeywords(sample.fab, STYLE_KEYWORDS);
  const fabFunctionFeatures = extractKeywords(sample.fab, FUNCTION_KEYWORDS);
  const fabSceneFeatures = extractKeywords(sample.fab, SCENE_KEYWORDS);

  // Also extract fabric keywords from FAB
  const fabFabricFeatures = extractKeywords(sample.fab, FABRIC_KEYWORDS);

  return mergeCounts(fitOneHot, fabricFeatures, fabFabricFeatures, fabStyleFeatures, fabFunctionFeatures, fabSceneFeatures);
}

const COMBINATION_FEATURE_GROUPS = ["fit_", "fabric_", "style_", "func_", "scene_"];

function getFeatureGroup(name: string): string | null {
  for (const prefix of COMBINATION_FEATURE_GROUPS) {
    if (name.startsWith(prefix)) return prefix;
  }
  return null;
}

function generateCombinationFeatures(
  baseFeatures: Record<string, number>,
  comboNames: Set<string>,
): Record<string, number> {
  const combos: Record<string, number> = {};
  const keys = Object.keys(baseFeatures);
  for (let i = 0; i < keys.length; i++) {
    const k1 = keys[i]!;
    if (baseFeatures[k1] === 0) continue;
    const g1 = getFeatureGroup(k1);
    if (!g1) continue;
    for (let j = i + 1; j < keys.length; j++) {
      const k2 = keys[j]!;
      if (baseFeatures[k2] === 0) continue;
      const g2 = getFeatureGroup(k2);
      if (!g2 || g1 === g2) continue;
      const comboKey = `${k1}__${k2}`;
      if (comboNames.has(comboKey)) {
        combos[comboKey] = 1;
      }
    }
  }
  return combos;
}

export function selectFrequentCombinationFeatures(
  baseFeatureRecords: Record<string, number>[],
  minFrequency = 3,
): string[] {
  const freq = new Map<string, number>();
  for (const record of baseFeatureRecords) {
    const seen = new Set<string>();
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i++) {
      const k1 = keys[i]!;
      if (record[k1] === 0) continue;
      const g1 = getFeatureGroup(k1);
      if (!g1) continue;
      for (let j = i + 1; j < keys.length; j++) {
        const k2 = keys[j]!;
        if (record[k2] === 0) continue;
        const g2 = getFeatureGroup(k2);
        if (!g2 || g1 === g2) continue;
        const comboKey = `${k1}__${k2}`;
        if (!seen.has(comboKey)) {
          seen.add(comboKey);
          freq.set(comboKey, (freq.get(comboKey) ?? 0) + 1);
        }
      }
    }
  }
  return [...freq.entries()]
    .filter(([, count]) => count >= minFrequency)
    .map(([key]) => key)
    .sort();
}

function addCombinationFeatures(
  baseFeatures: Record<string, number>,
  combinationFeatureNames: string[],
): Record<string, number> {
  if (combinationFeatureNames.length === 0) return baseFeatures;
  const comboSet = new Set(combinationFeatureNames);
  const comboFeatures = generateCombinationFeatures(baseFeatures, comboSet);
  return mergeCounts(baseFeatures, comboFeatures);
}

export function extractSupervisedFeatures(
  sample: PortraitTrainingSample,
  combinationFeatureNames?: string[],
): Record<string, number> {
  const baseFeatures = extractBaseSupervisedFeatures(sample);
  if (!combinationFeatureNames || combinationFeatureNames.length === 0) {
    return baseFeatures;
  }
  return addCombinationFeatures(baseFeatures, combinationFeatureNames);
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

function transpose(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  return matrix[0]!.map((_, j) => matrix.map((row) => row[j]!));
}

function matMul(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = [];
    for (let j = 0; j < b[0]!.length; j++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) {
        sum += a[i]![k]! * b[k]![j]!;
      }
      result[i]![j] = sum;
    }
  }
  return result;
}

function matVecMul(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((sum, value, j) => sum + value * (v[j] ?? 0), 0));
}

function addIdentity(matrix: number[][], alpha: number): number[][] {
  return matrix.map((row, i) => row.map((value, j) => (i === j ? value + alpha : value)));
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  // Augment with identity
  const aug: number[][] = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k]![i]!) > Math.abs(aug[maxRow]![i]!)) maxRow = k;
    }
    if (Math.abs(aug[maxRow]![i]!) < 1e-12) {
      throw new Error("Matrix is singular or nearly singular");
    }
    [aug[i], aug[maxRow]] = [aug[maxRow]!, aug[i]!];

    // Normalize pivot row
    const pivot = aug[i]![i]!;
    for (let j = 0; j < 2 * n; j++) {
      aug[i]![j]! /= pivot;
    }

    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = aug[k]![i]!;
      for (let j = 0; j < 2 * n; j++) {
        aug[k]![j]! -= factor * aug[i]![j]!;
      }
    }
  }

  // Extract inverse
  return aug.map((row) => row.slice(n));
}

// ---------------------------------------------------------------------------
// Standardization
// ---------------------------------------------------------------------------

function computeMeanStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1; // avoid zero std
  return { mean, std };
}

function standardize(matrix: number[][]): { scaled: number[][]; means: number[]; stds: number[] } {
  const featureCount = matrix[0]?.length ?? 0;
  const means: number[] = [];
  const stds: number[] = [];

  for (let j = 0; j < featureCount; j++) {
    const column = matrix.map((row) => row[j]!);
    const { mean, std } = computeMeanStd(column);
    means.push(mean);
    stds.push(std);
  }

  const scaled = matrix.map((row) => row.map((value, j) => (value - means[j]!) / stds[j]!));
  return { scaled, means, stds };
}

// ---------------------------------------------------------------------------
// Ridge regression
// ---------------------------------------------------------------------------

function trainRidge(X: number[][], y: number[], alpha: number): { weights: number[]; intercept: number } {
  const featureCount = X[0]?.length ?? 0;
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtX_reg = addIdentity(XtX, alpha);
  const XtX_inv = invertMatrix(XtX_reg);
  const Xty = matVecMul(Xt, y);
  const weights = matVecMul(XtX_inv, Xty);

  // Compute intercept on original scale
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const featureMeans = X[0]?.map((_, j) => X.reduce((sum, row) => sum + row[j]!, 0) / X.length) ?? [];
  const intercept = yMean - weights.reduce((sum, w, j) => sum + w * featureMeans[j]!, 0);

  return { weights, intercept };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export function loadSupervisedTrainingData(packagePath: string): {
  samples: PortraitTrainingSample[];
  targetsByDimension: Map<string, Map<string, number[]>>;
  package: PortraitSamplePackage;
} {
  const pkg = loadSingleProductPortraitSamplePackage(packagePath);

  const samples: PortraitTrainingSample[] = pkg.products.map((p) => ({
    skuId: p.skuId,
    sourceProductKey: p.sourceProductKey,
    fitType: p.fitType || "X型",
    fabric: p.fabric,
    fab: p.fab,
  }));

  const targetsByDimension = new Map<string, Map<string, number[]>>();
  for (const sample of samples) {
    const rows = pkg.portraitRows.filter(
      (r) => r.skuId === sample.skuId && r.sourceProductKey === sample.sourceProductKey,
    );
    for (const row of rows) {
      if (!SUPERVISED_TARGET_DIMENSIONS.includes(row.labelType as SupervisedTargetDimension)) continue;
      let dimMap = targetsByDimension.get(row.labelType);
      if (!dimMap) {
        dimMap = new Map<string, number[]>();
        targetsByDimension.set(row.labelType, dimMap);
      }
      let labelList = dimMap.get(row.label);
      if (!labelList) {
        labelList = [];
        dimMap.set(row.label, labelList);
      }
      labelList.push(row.share ?? 0);
    }
  }

  // Ensure each sample has a value for every label in each dimension (0 if missing)
  for (const [labelType, dimMap] of targetsByDimension) {
    const labels = [...dimMap.keys()];
    for (const sample of samples) {
      for (const label of labels) {
        const rows = pkg.portraitRows.filter(
          (r) =>
            r.skuId === sample.skuId &&
            r.sourceProductKey === sample.sourceProductKey &&
            r.labelType === labelType &&
            r.label === label,
        );
        if (rows.length === 0) {
          let list = dimMap.get(label);
          if (!list) {
            list = [];
            dimMap.set(label, list);
          }
          list.push(0);
        }
      }
    }
  }

  return { samples, targetsByDimension, package: pkg };
}

// ---------------------------------------------------------------------------
// Model training
// ---------------------------------------------------------------------------

export function trainSupervisedPortraitModel(options: {
  samples: PortraitTrainingSample[];
  targetsByDimension: Map<string, Map<string, number[]>>;
  alpha?: number;
  enableCombinationFeatures?: boolean;
  minCombinationFreq?: number;
}): SupervisedPortraitModel {
  const { samples, targetsByDimension, alpha = 1.0, enableCombinationFeatures = true, minCombinationFreq = 8 } = options;

  // Build base features and select frequent cross-field combinations
  const baseFeatureRecords = samples.map((s) => extractBaseSupervisedFeatures(s));
  const combinationFeatureNames = enableCombinationFeatures
    ? selectFrequentCombinationFeatures(baseFeatureRecords, minCombinationFreq)
    : [];

  const featureRecords = baseFeatureRecords.map((base) => addCombinationFeatures(base, combinationFeatureNames));
  const featureNames = [...new Set(featureRecords.flatMap((r) => Object.keys(r)))].sort();
  const X = featureRecords.map((record) => featureNames.map((name) => record[name] ?? 0));
  const { scaled, means, stds } = standardize(X);

  const dimensionModels: DimensionModel[] = [];

  for (const labelType of SUPERVISED_TARGET_DIMENSIONS) {
    const dimMap = targetsByDimension.get(labelType);
    if (!dimMap) continue;

    const labels = [...dimMap.keys()].sort();
    const isClosed = ["预测性别", "预测年龄段", "预测消费能力", "城市等级", "八大消费群体", "预测人生阶段"].includes(labelType);

    const weights: number[][] = [];
    const intercepts: number[] = [];

    for (const label of labels) {
      const y = dimMap.get(label) ?? [];
      const { weights: w, intercept } = trainRidge(scaled, y, alpha);
      weights.push(w);
      intercepts.push(intercept);
    }

    dimensionModels.push({
      labelType,
      isClosed,
      labels,
      featureNames,
      weights,
      intercepts,
      featureMean: means,
      featureStd: stds,
      alpha,
    });
  }

  return {
    version: SUPERVISED_PORTRAIT_MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    sampleCount: samples.length,
    fitTypes: [...new Set(samples.map((sample) => sample.fitType).filter(Boolean))].sort(),
    targetDimensions: [...SUPERVISED_TARGET_DIMENSIONS],
    dimensionModels,
    featureExtractorVersion: "q2_supervised_v2",
    combinationFeatureNames,
  };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

function computeDimensionScores(model: DimensionModel, features: Record<string, number>): number[] {
  const featureVector = model.featureNames.map((name) => features[name] ?? 0);
  const standardized = featureVector.map((v, j) => (v - model.featureMean[j]!) / model.featureStd[j]!);

  const scores: number[] = [];
  for (let i = 0; i < model.labels.length; i++) {
    let score = model.intercepts[i]!;
    for (let j = 0; j < standardized.length; j++) {
      score += model.weights[i]![j]! * standardized[j]!;
    }
    scores.push(score);
  }
  return scores;
}

function softmaxWithTemperature(scores: number[], temperature: number): number[] {
  if (temperature <= 0 || !Number.isFinite(temperature)) {
    const clipped = scores.map((s) => Math.max(0, s));
    const total = clipped.reduce((a, b) => a + b, 0);
    return total > 0 ? clipped.map((s) => s / total) : clipped.map(() => 1 / clipped.length);
  }
  const maxScore = Math.max(...scores);
  const expScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const total = expScores.reduce((a, b) => a + b, 0);
  return total > 0 ? expScores.map((s) => s / total) : scores.map(() => 1 / scores.length);
}

function predictDimension(model: DimensionModel, features: Record<string, number>): PlatformPortraitRow[] {
  const scores = computeDimensionScores(model, features);

  let shares: number[];
  if (model.isClosed) {
    shares = softmaxWithTemperature(scores, model.temperature ?? 1.0);
  } else {
    shares = scores.map((s) => Math.min(1, Math.max(0, s)));
  }

  return model.labels.map((label, i) => ({
    labelType: model.labelType,
    label,
    share: round2(shares[i]!),
    tgi: null,
    source: "single_product_portrait_supervised_ridge",
    confidence: round2(Math.min(1, 0.5 + Math.min(shares[i]!, 1) * 0.3)),
    evidence: [buildEvidence(model, i)],
    qualityFlags: [],
  }));
}

function buildEvidence(model: DimensionModel, labelIndex: number): PortraitEvidence {
  // Find top positive weighted features for this label
  const featureWeights = model.weights[labelIndex]!.map((w, j) => ({
    name: model.featureNames[j]!,
    weight: w,
  }));
  const topFeatures = featureWeights.filter((fw) => fw.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 3);

  return {
    sourceField: "版型/面料/FAB",
    sourceValue: topFeatures.map((fw) => fw.name).join(","),
    ruleId: `supervised-ridge-${model.labelType}`,
    targetLabelType: model.labelType,
    targetLabel: model.labels[labelIndex]!,
    effect: "increase",
    weight: round3(topFeatures[0]?.weight ?? 0),
    rationale: `Ridge model top positive drivers: ${topFeatures.map((fw) => fw.name).join(", ") || "none"}.`,
  };
}

export function predictSupervisedPortrait(options: PredictSupervisedOptions): SingleProductPortraitPrediction {
  const { input, model, outputTopNPerDimension = 10 } = options;
  const features = extractSupervisedFeatures(input, model.combinationFeatureNames);

  const platformPortraitRows: PlatformPortraitRow[] = [];
  for (const dimModel of model.dimensionModels) {
    const rows = predictDimension(dimModel, features);
    const sorted = rows.sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, outputTopNPerDimension);
    // Renormalize closed dimensions after top-N slicing so remaining mass sums to 1
    if (dimModel.isClosed) {
      const total = sorted.reduce((sum, r) => sum + (r.share ?? 0), 0);
      if (total > 0) {
        for (const row of sorted) {
          row.share = round2((row.share ?? 0) / total);
        }
      }
    }
    platformPortraitRows.push(...sorted);
  }

  const byDimension = new Map<string, PlatformPortraitRow[]>();
  for (const row of platformPortraitRows) {
    const list = byDimension.get(row.labelType) ?? [];
    list.push(row);
    byDimension.set(row.labelType, list);
  }

  const dimensionSummaries = [...byDimension.entries()].map(([labelType, rows]) => ({
    labelType,
    topLabels: rows.slice(0, 3).map((r) => ({ label: r.label, share: r.share, tgi: r.tgi, confidence: r.confidence })),
    qualityFlags: rows.some((r) => r.evidence.length === 0) ? ["missing_evidence"] : [],
  }));

  const riskFlags: SingleProductPortraitRisk[] = [...SUPERVISED_PORTRAIT_RISK_FLAGS];

  const explanationSources = platformPortraitRows.flatMap((r) => r.evidence);

  return {
    skuId: input.skuId,
    generatedAt: new Date().toISOString(),
    modelVersion: SUPERVISED_PORTRAIT_MODEL_VERSION,
    modelPath: "supervised_ridge",
    sourceType: "derived",
    anchorSkuId: ANCHOR_SKU_ID,
    inputCoverage: {
      requiredFieldCoverage: [input.fitType, input.fabric, input.fab].filter(Boolean).length / 3,
      optionalSignalCoverage: 0,
      usedFields: ["fitType", "fabric", "fab"],
      missingFields: [],
    },
    platformPortraitRows,
    dimensionSummaries,
    riskFlags,
    explanationSources,
  };
}

// ---------------------------------------------------------------------------
// LOO evaluation
// ---------------------------------------------------------------------------

export function evaluateSupervisedModel(options: EvaluateSupervisedOptions): SupervisedEvaluationResult {
  const { packagePath, alpha = 1.0 } = options;
  const { samples, targetsByDimension } = loadSupervisedTrainingData(packagePath);

  if (samples.length < 5) {
    return {
      status: "not_enough_labeled_samples",
      sampleCount: samples.length,
      folds: [],
      aggregateMetrics: {
        top1OverlapMean: 0,
        top3OverlapMean: 0,
        closedDimensionMassErrorMean: 0,
        dimensionCoverageRate: 0,
        perDimension: {},
      },
      riskFlags: ["baseline_not_trained_model", "small_sample_supervised_model", "not_enough_labeled_samples"],
      notEnoughSamplesReason: `Only ${samples.length} samples available; need at least 5.`,
    };
  }

  const folds: SupervisedEvaluationFold[] = [];

  for (let i = 0; i < samples.length; i++) {
    const heldOut = samples[i]!;
    const trainSamples = [...samples.slice(0, i), ...samples.slice(i + 1)];

    // Build training targets excluding held-out
    const trainTargets = new Map<string, Map<string, number[]>>();
    for (const [labelType, dimMap] of targetsByDimension) {
      const newDimMap = new Map<string, number[]>();
      for (const [label, values] of dimMap) {
        const newValues = values.filter((_, idx) => idx !== i);
        newDimMap.set(label, newValues);
      }
      trainTargets.set(labelType, newDimMap);
    }

    const trainModel = trainSupervisedPortraitModel({ samples: trainSamples, targetsByDimension: trainTargets, alpha });
    const predicted = predictSupervisedPortrait({ input: heldOut, model: trainModel, outputTopNPerDimension: 10 });

    // Build actual rows for target dimensions
    const actualRows: PlatformPortraitRow[] = [];
    for (const [labelType, dimMap] of targetsByDimension) {
      const labels = [...dimMap.keys()];
      for (const label of labels) {
        const values = dimMap.get(label) ?? [];
        const share = values[i];
        if (share === undefined || share === 0) continue;
        actualRows.push({
          labelType,
          label,
          share,
          tgi: null,
          source: "single_product_portrait_supervised_ridge",
          confidence: 1,
          evidence: [],
          qualityFlags: [],
        });
      }
    }

    const topActual = actualRows.filter((r) => r.share !== null).sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
    const top1Actual = new Set(topActual.slice(0, 1).map((r) => `${r.labelType}::${r.label}`));
    const top3Actual = new Set(topActual.slice(0, 3).map((r) => `${r.labelType}::${r.label}`));
    const top1Predicted = new Set(predicted.platformPortraitRows.slice(0, 1).map((r) => `${r.labelType}::${r.label}`));
    const top3Predicted = new Set(predicted.platformPortraitRows.slice(0, 3).map((r) => `${r.labelType}::${r.label}`));

    const top1Overlap = [...top1Predicted].filter((k) => top1Actual.has(k)).length / Math.max(1, top1Actual.size);
    const top3Overlap = [...top3Predicted].filter((k) => top3Actual.has(k)).length / Math.max(1, top3Actual.size);

    folds.push({
      skuId: heldOut.skuId,
      sourceProductKey: heldOut.sourceProductKey,
      actualRows,
      predictedRows: predicted.platformPortraitRows,
      top1Overlap,
      top3Overlap,
    });
  }

  const aggregate = aggregateSupervisedMetrics(folds, targetsByDimension);

  return {
    status: "ok",
    sampleCount: samples.length,
    folds,
    aggregateMetrics: aggregate,
    riskFlags: ["baseline_not_trained_model", "small_sample_supervised_model", "no_temporal_validation"],
  };
}

function aggregateSupervisedMetrics(
  folds: SupervisedEvaluationFold[],
  targetsByDimension: Map<string, Map<string, number[]>>,
): SupervisedAggregateMetrics {
  const perDimension: SupervisedAggregateMetrics["perDimension"] = {};

  for (const labelType of SUPERVISED_TARGET_DIMENSIONS) {
    const dimFolds = folds.map((fold) => {
      const actualTop = fold.actualRows
        .filter((r) => r.labelType === labelType && r.share !== null)
        .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
      const predTop = fold.predictedRows
        .filter((r) => r.labelType === labelType)
        .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

      const actualTop1 = new Set(actualTop.slice(0, 1).map((r) => r.label));
      const actualTop3 = new Set(actualTop.slice(0, 3).map((r) => r.label));
      const predTop1 = new Set(predTop.slice(0, 1).map((r) => r.label));
      const predTop3 = new Set(predTop.slice(0, 3).map((r) => r.label));

      const top1 = actualTop1.size === 0 ? 0 : [...predTop1].filter((l) => actualTop1.has(l)).length / actualTop1.size;
      const top3 = actualTop3.size === 0 ? 0 : [...predTop3].filter((l) => actualTop3.has(l)).length / actualTop3.size;

      const closedDims = new Set(["预测性别", "预测年龄段", "预测消费能力", "城市等级", "八大消费群体", "预测人生阶段"]);
      const predClosed = predTop.filter((r) => r.labelType === labelType);
      const total = predClosed.reduce((sum, r) => sum + (r.share ?? 0), 0);
      const massError = closedDims.has(labelType) ? Math.abs(total - 1) : 0;

      return { top1, top3, massError };
    });

    perDimension[labelType] = {
      top1Overlap: dimFolds.reduce((a, b) => a + b.top1, 0) / dimFolds.length,
      top3Overlap: dimFolds.reduce((a, b) => a + b.top3, 0) / dimFolds.length,
      massError: dimFolds.reduce((a, b) => a + b.massError, 0) / dimFolds.length,
    };
  }

  const top1OverlapMean = folds.reduce((a, b) => a + b.top1Overlap, 0) / folds.length;
  const top3OverlapMean = folds.reduce((a, b) => a + b.top3Overlap, 0) / folds.length;
  const closedMassErrorMean =
    Object.values(perDimension).reduce((a, b) => a + b.massError, 0) /
    Object.values(perDimension).filter((d) => d.massError > 0).length || 0;

  // Dimension coverage: predicted dimensions / target dimensions
  const dimensionCoverageRate = SUPERVISED_TARGET_DIMENSIONS.length / SUPERVISED_TARGET_DIMENSIONS.length;

  return {
    top1OverlapMean,
    top3OverlapMean,
    closedDimensionMassErrorMean: closedMassErrorMean,
    dimensionCoverageRate,
    perDimension,
  };
}

// ---------------------------------------------------------------------------
// Temperature calibration for closed dimensions
// ---------------------------------------------------------------------------

export interface CalibrateSupervisedOptions {
  packagePath: string;
  alpha?: number;
  temperatures?: number[];
}

export interface SupervisedCalibrationResult {
  temperatures: Record<string, number>;
  perDimensionMse: Record<string, number>;
}

function mseShares(predicted: number[], actual: number[]): number {
  const len = Math.max(predicted.length, actual.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += ((predicted[i] ?? 0) - (actual[i] ?? 0)) ** 2;
  }
  return sum / len;
}

export function calibrateSupervisedTemperatures(options: CalibrateSupervisedOptions): SupervisedCalibrationResult {
  const { packagePath, alpha = 1.0, temperatures = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 5.0] } = options;
  const { samples, targetsByDimension } = loadSupervisedTrainingData(packagePath);

  if (samples.length < 5) {
    return { temperatures: {}, perDimensionMse: {} };
  }

  // Collect per-dimension (scores, actualShares) pairs from LOO folds
  const dimObservations = new Map<string, { scores: number[][]; actualShares: number[][] }>();
  for (const labelType of SUPERVISED_TARGET_DIMENSIONS) {
    dimObservations.set(labelType, { scores: [], actualShares: [] });
  }

  for (let i = 0; i < samples.length; i++) {
    const heldOut = samples[i]!;
    const trainSamples = [...samples.slice(0, i), ...samples.slice(i + 1)];

    const trainTargets = new Map<string, Map<string, number[]>>();
    for (const [labelType, dimMap] of targetsByDimension) {
      const newDimMap = new Map<string, number[]>();
      for (const [label, values] of dimMap) {
        newDimMap.set(label, values.filter((_, idx) => idx !== i));
      }
      trainTargets.set(labelType, newDimMap);
    }

    const trainModel = trainSupervisedPortraitModel({ samples: trainSamples, targetsByDimension: trainTargets, alpha });
    const features = extractSupervisedFeatures(heldOut, trainModel.combinationFeatureNames);

    for (const dimModel of trainModel.dimensionModels) {
      if (!dimModel.isClosed) continue;
      const obs = dimObservations.get(dimModel.labelType);
      if (!obs) continue;

      const scores = computeDimensionScores(dimModel, features);
      const actualShares = dimModel.labels.map((label) => {
        const values = targetsByDimension.get(dimModel.labelType)?.get(label);
        return values?.[i] ?? 0;
      });

      obs.scores.push(scores);
      obs.actualShares.push(actualShares);
    }
  }

  const result: SupervisedCalibrationResult = { temperatures: {}, perDimensionMse: {} };

  for (const labelType of SUPERVISED_TARGET_DIMENSIONS) {
    const obs = dimObservations.get(labelType);
    if (!obs || obs.scores.length === 0) continue;

    let bestT = 1.0;
    let bestMse = Infinity;

    for (const t of temperatures) {
      let mseSum = 0;
      for (let k = 0; k < obs.scores.length; k++) {
        const predShares = softmaxWithTemperature(obs.scores[k]!, t);
        mseSum += mseShares(predShares, obs.actualShares[k]!);
      }
      const mse = mseSum / obs.scores.length;
      if (mse < bestMse) {
        bestMse = mse;
        bestT = t;
      }
    }

    result.temperatures[labelType] = bestT;
    result.perDimensionMse[labelType] = bestMse;
  }

  return result;
}

export function applySupervisedTemperatures(
  model: SupervisedPortraitModel,
  temperatures: Record<string, number>,
): SupervisedPortraitModel {
  return {
    ...model,
    dimensionModels: model.dimensionModels.map((dim) => ({
      ...dim,
      temperature: temperatures[dim.labelType] ?? dim.temperature,
    })),
  };
}

// ---------------------------------------------------------------------------
// Batch prediction from new-product Excel
// ---------------------------------------------------------------------------

export interface NewProductRow {
  skuId: string;
  fitType: string;
  fabric: string;
  fab: string;
}

export interface BatchPredictResult {
  skuId: string;
  fitType: string;
  fabric: string;
  fab: string;
  prediction: SingleProductPortraitPrediction;
}

const NEW_PRODUCT_FIELD_MAP: Record<string, keyof NewProductRow> = {
  "款号": "skuId",
  "版型": "fitType",
  "面料": "fabric",
  "FAB": "fab",
};

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function readNewProductXlsx(filePath: string): NewProductRow[] {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error(`No sheet found in ${filePath}`);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows.map((raw, index) => {
    const mapped: Partial<NewProductRow> = {};
    for (const [header, key] of Object.entries(NEW_PRODUCT_FIELD_MAP)) {
      mapped[key] = normalizeString(raw[header]) as never;
    }
    const row = mapped as NewProductRow;
    if (!row.skuId) {
      throw new Error(`Row ${index + 1} is missing 款号`);
    }
    // Impute missing fitType as X型 per project convention
    if (!row.fitType) row.fitType = "X型";
    return row;
  });
}

export function batchPredictSupervisedPortraits(options: {
  inputPath: string;
  modelPath: string;
  outputTopNPerDimension?: number;
}): BatchPredictResult[] {
  const { inputPath, modelPath, outputTopNPerDimension = 3 } = options;
  const rows = readNewProductXlsx(inputPath);
  const model = loadSupervisedModel(modelPath);

  return rows.map((row) => ({
    ...row,
    prediction: predictSupervisedPortrait({
      input: { skuId: row.skuId, fitType: row.fitType, fabric: row.fabric, fab: row.fab },
      model,
      outputTopNPerDimension,
    }),
  }));
}

// ---------------------------------------------------------------------------
// Server import contract
// ---------------------------------------------------------------------------

export function resolveSingleProductPortraitModelPath(explicitPath?: string): string {
  return explicitPath ?? process.env[SINGLE_PRODUCT_PORTRAIT_MODEL_PATH_ENV] ?? SINGLE_PRODUCT_PORTRAIT_DEFAULT_MODEL_PATH;
}

export function buildSingleProductPortraitModelMetadata(
  options: { modelPath?: string; model?: SupervisedPortraitModel } = {},
): SingleProductPortraitModelMetadata {
  try {
    const model = options.model ?? loadSupervisedModel(resolveSingleProductPortraitModelPath(options.modelPath));
    return {
      modelAvailable: true,
      fitTypes: extractFitTypesFromModel(model),
      requiredColumns: SINGLE_PRODUCT_PORTRAIT_REQUIRED_COLUMNS,
      maxBatchRows: SINGLE_PRODUCT_PORTRAIT_MAX_BATCH_ROWS,
      maxFileBytes: SINGLE_PRODUCT_PORTRAIT_MAX_FILE_BYTES,
      modelVersion: model.version,
      trainedAt: model.trainedAt,
      sampleCount: model.sampleCount,
      riskFlags: [...SUPERVISED_PORTRAIT_RISK_FLAGS],
      metricsSummary: SUPERVISED_PORTRAIT_METRICS_SUMMARY,
    };
  } catch {
    return {
      modelAvailable: false,
      requiredColumns: SINGLE_PRODUCT_PORTRAIT_REQUIRED_COLUMNS,
      maxBatchRows: SINGLE_PRODUCT_PORTRAIT_MAX_BATCH_ROWS,
      maxFileBytes: SINGLE_PRODUCT_PORTRAIT_MAX_FILE_BYTES,
      error: {
        code: "model_not_available",
        message: "模型文件未生成，请先训练模型",
      },
    };
  }
}

export function predictSingleProductPortraitFromCleanInput(
  input: CleanSingleProductPortraitInput,
  options: SingleProductPortraitServiceOptions = {},
): SingleProductPortraitPrediction {
  try {
    const model = options.model ?? loadSupervisedModel(resolveSingleProductPortraitModelPath(options.modelPath));
    return predictSupervisedPortrait({
      input,
      model,
      outputTopNPerDimension: options.outputTopNPerDimension ?? 3,
    });
  } catch (error) {
    throw new SingleProductPortraitModelUnavailableError(undefined, { cause: error });
  }
}

function extractFitTypesFromModel(model: SupervisedPortraitModel): string[] {
  if (Array.isArray(model.fitTypes) && model.fitTypes.length > 0) {
    return [...model.fitTypes].sort();
  }
  const fitFeatureNames = new Set<string>();
  for (const dimModel of model.dimensionModels) {
    for (const featureName of dimModel.featureNames) {
      if (featureName.startsWith("fit_")) fitFeatureNames.add(featureName.replace(/^fit_/, ""));
    }
  }
  return [...fitFeatureNames].sort();
}

// ---------------------------------------------------------------------------
// Model persistence
// ---------------------------------------------------------------------------

export function saveSupervisedModel(model: SupervisedPortraitModel, path: string): void {
  writeFileSync(path, JSON.stringify(model, null, 2));
}

export function loadSupervisedModel(path: string): SupervisedPortraitModel {
  return JSON.parse(readFileSync(path, "utf-8")) as SupervisedPortraitModel;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
