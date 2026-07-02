#!/usr/bin/env node
// D-P1-F1 Douyin BI data assetization generator.
// Reads user-authorized dashboard source (default
// /Users/huangbo/Downloads/douyin_report_dashboard/data.js) and writes a PLS
// data package under data/p1/douyin-bi/ that A domain can import into SQLite.
//
// Data admission: user-authorized BI data is passed through without privacy
// blocking; original account names, product codes and sales values are
// retained. Downstream domains consume PLS objects rather than raw HTML.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_SOURCE = "/Users/huangbo/Downloads/douyin_report_dashboard/data.js";
const OUTPUT_DIR = path.join(REPO_ROOT, "data", "p1", "douyin-bi");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sourceFile = args.source ?? DEFAULT_SOURCE;
const sourceBatchId = args.batchId ?? "batch_douyin_bi_20260703";
const dataVersion = args.dataVersion ?? "v1_20260703";
const generatedAt = args.generatedAt ?? "2026-07-03T00:00:00Z";
const timeWindow = args.timeWindow ?? "2026-05-01/2026-05-31";
if (!fs.existsSync(sourceFile)) {
  console.error(`[fatal] source not found: ${sourceFile}`);
  process.exit(1);
}

const rawJs = fs.readFileSync(sourceFile, "utf8");
const sourceSize = Buffer.byteLength(rawJs, "utf8");
const sourceHash = crypto.createHash("sha256").update(rawJs).digest("hex");

const sandbox = {};
vm.createContext(sandbox);
const normalizedSource = rawJs.replace(/^\s*const\s+dashboardData\s*=/, "dashboardData =");
vm.runInContext(normalizedSource, sandbox);
const dashboard = sandbox.dashboardData;
if (!dashboard || typeof dashboard !== "object") {
  console.error("[fatal] dashboardData not exported by source");
  process.exit(1);
}

const tableRows = Array.isArray(dashboard.tableData) ? dashboard.tableData : [];
const advantageRows = Array.isArray(dashboard.advantageData) ? dashboard.advantageData : [];
const insightsSheet1 = Array.isArray(dashboard.insightsSheet1) ? dashboard.insightsSheet1 : [];
const insightsSheet2 = Array.isArray(dashboard.insightsSheet2) ? dashboard.insightsSheet2 : [];
const insightsSheet3 = Array.isArray(dashboard.insightsSheet3) ? dashboard.insightsSheet3 : [];
const insightsSheet4 = Array.isArray(dashboard.insightsSheet4) ? dashboard.insightsSheet4 : [];
const multiAccountRawHtml =
  dashboard.multiAccountInsightsRawHTML && typeof dashboard.multiAccountInsightsRawHTML === "object"
    ? dashboard.multiAccountInsightsRawHTML
    : {};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const BASELINE_ACCOUNT_NAME = "森马官方旗舰店(基准)";
const BASELINE_CHANNEL_ID = "douyin_account_semir_official_flagship_baseline";
const ACCOUNT_GROUP_ID = "douyin_semir_official";

const ACCOUNT_KIND_RULES = [
  { pattern: /直播/, kind: "douyin_live_account", channelType: "live_stream" },
  { pattern: /小店|旗舰店|门店/, kind: "douyin_shop", channelType: "shelf_ecommerce" },
  { pattern: /服饰号|穿搭号|潮流|官方号|服饰号$|号$/, kind: "douyin_short_video_account", channelType: "short_video" },
];

const FIVE_DIMENSIONS = ["八大消费群体", "预测性别", "预测消费能力", "预测年龄段", "预测人生阶段"];
const DIMENSION_TAXONOMY = {
  预测性别: "demo",
  预测年龄段: "demo",
  预测消费能力: "price",
  预测人生阶段: "external",
  八大消费群体: "external",
};

const GENDER_TAG = { 女: "demo.female", 男: "demo.male" };
const AGE_TAG = {
  "18-23": "demo.age_18_24",
  "20-23": "demo.age_18_24",
  "24-30": "demo.age_25_34",
  "25-34": "demo.age_25_34",
  "31-35": "demo.age_25_34",
  "36-40": "demo.age_35_44",
  "35-40": "demo.age_35_44",
  "41-45": "demo.age_45_plus",
  "45+": "demo.age_45_plus",
  "45岁+": "demo.age_45_plus",
};
const CONSUMPTION_TAG = {
  高消费: "price.premium",
  中高消费: "price.premium",
  中消费: "price.mid",
  中低消费: "price.value",
  低消费: "price.value",
};
const CITY_TIER_TAG = {
  一线城市: "demo.city_high_tier",
  新一线城市: "demo.city_high_tier",
  二线城市: "demo.city_high_tier",
  三线城市: "demo.city_lower_tier",
  四线城市: "demo.city_lower_tier",
  五线城市: "demo.city_lower_tier",
};

