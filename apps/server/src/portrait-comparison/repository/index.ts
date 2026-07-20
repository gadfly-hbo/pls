// Repository index — re-exports for application layer consumption.

export type {
  ComparisonRunRow,
  ComparisonParticipantRow,
  ComparisonPortraitSourceRow,
  ComparisonDimensionEvidenceRow,
  ComparisonDimensionAssessmentRow,
  ComparisonExplanationAttemptRow,
  ComparisonExplanationOutcomeRow,
  ComparisonArchiveEventRow,
  ComparisonRunGraph,
} from "./types.js";

export {
  insertComparisonRunGraph,
  findRunByIdempotencyKey,
  findRunWorkspaceId,
  listComparisonRuns,
  getComparisonRunDetail,
  comparisonRecordExists,
} from "./comparison-run-repository.js";

export type {
  IdempotencyRecord,
  ComparisonRunListRow,
  ListComparisonRunsOptions,
  ComparisonRunDetail,
} from "./comparison-run-repository.js";

export type { ManifestRecordType } from "./comparison-run-repository.js";

export {
  insertExplanationAttempt,
  insertExplanationOutcome,
  findExplanationAttempt,
  findOutcomeByAttemptId,
  getMaxAttemptSequence,
  listAttemptsWithOutcomes,
} from "./explanation-repository.js";

export {
  insertArchiveEvent,
  findArchiveEventByIdempotencyKey,
  getMaxArchiveSequence,
  getLatestArchiveEvent,
  listArchiveEvents,
} from "./archive-repository.js";
