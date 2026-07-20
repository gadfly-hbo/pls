import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export class MigrationBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationBackupError";
  }
}

export const MIGRATION_BACKUP_DIRNAME = ".migration-backups";

export interface MigrationBackup {
  backupPath: string;
}

// Derive the real on-disk path of the open main database from the live
// connection. Returns null for in-memory databases (backup is impossible).
export function resolveMainDbPath(db: DatabaseSync): string | null {
  const rows = db.prepare("PRAGMA database_list").all() as Array<{
    seq: number;
    name: string;
    file: string;
  }>;
  const main = rows.find((row) => row.name === "main");
  if (!main || main.file.trim().length === 0) return null;
  return path.resolve(main.file);
}

function isOpen(db: DatabaseSync): boolean {
  try {
    db.exec("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// Create an owner-only backup of the database file inside the workspace's
// `.migration-backups/` directory. The backup directory is derived from the
// real database path; symlinked or escaping directories are refused.
export function createMigrationBackup(db: DatabaseSync, dbPath: string): MigrationBackup {
  const realDbPath = fs.realpathSync(dbPath);
  const workspaceDir = path.dirname(realDbPath);
  const backupDir = path.join(workspaceDir, MIGRATION_BACKUP_DIRNAME);

  if (fs.existsSync(backupDir)) {
    const stat = fs.lstatSync(backupDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new MigrationBackupError(
        `migration backup dir ${backupDir} is not a plain directory; refusing to use it`
      );
    }
    const realBackupDir = fs.realpathSync(backupDir);
    if (realBackupDir !== backupDir || path.dirname(realBackupDir) !== workspaceDir) {
      throw new MigrationBackupError(
        `migration backup dir ${backupDir} resolves to ${realBackupDir} outside ${workspaceDir}; refusing path escape`
      );
    }
  } else {
    fs.mkdirSync(backupDir, { mode: 0o700 });
  }
  fs.chmodSync(backupDir, 0o700);

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(realDbPath)}.backup-${stamp}`);
  fs.copyFileSync(realDbPath, backupPath);
  fs.chmodSync(backupPath, 0o600);
  return { backupPath };
}

// Restore the database file from a backup while the caller's handle is still
// open. The live handle first flushes and truncates the WAL, so the caller's
// later close() has no committed frames left to replay into the restored file
// (closing an open handle never throws, so a try/finally close in the call
// chain cannot mask the original migration error). After this function
// returns the handle is dead: callers must close it without issuing further
// statements. Verified on Node 26 / WAL mode: close after restore succeeds
// and a fresh connection sees exactly the backup content.
export function restoreMigrationBackup(
  db: DatabaseSync,
  dbPath: string,
  backupPath: string
): void {
  if (isOpen(db)) {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  fs.copyFileSync(backupPath, dbPath);
  for (const suffix of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // sidecar files may not exist
    }
  }
}
