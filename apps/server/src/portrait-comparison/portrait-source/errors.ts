// PLS PortraitSource error taxonomy.
//
// Errors use stable codes; messages are desensitized and never include raw
// SQL, portrait content, database rows, or provider errors.  The base class
// lets callers catch any portrait-source failure without swallowing unrelated
// errors.

export type PortraitSourceErrorCode =
  | "portrait_source_config"
  | "portrait_source_unavailable"
  | "portrait_source_data"
  | "portrait_source_schema"
  | "portrait_source_not_ready"
  | "portrait_source_resolver";

export class PortraitSourceError extends Error {
  readonly code: PortraitSourceErrorCode;

  constructor(code: PortraitSourceErrorCode, message: string) {
    super(message);
    this.name = "PortraitSourceError";
    this.code = code;
  }
}

export class PortraitSourceConfigError extends PortraitSourceError {
  constructor(message: string) {
    super("portrait_source_config", message);
    this.name = "PortraitSourceConfigError";
  }
}

export class PortraitSourceUnavailableError extends PortraitSourceError {
  constructor(message: string) {
    super("portrait_source_unavailable", message);
    this.name = "PortraitSourceUnavailableError";
  }
}

export class PortraitSourceDataError extends PortraitSourceError {
  constructor(message: string) {
    super("portrait_source_data", message);
    this.name = "PortraitSourceDataError";
  }
}

export class PortraitSourceSchemaError extends PortraitSourceError {
  readonly diagnostic: import("./types.js").SchemaDiagnostic;

  constructor(diagnostic: import("./types.js").SchemaDiagnostic) {
    const parts: string[] = [];
    if (diagnostic.viewsMissing.length > 0) {
      parts.push(`missing core views [${diagnostic.viewsMissing.join(", ")}]`);
    }
    if (diagnostic.columnsMissing.length > 0) {
      parts.push(`missing columns [${diagnostic.columnsMissing.map((c) => `${c.view}: ${c.columns.join(", ")}`).join("; ")}]`);
    }
    if (diagnostic.columnsExtra.length > 0) {
      parts.push(`extra columns [${diagnostic.columnsExtra.map((c) => `${c.view}: ${c.columns.join(", ")}`).join("; ")}]`);
    }
    if (diagnostic.columnsReordered.length > 0) {
      parts.push(`reordered columns [${diagnostic.columnsReordered.map((c) => `${c.view}: expected [${c.expected.join(", ")}] but got [${c.actual.join(", ")}]`).join("; ")}]`);
    }
    super("portrait_source_schema", `AgentHarness schema incompatible with consumption contract: ${parts.join(", ")}`);
    this.name = "PortraitSourceSchemaError";
    this.diagnostic = diagnostic;
  }
}

export class PortraitSourceNotReadyError extends PortraitSourceError {
  constructor(message: string) {
    super("portrait_source_not_ready", message);
    this.name = "PortraitSourceNotReadyError";
  }
}

export class PortraitSourceResolverError extends PortraitSourceError {
  constructor(message: string) {
    super("portrait_source_resolver", message);
    this.name = "PortraitSourceResolverError";
  }
}
