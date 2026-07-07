import { Hono, type Context, type Next } from "hono";
import { openDb } from "../db/connection.js";
import { ok, invalidInput, internalError, unauthorized } from "../lib/response.js";
import {
  idempotencyMiddleware,
  storeIdempotent,
  readJson,
} from "../lib/idempotency.js";
import {
  stageCsvFile,
  dryRunCsv,
  executeCsvImport,
} from "../lib/csv-ingestion.js";

const ADMIN_TOKEN = "pls-admin-token";

function adminTokenRequired() {
  return async (c: Context, next: Next) => {
    if (c.req.header("X-PLS-Admin-Token") !== ADMIN_TOKEN) {
      return unauthorized(c);
    }
    await next();
  };
}

function invalidConfirmText(c: Context, expected: string): Response {
  return invalidInput(c, `confirmText required: must be exactly "${expected}"`, "confirmText");
}

function requireIdempotencyKey(c: Context): Response | null {
  if (!c.req.header("Idempotency-Key")) {
    return invalidInput(c, "Idempotency-Key header is required for CSV imports", "Idempotency-Key");
  }
  return null;
}

const admin = new Hono();

// ---------------------------------------------------------------------------
// POST /csv/dry-run
// ---------------------------------------------------------------------------
admin.post("/csv/dry-run", async (c) => {
  const wsId = c.get("workspaceId");
  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch (err) {
    return invalidInput(c, `failed to parse multipart body: ${err instanceof Error ? err.message : String(err)}`, "body");
  }

  const targetTable = body.targetTable;
  if (typeof targetTable !== "string" || !targetTable) {
    return invalidInput(c, "targetTable is required", "targetTable");
  }

  const file = body.file;
  if (!(file instanceof File) && !(typeof file === "object" && file != null && "name" in file && "text" in file)) {
    return invalidInput(c, "file is required", "file");
  }

  const db = openDb(wsId);
  try {
    const staged = await stageCsvFile(wsId, targetTable, file as File);
    const dry = dryRunCsv(db, wsId, targetTable, staged.stagedFileId);
    return ok(c, {
      operation: dry.operation,
      targetType: dry.targetType,
      targetName: dry.targetName,
      affectedTables: dry.affectedTables,
      affectedRows: dry.affectedRows,
      sourceType: dry.sourceType,
      dataVersion: dry.dataVersion,
      containsUserAuthorized: dry.containsUserAuthorized,
      containsSystemHistory: dry.containsSystemHistory,
      warnings: dry.warnings,
      requiredConfirmText: dry.requiredConfirmText,
      stagedFileId: dry.stagedFileId,
      qualityReport: dry.qualityReport,
    });
  } catch (err) {
    return internalError(c, `dry run failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// POST /csv/import
// ---------------------------------------------------------------------------
admin.post("/csv/import", adminTokenRequired(), idempotencyMiddleware(), async (c) => {
  const idemErr = requireIdempotencyKey(c);
  if (idemErr) return idemErr;

  const wsId = c.get("workspaceId");
  const body = await readJson<{ stagedFileId?: string; targetTable?: string; confirmText?: string }>(c);

  if (!body.stagedFileId) {
    return invalidInput(c, "stagedFileId is required", "stagedFileId");
  }
  if (!body.targetTable) {
    return invalidInput(c, "targetTable is required", "targetTable");
  }

  const expectedConfirm = `IMPORT CSV ${body.targetTable}`;
  if (body.confirmText !== expectedConfirm) {
    return invalidConfirmText(c, expectedConfirm);
  }

  const db = openDb(wsId);
  try {
    const dry = dryRunCsv(db, wsId, body.targetTable, body.stagedFileId);
    if (dry.blockingErrorCount > 0) {
      return invalidInput(
        c,
        `import blocked by dry-run errors: ${dry.qualityReport.sampleErrors.map((e) => e.message).join("; ")}`,
        "dryRun"
      );
    }

    const result = executeCsvImport(db, wsId, body.targetTable, body.stagedFileId);
    const response = ok(c, {
      operation: "import",
      status: "success",
      auditId: result.auditId,
      jobId: result.jobId,
      beforeSnapshot: result.beforeSnapshot,
      afterSnapshot: result.afterSnapshot,
      warnings: result.warnings,
    });
    return storeIdempotent(c, response, result.jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Staged file") || message.includes("not found or was modified")) {
      return invalidInput(c, message, "stagedFileId");
    }
    return internalError(c, `import failed: ${message}`);
  } finally {
    db.close();
  }
});

export default admin;
