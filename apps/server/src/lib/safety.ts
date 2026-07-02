// Safety gate: detect S0/S1 fields in input data
// Per pipeline-design.md §2.3 and data-safety-policy.md

// All entries lowercase — compared against key.toLowerCase()
const FIELD_BLACKLIST = [
  "phone",
  "name",
  "address",
  "orderid",
  "order_id",
  "memberid",
  "member_id",
  "openid",
  "open_id",
  "adid",
  "ad_id",
  "deviceid",
  "device_id",
  "buyername",
  "buyer_name",
  "email",
  "idcard",
  "id_card",
];

const VALUE_PATTERNS: [RegExp, string][] = [
  [/^1[3-9]\d{9}$/, "phone_number"],
  [/^\d{17}[\dXx]$/, "id_card"],
  [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "email"],
];

export interface SafetyResult {
  safe: boolean;
  violations: Array<{ field: string; reason: string }>;
}

export function checkSafety(obj: Record<string, unknown>): SafetyResult {
  const violations: SafetyResult["violations"] = [];

  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    for (const blocked of FIELD_BLACKLIST) {
      if (lowerKey === blocked) {
        violations.push({ field: key, reason: `blocked field name: ${blocked}` });
        break;
      }
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") continue;
    for (const [pattern, label] of VALUE_PATTERNS) {
      if (pattern.test(value)) {
        violations.push({ field: key, reason: `matches ${label} pattern` });
      }
    }
  }

  return { safe: violations.length === 0, violations };
}

// Check if a tag object or tagId is valid
export function extractTagIds(
  tags: Array<{ tagId?: string }> | string[]
): string[] {
  return tags.map((t) => (typeof t === "string" ? t : t.tagId ?? ""));
}

// Deep scan an object tree for any blocked field names
export function deepScanSafety(obj: unknown, path = ""): SafetyResult {
  const violations: SafetyResult["violations"] = [];

  if (obj === null || obj === undefined) return { safe: true, violations: [] };
  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      for (const [pattern, label] of VALUE_PATTERNS) {
        if (pattern.test(obj)) {
          violations.push({ field: path || "value", reason: `matches ${label} pattern` });
        }
      }
    }
    return { safe: violations.length === 0, violations };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = deepScanSafety(obj[i], `${path}[${i}]`);
      violations.push(...r.violations);
    }
    return { safe: violations.length === 0, violations };
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    for (const blocked of FIELD_BLACKLIST) {
      if (lowerKey === blocked) {
        violations.push({
          field: path ? `${path}.${key}` : key,
          reason: `blocked field name: ${blocked}`,
        });
        break;
      }
    }
    const childPath = path ? `${path}.${key}` : key;
    const r = deepScanSafety(value, childPath);
    violations.push(...r.violations);
  }

  return { safe: violations.length === 0, violations };
}