const TAXONOMY_WHITELIST = new Set([
  "demo.age_18_24",
  "demo.age_25_34",
  "demo.age_35_44",
  "demo.age_45_plus",
  "demo.female",
  "demo.male",
  "demo.city_high_tier",
  "demo.city_lower_tier",
  "price.value",
  "price.mid",
  "price.premium",
  "price.promo_sensitive",
  "price.new_arrival_sensitive",
]);
function stableChannelIdForAccount(name) {
  const slug = crypto.createHash("sha1").update(name).digest("hex").slice(0, 10);
  return `douyin_account_${slug}`;
}

function resolveAccountKind(name) {
  for (const rule of ACCOUNT_KIND_RULES) {
    if (rule.pattern.test(name)) {
      return { accountKind: rule.kind, channelType: rule.channelType };
    }
  }
  return { accountKind: "douyin_account", channelType: "short_video" };
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim().replace(/%$/, "").replace(/,/g, "");
  if (s === "") return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function ratioFromPercent(value) {
  const n = safeNumber(value);
  if (n === null) return null;
  return n > 1 ? Number((n / 100).toFixed(6)) : Number(n.toFixed(6));
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDistribution(raw) {
  if (raw === null || raw === undefined) return [];
  const text = String(raw).trim();
  if (text === "" || text === "0") return [];
  const parts = text.replace(/，/g, "、").split("、").map((s) => s.trim()).filter(Boolean);
  const buckets = [];
  for (const part of parts) {
    const match = part.match(/^(.*?)[\(（]([\-+.\d]+)%[\)）]$/);
    if (match) {
      const label = match[1].trim();
      const percent = Number(match[2]);
      if (label !== "" && Number.isFinite(percent)) {
        buckets.push({
          label,
          sharePercent: percent,
          shareRatio: Number((percent / 100).toFixed(6)),
        });
      }
    } else {
      buckets.push({ label: part, sharePercent: null, shareRatio: null });
    }
  }
  return buckets;
}

function pickTagId(dimension, label) {
  if (!label) return null;
  const table =
    dimension === "demo_gender"
      ? GENDER_TAG
      : dimension === "demo_age"
      ? AGE_TAG
      : dimension === "price_power"
      ? CONSUMPTION_TAG
      : dimension === "demo_city_tier"
      ? CITY_TIER_TAG
      : null;
  if (!table) return null;
  if (table[label]) return table[label];
  for (const [key, tag] of Object.entries(table)) {
    if (label.includes(key)) return tag;
  }
  return null;
}

function mapProfileDistributionTags(profileDistribution, sampleSize) {
  const tags = [];
  const unmapped = [];
  const push = (dimension, tagId, source, entry) => {
    if (!entry) return;
    if (!tagId) {
      unmapped.push({
        sourceField: source,
        sourceLabel: entry.label,
        sharePercent: entry.sharePercent,
        reason: "not_in_taxonomy",
      });
      return;
    }
    const score = entry.shareRatio ?? 0;
    const confidence = entry.shareRatio ? Number(Math.min(0.9, 0.5 + entry.shareRatio * 0.4).toFixed(3)) : 0.4;
    tags.push({
      dimension,
      tagId,
      score,
      confidence,
      sourceField: source,
      sourceLabel: entry.label,
      sampleSize: sampleSize ?? null,
    });
  };
  for (const [key, buckets] of Object.entries(profileDistribution)) {
    if (!Array.isArray(buckets) || buckets.length === 0) continue;
    if (key === "预测性别_提取结果(占比)") {
      buckets.forEach((b) => push("demo", pickTagId("demo_gender", b.label), key, b));
    } else if (key === "预测年龄段_提取结果(占比)") {
      buckets.forEach((b) => push("demo", pickTagId("demo_age", b.label), key, b));
    } else if (key === "预测消费能力_提取结果(占比)") {
      buckets.forEach((b) => push("price", pickTagId("price_power", b.label), key, b));
    } else if (key === "城市等级_提取结果(占比)") {
      buckets.forEach((b) => push("demo", pickTagId("demo_city_tier", b.label), key, b));
    } else {
      buckets.forEach((b) => push("external", null, key, b));
    }
  }
  return { tags, unmapped };
}

function writeJson(name, payload) {
  const outPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return outPath;
}

function writeJsonl(name, rows) {
  const outPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  return outPath;
}

function writeCsv(name, header, rows) {
  const outPath = path.join(OUTPUT_DIR, name);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((h) => escape(row[h])).join(","));
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  return outPath;
}

function upsertKeyOf(fields, values) {
  if (!Array.isArray(values) || values.length !== fields.length) {
    throw new Error(`upsertKeyOf: values length mismatch for fields=${fields.join(",")}`);
  }
  const payload = values
    .map((v) => (v === null || v === undefined ? "__null__" : String(v)))
    .join("|");
  return {
    fields,
    hash: crypto.createHash("sha1").update(fields.join(",") + "::" + payload).digest("hex").slice(0, 16),
  };
}
// ---------------- accounts ----------------

const accountNamesFromReports = Object.keys(multiAccountRawHtml);
const accountRecords = [];
const accountByName = new Map();

function registerAccount(name, opts = {}) {
  if (accountByName.has(name)) return accountByName.get(name);
  const kind = resolveAccountKind(name);
  const channelId = opts.channelId ?? stableChannelIdForAccount(name);
  const rec = {
    channelId,
    accountGroupId: ACCOUNT_GROUP_ID,
    accountName: name,
    accountKind: kind.accountKind,
    platformType: "content_ecommerce",
    channelType: kind.channelType,
    displayNamePolicy: "user_authorized",
    displayName: name,
    isBaseline: Boolean(opts.isBaseline) || false,
    source: "douyin_report_dashboard",
    sourceType: "user_authorized",
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    upsertKey: null,
    hasReport: false,
    hasBenchmarkTags: false,
  };
  rec.upsertKey = upsertKeyOf(
    ["channelId", "sourceBatchId", "dataVersion"],
    [rec.channelId, sourceBatchId, dataVersion],
  );
  accountByName.set(name, rec);
  accountRecords.push(rec);
  return rec;
}

// baseline account (from insightsSheet1 + semirCoreTagsHtml)
if (insightsSheet1.length > 0) {
  const baseline = registerAccount(BASELINE_ACCOUNT_NAME, {
    channelId: BASELINE_CHANNEL_ID,
    isBaseline: true,
  });
  baseline.hasBenchmarkTags = true;
}

for (const name of accountNamesFromReports) {
  const rec = registerAccount(name);
  rec.hasReport = true;
}

// account benchmark tags come from insightsSheet1 (all rows describe baseline)
const accountBenchmarkTagRows = insightsSheet1.map((row, index) => {
  const dimension = normalizeText(row["标签维度"]);
  const label = normalizeText(row["选项"]);
  const sharePercent = safeNumber(row["账号占比%"]);
  const shareRatio = ratioFromPercent(row["账号占比%"]);
  const top1Flag = normalizeText(row["TOP1标记"]);
  const decisionMethod = normalizeText(row["判定方式"]);
  const businessInterpretation = normalizeText(row["业务解读"]);
  const taxonomyDim =
    dimension === "预测性别"
      ? "demo"
      : dimension === "预测年龄段"
      ? "demo"
      : dimension === "预测消费能力"
      ? "price"
      : dimension === "预测人生阶段"
      ? "external"
      : dimension === "八大消费群体"
      ? "external"
      : "external";
  let mappedTagId = null;
  if (dimension === "预测性别") mappedTagId = pickTagId("demo_gender", label);
  else if (dimension === "预测年龄段") mappedTagId = pickTagId("demo_age", label);
  else if (dimension === "预测消费能力") mappedTagId = pickTagId("price_power", label);
  return {
    channelId: BASELINE_CHANNEL_ID,
    accountName: BASELINE_ACCOUNT_NAME,
    dimension,
    dimensionTaxonomy: taxonomyDim,
    optionLabel: label,
    sharePercent,
    shareRatio,
    top1Flag,
    decisionMethod,
    businessInterpretation,
    mappedTagId,
    mappingConfidence: mappedTagId ? 0.9 : 0,
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    sampleSize: null,
    upsertKey: upsertKeyOf(
      ["channelId", "dimension", "optionLabel", "sourceBatchId", "dataVersion"],
      [BASELINE_CHANNEL_ID, dimension, label, sourceBatchId, dataVersion],
    ),
    orderIndex: index,
  };
});
// ---------------- products ----------------

const PROFILE_DISTRIBUTION_KEYS = [
  "预测性别_提取结果(占比)",
  "预测年龄段_提取结果(占比)",
  "地域分布_提取结果(占比)",
  "八大消费群体_提取结果(占比)",
  "预测消费能力_提取结果(占比)",
  "手机品牌_提取结果(占比)",
  "预测人生阶段_提取结果(占比)",
  "预测职业_提取结果(占比)",
  "手机价格_提取结果(占比)",
  "抖音活跃用户_提取结果(占比)",
  "头条活跃用户_提取结果(占比)",
  "西瓜活跃用户_提取结果(占比)",
  "火山活跃用户_提取结果(占比)",
  "头条用户阅读兴趣分类_提取结果(占比)",
  "抖音视频观看兴趣分类_提取结果(占比)",
  "西瓜视频观看兴趣分类_提取结果(占比)",
  "美妆行业特色人群_提取结果(占比)",
  "电商品类成交偏好_提取结果(占比)",
  "电商品牌成交偏好_提取结果(占比)",
  "电商消费频次_提取结果(占比)",
  "电商消费金额_提取结果(占比)",
  "触点互动偏好_提取结果(占比)",
  "城市_提取结果(占比)",
  "城市等级_提取结果(占比)",
  "抖音视频观看兴趣分类v2_提取结果(占比)",
];

const PRODUCT_BASIC_KEYS = [
  "季度",
  "款号",
  "商品名称",
  "货品属性",
  "性别修正",
  "中类",
  "小类",
  "全域款",
  "延续款",
  "场景",
  "年龄段",
  "主题",
  "推广群组",
  "商品群",
  "商品定位",
  "故事线",
];

const PRODUCT_PERFORMANCE_KEYS = [
  "2026合计净销量",
  "2026合计零售额",
  "实销排名",
  "实销层级",
  "商品链接数量",
  "号货匹配度",
];

const productRecords = tableRows.map((row) => {
  const skuId = String(row["款号"]);
  const productName = normalizeText(row["商品名称"]);
  const basic = {};
  for (const k of PRODUCT_BASIC_KEYS) basic[k] = row[k] ?? null;
  const performance = {};
  for (const k of PRODUCT_PERFORMANCE_KEYS) performance[k] = row[k] ?? null;
  const profileDistribution = {};
  for (const k of PROFILE_DISTRIBUTION_KEYS) {
    const buckets = parseDistribution(row[k]);
    if (buckets.length > 0) profileDistribution[k] = buckets;
  }
  const performanceIndex = {
    salesVolume: safeNumber(row["2026合计净销量"]),
    salesAmount: safeNumber(row["2026合计零售额"]),
    salesRank: safeNumber(row["实销排名"]),
    salesTier: normalizeText(row["实销层级"]),
    productLinkCount: safeNumber(row["商品链接数量"]),
    legacyFitScore: safeNumber(row["号货匹配度"]),
  };
  const { tags, unmapped } = mapProfileDistributionTags(profileDistribution, null);
  return {
    skuId,
    productName,
    productAttributes: basic,
    performanceMetrics: performance,
    performanceIndex,
    profileDistribution,
    mappedProfileTags: tags,
    unmappedProfileFields: unmapped,
    source: "douyin_report_dashboard.tableData",
    sourceType: "user_authorized",
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    qualityFlags: [],
    upsertKey: upsertKeyOf(
      ["skuId", "sourceBatchId", "dataVersion"],
      [skuId, sourceBatchId, dataVersion],
    ),
  };
});
// ---------------- product_account_fits ----------------

const productAccountFits = [];
const comparisonDimensions = [];

for (const row of insightsSheet2) {
  const skuId = String(row["款号"]);
  const productName = normalizeText(row["商品名称"]);
  const legacyFitScore = safeNumber(row["号货匹配度"]);
  const mismatchCount = safeNumber(row["不匹配维度数"]);
  const heavyTagList = normalizeText(row["需重点调整标签清单"]);
  const fitId = crypto
    .createHash("sha1")
    .update([BASELINE_CHANNEL_ID, skuId, sourceBatchId, dataVersion].join("|"))
    .digest("hex")
    .slice(0, 16);
  const fit = {
    fitId,
    skuId,
    productName,
    accountChannelId: BASELINE_CHANNEL_ID,
    accountName: BASELINE_ACCOUNT_NAME,
    legacyFitScore,
    legacyFitScoreUsage: "diagnostic_reference_only",
    mismatchDimensionCount: mismatchCount,
    heavyAdjustmentTagList: heavyTagList,
    salesRank: safeNumber(row["实销排名"]),
    salesVolume: safeNumber(row["2026合计净销量"]),
    source: "douyin_report_dashboard.insightsSheet2",
    sourceType: "user_authorized",
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    qualityFlags: ["algorithm_pending_user_formula"],
    upsertKey: upsertKeyOf(
      ["skuId", "accountChannelId", "sourceBatchId", "dataVersion"],
      [skuId, BASELINE_CHANNEL_ID, sourceBatchId, dataVersion],
    ),
  };
  productAccountFits.push(fit);

  for (const dim of FIVE_DIMENSIONS) {
    const productTop1 = normalizeText(row[`${dim}_款TOP1`]);
    const productTopShare = safeNumber(row[`${dim}_款占比%`]);
    const accountTop1 = normalizeText(row[`${dim}_账号TOP1`]);
    const accountTopShare = safeNumber(row[`${dim}_账号占比%`]);
    const decision = normalizeText(row[`${dim}_判定方式`]);
    const isMatch = normalizeText(row[`${dim}_是否匹配`]);
    let productTagId = null;
    let accountTagId = null;
    if (dim === "预测性别") {
      productTagId = pickTagId("demo_gender", productTop1);
      accountTagId = pickTagId("demo_gender", accountTop1);
    } else if (dim === "预测年龄段") {
      productTagId = pickTagId("demo_age", productTop1);
      accountTagId = pickTagId("demo_age", accountTop1);
    } else if (dim === "预测消费能力") {
      productTagId = pickTagId("price_power", productTop1);
      accountTagId = pickTagId("price_power", accountTop1);
    }
    const status =
      isMatch === "匹配"
        ? "matched"
        : isMatch === "不匹配"
        ? "mismatch"
        : isMatch === null
        ? "unmapped"
        : "partial";
    const gapScore =
      productTopShare !== null && accountTopShare !== null
        ? Number(Math.abs(productTopShare - accountTopShare).toFixed(2))
        : null;
    comparisonDimensions.push({
      fitId,
      skuId,
      accountChannelId: BASELINE_CHANNEL_ID,
      dimension: dim,
      dimensionTaxonomy: DIMENSION_TAXONOMY[dim] ?? "external",
      productTop1Label: productTop1,
      productTop1SharePercent: productTopShare,
      accountTop1Label: accountTop1,
      accountTop1SharePercent: accountTopShare,
      productTop1TagId: productTagId,
      accountTop1TagId: accountTagId,
      decisionMethod: decision,
      isMatchLabel: isMatch,
      status,
      gapScore,
      sourceBatchId,
      dataVersion,
      generatedAt,
      timeWindow,
      upsertKey: upsertKeyOf(
        ["fitId", "dimension", "sourceBatchId", "dataVersion"],
        [fitId, dim, sourceBatchId, dataVersion],
      ),
    });
  }
}
// ---------------- adjustment_advice ----------------

const ACTION_TYPE_MAP = [
  { pattern: /文案|copy|标题/i, actionType: "copy_adjustment" },
  { pattern: /内容|角度|种草|素材|视频/, actionType: "content_angle_adjustment" },
  { pattern: /价|折|券|价格/, actionType: "pricing_position_review" },
  { pattern: /账号|号选|投放账号|选号/, actionType: "account_selection_review" },
];

function inferActionType(direction) {
  if (!direction) return "mapping_review";
  for (const rule of ACTION_TYPE_MAP) {
    if (rule.pattern.test(direction)) return rule.actionType;
  }
  return "content_angle_adjustment";
}

const adjustmentAdvices = insightsSheet3.map((row, index) => {
  const skuId = normalizeText(row["款号"]);
  const productName = normalizeText(row["商品名称"]);
  const legacyFitScore = safeNumber(row["号货匹配度"]);
  const dimension = normalizeText(row["不匹配维度"]);
  const productTop1 = normalizeText(row["款当前TOP1"]);
  const productTop1Share = safeNumber(row["款TOP1占比"]);
  const accountTop1 = normalizeText(row["账号TOP1"]);
  const accountTop1Share = safeNumber(row["账号TOP1占比"]);
  const direction = normalizeText(row["调整方向"]);
  const priorityRaw = normalizeText(row["优先级"]);
  const priority =
    priorityRaw && /高/.test(priorityRaw)
      ? "high"
      : priorityRaw && /中/.test(priorityRaw)
      ? "medium"
      : priorityRaw && /低/.test(priorityRaw)
      ? "low"
      : "medium";
  const actionType = inferActionType(direction);
  const productTagId =
    dimension === "预测性别"
      ? pickTagId("demo_gender", productTop1)
      : dimension === "预测年龄段"
      ? pickTagId("demo_age", productTop1)
      : dimension === "预测消费能力"
      ? pickTagId("price_power", productTop1)
      : null;
  const accountTagId =
    dimension === "预测性别"
      ? pickTagId("demo_gender", accountTop1)
      : dimension === "预测年龄段"
      ? pickTagId("demo_age", accountTop1)
      : dimension === "预测消费能力"
      ? pickTagId("price_power", accountTop1)
      : null;
  const gapScore =
    productTop1Share !== null && accountTop1Share !== null
      ? Number(Math.abs(productTop1Share - accountTop1Share).toFixed(2))
      : null;
  const adviceId = crypto
    .createHash("sha1")
    .update([skuId, BASELINE_CHANNEL_ID, dimension, index, sourceBatchId, dataVersion].join("|"))
    .digest("hex")
    .slice(0, 16);
  return {
    adviceId,
    skuId,
    productName,
    accountChannelId: BASELINE_CHANNEL_ID,
    dimension,
    dimensionTaxonomy: DIMENSION_TAXONOMY[dimension] ?? "external",
    productTop1Label: productTop1,
    productTop1SharePercent: productTop1Share,
    accountTop1Label: accountTop1,
    accountTop1SharePercent: accountTop1Share,
    productTop1TagId: productTagId,
    accountTop1TagId: accountTagId,
    gapScore,
    priorityLabel: priorityRaw,
    priority,
    direction,
    actionType,
    legacyFitScore,
    evidence: {
      productScore: productTop1Share !== null ? Number((productTop1Share / 100).toFixed(6)) : null,
      accountScore: accountTop1Share !== null ? Number((accountTop1Share / 100).toFixed(6)) : null,
      gapScore,
      sourceField: "insightsSheet3.调整方向",
    },
    source: "douyin_report_dashboard.insightsSheet3",
    sourceType: "user_authorized",
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    qualityFlags: ["algorithm_pending_user_formula"],
    orderIndex: index,
    upsertKey: upsertKeyOf(
      ["skuId", "accountChannelId", "dimension", "orderIndex", "sourceBatchId", "dataVersion"],
      [skuId, BASELINE_CHANNEL_ID, dimension, index, sourceBatchId, dataVersion],
    ),
  };
});

// summary_metrics: drop rows with null metricName (dashboard 分节留白) and use
// (metricName + orderIndex + sourceBatchId + dataVersion) so BI 中同名/空行
// 不会互相 upsert 覆盖。
const summaryMetrics = insightsSheet4
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => normalizeText(row["统计指标"]) !== null)
  .map(({ row, index }) => {
    const metricName = normalizeText(row["统计指标"]);
    return {
      metricName,
      metricValue: row["数值"] ?? null,
      metricValueNumeric: safeNumber(row["数值"]),
      orderIndex: index,
      sourceBatchId,
      dataVersion,
      generatedAt,
      timeWindow,
      source: "douyin_report_dashboard.insightsSheet4",
      sourceType: "user_authorized",
      upsertKey: upsertKeyOf(
        ["metricName", "orderIndex", "sourceBatchId", "dataVersion"],
        [metricName, index, sourceBatchId, dataVersion],
      ),
    };
  });
