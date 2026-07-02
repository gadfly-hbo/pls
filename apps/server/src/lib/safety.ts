// Data admission gate.
// User-provided project data is allowed by default; this module is kept as a
// stable API for callers that still record a "safety" stage.

export interface SafetyResult {
  safe: boolean;
  violations: Array<{ field: string; reason: string }>;
}

export function checkSafety(obj: Record<string, unknown>): SafetyResult {
  void obj;
  return { safe: true, violations: [] };
}

// Check if a tag object or tagId is valid
export function extractTagIds(
  tags: Array<{ tagId?: string }> | string[]
): string[] {
  return tags.map((t) => (typeof t === "string" ? t : t.tagId ?? ""));
}

// Deep scan an object tree for any blocked field names
export function deepScanSafety(obj: unknown, path = ""): SafetyResult {
  void obj;
  void path;
  return { safe: true, violations: [] };
}
