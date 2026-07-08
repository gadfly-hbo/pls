import * as XLSX from "xlsx";
import { parseCsv } from "../csv-ingestion.js";
import {
  getSingleProductPortraitMetadata,
  predictSingleProductPortrait,
  type SingleProductPortraitModelMetadata,
  type SingleProductPortraitPrediction,
} from "./prediction.js";

export type FieldName = "skuId" | "fitType" | "fabric" | "fab" | "file";

export interface PortraitInputIssue {
  code: string;
  message: string;
  field?: FieldName;
  rawValue?: string;
  rowNumber?: number;
  skuId?: string;
}

export interface ParsedBatchRow {
  rowNumber: number;
  skuId: string;
  fitType: string;
  fabric: string;
  fab: string;
  issues: PortraitInputIssue[];
}

export interface BatchParseResult {
  fileErrors: PortraitInputIssue[];
  warnings: PortraitInputIssue[];
  extraColumns: string[];
  rows: ParsedBatchRow[];
  requiredColumns: string[];
  metadata: SingleProductPortraitModelMetadata;
}

export interface BatchPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  fileErrors: PortraitInputIssue[];
  rowErrors: PortraitInputIssue[];
  warnings: PortraitInputIssue[];
  extraColumns: string[];
  requiredColumns: string[];
}

export interface BatchExecuteResult {
  totalRows: number;
  successCount: number;
  failureCount: number;
  warningCount: number;
  results: Array<{ rowNumber: number; skuId: string; prediction: SingleProductPortraitPrediction }>;
  fileErrors: PortraitInputIssue[];
  rowErrors: PortraitInputIssue[];
  warnings: PortraitInputIssue[];
  metadata: SingleProductPortraitModelMetadata;
}

export const PORTRAIT_REQUIRED_COLUMNS = ["款号", "版型", "面料", "FAB"] as const;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_ROWS = 100;
const MAX_SKU_ID_LENGTH = 100;
const MAX_FABRIC_LENGTH = 500;
const MAX_FAB_LENGTH = 2000;

function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".csv");
}

function isXlsx(name: string): boolean {
  return name.toLowerCase().endsWith(".xlsx");
}

function trimValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeHeaders(rawHeaders: string[]): string[] {
  return rawHeaders.map((h) => trimValue(h));
}

function parseHeadersAndRows(
  fileName: string,
  buffer: ArrayBuffer,
): { headers: string[]; dataRows: Record<string, unknown>[] } {
  if (isXlsx(fileName)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("xlsx file has no sheets");
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error("xlsx first sheet is empty");
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) {
      return { headers: [], dataRows: [] };
    }
    const headers = Object.keys(rows[0] ?? {}).map(trimValue);
    return { headers, dataRows: rows };
  }

  // CSV
  const text = new TextDecoder().decode(buffer).replace(/^\uFEFF/, "");
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0) {
    return { headers: [], dataRows: [] };
  }
  const headers = parsed.headers.map(trimValue);
  const dataRows = parsed.rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]!] = row[i] ?? "";
    }
    return record;
  });
  return { headers, dataRows };
}