// ---------------- account_reports ----------------

const accountReports = accountNamesFromReports.map((name) => {
  const rec = accountByName.get(name);
  const rawHtml = String(multiAccountRawHtml[name] ?? "");
  const rawHtmlBytes = Buffer.byteLength(rawHtml, "utf8");
  const rawHtmlHash = crypto.createHash("sha256").update(rawHtml).digest("hex");
  const plainText = stripHtml(rawHtml);
  const excerpt = plainText.slice(0, 1200);
  return {
    reportId: crypto
      .createHash("sha1")
      .update([rec.channelId, sourceBatchId, dataVersion].join("|"))
      .digest("hex")
      .slice(0, 16),
    channelId: rec.channelId,
    accountName: name,
    accountKind: rec.accountKind,
    channelType: rec.channelType,
    reportKind: "monthly_trend_report",
    comparePeriod: "25.5.1-5.31_vs_26.5.1-5.31",
    plainTextExcerpt: excerpt,
    plainTextCharCount: plainText.length,
    rawHtmlBytes,
    rawHtmlHash,
    rawHtmlAvailable: true,
    source: "douyin_report_dashboard.multiAccountInsightsRawHTML",
    sourceType: "user_authorized",
    sourceBatchId,
    dataVersion,
    generatedAt,
    timeWindow,
    upsertKey: upsertKeyOf(
      ["channelId", "reportKind", "sourceBatchId", "dataVersion"],
      [rec.channelId, "monthly_trend_report", sourceBatchId, dataVersion],
    ),
  };
});
// ---------------- persistence ----------------

