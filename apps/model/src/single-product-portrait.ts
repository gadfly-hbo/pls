import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { loadAllowedTagIds, type ProductProfileDraft, type ProfileTagScore, type SegmentDraft } from "./baseline.js";

export const SINGLE_PRODUCT_PORTRAIT_MODEL_VERSION = "single-product-portrait-rule-baseline-0.1";
export const ANCHOR_SKU_ID = "10A326100109";

export type SingleProductPortraitRisk =
  | "baseline_not_trained_model"
  | "single_anchor_only"
  | "manual_rule_weight"
  | "low_input_coverage"
  | "platform_label_unmapped"
  | "csv_source_row_anomaly"
  | "anchor_product_attributes_missing";

export interface PortraitEvidence {
  sourceField: string;
  sourceValue: string;
  ruleId: string;
  targetLabelType: string;
  targetLabel: string;
  effect: "increase" | "decrease" | "set_prior";
  weight: number;
  rationale: string;
}

export interface PlatformPortraitRow {
  labelType: string;
  label: string;
  share: number | null;
  tgi: number | null;
  source: "single_product_portrait_rule_baseline";
  confidence: number;
  evidence: PortraitEvidence[];
  qualityFlags: string[];
}

export interface SingleProductPortraitInputProduct {
  skuId: string;
  gender: string;
  brand: string;
  productName?: string;
  category: string;
  year?: number;
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

export interface SingleProductPortraitInput {
  product: SingleProductPortraitInputProduct;
  options?: {
    outputTopNPerDimension?: number;
    includeLongTailDimensions?: boolean;
    bridgeToPlsTaxonomy?: boolean;
  };
}

export interface SingleProductPortraitPrediction {
  skuId: string;
  generatedAt: string;
  modelVersion: typeof SINGLE_PRODUCT_PORTRAIT_MODEL_VERSION;
  modelPath: "rule_baseline";
  sourceType: "derived";
  anchorSkuId: typeof ANCHOR_SKU_ID;
  inputCoverage: {
    requiredFieldCoverage: number;
    optionalSignalCoverage: number;
    usedFields: string[];
    missingFields: string[];
  };
  platformPortraitRows: PlatformPortraitRow[];
  dimensionSummaries: Array<{
    labelType: string;
    topLabels: Array<{ label: string; share: number | null; tgi: number | null; confidence: number }>;
    qualityFlags: string[];
  }>;
  plsBridge?: {
    predictedProfileTags: ProfileTagScore[];
    unmappedPlatformLabels: Array<{ labelType: string; label: string; reason: string }>;
    bridgeCoverageRate: number;
  };
  riskFlags: SingleProductPortraitRisk[];
  explanationSources: PortraitEvidence[];
}

export interface ParsedProductRow {
  skuId: string;
  gender: string;
  brand: string;
  productName: string;
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
}

export interface ParsedPortraitAnchor {
  rows: Array<{
    labelType: string;
    label: string;
    share: number | null;
    tgi: number | null;
  }>;
  dimensions: string[];
  anomalyRows: Array<{ rowIndex: number; raw: string; fieldCount: number }>;
}

export interface ProductFeatures {
  gender: string;
  category: string;
  fitType: string;
  fabric: string;
  fab: string;
  mentalProduct: string;
  ipCollaboration: string;
  specialFunctionOrMaterial: string;
  memoryPoint: string;
  productName: string;
  subCategory: string;
  styleKeywords: string[];
  fabricSignals: string[];
  functionSignals: string[];
  ipSignals: string[];
}

// ---------------------------------------------------------------------------
// Source parser
// ---------------------------------------------------------------------------

const XLSX_FIELD_MAP: Record<string, keyof ParsedProductRow> = {
  "款号": "skuId",
  "性别修正": "gender",
  "品牌": "brand",
  "商品名称": "productName",
  "品类": "category",
  "年份": "year",
  "季节": "season",
  "货品属性": "productLifecycle",
  "心智产品": "mentalProduct",
  "IP/联名": "ipCollaboration",
  "特殊功能/材质": "specialFunctionOrMaterial",
  "记忆点": "memoryPoint",
  "小类": "subCategory",
  "群组打标": "groupTag",
  "版型": "fitType",
  "面料": "fabric",
  "FAB": "fab",
  "规格": "specification",
  "领型": "collarType",
  "长度": "length",
  "产品备注": "productNote",
  "25Q3产品销额": "historicalSales25Q3",
  "26Q3产品规划销额": "plannedSales26Q3",
};

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseProductXlsx(filePath: string): ParsedProductRow[] {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error(`No sheet found in ${filePath}`);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows.map((raw) => {
    const mapped: Partial<ParsedProductRow> = {};
    for (const [header, key] of Object.entries(XLSX_FIELD_MAP)) {
      const value = raw[header];
      if (key === "year" || key === "historicalSales25Q3" || key === "plannedSales26Q3") {
        mapped[key] = normalizeNumber(value) as never;
      } else {
        mapped[key] = normalizeString(value) as never;
      }
    }
    return mapped as ParsedProductRow;
  });
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

export function parsePortraitCsv(filePath: string): ParsedPortraitAnchor {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: ParsedPortraitAnchor["rows"] = [];
  const anomalyRows: ParsedPortraitAnchor["anomalyRows"] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.includes("标签类型")) continue; // skip header
    const fields = line.split(",");
    if (fields.length !== 4) {
      anomalyRows.push({ rowIndex: i, raw: line, fieldCount: fields.length });
      continue;
    }
    const [labelType, label, shareStr, tgiStr] = fields;
    rows.push({
      labelType: labelType.trim(),
      label: label.trim(),
      share: parseShare(shareStr),
      tgi: parseTgi(tgiStr),
    });
  }

  const dimensions = [...new Set(rows.map((r) => r.labelType))];
  return { rows, dimensions, anomalyRows };
}

