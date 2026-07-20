// Application error taxonomy — stable codes, desensitized messages.
// Raw SQLite/source/provider errors never enter DTOs or messages.

export class ComparisonApplicationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ComparisonApplicationError";
    this.code = code;
  }
}

export class ComparisonValidationError extends ComparisonApplicationError {
  readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  constructor(issues: ReadonlyArray<{ readonly path: string; readonly message: string }>) {
    super("comparison_validation", issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    this.name = "ComparisonValidationError";
    this.issues = issues;
  }
}

export class ComparisonIdempotencyConflictError extends ComparisonApplicationError {
  constructor(message: string) {
    super("comparison_idempotency_conflict", message);
    this.name = "ComparisonIdempotencyConflictError";
  }
}

export class ComparisonQualityGateError extends ComparisonApplicationError {
  readonly reasonCodes: readonly string[];
  constructor(reasonCodes: readonly string[]) {
    super("comparison_quality_blocked", `quality gate blocked: ${reasonCodes.join(", ")}`);
    this.name = "ComparisonQualityGateError";
    this.reasonCodes = reasonCodes;
  }
}

export class ComparisonSourceError extends ComparisonApplicationError {
  constructor(message: string) {
    super("comparison_source_error", message);
    this.name = "ComparisonSourceError";
  }
}

export class ComparisonConcurrencyError extends ComparisonApplicationError {
  constructor(message: string) {
    super("comparison_concurrency_conflict", message);
    this.name = "ComparisonConcurrencyError";
  }
}

export class ComparisonStateError extends ComparisonApplicationError {
  constructor(message: string) {
    super("comparison_state_violation", message);
    this.name = "ComparisonStateError";
  }
}

export class ComparisonNotFoundError extends ComparisonApplicationError {
  constructor(message: string) {
    super("comparison_not_found", message);
    this.name = "ComparisonNotFoundError";
  }
}