const writtenFiles = [];
const track = (p) => {
  writtenFiles.push(path.relative(OUTPUT_DIR, p));
  return p;
};

track(writeJsonl("accounts.jsonl", accountRecords));
track(writeJsonl("account_benchmark_tags.jsonl", accountBenchmarkTagRows));
track(writeJsonl("account_reports.jsonl", accountReports));
track(writeJsonl("products.jsonl", productRecords));
track(writeJsonl("product_account_fits.jsonl", productAccountFits));
track(writeJsonl("comparison_dimensions.jsonl", comparisonDimensions));
track(writeJsonl("adjustment_advice.jsonl", adjustmentAdvices));
track(writeJsonl("summary_metrics.jsonl", summaryMetrics));

// ---------------- field dictionary ----------------

const USAGE_RULES = {
  identifier: [/Id$/, /^channelId$/, /^skuId$/, /Hash$/, /BatchId$/, /Version$/, /Name$/, /source$/, /reportKind/],
  dimension: [/Type$/, /Kind$/, /Policy$/, /Flag$/, /^is/, /^has/, /taxonomy$/i, /timeWindow/, /dimension$/, /Label$/, /status/, /priority/, /decisionMethod/, /orderIndex/, /accountGroupId/, /generatedAt/],
  display_metric: [/Text/, /Excerpt/, /businessInterpretation/, /direction/, /displayName/, /heavyAdjustmentTagList/, /productName/, /accountName/, /metricValue$/, /performanceMetrics/, /productAttributes/],
  calculation_metric: [/^shareRatio$/, /Confidence$/, /Score$/, /Percent$/, /Ratio$/, /Count$/, /Bytes$/, /Amount$/, /Volume$/, /Rank$/, /Index$/, /Value$/, /Numeric$/, /gapScore/],
};

