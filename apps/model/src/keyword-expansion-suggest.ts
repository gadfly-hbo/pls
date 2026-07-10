/**
 * Suggest keyword dictionary expansions from Q1/Q2 fabric and FAB corpus.
 *
 * Extracts frequent 2-4 character Chinese n-grams that are not already present
 * in the existing fabric/style/function/scene dictionaries.
 */

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  FABRIC_KEYWORDS,
  STYLE_KEYWORDS,
  FUNCTION_KEYWORDS,
  SCENE_KEYWORDS,
} from "./single-product-portrait-supervised.js";

const Q2_PRODUCTS_PATH = "../../data/local/single-product-portrait-q2-73sample/product_attributes.jsonl";
const Q1_XLSX_PATH = "/Users/huangbo/Downloads/Q1商品信息.xlsx";

const MIN_LENGTH = 2;
const MAX_LENGTH = 4;
const MIN_FREQUENCY = 3;

// Generic stopwords that appear frequently but carry little signal
const STOPWORDS = new Set([
  "面料", "版型", "设计", "穿着", "细节", "采用", "搭配", "经典", "时尚", "工艺",
  "功能", "风格", "其他", "增加", "效果", "同时", "提升", "各种", "实用", "自然",
  "独特", "结合", "选用", "多种", "造型", "视觉", "不同", "身形", "轻松", "穿搭",
  "适合", "柔软", "质感", "手感", "身材", "修饰", "线条", "剪裁", "百搭", "有型",
  "立体", "层次", "水洗", "全棉", "采用", "一条", "带来", "无论", "有效", "显著",
  "具有", "以及", "及其", "随着", "通过", "进行", "可以", "能够", "使得", "提供",
  "满足", "符合", "根据", "针对", "基于", "关于", "由于", "因此", "从而", "不仅",
  "而且", "并且", "或者", "还是", "因为", "所以", "虽然", "但是", "如果", "那么",
]);

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMostlyChinese(text: string): boolean {
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  if (!chineseChars) return false;
  return chineseChars.length / text.length >= 0.8;
}

function extractNgrams(text: string): string[] {
  const cleaned = text.replace(/\s+/g, "");
  const ngrams: string[] = [];
  for (let n = MIN_LENGTH; n <= MAX_LENGTH; n++) {
    for (let i = 0; i + n <= cleaned.length; i++) {
      const gram = cleaned.slice(i, i + n);
      if (isMostlyChinese(gram)) {
        ngrams.push(gram);
      }
    }
  }
  return ngrams;
}

function loadQ2Texts(): { fabric: string[]; fab: string[] } {
  const fabric: string[] = [];
  const fab: string[] = [];
  const content = readFileSync(Q2_PRODUCTS_PATH, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { fabric?: string; fab?: string };
      if (record.fabric) fabric.push(record.fabric);
      if (record.fab) fab.push(record.fab);
    } catch {
      // ignore malformed lines
    }
  }
  return { fabric, fab };
}

function loadQ1Texts(): { fabric: string[]; fab: string[] } {
  const buffer = readFileSync(Q1_XLSX_PATH);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("No sheet found in Q1 xlsx");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const fabric: string[] = [];
  const fab: string[] = [];
  for (const row of rows) {
    const f = normalizeText(row["面料"]);
    const d = normalizeText(row["FAB"]);
    if (f) fabric.push(f);
    if (d) fab.push(d);
  }
  return { fabric, fab };
}

function collectFrequencies(texts: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const gram of extractNgrams(text)) {
      if (seen.has(gram)) continue;
      seen.add(gram);
      freq.set(gram, (freq.get(gram) ?? 0) + 1);
    }
  }
  return freq;
}

function getExistingKeywords(): Set<string> {
  const all = [...FABRIC_KEYWORDS, ...STYLE_KEYWORDS, ...FUNCTION_KEYWORDS, ...SCENE_KEYWORDS];
  return new Set(all.map((k) => k.keyword));
}

function isSubstringOfExisting(ngram: string, existing: Set<string>): boolean {
  for (const kw of existing) {
    if (kw.includes(ngram) && kw !== ngram) return true;
  }
  return false;
}

function suggest(texts: string[], label: string, existing: Set<string>): Array<{ ngram: string; frequency: number }> {
  const freq = collectFrequencies(texts);
  const candidates: Array<{ ngram: string; frequency: number }> = [];
  for (const [ngram, count] of freq) {
    if (count < MIN_FREQUENCY) continue;
    if (existing.has(ngram)) continue;
    if (STOPWORDS.has(ngram)) continue;
    if (isSubstringOfExisting(ngram, existing)) continue;
    candidates.push({ ngram, frequency: count });
  }
  return candidates.sort((a, b) => b.frequency - a.frequency).slice(0, 50);
}

function main(): void {
  const q2 = loadQ2Texts();
  const q1 = loadQ1Texts();
  const existing = getExistingKeywords();

  const allFabric = [...q2.fabric, ...q1.fabric];
  const allFab = [...q2.fab, ...q1.fab];

  const fabricCandidates = suggest(allFabric, "fabric", existing);
  const fabCandidates = suggest(allFab, "fab", existing);

  console.log("=== Fabric keyword candidates ===");
  for (const { ngram, frequency } of fabricCandidates) {
    console.log(`  ${ngram}: ${frequency}`);
  }

  console.log("\n=== FAB keyword candidates ===");
  for (const { ngram, frequency } of fabCandidates) {
    console.log(`  ${ngram}: ${frequency}`);
  }

  console.log(`\nTotal corpus: ${allFabric.length} fabric texts, ${allFab.length} fab texts`);
  console.log(`Existing dictionary keywords: ${existing.size}`);
}

main();
