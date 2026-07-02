import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const dataDir = resolve(import.meta.dirname, "../../../../data");

export function openDb(workspaceId: string): DatabaseSync {
  const dbPath = resolve(dataDir, "workspaces", workspaceId, "db.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