function classifyUsage(field) {
  if (field === "upsertKey") return "identifier";
  if (field === "profileDistribution" || field === "unmappedProfileFields" || field === "mappedProfileTags" || field === "qualityFlags" || field === "evidence") return "dimension";
  if (field === "sampleSize" || field === "mappingConfidence") return "calculation_metric";
  for (const [usage, patterns] of Object.entries(USAGE_RULES)) {
    for (const p of patterns) if (p.test(field)) return usage;
  }
  return "dimension";
}

function jsType(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function collectFields(objectName, rows) {
  const keys = new Set();
  const sample = rows[0] ?? {};
  const walk = (prefix, obj) => {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      keys.add(full);
      if (v && typeof v === "object" && !Array.isArray(v) && (k === "productAttributes" || k === "performanceMetrics" || k === "performanceIndex" || k === "evidence" || k === "upsertKey")) {
        walk(full, v);
      }
    }
  };
  walk("", sample);
  return Array.from(keys).map((field) => ({
    object: objectName,
    field,
    usage: classifyUsage(field),
    jsType: jsType(getDeep(sample, field)),
  }));
}

function getDeep(obj, path) {
  return path.split(".").reduce((cur, k) => (cur ? cur[k] : undefined), obj);
}

const fieldDictionary = [
  ...collectFields("accounts", accountRecords),
  ...collectFields("account_benchmark_tags", accountBenchmarkTagRows),
  ...collectFields("account_reports", accountReports),
  ...collectFields("products", productRecords),
  ...collectFields("product_account_fits", productAccountFits),
  ...collectFields("comparison_dimensions", comparisonDimensions),
  ...collectFields("adjustment_advice", adjustmentAdvices),
  ...collectFields("summary_metrics", summaryMetrics),
];