export async function parseBatchFile(file: File): Promise<BatchParseResult> {
  const metadata = getSingleProductPortraitMetadata();
  const fileErrors: PortraitInputIssue[] = [];
  const warnings: PortraitInputIssue[] = [];

  if (!isSupportedFile(file.name)) {
    fileErrors.push({
      code: "unsupported_file_type",
      message: "仅支持 .xlsx 和 .csv 文件",
      field: "file",
    });
    return { fileErrors, warnings, extraColumns: [], rows: [], requiredColumns: [...PORTRAIT_REQUIRED_COLUMNS], metadata };
  }

  if (file.size > MAX_FILE_BYTES) {
    fileErrors.push({
      code: "file_too_large",
      message: `文件大小超过 ${MAX_FILE_BYTES} 字节`,
      field: "file",
    });
    return { fileErrors, warnings, extraColumns: [], rows: [], requiredColumns: [...PORTRAIT_REQUIRED_COLUMNS], metadata };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    fileErrors.push({
      code: "file_parse_failed",
      message: `读取文件失败: ${err instanceof Error ? err.message : String(err)}`,
      field: "file",
    });
    return { fileErrors, warnings, extraColumns: [], rows: [], requiredColumns: [...PORTRAIT_REQUIRED_COLUMNS], metadata };
  }

  let headers: string[];
  let dataRows: Record<string, unknown>[];
  try {
    ({ headers, dataRows } = parseHeadersAndRows(file.name, buffer));
  } catch (err) {
    fileErrors.push({
      code: "file_parse_failed",
      message: `解析文件失败: ${err instanceof Error ? err.message : String(err)}`,
      field: "file",
    });
    return { fileErrors, warnings, extraColumns: [], rows: [], requiredColumns: [...PORTRAIT_REQUIRED_COLUMNS], metadata };
  }

  const requiredColumns: string[] = [...PORTRAIT_REQUIRED_COLUMNS];
  const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    fileErrors.push({
      code: "missing_required_columns",
      message: `缺少必需列: ${missingColumns.join(", ")}`,
      field: "file",
      rawValue: headers.join(", "),
    });
  }

  const extraColumns = headers.filter((h) => !requiredColumns.includes(h));
  if (extraColumns.length > 0) {
    warnings.push({
      code: "extra_columns_ignored",
      message: `忽略额外列: ${extraColumns.join(", ")}`,
      field: "file",
    });
  }

  if (dataRows.length === 0) {
    fileErrors.push({
      code: "empty_file",
      message: "文件没有数据行",
      field: "file",
    });
  } else if (dataRows.length > MAX_BATCH_ROWS) {
    fileErrors.push({
      code: "row_limit_exceeded",
      message: `数据行数超过 ${MAX_BATCH_ROWS} 行`,
      field: "file",
      rawValue: String(dataRows.length),
    });
  }

  if (fileErrors.length > 0) {
    return { fileErrors, warnings, extraColumns, rows: [], requiredColumns, metadata };
  }

  const fitTypes = metadata.modelAvailable ? metadata.fitTypes : [];
  const seenSkuIds = new Map<string, number>();
  const rows: ParsedBatchRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const raw = dataRows[i]!;
    const skuId = trimValue(raw["款号"]);
    const fitType = trimValue(raw["版型"]);
    const fabric = trimValue(raw["面料"]);
    const fab = trimValue(raw["FAB"]);

    const issues: PortraitInputIssue[] = [];

    if (skuId === "") {
      issues.push({
        code: "required_field_empty",
        message: "款号不能为空",
        field: "skuId",
        rawValue: "",
        rowNumber,
      });
    } else if (skuId.length > MAX_SKU_ID_LENGTH) {
      issues.push({
        code: "field_too_long",
        message: `款号超过 ${MAX_SKU_ID_LENGTH} 字符`,
        field: "skuId",
        rawValue: skuId,
        rowNumber,
      });
    }

    if (fitType === "") {
      issues.push({
        code: "required_field_empty",
        message: "版型不能为空",
        field: "fitType",
        rawValue: "",
        rowNumber,
      });
    } else if (fitTypes.length > 0 && !fitTypes.includes(fitType)) {
      issues.push({
        code: "unknown_fit_type",
        message: "版型不在当前模型支持列表中",
        field: "fitType",
        rawValue: fitType,
        rowNumber,
      });
    } else if (metadata.modelAvailable && fitTypes.length === 0) {
      // Defensive: model available but no fit types
      issues.push({
        code: "unknown_fit_type",
        message: "当前模型未声明支持版型",
        field: "fitType",
        rawValue: fitType,
        rowNumber,
      });
    }

    if (fabric === "") {
      issues.push({
        code: "required_field_empty",
        message: "面料不能为空",
        field: "fabric",
        rawValue: "",
        rowNumber,
      });
    } else if (fabric.length > MAX_FABRIC_LENGTH) {
      issues.push({
        code: "field_too_long",
        message: `面料超过 ${MAX_FABRIC_LENGTH} 字符`,
        field: "fabric",
        rawValue: fabric,
        rowNumber,
      });
    }

    if (fab === "") {
      issues.push({
        code: "required_field_empty",
        message: "FAB 不能为空",
        field: "fab",
        rawValue: "",
        rowNumber,
      });
    } else if (fab.length > MAX_FAB_LENGTH) {
      issues.push({
        code: "field_too_long",
        message: `FAB 超过 ${MAX_FAB_LENGTH} 字符`,
        field: "fab",
        rawValue: fab,
        rowNumber,
      });
    }

    if (skuId !== "" && seenSkuIds.has(skuId)) {
      issues.push({
        code: "duplicate_sku_id_in_file",
        message: `款号重复，首次出现在第 ${seenSkuIds.get(skuId)} 行`,
        field: "skuId",
        rawValue: skuId,
        rowNumber,
        skuId,
      });
    }

    if (skuId !== "") {
      seenSkuIds.set(skuId, rowNumber);
    }

    rows.push({ rowNumber, skuId, fitType, fabric, fab, issues });
  }

  return { fileErrors, warnings, extraColumns, rows, requiredColumns, metadata };
}

