// Shared parsing utilities for PortraitSource adapters.
//
// These parsers fail closed on every invalid or ambiguous value.  They never
// fabricate contract-required fields from available data, and they never
// substitute defaults for unknown values.

import { PortraitSourceDataError } from "./errors.js";
import { dedupSorted } from "./types.js";

// ---------------------------------------------------------------------------
// Time window: "YYYY-MM-DD/YYYY-MM-DD" -> { periodStart, periodEnd }
// ---------------------------------------------------------------------------

export function parseTimeWindow(timeWindow: string): { periodStart: string; periodEnd: string } {
  const parts = timeWindow.split("/");
  if (parts.length !== 2) {
    throw new PortraitSourceDataError(`invalid time_window format: expected "YYYY-MM-DD/YYYY-MM-DD"`);
  }
  const periodStart = parts[0]!.trim();
  const periodEnd = parts[1]!.trim();
  if (!isValidBusinessDate(periodStart) || !isValidBusinessDate(periodEnd)) {
    throw new PortraitSourceDataError(`time_window contains invalid date format`);
  }
  if (periodStart > periodEnd) {
    throw new PortraitSourceDataError(`time_window start is after end`);
  }
  return { periodStart, periodEnd };
}

function isValidBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// ---------------------------------------------------------------------------
// Timestamp normalization: only accept approved UTC Z timestamp formats.
// Accepted: YYYY-MM-DDTHH:MM:SSZ and YYYY-MM-DDTHH:MM:SS.mmmZ
// Rejected: date-only, offset (+/-HH:MM), local (no Z), and other non-UTC forms.
// Also rejects semantically invalid timestamps (e.g. 2026-02-29, 24:00:00).
// ---------------------------------------------------------------------------

const UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UTC_S_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function normalizeToUtcMs(timestamp: string): string {
  if (typeof timestamp !== "string" || timestamp.trim().length === 0) {
    throw new PortraitSourceDataError(`invalid UTC timestamp: must be a non-blank string`);
  }
  // Reject date-only, offset, and local forms explicitly.
  if (!UTC_MS_RE.test(timestamp) && !UTC_S_RE.test(timestamp)) {
    throw new PortraitSourceDataError(
      `invalid UTC timestamp: only YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS.mmmZ accepted; got "${timestamp}"`,
    );
  }
  // Extract and validate calendar/time components.
  const year = Number(timestamp.slice(0, 4));
  const month = Number(timestamp.slice(5, 7));
  const day = Number(timestamp.slice(8, 10));
  const hour = Number(timestamp.slice(11, 13));
  const minute = Number(timestamp.slice(14, 16));
  const second = Number(timestamp.slice(17, 19));

  if (month < 1 || month > 12) {
    throw new PortraitSourceDataError(`invalid UTC timestamp: month must be 01-12, got "${timestamp.slice(5, 7)}"`);
  }
  if (hour > 23) {
    throw new PortraitSourceDataError(`invalid UTC timestamp: hour must be 00-23, got "${timestamp.slice(11, 13)}"`);
  }
  if (minute > 59) {
    throw new PortraitSourceDataError(`invalid UTC timestamp: minute must be 00-59, got "${timestamp.slice(14, 16)}"`);
  }
  if (second > 59) {
    throw new PortraitSourceDataError(`invalid UTC timestamp: second must be 00-59, got "${timestamp.slice(17, 19)}"`);
  }
  // Validate day for month (including leap year).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new PortraitSourceDataError(
      `invalid UTC timestamp: day must be 01-${daysInMonth} for ${year}-${timestamp.slice(5, 7)}, got "${timestamp.slice(8, 10)}"`,
    );
  }
  // Preserve milliseconds for .mmmZ format; default to 0 for .SSZ format.
  const ms = UTC_MS_RE.test(timestamp) ? Number(timestamp.slice(20, 23)) : 0;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms)).toISOString();
}

// ---------------------------------------------------------------------------
// Sample size: non-negative safe integer or null
// ---------------------------------------------------------------------------

export function parseSampleSize(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new PortraitSourceDataError(`invalid sampleSize: must be a non-negative safe integer or null`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Confidence: finite number in [0, 1] or null
// ---------------------------------------------------------------------------

export function parseConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new PortraitSourceDataError(`invalid confidence: must be a finite number in [0, 1] or null`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Quality flags JSON: must be a valid JSON array of non-blank strings
// ---------------------------------------------------------------------------

export function parseQualityFlags(json: string | null): string[] {
  if (json === null || json === undefined) {
    throw new PortraitSourceDataError(`source has null quality_flags_json; source must provide empty array when no flags exist`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PortraitSourceDataError(`invalid quality_flags_json: not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new PortraitSourceDataError(`invalid quality_flags_json: expected an array`);
  }
  const flags: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new PortraitSourceDataError(`invalid quality_flags_json: expected non-blank strings`);
    }
    flags.push(item);
  }
  return dedupSorted(flags);
}

// ---------------------------------------------------------------------------
// Evidence refs JSON: must be a non-empty array of objects with required fields
// ---------------------------------------------------------------------------

export function parseEvidenceRefs(json: string, dimensionKey: string): Record<string, unknown>[] {
  if (json === null || json === undefined) {
    throw new PortraitSourceDataError(
      `source dimension evidence has null source_evidence_refs_json for dimension "${dimensionKey}"`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PortraitSourceDataError(
      `invalid source_evidence_refs_json for dimension "${dimensionKey}": not valid JSON`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new PortraitSourceDataError(
      `invalid source_evidence_refs_json for dimension "${dimensionKey}": expected an array`,
    );
  }
  if (parsed.length === 0) {
    throw new PortraitSourceDataError(
      `source dimension evidence has empty source_evidence_refs_json for dimension "${dimensionKey}"`,
    );
  }
  const refs: Record<string, unknown>[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new PortraitSourceDataError(
        `invalid source_evidence_refs_json[${i}] for dimension "${dimensionKey}": expected an object`,
      );
    }
    const ref = item as Record<string, unknown>;
    if (ref["sourceSystem"] !== "agentharness") {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": sourceSystem must be "agentharness"`,
      );
    }
    if (ref["sourceRecordType"] !== "platform_profile_tag_metric") {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": sourceRecordType must be exactly "platform_profile_tag_metric"`,
      );
    }
    if (typeof ref["sourceRecordId"] !== "string" || (ref["sourceRecordId"] as string).trim().length === 0) {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": missing sourceRecordId`,
      );
    }
    if (typeof ref["sourceBatchId"] !== "string" || (ref["sourceBatchId"] as string).trim().length === 0) {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": missing sourceBatchId`,
      );
    }
    if (typeof ref["sourceFile"] !== "string" || (ref["sourceFile"] as string).trim().length === 0) {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": missing sourceFile`,
      );
    }
    if (ref["sourceRow"] === null || ref["sourceRow"] === undefined || typeof ref["sourceRow"] !== "number" || !Number.isSafeInteger(ref["sourceRow"]) || ref["sourceRow"] < 0) {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": missing or invalid sourceRow`,
      );
    }
    if (typeof ref["platformTagCatalogId"] !== "string" || (ref["platformTagCatalogId"] as string).trim().length === 0) {
      throw new PortraitSourceDataError(
        `source_evidence_refs_json[${i}] for dimension "${dimensionKey}": missing platformTagCatalogId`,
      );
    }
    refs.push(ref);
  }
  return refs;
}
