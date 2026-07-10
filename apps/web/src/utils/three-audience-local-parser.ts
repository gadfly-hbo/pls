import { estimateSemirThreeAudienceShares } from '../../../model/src/three-audience-share';

export { estimateSemirThreeAudienceShares };
export type {
  ThreeAudienceChannel,
  NativeSegmentSystem,
  NativeAudienceSegmentShare,
  ThreeAudiencePrior,
  ThreeAudienceEstimateInput,
  ThreeAudienceShare,
  ThreeAudienceEstimateResult,
  ThreeAudienceInputError,
} from '../../../model/src/three-audience-share';

export interface ParsedSegmentRow {
  label: string;
  rawShare: string;
  share: number;
}

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export interface ColumnMapping {
  labelColumn: string;
  shareColumn: string;
}

export interface FileParseError {
  rowNumber: number;
  reason: string;
}

export const LABEL_COLUMN_CANDIDATES = ['人群标签', '标签', '人群', 'label', 'segment'];
export const SHARE_COLUMN_CANDIDATES = ['占比', '比例', '渗透率', 'share', 'ratio'];

export function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-_.]+/g, '_');
}

export function parseShare(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.endsWith('%')) {
    const num = Number(trimmed.slice(0, -1));
    return Number.isFinite(num) ? num / 100 : null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function parseCsv(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseMarkdownTable(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableStart = i;
      break;
    }
  }
  if (tableStart === -1 || tableStart + 1 >= lines.length) return { headers: [], rows: [] };
  const headerLine = lines[tableStart].trim();
  const separatorLine = lines[tableStart + 1].trim();
  if (!/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(separatorLine)) {
    return { headers: [], rows: [] };
  }
  const headers = headerLine
    .split('|')
    .slice(1, -1)
    .map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = tableStart + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|') || !line.endsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function pickColumn(
  headers: string[],
  candidates: string[],
  fallback: 'first' | 'none' = 'none'
): string | null {
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const match = normalizedHeaders.find((h) => h.normalized === normalizedCandidate);
    if (match) return match.original;
  }
  if (fallback === 'first' && headers.length > 0) return headers[0];
  return null;
}

export function validateAndBuildSegments(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { segments: ParsedSegmentRow[]; errors: FileParseError[] } {
  const segments: ParsedSegmentRow[] = [];
  const errors: FileParseError[] = [];
  const seenLabels = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawLabel = row[mapping.labelColumn];
    const rawShare = row[mapping.shareColumn];

    if (rawLabel === undefined || rawShare === undefined) {
      errors.push({ rowNumber, reason: `缺少列：${mapping.labelColumn} 或 ${mapping.shareColumn}` });
      return;
    }

    const trimmedLabel = rawLabel.trim();
    if (trimmedLabel === '') {
      errors.push({ rowNumber, reason: '标签为空' });
      return;
    }

    if (seenLabels.has(trimmedLabel)) {
      errors.push({ rowNumber, reason: `重复标签：${trimmedLabel}` });
      return;
    }
    seenLabels.add(trimmedLabel);

    const share = parseShare(rawShare);
    if (share === null) {
      errors.push({ rowNumber, reason: `占比非数值：${rawShare}` });
      return;
    }

    if (share < 0) {
      errors.push({ rowNumber, reason: `占比不能为负数：${rawShare}` });
      return;
    }

    if (share > 1) {
      errors.push({ rowNumber, reason: `占比不能大于 100%：${rawShare}` });
      return;
    }

    segments.push({ label: trimmedLabel, rawShare: rawShare.trim(), share });
  });

  return { segments, errors };
}

export function validateShareTotal(segments: ParsedSegmentRow[], channel: string): string | null {
  const total = segments.reduce((sum, s) => sum + s.share, 0);
  const tolerance = channel === 'jd' ? 0.0001 + 1e-12 : 1e-6;
  if (total > 1 + tolerance) {
    return `输入占比合计 ${(total * 100).toFixed(2)}% 超过渠道容差（> ${((1 + tolerance) * 100).toFixed(4)}%）`;
  }
  return null;
}

export function formatShareAsPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export async function parseXlsx(arrayBuffer: ArrayBuffer): Promise<ParsedTable> {
  const xlsx = await import('xlsx');
  const workbook = xlsx.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const worksheet = workbook.Sheets[firstSheetName];
  const json = xlsx.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
  if (json.length === 0) return { headers: [], rows: [] };
  const headers = json[0].map((h) => String(h).trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < json.length; i++) {
    const cells = json[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] !== undefined ? String(cells[index]).trim() : '';
    });
    rows.push(row);
  }
  return { headers, rows };
}