// ---------------------------------------------------------------------------
// Feature extractor
// ---------------------------------------------------------------------------

const STYLE_KEYWORDS: Array<{ keyword: string; style: string }> = [
  { keyword: "复古", style: "复古" },
  { keyword: "怀旧", style: "复古" },
  { keyword: "vintage", style: "复古" },
  { keyword: "休闲", style: "休闲" },
  { keyword: "松弛", style: "休闲" },
  { keyword: "慵懒", style: "休闲" },
  { keyword: "舒适", style: "休闲" },
  { keyword: "通勤", style: "通勤" },
  { keyword: "职场", style: "通勤" },
  { keyword: "办公", style: "通勤" },
  { keyword: "商务", style: "通勤" },
  { keyword: "干练", style: "通勤" },
  { keyword: "运动", style: "运动" },
  { keyword: "健身", style: "运动" },
  { keyword: "瑜伽", style: "运动" },
  { keyword: "户外", style: "户外" },
  { keyword: "工装", style: "工装" },
  { keyword: "机能", style: "工装" },
  { keyword: "口袋", style: "工装" },
  { keyword: "耐磨", style: "工装" },
  { keyword: "甜美", style: "甜美" },
  { keyword: "俏皮", style: "甜美" },
  { keyword: "可爱", style: "甜美" },
  { keyword: "少女", style: "甜美" },
  { keyword: "简约", style: "简约" },
  { keyword: "极简", style: "简约" },
  { keyword: "基础", style: "简约" },
  { keyword: "净色", style: "简约" },
  { keyword: "设计感", style: "设计感" },
  { keyword: "解构", style: "设计感" },
  { keyword: "拼接", style: "设计感" },
  { keyword: "不对称", style: "设计感" },
  { keyword: "显瘦", style: "显瘦" },
  { keyword: "修身", style: "显瘦" },
  { keyword: "收腰", style: "显瘦" },
  { keyword: "优化比例", style: "显瘦" },
  { keyword: "宽松", style: "宽松" },
  { keyword: "廓形", style: "宽松" },
  { keyword: "oversize", style: "宽松" },
  { keyword: "包容", style: "宽松" },
  { keyword: "学院", style: "学院" },
  { keyword: "校园", style: "学院" },
  { keyword: "青春", style: "学院" },
  { keyword: "文艺", style: "文艺" },
  { keyword: "高知", style: "文艺" },
  { keyword: "知识分子", style: "文艺" },
  { keyword: "智性", style: "文艺" },
  { keyword: "科技", style: "科技" },
  { keyword: "三防", style: "科技" },
  { keyword: "防护", style: "科技" },
  { keyword: "SMARTECH", style: "科技" },
  { keyword: "环保", style: "环保" },
  { keyword: "森柔", style: "环保" },
  { keyword: "优可丝", style: "环保" },
  { keyword: "莱赛尔", style: "环保" },
  { keyword: "高级", style: "高级" },
  { keyword: "精致", style: "高级" },
  { keyword: "质感", style: "高级" },
  { keyword: "轻奢", style: "高级" },
  { keyword: "辣妹", style: "辣妹" },
  { keyword: "街头", style: "街头" },
  { keyword: "中性", style: "中性" },
];

const FABRIC_SIGNALS: Array<{ keyword: string; signal: string }> = [
  { keyword: "莱赛尔", signal: "环保品质" },
  { keyword: "优可丝", signal: "亲肤品质" },
  { keyword: "森柔", signal: "亲肤品质" },
  { keyword: "三防", signal: "功能户外" },
  { keyword: "特氟龙", signal: "功能户外" },
  { keyword: "牛仔", signal: "牛仔复古" },
  { keyword: "雪纺", signal: "女性通勤" },
  { keyword: "罗纹", signal: "修身基础" },
  { keyword: "仿羊绒", signal: "品质亲肤" },
  { keyword: "帆布", signal: "工装户外" },
  { keyword: "全棉", signal: "舒适亲肤" },
  { keyword: "羊毛", signal: "品质保暖" },
  { keyword: "棉涤", signal: "耐用易打理" },
  { keyword: "全涤", signal: "功能易打理" },
  { keyword: "亚麻", signal: "天然透气" },
];

const FUNCTION_SIGNALS: Array<{ keyword: string; signal: string }> = [
  { keyword: "三防", signal: "功能户外" },
  { keyword: "防护", signal: "功能户外" },
  { keyword: "SMARTECH", signal: "科技功能" },
  { keyword: "易打理", signal: "实用便捷" },
  { keyword: "抗菌", signal: "健康舒适" },
  { keyword: "防晒", signal: "功能户外" },
];

const IP_SIGNALS: Array<{ keyword: string; signal: string }> = [
  { keyword: "航天", signal: "科技国潮" },
  { keyword: "中国航天", signal: "科技国潮" },
  { keyword: "PEANUTS", signal: "潮流联名" },
  { keyword: "史努比", signal: "潮流联名" },
  { keyword: "设计师", signal: "设计品质" },
  { keyword: "联名", signal: "潮流联名" },
];

function extractKeywords(text: string, dictionary: Array<{ keyword: string; value: string }>): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const { keyword, value } of dictionary) {
    if (lower.includes(keyword.toLowerCase())) found.add(value);
  }
  return [...found];
}