export function buildPreviewResult(parseResult: BatchParseResult): BatchPreviewResult {
  const rowErrors = parseResult.rows.flatMap((row) =>
    row.issues.filter((issue) => issue.code !== "duplicate_sku_id_in_file"),
  );
  const warnings = [...parseResult.warnings];
  const duplicateWarnings = parseResult.rows.flatMap((row) =>
    row.issues.filter((issue) => issue.code === "duplicate_sku_id_in_file"),
  );
  warnings.push(...duplicateWarnings);

  const fileErrors = [...parseResult.fileErrors];
  if (!parseResult.metadata.modelAvailable) {
    fileErrors.push({
      code: "model_not_available",
      message: parseResult.metadata.error?.message ?? "模型文件未生成，请先训练模型",
      field: "file",
    });
  }

  const totalRows = parseResult.rows.length;
  const validRows = parseResult.rows.filter(
    (row) => row.issues.filter((issue) => issue.code !== "duplicate_sku_id_in_file").length === 0,
  ).length;
  const invalidRows = totalRows - validRows;

  return {
    totalRows,
    validRows,
    invalidRows,
    fileErrors,
    rowErrors,
    warnings,
    extraColumns: parseResult.extraColumns,
    requiredColumns: parseResult.requiredColumns,
  };
}

export function buildExecuteResult(parseResult: BatchParseResult): BatchExecuteResult {
  const metadata = parseResult.metadata;
  if (!metadata.modelAvailable) {
    const fileError: PortraitInputIssue = {
      code: "model_not_available",
      message: metadata.error?.message ?? "模型文件未生成，请先训练模型",
      field: "file",
    };
    return {
      totalRows: parseResult.rows.length,
      successCount: 0,
      failureCount: parseResult.rows.length,
      warningCount: 0,
      results: [],
      fileErrors: [fileError],
      rowErrors: parseResult.rows.flatMap((row) => row.issues),
      warnings: parseResult.warnings,
      metadata,
    };
  }

  const warnings = [...parseResult.warnings];
  const duplicateWarnings = parseResult.rows.flatMap((row) =>
    row.issues.filter((issue) => issue.code === "duplicate_sku_id_in_file"),
  );
  warnings.push(...duplicateWarnings);

  const results: BatchExecuteResult["results"] = [];
  const rowErrors: PortraitInputIssue[] = [];

  for (const row of parseResult.rows) {
    const nonWarningIssues = row.issues.filter((issue) => issue.code !== "duplicate_sku_id_in_file");
    if (nonWarningIssues.length > 0) {
      rowErrors.push(...nonWarningIssues);
      continue;
    }

    try {
      const prediction = predictSingleProductPortrait({
        skuId: row.skuId,
        fitType: row.fitType,
        fabric: row.fabric,
        fab: row.fab,
      });
      results.push({ rowNumber: row.rowNumber, skuId: row.skuId, prediction });
    } catch (err) {
      rowErrors.push({
        code: "model_not_available",
        message: err instanceof Error ? err.message : String(err),
        field: "file",
        rowNumber: row.rowNumber,
        skuId: row.skuId,
      });
    }
  }

  return {
    totalRows: parseResult.rows.length,
    successCount: results.length,
    failureCount: rowErrors.length,
    warningCount: warnings.length,
    results,
    fileErrors: [],
    rowErrors,
    warnings,
    metadata,
  };
}