track(writeCsv("field_dictionary.csv", ["object", "field", "usage", "jsType"], fieldDictionary));

// ---------------- unmapped fields ----------------

const unmappedRows = [];
for (const product of productRecords) {
  for (const item of product.unmappedProfileFields) {
    unmappedRows.push({
      object: "products",
      businessKey: product.skuId,
      sourceField: item.sourceField,
      sourceLabel: item.sourceLabel ?? "",
      sharePercent: item.sharePercent ?? "",
      reason: item.reason,
    });
  }
}
for (const row of accountBenchmarkTagRows) {
  if (!row.mappedTagId) {
    unmappedRows.push({
      object: "account_benchmark_tags",
      businessKey: `${row.channelId}|${row.dimension}|${row.optionLabel}`,
      sourceField: row.dimension,
      sourceLabel: row.optionLabel,
      sharePercent: row.sharePercent ?? "",
      reason: "not_in_taxonomy_or_pending_review",
    });
  }
}
track(
  writeCsv(
    "unmapped_fields.csv",
    ["object", "businessKey", "sourceField", "sourceLabel", "sharePercent", "reason"],
    unmappedRows
  )
);

// ---------------- quality report ----------------

const objectCounts = {
  accounts: accountRecords.length,
  account_benchmark_tags: accountBenchmarkTagRows.length,
  account_reports: accountReports.length,
  products: productRecords.length,
  product_account_fits: productAccountFits.length,
  comparison_dimensions: comparisonDimensions.length,
  adjustment_advice: adjustmentAdvices.length,
  summary_metrics: summaryMetrics.length,
};

