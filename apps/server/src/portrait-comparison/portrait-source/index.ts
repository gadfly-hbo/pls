// PLS PortraitSource seam - public exports for W05 application/persistence.
//
// Only the 4-method PortraitSource interface, the resolver, types, and errors
// are exported.  SQLite rows, SQL, view names, adapter constructors, and
// schema-gate internals stay internal.

// --- Constants & types ---
export {
  PLS_PORTRAIT_SOURCE_CONTRACT_ID,
  PLS_PORTRAIT_SOURCE_CONTRACT_VERSION,
  AGENTHARNESS_PORTRAIT_CONTRACT_VERSION,
  PORTRAIT_SOURCE_SYSTEMS,
  PORTRAIT_OBJECT_FAMILIES,
  APPROVED_CHANNEL_OBJECT_TYPES,
  APPROVED_PRODUCT_OBJECT_TYPES,
  dedupSorted,
  isApprovedChannelObjectType,
  isApprovedProductObjectType,
  familyForObjectType,
} from "./types.js";

export type {
  PortraitSourceSystem,
  PortraitObjectFamily,
  ApprovedChannelObjectType,
  ApprovedProductObjectType,
  PortraitObjectType,
  PortraitCapabilityReadiness,
  PortraitSourceCapability,
  PortraitObject,
  PortraitSnapshot,
  DimensionEvidenceRecord,
  ResolvedPortraitSnapshot,
  ListPortraitObjectsFilters,
  PortraitSource,
  ResolvedActiveSource,
} from "./types.js";

// --- Errors ---
export {
  PortraitSourceError,
  PortraitSourceConfigError,
  PortraitSourceUnavailableError,
  PortraitSourceDataError,
  PortraitSourceSchemaError,
  PortraitSourceNotReadyError,
  PortraitSourceResolverError,
} from "./errors.js";

export type { PortraitSourceErrorCode } from "./errors.js";

// --- Resolver (the only public entry point for obtaining a PortraitSource) ---
export {
  PORTRAIT_SOURCE_ID,
  resolveActivePortraitSource,
} from "./resolver.js";

export type { ResolveActiveSourceOptions } from "./resolver.js";
