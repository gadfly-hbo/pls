#!/usr/bin/env node
// Workspace write guard: prevents backend scripts from accidentally writing to the
// protected ws_demo fixture workspace. Import and call guardWriteWorkspace() before
// opening a workspace DB or issuing a write request.

const PROTECTED_WORKSPACE = "ws_demo";
const DEFAULT_OVERRIDE_VAR = "PLS_ALLOW_WS_DEMO_WRITE";

export class WsDemoWriteGuardError extends Error {
  constructor(purpose, overrideVar) {
    super(
      `Refusing to perform write operation in protected workspace '${PROTECTED_WORKSPACE}'.\n` +
        `Purpose: ${purpose ?? "unspecified"}\n` +
        `To target a different workspace, set PLS_WORKSPACE=ws_<purpose>_<timestamp>.\n` +
        `If you are the controller and explicitly intend to mutate ${PROTECTED_WORKSPACE}, set ${overrideVar}=1.`
    );
    this.name = "WsDemoWriteGuardError";
    this.code = "WS_DEMO_WRITE_BLOCKED";
  }
}

function overrideIsActive(override) {
  if (override == null || override === "") return false;
  if (override === "0") return false;
  if (override.toLowerCase() === "false") return false;
  return true;
}

export function guardWriteWorkspace(workspace, { purpose, overrideVar = DEFAULT_OVERRIDE_VAR } = {}) {
  if (workspace !== PROTECTED_WORKSPACE) return;
  const override = process.env[overrideVar];
  if (!overrideIsActive(override)) {
    throw new WsDemoWriteGuardError(purpose, overrideVar);
  }
  console.warn(
    `[WS-GUARD] OVERRIDE active (${overrideVar}=${override}): allowing write to ${PROTECTED_WORKSPACE}` +
      (purpose ? ` for purpose: ${purpose}` : "")
  );
}

export function makeTempWorkspace(prefix) {
  const clean = String(prefix)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
  return `${clean}_${Date.now()}`;
}
