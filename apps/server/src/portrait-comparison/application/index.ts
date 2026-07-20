// Comparison Application — public surface.
// Only exports the stable DTO types and the ComparisonApplication interface.
// Internal helpers, repository row types, and test fixtures are NOT exported.

export {
  PLS_COMPARISON_CONTRACT_ID,
  PLS_COMPARISON_CONTRACT_VERSION,
} from "./types.js";

export type {
  ComparisonMode,
  ComparisonObjectRef,
  ComparisonSnapshotRef,
  ComparisonSideRef,
  CreateComparisonInput,
  CreateComparisonOutput,
  ListComparisonsInput,
  ComparisonSummary,
  ListComparisonsOutput,
  PortraitSourceDetail,
  ComparisonParticipantDetail,
  DimensionEvidenceDetail,
  DimensionAssessmentDetail,
  ExplanationAttemptDetail,
  ArchiveEventDetail,
  ComparisonDetail,
  CreateExplanationInput,
  ExplanationOutput,
  ArchiveComparisonInput,
  ArchiveComparisonOutput,
  ComparisonApplication,
} from "./types.js";

export {
  ComparisonApplicationError,
  ComparisonValidationError,
  ComparisonIdempotencyConflictError,
  ComparisonQualityGateError,
  ComparisonSourceError,
  ComparisonConcurrencyError,
  ComparisonStateError,
  ComparisonNotFoundError,
} from "./errors.js";

// Production factory — accepts only public deps, always uses getProductionQualityPolicy()
export { createProductionComparisonApplication } from "./comparison-application.js";
export type { ComparisonApplicationDeps } from "./comparison-application.js";

// Implementation functions (for direct use by tests and integration)
export {
  createComparison,
  getComparisonDetail,
  listComparisons,
  createExplanation,
  archiveComparison,
} from "./comparison-application.js";

// Public context — minimal, cannot bypass getProductionQualityPolicy()
export type { ComparisonApplicationPublicContext } from "./comparison-application.js";
// ComparisonApplicationContext is internal/test-only and NOT exported
