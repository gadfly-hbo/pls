import { createHash } from "node:crypto";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PortraitComparisonValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class PortraitComparisonValidationError extends Error {
  readonly issues: readonly PortraitComparisonValidationIssue[];

  constructor(issues: readonly PortraitComparisonValidationIssue[] | string) {
    const normalized = typeof issues === "string" ? [{ path: "$", message: issues }] : issues;
    super(normalized.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "PortraitComparisonValidationError";
    this.issues = normalized;
  }
}

export function assertJsonValue(value: unknown, path = "$", stack: Set<object> = new Set()): asserts value is JsonValue {
  if (value === null) return;
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) throw new PortraitComparisonValidationError([{ path, message: "non-finite number is not allowed" }]);
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new PortraitComparisonValidationError([{ path, message: "unsafe integer is not allowed" }]);
      return;
    case "object": {
      if (stack.has(value)) throw new PortraitComparisonValidationError([{ path, message: "circular structure is not allowed" }]);
      if (!Array.isArray(value)) {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
          throw new PortraitComparisonValidationError([{ path, message: "only plain JSON objects are allowed" }]);
        }
      }
      stack.add(value);
      try {
        if (Array.isArray(value)) {
          for (let index = 0; index < value.length; index += 1) {
            if (!(index in value)) {
              throw new PortraitComparisonValidationError([{ path: `${path}[${index}]`, message: "sparse array holes are not allowed" }]);
            }
          }
          value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, stack));
          return;
        }
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          assertJsonValue(child, `${path}.${key}`, stack);
        }
      } finally {
        stack.delete(value);
      }
      return;
    }
    default:
      throw new PortraitComparisonValidationError([{ path, message: `value of type ${typeof value} is not valid JSON` }]);
  }
}

export function canonicalJson(value: unknown): string {
  assertJsonValue(value);
  return serializeCanonicalJson(value);
}

function serializeCanonicalJson(value: JsonValue): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) return `[${value.map((item) => serializeCanonicalJson(item)).join(",")}]`;
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${serializeCanonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
}

export function checksumCanonicalJson(value: JsonValue): string {
  assertJsonValue(value);
  return createHash("sha256").update(serializeCanonicalJson(value), "utf8").digest("hex");
}

export function toJsonValue(value: unknown, path = "$checkable"): JsonValue {
  assertJsonValue(value, path);
  return value;
}
