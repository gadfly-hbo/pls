import { openDb } from "./connection.js";
import {
  SCHEMA_DDL,
  DOUYIN_BI_DDL,
  DOUYIN_BI_DDL_PART2,
  DOUYIN_BI_DDL_PART3,
  DATA_MANAGEMENT_DDL,
  CHANNEL_ENTITY_DDL,
  NEW_PRODUCT_DDL,
  FLYWHEEL_DDL,
  ADMIN_DDL,
} from "./schema.js";

const ALL_DDL = [
  SCHEMA_DDL,
  DOUYIN_BI_DDL,
  DOUYIN_BI_DDL_PART2,
  DOUYIN_BI_DDL_PART3,
  DATA_MANAGEMENT_DDL,
  CHANNEL_ENTITY_DDL,
  NEW_PRODUCT_DDL,
  FLYWHEEL_DDL,
  ADMIN_DDL,
].join("\n");

function extractNames(ddl: string, type: "table" | "view"): string[] {
  const pattern =
    type === "table"
      ? /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi
      : /CREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  const names: string[] = [];
  let match;
  while ((match = pattern.exec(ddl)) !== null) {
    names.push(match[1]!.toLowerCase());
  }
  return [...new Set(names)];
}

export interface SchemaCheckResult {
  valid: boolean;
  missing: string[];
  extra: string[];
  viewMissing: string[];
  viewExtra: string[];
  migrationStatus: {
    total: number;
    applied: number;
    pending: number;
    failed: number;
  };
}

export function validateSchema(workspaceId: string): SchemaCheckResult {
  const db = openDb(workspaceId);
  try {
    // Collect code-defined names
    const codeTables = extractNames(ALL_DDL, "table");
    const codeViews = extractNames(ALL_DDL, "view");

    // Collect actual DB names
    const dbRows = db
      .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string; type: string }>;

    const dbTables = dbRows
      .filter((r) => r.type === "table")
      .map((r) => r.name.toLowerCase());
    const dbViews = dbRows
      .filter((r) => r.type === "view")
      .map((r) => r.name.toLowerCase());

    const missing = codeTables.filter((t) => !dbTables.includes(t));
    const extra = dbTables.filter((t) => !codeTables.includes(t));
    const viewMissing = codeViews.filter((v) => !dbViews.includes(v));
    const viewExtra = dbViews.filter((v) => !codeViews.includes(v));

    // Migration status
    let migrationStatus = { total: 0, applied: 0, pending: 0, failed: 0 };
    const hasMigrationTable = dbTables.includes("schema_migration");
    if (hasMigrationTable) {
      const rows = db
        .prepare("SELECT status, COUNT(*) as cnt FROM schema_migration GROUP BY status")
        .all() as Array<{ status: string; cnt: number }>;
      for (const row of rows) {
        migrationStatus.total += row.cnt;
        if (row.status === "applied") migrationStatus.applied = row.cnt;
        else if (row.status === "pending") migrationStatus.pending = row.cnt;
        else if (row.status === "failed") migrationStatus.failed = row.cnt;
      }
    }

    return {
      valid: missing.length === 0 && viewMissing.length === 0,
      missing,
      extra,
      viewMissing,
      viewExtra,
      migrationStatus,
    };
  } finally {
    db.close();
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const wsId = process.argv[2] || "ws_demo";
  const result = validateSchema(wsId);

  console.log(`Schema check for workspace: ${wsId}`);
  console.log(`  Valid: ${result.valid}`);
  console.log(`  Tables missing: ${result.missing.length === 0 ? "none" : result.missing.join(", ")}`);
  console.log(`  Tables extra: ${result.extra.length === 0 ? "none" : result.extra.join(", ")}`);
  console.log(`  Views missing: ${result.viewMissing.length === 0 ? "none" : result.viewMissing.join(", ")}`);
  console.log(`  Views extra: ${result.viewExtra.length === 0 ? "none" : result.viewExtra.join(", ")}`);
  console.log(`  Migrations: ${result.migrationStatus.applied} applied, ${result.migrationStatus.pending} pending, ${result.migrationStatus.failed} failed`);

  process.exit(result.valid ? 0 : 1);
}
