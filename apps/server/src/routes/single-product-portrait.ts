import { Hono, type Context } from "hono";
import { ok, invalidInput, err } from "../lib/response.js";
import {
  getSingleProductPortraitMetadata,
  predictSingleProductPortrait,
  SingleProductPortraitModelUnavailableError,
  type CleanSingleProductPortraitInput,
} from "../lib/single-product-portrait/prediction.js";
import {
  parseBatchFile,
  buildPreviewResult,
  buildExecuteResult,
  type FieldName,
} from "../lib/single-product-portrait/batch.js";

const singleProductPortrait = new Hono();

const MAX_SKU_ID_LENGTH = 100;
const MAX_FABRIC_LENGTH = 500;
const MAX_FAB_LENGTH = 2000;

function isValidString(value: unknown): value is string {
  return typeof value === "string";
}

function validateSingleInput(body: Record<string, unknown>): {
  input: CleanSingleProductPortraitInput;
  error?: { code: string; message: string; field?: FieldName; rawValue?: string };
} {
  const skuId = isValidString(body.skuId) ? body.skuId.trim() : "";
  const fitType = isValidString(body.fitType) ? body.fitType.trim() : "";
  const fabric = isValidString(body.fabric) ? body.fabric.trim() : "";
  const fab = isValidString(body.fab) ? body.fab.trim() : "";

  if (skuId === "") {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "required_field_empty", message: "款号不能为空", field: "skuId", rawValue: "" },
    };
  }
  if (skuId.length > MAX_SKU_ID_LENGTH) {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "field_too_long", message: `款号超过 ${MAX_SKU_ID_LENGTH} 字符`, field: "skuId", rawValue: skuId },
    };
  }
  if (fitType === "") {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "required_field_empty", message: "版型不能为空", field: "fitType", rawValue: "" },
    };
  }
  if (fabric === "") {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "required_field_empty", message: "面料不能为空", field: "fabric", rawValue: "" },
    };
  }
  if (fabric.length > MAX_FABRIC_LENGTH) {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "field_too_long", message: `面料超过 ${MAX_FABRIC_LENGTH} 字符`, field: "fabric", rawValue: fabric },
    };
  }
  if (fab === "") {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "required_field_empty", message: "FAB 不能为空", field: "fab", rawValue: "" },
    };
  }
  if (fab.length > MAX_FAB_LENGTH) {
    return {
      input: { skuId, fitType, fabric, fab },
      error: { code: "field_too_long", message: `FAB 超过 ${MAX_FAB_LENGTH} 字符`, field: "fab", rawValue: fab },
    };
  }

  return { input: { skuId, fitType, fabric, fab } };
}

function badRequestIssue(
  c: Context,
  issue: { code: string; message: string; field?: FieldName; rawValue?: string },
) {
  const error: { code: string; message: string; field?: string; rawValue?: string } = {
    code: issue.code,
    message: issue.message,
  };
  if (issue.field) error.field = issue.field;
  if (issue.rawValue !== undefined) error.rawValue = issue.rawValue;
  return c.json(
    {
      code: "bad_request",
      requestId: (c.get("requestId") as string) ?? `req_${Date.now()}`,
      generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      error,
    },
    400,
  );
}

// ---------------------------------------------------------------------------
// GET /single-product-portrait/metadata
// ---------------------------------------------------------------------------
singleProductPortrait.get("/metadata", (c) => {
  return ok(c, getSingleProductPortraitMetadata());
});

// ---------------------------------------------------------------------------
// POST /single-product-portrait/predict
// ---------------------------------------------------------------------------
singleProductPortrait.post("/predict", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return invalidInput(c, "request body must be valid JSON", "body");
  }

  const metadata = getSingleProductPortraitMetadata();
  if (!metadata.modelAvailable) {
    return badRequestIssue(c, {
      code: "model_not_available",
      message: metadata.error?.message ?? "模型文件未生成，请先训练模型",
    });
  }

  const { input, error } = validateSingleInput(body);
  if (error) {
    return badRequestIssue(c, error);
  }

  if (!metadata.fitTypes.includes(input.fitType)) {
    return badRequestIssue(c, {
      code: "unknown_fit_type",
      message: "版型不在当前模型支持列表中",
      field: "fitType",
      rawValue: input.fitType,
    });
  }

  try {
    const prediction = predictSingleProductPortrait(input);
    return ok(c, { prediction });
  } catch (error) {
    if (error instanceof SingleProductPortraitModelUnavailableError) {
      return badRequestIssue(c, {
        code: error.code,
        message: error.message,
      });
    }
    return err(c, "internal_error", error instanceof Error ? error.message : String(error), 500);
  }
});

// ---------------------------------------------------------------------------
// POST /single-product-portrait/predict/batch/preview
// ---------------------------------------------------------------------------
singleProductPortrait.post("/predict/batch/preview", async (c) => {
  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch (err) {
    return invalidInput(c, `failed to parse multipart body: ${err instanceof Error ? err.message : String(err)}`, "body");
  }

  const file = body.file;
  if (!(file instanceof File)) {
    return invalidInput(c, "file is required", "file");
  }

  const parseResult = await parseBatchFile(file);
  return ok(c, buildPreviewResult(parseResult));
});

// ---------------------------------------------------------------------------
// POST /single-product-portrait/predict/batch
// ---------------------------------------------------------------------------
singleProductPortrait.post("/predict/batch", async (c) => {
  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch (err) {
    return invalidInput(c, `failed to parse multipart body: ${err instanceof Error ? err.message : String(err)}`, "body");
  }

  const file = body.file;
  if (!(file instanceof File)) {
    return invalidInput(c, "file is required", "file");
  }

  const parseResult = await parseBatchFile(file);
  if (parseResult.fileErrors.length > 0) {
    // File-level errors prevent prediction; return execute result with empty results
    return ok(c, {
      totalRows: parseResult.rows.length,
      successCount: 0,
      failureCount: parseResult.rows.length,
      warningCount: parseResult.warnings.length,
      results: [],
      fileErrors: parseResult.fileErrors,
      rowErrors: parseResult.rows.flatMap((row) => row.issues),
      warnings: parseResult.warnings,
      metadata: parseResult.metadata,
    });
  }

  return ok(c, buildExecuteResult(parseResult));
});

export default singleProductPortrait;