const totalRows = Object.values(objectCounts).reduce((a, b) => a + b, 0);

const mappedTagCount = accountBenchmarkTagRows.filter((r) => r.mappedTagId).length;
const productsWithProfile = productRecords.filter((p) => Object.keys(p.profileDistribution).length > 0).length;
const productsWithLegacyFit = productRecords.filter((p) => p.performanceIndex.legacyFitScore !== null).length;
const fitsWithLegacyScore = productAccountFits.filter((f) => f.legacyFitScore !== null).length;

const qualityReport = {
  batchId: sourceBatchId,
  dataVersion,
  generatedAt,
  timeWindow,
  source: {
    file: sourceFile,
    bytes: sourceSize,
    sha256: sourceHash,
  },
  objectCounts,
  totalRows,
  coverage: {
    accountsWithBenchmarkTags: accountBenchmarkTagRows.length > 0 ? 1 : 0,
    accountBenchmarkTagsWithTaxonomyMapping:
      accountBenchmarkTagRows.length === 0
        ? 0
        : Number((mappedTagCount / accountBenchmarkTagRows.length).toFixed(4)),
    productsWithProfileDistribution:
      productRecords.length === 0 ? 0 : Number((productsWithProfile / productRecords.length).toFixed(4)),
    productsWithLegacyFitScore:
      productRecords.length === 0 ? 0 : Number((productsWithLegacyFit / productRecords.length).toFixed(4)),
    fitsWithLegacyScore:
      productAccountFits.length === 0
        ? 0
        : Number((fitsWithLegacyScore / productAccountFits.length).toFixed(4)),
  },
  qualityFlags: [
    "algorithm_pending_user_formula",
    "single_baseline_account_only",
  ],
  admissionPolicy: "user_authorized_full_passthrough",
  reproduce: {
    command:
      "node data/scripts/generate-p1-douyin-bi.mjs --source /Users/huangbo/Downloads/douyin_report_dashboard/data.js --batchId batch_douyin_bi_20260703 --dataVersion v1_20260703",
  },
};

