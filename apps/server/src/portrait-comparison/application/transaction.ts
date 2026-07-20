// Transaction helper — BEGIN IMMEDIATE with explicit rollback on error.
// Rollback/close errors never mask the original controlled error.

import type { DatabaseSync } from "node:sqlite";

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // the original error carries the useful diagnostic
    }
    throw error;
  }
}
