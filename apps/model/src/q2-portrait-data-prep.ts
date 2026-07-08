/**
 * Convert the user-provided Q2 portrait training data into the standard
 * single-product portrait sample package format.
 *
 * Inputs:
 * - /Users/huangbo/Downloads/Q2有画像款.xlsx
 * - /Users/huangbo/Downloads/单款画像/*.csv
 *
 * Output:
 * - data/local/single-product-portrait-q2-73sample/ (standard package)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const XLSX_PATH = "/Users/huangbo/Downloads/Q2有画像款.xlsx";
const PORTRAIT_DIR = "/Users/huangbo/Downloads/单款画像";
const OUTPUT_DIR = "../../data/local/single-product-portrait-q2-73sample";

interface Q2ProductRow {
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
}

const XLSX_FIELD_MAP: Record<string, keyof Q2ProductRow> = {
  "款号": "skuId",
  "品牌": "brand",
  "商品名称": "productName",
  "性别修正": "gender",
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

function parseProductXlsx(filePath: string): Q2ProductRow[] {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error(`No sheet found in ${filePath}`);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows.map((raw) => {
    const mapped: Partial<Q2ProductRow> = {};
    for (const [header, key] of Object.entries(XLSX_FIELD_MAP)) {
      const value = raw[header];
      if (key === "year") {
        mapped[key] = normalizeNumber(value) as never;
      } else {
        mapped[key] = normalizeString(value) as never;
      }
    }
    return mapped as Q2ProductRow;
  });
}

function parsePortraitCsv(filePath: string): {
  skuId: string;
  rows: Array<{
    labelType: string;
    label: string;
    share: number | null;
    tgi: number | null;
  }>;
  anomalyRows: Array<{ rowIndex: number; raw: string; fieldCount: number }>;
} {
  const content = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const rows: Array<{ labelType: string; label: string; share: number | null; tgi: number | null }> = [];
  const anomalyRows: Array<{ rowIndex: number; raw: string; fieldCount: number }> = [];

  let headerFieldCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0) {
      headerFieldCount = line.split(",").length;
      continue;
    }
    const fields = line.split(",");
    if (fields.length !== headerFieldCount) {
      anomalyRows.push({ rowIndex: i, raw: line, fieldCount: fields.length });
      continue;
    }
    const labelType = fields[0]!;
    const label = fields[1]!;
    const shareStr = fields[2]!;
    const tgiStr = fields[3]!;

    const parseShare = (value: string): number | null => {
      const clean = value.trim().replace(/%/g, "");
      if (clean === "" || clean === "-" || clean === "—") return null;
      const n = Number(clean);
      return Number.isFinite(n) ? n / 100 : null;
    };

    const parseTgi = (value: string): number | null => {
      const clean = value.trim();
      if (clean === "" || clean === "-" || clean === "—") return null;
      const n = Number(clean);
      return Number.isFinite(n) ? n : null;
    };

    rows.push({
      labelType: labelType.trim(),
      label: label.trim(),
      share: parseShare(shareStr),
      tgi: parseTgi(tgiStr),
    });
  }

  const skuId = lines[0]?.split(",")[2]?.replace(/-占比$/, "").trim() ?? "";
  return { skuId, rows, anomalyRows };
}

function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const products = parseProductXlsx(XLSX_PATH);
  console.log(`Parsed ${products.length} products from ${XLSX_PATH}`);

  // Fill missing fitType with X型
  let filledCount = 0;
  for (const p of products) {
    if (!p.fitType) {
      p.fitType = "X型";
      filledCount++;
    }
  }
  console.log(`Filled ${filledCount} missing fitType with "X型"`);

  // Match portraits
  const portraitFiles = readdirSync(PORTRAIT_DIR).filter((f) => f.endsWith(".csv"));
  const productBySku = new Map(products.map((p) => [p.skuId, p]));
  const matched: Array<{ product: Q2ProductRow; portrait: ReturnType<typeof parsePortraitCsv> }> = [];
  const unmatchedProducts: string[] = [];
  const unmatchedPortraits: string[] = [];

  for (const product of products) {
    const expectedFile = `${product.skuId}画像数据.csv`;
    if (!portraitFiles.includes(expectedFile)) {
      unmatchedProducts.push(product.skuId);
      continue;
    }
    const portrait = parsePortraitCsv(join(PORTRAIT_DIR, expectedFile));
    matched.push({ product, portrait });
  }

  for (const file of portraitFiles) {
    const skuId = file.replace("画像数据.csv", "");
    if (!productBySku.has(skuId)) {
      unmatchedPortraits.push(skuId);
    }
  }

  console.log(`Matched ${matched.length} product-portrait pairs`);
  if (unmatchedProducts.length > 0) console.log(`Unmatched products: ${unmatchedProducts.join(", ")}`);
  if (unmatchedPortraits.length > 0) console.log(`Unmatched portraits: ${unmatchedPortraits.join(", ")}`);

  // Build package files
  const sourceBatchId = "q2_portrait_train_batch_20260708";
  const dataVersion = "v_q2_20260708";
  const timeWindow = "2026-04-01/2026-06-30";
  const source = "q2_single_product_portrait_training";
  const sourceType = "real_sample";

  const allowedLabelTypes = [
    "预测性别",
    "预测年龄段",
    "预测消费能力",
    "城市等级",
    "八大消费群体",
    "预测人生阶段",
    "抖音视频观看兴趣分类",
    "电商品类成交偏好",
    "电商品牌成交偏好",
    "触点互动偏好",
    "地域分布",
    "城市",
    "手机品牌",
    "手机价格",
    "头条用户阅读兴趣分类",
    "西瓜视频观看兴趣分类",
    "抖音视频观看兴趣分类v2",
    "美妆行业特色人群",
    "电商消费频次",
    "电商消费金额",
  ];

  const manifest = {
    packageType: "single-product-portrait-sample",
    packageVersion: "0.1",
    sourceBatchId,
    dataVersion,
    generatedAt: new Date().toISOString(),
    source,
    sourceType,
    workspaceId: "ws_demo",
    timeWindows: [timeWindow],
    allowedLabelTypes,
    inputSources: [
      {
        sourceId: "q2_portrait_training_v1",
        sourceName: "Q2 有画像款训练数据",
        sourceType: "real_sample",
        description: "73 Q2 products with platform portrait. Used for supervised model training.",
      },
    ],
    entityCounts: {
      productAttributes: matched.length,
      platformPortraitRows: matched.reduce((sum, m) => sum + m.portrait.rows.length, 0),
      fieldMappingRows: 8,
      abnormalRows: matched.reduce((sum, m) => sum + m.portrait.anomalyRows.length, 0),
    },
    calibrationReadiness: {
      minimumValidProducts: 5,
      currentValidProducts: matched.length,
      readyForSmallSampleCalibration: matched.length >= 5,
    },
  };

  const productAttributes = matched.map(({ product }) => ({
    skuId: product.skuId,
    sourceProductKey: product.skuId,
    brand: product.brand,
    productName: product.productName,
    gender: product.gender,
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
    productNote: "",
    historicalSales25Q3: null,
    plannedSales26Q3: null,
    source,
    sourceType,
    sourceBatchId,
    dataVersion,
    generatedAt: new Date().toISOString(),
    timeWindow,
    qualityFlags: ["real_sample"],
  }));

  const portraitRows = matched.flatMap(({ product, portrait }) =>
    portrait.rows.map((r) => ({
      skuId: product.skuId,
      sourceProductKey: product.skuId,
      labelType: r.labelType,
      label: r.label,
      share: r.share,
      tgi: r.tgi,
      source,
      sourceType,
      sourceBatchId,
      dataVersion,
      timeWindow,
      qualityFlags: ["real_sample"],
    })),
  );

  const qualityReport = {
    packageType: "single-product-portrait-sample",
    sourceBatchId,
    dataVersion,
    generatedAt: new Date().toISOString(),
    productAttributeCount: matched.length,
    validProductCount: matched.length,
    platformPortraitRowCount: portraitRows.length,
    fieldMappingRowCount: 8,
    abnormalRowCount: manifest.entityCounts.abnormalRows,
    missingRequiredAttributeCount: 0,
    unboundPortraitRowCount: 0,
    labelTypeCount: new Set(portraitRows.map((r) => r.labelType)).size,
    timeWindows: [timeWindow],
    qualityFlags: ["real_sample"],
    calibrationReadiness: {
      minimumValidProducts: 5,
      currentValidProducts: matched.length,
      missingValidProducts: Math.max(0, 5 - matched.length),
      readyForSmallSampleCalibration: matched.length >= 5,
    },
    shareable: false,
  };

  const fieldMapping = [
    ["sourceObject", "sourceField", "targetObject", "targetField", "mappingRule", "required", "confidence", "owner", "version"],
    ["product_attributes", "skuId", "SingleProductPortraitInput.product", "skuId", "direct", "true", "1.0", "D", "0.1"],
    ["product_attributes", "sourceProductKey", "SingleProductPortraitInput.product", "sourceProductKey", "direct", "true", "1.0", "D", "0.1"],
    ["product_attributes", "fitType", "SingleProductPortraitInput.product", "fitType", "direct", "true", "1.0", "D", "0.1"],
    ["product_attributes", "fabric", "SingleProductPortraitInput.product", "fabric", "direct", "true", "1.0", "D", "0.1"],
    ["product_attributes", "fab", "SingleProductPortraitInput.product", "fab", "direct", "true", "1.0", "D", "0.1"],
    ["platform_portrait", "labelType", "PlatformPortraitRow", "labelType", "platform_passthrough", "true", "1.0", "D", "0.1"],
    ["platform_portrait", "label", "PlatformPortraitRow", "label", "platform_passthrough", "true", "1.0", "D", "0.1"],
  ];

  writeFileSync(join(OUTPUT_DIR, "source_manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(OUTPUT_DIR, "product_attributes.jsonl"), productAttributes.map((p) => JSON.stringify(p)).join("\n"));

  const portraitCsvHeader = "skuId,sourceProductKey,labelType,label,share,tgi,source,sourceType,sourceBatchId,dataVersion,timeWindow,qualityFlags";
  const portraitCsvRows = portraitRows.map((r) =>
    `${r.skuId},${r.sourceProductKey},${r.labelType},${r.label},${r.share ?? ""},${r.tgi ?? ""},${r.source},${r.sourceType},${r.sourceBatchId},${r.dataVersion},${r.timeWindow},${r.qualityFlags.join(";")}`,
  );
  writeFileSync(join(OUTPUT_DIR, "platform_portrait.csv"), [portraitCsvHeader, ...portraitCsvRows].join("\n"));

  writeFileSync(join(OUTPUT_DIR, "quality_report.json"), JSON.stringify(qualityReport, null, 2));
  writeFileSync(join(OUTPUT_DIR, "field_mapping.csv"), fieldMapping.map((row) => row.join(",")).join("\n"));

  console.log(`\nPackage written to ${OUTPUT_DIR}`);
  console.log(`  products: ${productAttributes.length}`);
  console.log(`  portrait rows: ${portraitRows.length}`);
  console.log(`  anomaly rows: ${qualityReport.abnormalRowCount}`);
}

main();