track(writeJson("quality_report.json", qualityReport));

// ---------------- source manifest ----------------

const sourceManifest = {
  batchId: sourceBatchId,
  dataVersion,
  generatedAt,
  timeWindow,
  admissionPolicy: "user_authorized_full_passthrough",
  sources: [
    {
      sourceKey: "douyin_report_dashboard",
      sourceType: "user_authorized",
      file: sourceFile,
      bytes: sourceSize,
      sha256: sourceHash,
      role: "primary_bi_snapshot",
      note: "Legacy dashboard data.js snapshot. Retained values are user-authorized BI data.",
    },
  ],
  mappingTemplate: {
    path: "data/templates/douyin-account-product-mapping",
    version: "v1_2026-07-02",
  },
};

track(writeJson("source_manifest.json", sourceManifest));

// ---------------- sqlite import manifest ----------------

const importManifest = {
  batchId: sourceBatchId,
  dataVersion,
  generatedAt,
  timeWindow,
  targetDatabase: "pls",
  tables: [
    {
      name: "douyin_accounts",
      file: "accounts.jsonl",
      businessKey: ["channelId"],
      upsertKey: ["channelId", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_account_benchmark_tags",
      file: "account_benchmark_tags.jsonl",
      businessKey: ["channelId", "dimension", "optionLabel"],
      upsertKey: ["channelId", "dimension", "optionLabel", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_account_reports",
      file: "account_reports.jsonl",
      businessKey: ["channelId", "reportKind"],
      upsertKey: ["channelId", "reportKind", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_products",
      file: "products.jsonl",
      businessKey: ["skuId"],
      upsertKey: ["skuId", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_product_account_fits",
      file: "product_account_fits.jsonl",
      businessKey: ["fitId"],
      upsertKey: ["skuId", "accountChannelId", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_comparison_dimensions",
      file: "comparison_dimensions.jsonl",
      businessKey: ["fitId", "dimension"],
      upsertKey: ["fitId", "dimension", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
    {
      name: "douyin_adjustment_advice",
      file: "adjustment_advice.jsonl",
      businessKey: ["adviceId"],
      upsertKey: [
        "skuId",
        "accountChannelId",
        "dimension",
        "orderIndex",
        "sourceBatchId",
        "dataVersion",
      ],
      writeMode: "upsert",
    },
    {
      name: "douyin_summary_metrics",
      file: "summary_metrics.jsonl",
      businessKey: ["metricName", "orderIndex"],
      upsertKey: ["metricName", "orderIndex", "sourceBatchId", "dataVersion"],
      writeMode: "upsert",
    },
  ],
  notes: [
    "SQLite schema and migration are owned by X orchestrator; this manifest only exposes intended target tables, business keys and upsert keys.",
    "All rows carry sourceBatchId + dataVersion so re-imports over the same version are idempotent under upsert.",
  ],
};

track(writeJson("sqlite_import_manifest.json", importManifest));

// ---------------- summary log ----------------

const summary = {
  outputDir: path.relative(REPO_ROOT, OUTPUT_DIR),
  batchId: sourceBatchId,
  dataVersion,
  generatedAt,
  objectCounts,
  totalRows,
  writtenFiles: writtenFiles.sort(),
};

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