export function extractFeatures(product: ParsedProductRow): ProductFeatures {
  const searchText = [product.fab, product.memoryPoint, product.productName, product.productNote, product.specialFunctionOrMaterial].filter(Boolean).join(" ");
  const fabricText = [product.fabric, product.fab].filter(Boolean).join(" ");
  const ipText = [product.ipCollaboration, product.mentalProduct, product.productName].filter(Boolean).join(" ");
  const functionText = [product.specialFunctionOrMaterial, product.fabric, product.fab].filter(Boolean).join(" ");

  const styleKeywords = extractKeywords(
    searchText,
    STYLE_KEYWORDS.map((k) => ({ keyword: k.keyword, value: k.style })),
  );
  const fabricSignals = extractKeywords(
    fabricText,
    FABRIC_SIGNALS.map((k) => ({ keyword: k.keyword, value: k.signal })),
  );
  const functionSignals = extractKeywords(
    functionText,
    FUNCTION_SIGNALS.map((k) => ({ keyword: k.keyword, value: k.signal })),
  );
  const ipSignals = extractKeywords(
    ipText,
    IP_SIGNALS.map((k) => ({ keyword: k.keyword, value: k.signal })),
  );

  return {
    gender: product.gender,
    category: product.category,
    fitType: product.fitType,
    fabric: product.fabric,
    fab: product.fab,
    mentalProduct: product.mentalProduct,
    ipCollaboration: product.ipCollaboration,
    specialFunctionOrMaterial: product.specialFunctionOrMaterial,
    memoryPoint: product.memoryPoint,
    productName: product.productName,
    subCategory: product.subCategory,
    styleKeywords,
    fabricSignals,
    functionSignals,
    ipSignals,
  };
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

interface DimensionPrior {
  labelType: string;
  labels: Array<{ label: string; share: number; tgi: number | null }>;
}

interface RawPrediction {
  labelType: string;
  label: string;
  score: number;
  tgi: number | null;
  evidence: PortraitEvidence[];
}

function anchorPriors(anchor: ParsedPortraitAnchor): DimensionPrior[] {
  const byDimension = new Map<string, Array<{ label: string; share: number; tgi: number | null }>>();
  for (const row of anchor.rows) {
    if (row.share === null) continue;
    const list = byDimension.get(row.labelType) ?? [];
    list.push({ label: row.label, share: row.share, tgi: row.tgi });
    byDimension.set(row.labelType, list);
  }
  return [...byDimension.entries()].map(([labelType, labels]) => ({ labelType, labels }));
}

function evidence(
  sourceField: string,
  sourceValue: string,
  ruleId: string,
  targetLabelType: string,
  targetLabel: string,
  effect: PortraitEvidence["effect"],
  weight: number,
  rationale: string,
): PortraitEvidence {
  return { sourceField, sourceValue, ruleId, targetLabelType, targetLabel, effect, weight, rationale };
}

function applyBaseRules(features: ProductFeatures, priors: DimensionPrior[]): RawPrediction[] {
  const predictions: RawPrediction[] = [];
  const gender = features.gender;
  const category = features.category;

  // Gender base distribution
  const femalePrior = gender === "女" ? 0.72 : gender === "男" ? 0.28 : 0.5;
  predictions.push({
    labelType: "预测性别",
    label: "女",
    score: femalePrior,
    tgi: null,
    evidence: [evidence("性别修正", gender, "gender-base", "预测性别", "女", "set_prior", 0.4, `Gender prior based on product gender=${gender}.`)],
  });
  predictions.push({
    labelType: "预测性别",
    label: "男",
    score: 1 - femalePrior,
    tgi: null,
    evidence: [evidence("性别修正", gender, "gender-base", "预测性别", "男", "set_prior", 0.4, `Complementary gender share.`)],
  });

  // Age base distribution: category-driven prior
  const agePrior = buildAgePrior(category, gender, features.fitType, features.fabricSignals, features.styleKeywords);
  for (const [label, score, rationale] of agePrior) {
    predictions.push({
      labelType: "预测年龄段",
      label,
      score,
      tgi: null,
      evidence: [evidence("品类", category, "age-category-prior", "预测年龄段", label, "set_prior", 0.25, rationale)],
    });
  }

  // Spending power base
  const spendingPrior = buildSpendingPrior(features.fabricSignals, features.styleKeywords, features.functionSignals);
  for (const [label, score, rationale] of spendingPrior) {
    predictions.push({
      labelType: "预测消费能力",
      label,
      score,
      tgi: null,
      evidence: [evidence("面料/FAB", features.fabric, "spending-prior", "预测消费能力", label, "set_prior", 0.25, rationale)],
    });
  }

  // City tier base
  const cityPrior = buildCityPrior(features.styleKeywords, features.category);
  for (const [label, score, rationale] of cityPrior) {
    predictions.push({
      labelType: "城市等级",
      label,
      score,
      tgi: null,
      evidence: [evidence("风格/品类", features.styleKeywords.join(","), "city-prior", "城市等级", label, "set_prior", 0.25, rationale)],
    });
  }

  // Consumer group base
  const groupPrior = buildConsumerGroupPrior(features.styleKeywords, features.fabricSignals, features.functionSignals, gender);
  for (const [label, score, rationale] of groupPrior) {
    predictions.push({
      labelType: "八大消费群体",
      label,
      score,
      tgi: null,
      evidence: [evidence("风格/面料/功能", features.styleKeywords.join(","), "consumer-group-prior", "八大消费群体", label, "set_prior", 0.25, rationale)],
    });
  }

  // Life stage base
  const lifeStagePrior = buildLifeStagePrior(features.styleKeywords, features.category, gender, features.fabricSignals);
  for (const [label, score, rationale] of lifeStagePrior) {
    predictions.push({
      labelType: "预测人生阶段",
      label,
      score,
      tgi: null,
      evidence: [evidence("风格/品类", features.styleKeywords.join(","), "life-stage-prior", "预测人生阶段", label, "set_prior", 0.25, rationale)],
    });
  }

  return predictions;
}

function buildAgePrior(category: string, gender: string, fitType: string, fabricSignals: string[], styleKeywords: string[]): Array<[string, number, string]> {
  let base: Record<string, number> = { "18-19": 0.05, "20-23": 0.18, "24-30": 0.35, "31-35": 0.22, "36-40": 0.12, "41-45": 0.05, "46-50": 0.02, "51-60": 0.01 };

  if (["短袖T恤", "卫衣", "POLO衫"].includes(category)) base = shiftAge(base, -1);
  if (["开襟毛衫", "长袖衬衫", "茄克"].includes(category)) base = shiftAge(base, 1);
  if (["半裙", "牛仔长裤"].includes(category)) base = shiftAge(base, -0.5);

  if (fitType.includes("修身") || styleKeywords.includes("显瘦")) base = boostAge(base, "24-30", 0.08);
  if (styleKeywords.includes("学院") || styleKeywords.includes("休闲")) base = boostAge(base, "20-23", 0.08);
  if (styleKeywords.includes("通勤")) base = boostAge(base, "24-30", 0.06);
  if (fabricSignals.includes("品质保暖") || fabricSignals.includes("品质亲肤")) base = boostAge(base, "31-35", 0.06);

  const entries = Object.entries(base);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return entries.map(([label, score]) => [label, score / total, `Category=${category} age prior`]);
}

function shiftAge(dist: Record<string, number>, direction: number): Record<string, number> {
  const order = ["18-19", "20-23", "24-30", "31-35", "36-40", "41-45", "46-50", "51-60"];
  const result: Record<string, number> = {};
  for (const [label, score] of Object.entries(dist)) {
    const idx = order.indexOf(label);
    const shift = idx + direction;
    const target = order[Math.max(0, Math.min(order.length - 1, Math.round(shift)))] ?? label;
    result[target] = (result[target] ?? 0) + score * 0.7;
    result[label] = (result[label] ?? 0) + score * 0.3;
  }
  return result;
}

function boostAge(dist: Record<string, number>, label: string, amount: number): Record<string, number> {
  const result = { ...dist };
  result[label] = (result[label] ?? 0) + amount;
  return result;
}

function buildSpendingPrior(fabricSignals: string[], styleKeywords: string[], functionSignals: string[]): Array<[string, number, string]> {
  let high = 0.25;
  let mid = 0.45;
  let low = 0.3;

  if (fabricSignals.includes("环保品质") || fabricSignals.includes("品质亲肤") || fabricSignals.includes("品质保暖")) high += 0.12;
  if (styleKeywords.includes("高级")) high += 0.08;
  if (functionSignals.includes("科技功能") || functionSignals.includes("功能户外")) mid += 0.08;
  if (styleKeywords.includes("休闲") || styleKeywords.includes("基础")) low += 0.08;

  const total = high + mid + low;
  return [
    ["高消费", high / total, "Fabric/style spending signal"],
    ["中消费", mid / total, "Fabric/style spending signal"],
    ["低消费", low / total, "Fabric/style spending signal"],
  ];
}

function buildCityPrior(styleKeywords: string[], category: string): Array<[string, number, string]> {
  let high = 0.45;
  let low = 0.55;
  if (styleKeywords.includes("通勤") || styleKeywords.includes("高级") || styleKeywords.includes("设计感")) high += 0.12;
  if (styleKeywords.includes("休闲") || styleKeywords.includes("学院")) low += 0.08;
  if (["茄克", "长袖衬衫"].includes(category)) high += 0.05;
  const total = high + low;
  return [
    ["一线", high * 0.35 / total, "Style/city tier signal"],
    ["新一线", high * 0.35 / total, "Style/city tier signal"],
    ["二线", high * 0.2 / total, "Style/city tier signal"],
    ["三线", low * 0.35 / total, "Style/city tier signal"],
    ["四线", low * 0.35 / total, "Style/city tier signal"],
    ["五线", low * 0.2 / total, "Style/city tier signal"],
    ["六线", low * 0.1 / total, "Style/city tier signal"],
  ];
}

function buildConsumerGroupPrior(styleKeywords: string[], fabricSignals: string[], functionSignals: string[], gender: string): Array<[string, number, string]> {
  const groups: Record<string, number> = {
    "GenZ": 0.12,
    "新锐白领": 0.22,
    "精致妈妈": 0.15,
    "都市蓝领": 0.12,
    "小镇青年": 0.14,
    "资深中产": 0.1,
    "都市银发": 0.05,
    "小镇中老年": 0.1,
  };

  if (styleKeywords.includes("通勤") || styleKeywords.includes("设计感")) groups["新锐白领"] += 0.1;
  if (fabricSignals.includes("亲肤品质") || fabricSignals.includes("品质保暖")) groups["精致妈妈"] += 0.1;
  if (styleKeywords.includes("学院") || styleKeywords.includes("休闲")) groups["GenZ"] += 0.08;
  if (functionSignals.includes("功能户外") || styleKeywords.includes("工装")) groups["都市蓝领"] += 0.08;
  if (styleKeywords.includes("复古") || styleKeywords.includes("街头")) groups["小镇青年"] += 0.06;
  if (styleKeywords.includes("高级")) groups["资深中产"] += 0.06;
  if (gender === "男") groups["都市蓝领"] += 0.04;

  const total = Object.values(groups).reduce((sum, v) => sum + v, 0);
  return Object.entries(groups).map(([label, score]) => [label, score / total, "Style/fabric/function consumer group signal"]);
}

function buildLifeStagePrior(styleKeywords: string[], category: string, gender: string, fabricSignals: string[]): Array<[string, number, string]> {
  const stages: Record<string, number> = {
    "单身": 0.2,
    "新婚": 0.15,
    "二人世界": 0.2,
    "家有小学生": 0.1,
    "家有中学生": 0.1,
    "家有婴幼儿": 0.1,
    "成熟期": 0.1,
    "养老期": 0.05,
  };

  if (styleKeywords.includes("通勤") || styleKeywords.includes("设计感")) stages["二人世界"] += 0.08;
  if (fabricSignals.some((s: string) => s.includes("亲肤"))) stages["家有婴幼儿"] += 0.06;
  if (styleKeywords.includes("学院") || styleKeywords.includes("休闲")) stages["单身"] += 0.06;
  if (gender === "男" && ["茄克", "长袖衬衫"].includes(category)) stages["成熟期"] += 0.05;

  const total = Object.values(stages).reduce((sum, v) => sum + v, 0);
  return Object.entries(stages).map(([label, score]) => [label, score / total, "Style/category life stage signal"]);
}

function applyStyleRules(features: ProductFeatures, predictions: RawPrediction[]): RawPrediction[] {
  const newPredictions = [...predictions];

  // Map style keywords to interest dimensions
  const interestMappings: Array<{ keyword: string; labelType: string; label: string; weight: number }> = [
    { keyword: "运动", labelType: "抖音视频观看兴趣分类", label: "运动", weight: 0.25 },
    { keyword: "户外", labelType: "抖音视频观看兴趣分类", label: "户外", weight: 0.2 },
    { keyword: "科技", labelType: "抖音视频观看兴趣分类", label: "科技", weight: 0.2 },
    { keyword: "设计感", labelType: "抖音视频观看兴趣分类", label: "创意", weight: 0.18 },
    { keyword: "复古", labelType: "抖音视频观看兴趣分类", label: "时尚", weight: 0.15 },
    { keyword: "通勤", labelType: "抖音视频观看兴趣分类", label: "职场", weight: 0.15 },
    { keyword: "甜美", labelType: "抖音视频观看兴趣分类", label: "美妆", weight: 0.12 },
    { keyword: "高级", labelType: "抖音视频观看兴趣分类", label: "汽车", weight: 0.1 },
  ];

  for (const { keyword, labelType, label, weight } of interestMappings) {
    if (features.styleKeywords.includes(keyword) || features.functionSignals.includes("科技功能") || features.ipSignals.includes("科技国潮")) {
      newPredictions.push({
        labelType,
        label,
        score: weight,
        tgi: null,
        evidence: [evidence("FAB/风格", keyword, `style->interest-${keyword}`, labelType, label, "increase", weight, `Style keyword ${keyword} boosts interest ${label}.`)],
      });
    }
  }

  // Fit type -> age/scene signals
  if (features.fitType.includes("修身") || features.fitType.includes("紧身")) {
    newPredictions.push({
      labelType: "预测年龄段",
      label: "24-30",
      score: 0.1,
      tgi: null,
      evidence: [evidence("版型", features.fitType, "fit->age", "预测年龄段", "24-30", "increase", 0.1, "修身版型倾向24-30岁职场人群")],
    });
  }
  if (features.fitType.includes("宽松") || features.fitType.includes("阔腿")) {
    newPredictions.push({
      labelType: "预测年龄段",
      label: "20-23",
      score: 0.08,
      tgi: null,
      evidence: [evidence("版型", features.fitType, "fit->age", "预测年龄段", "20-23", "increase", 0.08, "宽松版型倾向年轻休闲人群")],
    });
  }

  return newPredictions;
}

function applyIpFunctionRules(features: ProductFeatures, predictions: RawPrediction[]): RawPrediction[] {
  const newPredictions = [...predictions];

  if (features.ipSignals.includes("科技国潮") || features.functionSignals.includes("科技功能")) {
    newPredictions.push({
      labelType: "抖音视频观看兴趣分类",
      label: "科技",
      score: 0.25,
      tgi: null,
      evidence: [evidence("IP/功能", features.ipCollaboration || features.specialFunctionOrMaterial, "ip->interest", "抖音视频观看兴趣分类", "科技", "increase", 0.25, "航天/科技IP或功能材质提升科技兴趣")],
    });
    newPredictions.push({
      labelType: "八大消费群体",
      label: "GenZ",
      score: 0.1,
      tgi: null,
      evidence: [evidence("IP/功能", features.ipCollaboration || features.specialFunctionOrMaterial, "ip->group", "八大消费群体", "GenZ", "increase", 0.1, "科技国潮吸引GenZ")],
    });
  }

  if (features.functionSignals.includes("功能户外")) {
    newPredictions.push({
      labelType: "抖音视频观看兴趣分类",
      label: "户外",
      score: 0.2,
      tgi: null,
      evidence: [evidence("功能", features.specialFunctionOrMaterial, "function->interest", "抖音视频观看兴趣分类", "户外", "increase", 0.2, "三防/防护功能提升户外兴趣")],
    });
  }

  if (features.ipSignals.includes("潮流联名")) {
    newPredictions.push({
      labelType: "抖音视频观看兴趣分类",
      label: "时尚",
      score: 0.18,
      tgi: null,
      evidence: [evidence("IP", features.ipCollaboration, "ip->interest", "抖音视频观看兴趣分类", "时尚", "increase", 0.18, "IP联名提升时尚兴趣")],
    });
  }

  return newPredictions;
}

function fillRemainingDimensions(predictions: RawPrediction[], anchor: ParsedPortraitAnchor, topNPerDimension: number): RawPrediction[] {
  const existing = new Set(predictions.map((p) => `${p.labelType}::${p.label}`));
  const anchorRows = [...anchor.rows];

  // For dimensions not yet touched, copy top-N anchor labels as weak prior
  const byDimension = new Map<string, Array<{ label: string; share: number; tgi: number | null }>>();
  for (const row of anchorRows) {
    if (row.share === null) continue;
    const list = byDimension.get(row.labelType) ?? [];
    list.push({ label: row.label, share: row.share, tgi: row.tgi });
    byDimension.set(row.labelType, list);
  }

  const result = [...predictions];
  for (const [labelType, labels] of byDimension) {
    const alreadyHas = predictions.some((p) => p.labelType === labelType);
    if (alreadyHas) continue;
    const top = labels.sort((a, b) => b.share - a.share).slice(0, topNPerDimension);
    for (const row of top) {
      if (existing.has(`${labelType}::${row.label}`)) continue;
      result.push({
        labelType,
        label: row.label,
        score: row.share * 0.3, // weak prior only
        tgi: row.tgi,
        evidence: [evidence("anchor", ANCHOR_SKU_ID, "anchor-weak-prior", labelType, row.label, "set_prior", 0.1, `No direct rule for ${labelType}; weak prior from anchor.`)],
      });
      existing.add(`${labelType}::${row.label}`);
    }
  }

  return result;
}

function calibrate(predictions: RawPrediction[], anchor: ParsedPortraitAnchor, topNPerDimension: number): PlatformPortraitRow[] {
  const byDimension = new Map<string, RawPrediction[]>();
  for (const p of predictions) {
    const list = byDimension.get(p.labelType) ?? [];
    list.push(p);
    byDimension.set(p.labelType, list);
  }

  const rows: PlatformPortraitRow[] = [];
  for (const [labelType, dimPredictions] of byDimension) {
    // Aggregate scores by label
    const byLabel = new Map<string, { score: number; tgi: number | null; evidence: PortraitEvidence[] }>();
    for (const p of dimPredictions) {
      const current = byLabel.get(p.label) ?? { score: 0, tgi: p.tgi, evidence: [] };
      current.score += p.score;
      current.evidence.push(...p.evidence);
      if (current.tgi === null && p.tgi !== null) current.tgi = p.tgi;
      byLabel.set(p.label, current);
    }

    // Sort and take top N
    const sorted = [...byLabel.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, topNPerDimension);
    const totalScore = sorted.reduce((sum, [, v]) => sum + v.score, 0) || 1;

    // Normalize to sum to 1 for closed dimensions; keep raw for open dimensions
    const closedDimensions = new Set(["预测性别", "预测年龄段", "预测消费能力", "城市等级", "预测人生阶段", "八大消费群体"]);
    const isClosed = closedDimensions.has(labelType);

    for (const [label, value] of sorted) {
      const share = isClosed ? value.score / totalScore : Math.min(1, value.score);
      rows.push({
        labelType,
        label,
        share: round2(share),
        tgi: value.tgi,
        source: "single_product_portrait_rule_baseline",
        confidence: round2(Math.min(1, 0.35 + value.evidence.length * 0.08)),
        evidence: dedupeEvidence(value.evidence).slice(0, 5),
        qualityFlags: [],
      });
    }
  }

  return rows;
}

function dedupeEvidence(evidenceList: PortraitEvidence[]): PortraitEvidence[] {
  const seen = new Set<string>();
  return evidenceList.filter((e) => {
    const key = `${e.ruleId}::${e.targetLabelType}::${e.targetLabel}::${e.effect}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// PLS bridge
// ---------------------------------------------------------------------------

const PLS_BRIDGE_MAP: Array<{ labelType: string; label: string; tagId: string; confidence: number }> = [
  { labelType: "预测性别", label: "女", tagId: "demo.female", confidence: 0.85 },
  { labelType: "预测性别", label: "男", tagId: "demo.male", confidence: 0.85 },
  { labelType: "预测年龄段", label: "18-19", tagId: "demo.age_18_24", confidence: 0.7 },
  { labelType: "预测年龄段", label: "20-23", tagId: "demo.age_18_24", confidence: 0.75 },
  { labelType: "预测年龄段", label: "24-30", tagId: "demo.age_25_34", confidence: 0.8 },
  { labelType: "预测年龄段", label: "31-35", tagId: "demo.age_25_34", confidence: 0.75 },
  { labelType: "预测年龄段", label: "36-40", tagId: "demo.age_35_44", confidence: 0.7 },
  { labelType: "预测年龄段", label: "41-45", tagId: "demo.age_35_44", confidence: 0.65 },
  { labelType: "预测年龄段", label: "46-50", tagId: "demo.age_45_plus", confidence: 0.65 },
  { labelType: "预测年龄段", label: "51-60", tagId: "demo.age_45_plus", confidence: 0.65 },
  { labelType: "预测消费能力", label: "高消费", tagId: "price.premium", confidence: 0.7 },
  { labelType: "预测消费能力", label: "中消费", tagId: "price.mid", confidence: 0.7 },
  { labelType: "预测消费能力", label: "低消费", tagId: "price.value", confidence: 0.65 },
  { labelType: "城市等级", label: "一线", tagId: "demo.city_high_tier", confidence: 0.75 },
  { labelType: "城市等级", label: "新一线", tagId: "demo.city_high_tier", confidence: 0.75 },
  { labelType: "城市等级", label: "二线", tagId: "demo.city_high_tier", confidence: 0.6 },
  { labelType: "城市等级", label: "三线", tagId: "demo.city_lower_tier", confidence: 0.6 },
  { labelType: "城市等级", label: "四线", tagId: "demo.city_lower_tier", confidence: 0.6 },
  { labelType: "城市等级", label: "五线", tagId: "demo.city_lower_tier", confidence: 0.55 },
  { labelType: "城市等级", label: "六线", tagId: "demo.city_lower_tier", confidence: 0.55 },
  { labelType: "抖音视频观看兴趣分类", label: "运动", tagId: "style.sporty", confidence: 0.55 },
  { labelType: "抖音视频观看兴趣分类", label: "时尚", tagId: "style.trendy", confidence: 0.55 },
  { labelType: "抖音视频观看兴趣分类", label: "创意", tagId: "style.trendy", confidence: 0.5 },
  { labelType: "抖音视频观看兴趣分类", label: "户外", tagId: "style.sporty", confidence: 0.55 },
  { labelType: "抖音视频观看兴趣分类", label: "科技", tagId: "style.street", confidence: 0.5 },
];

function buildPlsBridge(rows: PlatformPortraitRow[], allowedTagIds: Set<string>): SingleProductPortraitPrediction["plsBridge"] {
  const predictedProfileTags: ProfileTagScore[] = [];
  const unmappedPlatformLabels: Array<{ labelType: string; label: string; reason: string }> = [];
  const byTagId = new Map<string, ProfileTagScore>();

  for (const row of rows) {
    const mapping = PLS_BRIDGE_MAP.find((m) => m.labelType === row.labelType && m.label === row.label);
    if (!mapping) {
      unmappedPlatformLabels.push({ labelType: row.labelType, label: row.label, reason: "No approved PLS taxonomy mapping." });
      continue;
    }
    if (!allowedTagIds.has(mapping.tagId)) {
      unmappedPlatformLabels.push({ labelType: row.labelType, label: row.label, reason: `Mapped tagId ${mapping.tagId} not in allowed taxonomy.` });
      continue;
    }
    const current = byTagId.get(mapping.tagId);
    const share = row.share ?? 0;
    const confidence = row.confidence * mapping.confidence;
    if (!current || share > current.score) {
      byTagId.set(mapping.tagId, {
        tagId: mapping.tagId,
        score: round3(share),
        confidence: round3(confidence),
        source: `single_product_portrait_rule_baseline:${row.labelType}:${row.label}`,
        sampleSize: null,
        timeWindow: null,
      });
    }
  }

  for (const tag of byTagId.values()) predictedProfileTags.push(tag);
  predictedProfileTags.sort((a, b) => b.score * b.confidence - a.score * a.confidence);

  const bridgeCoverageRate = rows.length === 0 ? 0 : (rows.length - unmappedPlatformLabels.length) / rows.length;

  return {
    predictedProfileTags,
    unmappedPlatformLabels,
    bridgeCoverageRate: round2(bridgeCoverageRate),
  };
}

// ---------------------------------------------------------------------------
// Main prediction
// ---------------------------------------------------------------------------

export function predictSingleProductPortrait(
  input: SingleProductPortraitInput,
  anchor: ParsedPortraitAnchor,
): SingleProductPortraitPrediction {
  const product = input.product;
  const options = {
    outputTopNPerDimension: input.options?.outputTopNPerDimension ?? 10,
    includeLongTailDimensions: input.options?.includeLongTailDimensions ?? true,
    bridgeToPlsTaxonomy: input.options?.bridgeToPlsTaxonomy ?? true,
  };

  const requiredFields = ["skuId", "gender", "category"] as const;
  const optionalFields = ["fitType", "fabric", "fab", "ipCollaboration", "specialFunctionOrMaterial", "memoryPoint", "subCategory"] as const;

  const missingFields: string[] = [];
  for (const field of requiredFields) {
    if (!product[field]) missingFields.push(field);
  }
  for (const field of optionalFields) {
    if (!product[field]) missingFields.push(field);
  }
  const usedFields = [...requiredFields, ...optionalFields].filter((f) => product[f]);

  const requiredFieldCoverage = requiredFields.filter((f) => product[f]).length / requiredFields.length;
  const optionalSignalCoverage = optionalFields.filter((f) => product[f]).length / optionalFields.length;

  const parsedProduct: ParsedProductRow = {
    skuId: product.skuId,
    gender: product.gender,
    brand: product.brand,
    productName: product.productName ?? "",
    category: product.category,
    year: product.year ?? null,
    season: product.season ?? "",
    productLifecycle: product.productLifecycle ?? "",
    mentalProduct: product.mentalProduct ?? "",
    ipCollaboration: product.ipCollaboration ?? "",
    specialFunctionOrMaterial: product.specialFunctionOrMaterial ?? "",
    memoryPoint: product.memoryPoint ?? "",
    subCategory: product.subCategory ?? "",
    groupTag: product.groupTag ?? "",
    fitType: product.fitType ?? "",
    fabric: product.fabric ?? "",
    fab: product.fab ?? "",
    specification: product.specification ?? "",
    collarType: product.collarType ?? "",
    length: product.length ?? "",
    productNote: product.productNote ?? "",
    historicalSales25Q3: product.historicalSales25Q3 ?? null,
    plannedSales26Q3: product.plannedSales26Q3 ?? null,
  };

  const features = extractFeatures(parsedProduct);
  const priors = anchorPriors(anchor);

  let predictions = applyBaseRules(features, priors);
  predictions = applyStyleRules(features, predictions);
  predictions = applyIpFunctionRules(features, predictions);
  if (options.includeLongTailDimensions) {
    predictions = fillRemainingDimensions(predictions, anchor, options.outputTopNPerDimension);
  }

  const platformPortraitRows = calibrate(predictions, anchor, options.outputTopNPerDimension);

  // Build dimension summaries
  const byDimension = new Map<string, PlatformPortraitRow[]>();
  for (const row of platformPortraitRows) {
    const list = byDimension.get(row.labelType) ?? [];
    list.push(row);
    byDimension.set(row.labelType, list);
  }
  const dimensionSummaries = [...byDimension.entries()].map(([labelType, rows]) => ({
    labelType,
    topLabels: rows.slice(0, 3).map((r) => ({ label: r.label, share: r.share, tgi: r.tgi, confidence: r.confidence })),
    qualityFlags: rows.some((r) => r.evidence.length === 0) ? ["anchor_weak_prior"] : [],
  }));

  const riskFlags: SingleProductPortraitRisk[] = [
    "baseline_not_trained_model",
    "single_anchor_only",
    "manual_rule_weight",
  ];
  if (requiredFieldCoverage < 1) riskFlags.push("low_input_coverage");
  if (anchor.anomalyRows.length > 0) riskFlags.push("csv_source_row_anomaly");

  const allowedTagIds = loadAllowedTagIds();
  const plsBridge = options.bridgeToPlsTaxonomy ? buildPlsBridge(platformPortraitRows, allowedTagIds) : undefined;
  if (plsBridge && plsBridge.unmappedPlatformLabels.length > 0) riskFlags.push("platform_label_unmapped");

  const explanationSources = platformPortraitRows.flatMap((r) => r.evidence);

  return {
    skuId: product.skuId,
    generatedAt: new Date().toISOString(),
    modelVersion: SINGLE_PRODUCT_PORTRAIT_MODEL_VERSION,
    modelPath: "rule_baseline",
    sourceType: "derived",
    anchorSkuId: ANCHOR_SKU_ID,
    inputCoverage: {
      requiredFieldCoverage: round2(requiredFieldCoverage),
      optionalSignalCoverage: round2(optionalSignalCoverage),
      usedFields,
      missingFields,
    },
    platformPortraitRows,
    dimensionSummaries,
    plsBridge,
    riskFlags: [...new Set(riskFlags)].sort(),
    explanationSources,
  };
}

export function predictSingleProductPortraitFromRow(
  row: ParsedProductRow,
  anchor: ParsedPortraitAnchor,
  options?: SingleProductPortraitInput["options"],
): SingleProductPortraitPrediction {
  const input: SingleProductPortraitInput = {
    product: {
      skuId: row.skuId,
      gender: row.gender,
      brand: row.brand,
      productName: row.productName,
      category: row.category,
      year: row.year ?? undefined,
      season: row.season,
      productLifecycle: row.productLifecycle,
      mentalProduct: row.mentalProduct,
      ipCollaboration: row.ipCollaboration,
      specialFunctionOrMaterial: row.specialFunctionOrMaterial,
      memoryPoint: row.memoryPoint,
      subCategory: row.subCategory,
      groupTag: row.groupTag,
      fitType: row.fitType,
      fabric: row.fabric,
      fab: row.fab,
      specification: row.specification,
      collarType: row.collarType,
      length: row.length,
      productNote: row.productNote,
      historicalSales25Q3: row.historicalSales25Q3,
      plannedSales26Q3: row.plannedSales26Q3,
    },
    options,
  };
  return predictSingleProductPortrait(input, anchor);
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

export interface RunSingleProductOptions {
  xlsxPath: string;
  csvPath: string;
  skuId?: string;
  outputPath?: string;
  outputTopNPerDimension?: number;
  includeLongTailDimensions?: boolean;
  bridgeToPlsTaxonomy?: boolean;
}

export interface AnchorBacktestResult {
  skuId: string;
  predictedTopLabels: Array<{ labelType: string; label: string; share: number | null }>;
  actualTopLabels: Array<{ labelType: string; label: string; share: number | null }>;
  overlapAt3: number;
}

export interface RunSingleProductPortraitResult {
  products: ParsedProductRow[];
  anchor: ParsedPortraitAnchor;
  predictions: SingleProductPortraitPrediction[];
  anchorStatus: "found" | "missing";
  anchorBacktest?: AnchorBacktestResult;
  anchorMissingRisk?: "anchor_product_attributes_missing";
}

export function runSingleProductPortrait(options: RunSingleProductOptions): RunSingleProductPortraitResult {
  const products = parseProductXlsx(options.xlsxPath);
  const anchor = parsePortraitCsv(options.csvPath);
  const predictions: SingleProductPortraitPrediction[] = [];

  let targetProducts = products;
  if (options.skuId) {
    targetProducts = products.filter((p) => p.skuId === options.skuId);
    if (targetProducts.length === 0) {
      throw new Error(`skuId ${options.skuId} not found in ${options.xlsxPath}`);
    }
  }

  for (const product of targetProducts) {
    predictions.push(predictSingleProductPortraitFromRow(product, anchor, {
      outputTopNPerDimension: options.outputTopNPerDimension,
      includeLongTailDimensions: options.includeLongTailDimensions,
      bridgeToPlsTaxonomy: options.bridgeToPlsTaxonomy,
    }));
  }

  let anchorBacktest: AnchorBacktestResult | undefined;
  const anchorProduct = products.find((p) => p.skuId === ANCHOR_SKU_ID);
  const anchorStatus: RunSingleProductPortraitResult["anchorStatus"] = anchorProduct ? "found" : "missing";

  if (anchorProduct) {
    const anchorPrediction = predictSingleProductPortraitFromRow(anchorProduct, anchor, {
      outputTopNPerDimension: 3,
      includeLongTailDimensions: true,
      bridgeToPlsTaxonomy: false,
    });

    const predictedTopLabels = anchorPrediction.dimensionSummaries
      .filter((d) => ["预测性别", "预测年龄段", "预测消费能力", "八大消费群体", "城市等级"].includes(d.labelType))
      .map((d) => ({ labelType: d.labelType, label: d.topLabels[0]?.label ?? "", share: d.topLabels[0]?.share ?? null }));

    const actualTopByDimension = new Map<string, { label: string; share: number }>();
    for (const row of anchor.rows) {
      if (row.share === null) continue;
      const current = actualTopByDimension.get(row.labelType);
      if (!current || row.share > current.share) {
        actualTopByDimension.set(row.labelType, { label: row.label, share: row.share });
      }
    }
    const actualTopLabels = [...actualTopByDimension.entries()]
      .filter(([labelType]) => ["预测性别", "预测年龄段", "预测消费能力", "八大消费群体", "城市等级"].includes(labelType))
      .map(([labelType, value]) => ({ labelType, label: value.label, share: value.share }));

    const predictedKeys = new Set(predictedTopLabels.map((p) => `${p.labelType}::${p.label}`));
    const overlap = actualTopLabels.filter((a) => predictedKeys.has(`${a.labelType}::${a.label}`)).length;

    anchorBacktest = {
      skuId: ANCHOR_SKU_ID,
      predictedTopLabels,
      actualTopLabels,
      overlapAt3: overlap,
    };
  }

  if (options.outputPath) {
    writeFileSync(options.outputPath, JSON.stringify({ products: targetProducts.map((p) => p.skuId), predictions, anchorStatus, anchorBacktest }, null, 2));
  }

  const result: RunSingleProductPortraitResult = { products, anchor, predictions, anchorStatus, anchorBacktest };
  if (anchorStatus === "missing") {
    result.anchorMissingRisk = "anchor_product_attributes_missing";
  }
  return result;
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
