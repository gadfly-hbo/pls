// P1-B3: In-process async task worker with timeout fallback.
//
// Design:
// - Zero external queue dependency; jobs run in setImmediate off the request loop.
// - `runWithTimeout(job, timeoutMs)` returns { kind:"done", value } if the job
//   completes in time, else { kind:"timeout", promise } giving the caller access
//   to the still-running work so it can be detached.
// - `markTask` writes a single task row transition (running / succeeded / failed
//   / cancelled) plus started_at / finished_at / error, so GET /tasks/{taskId}
//   always reflects a consistent state.
//
// Redline: task input JSON and audit meta contain only IDs, model version and
// counts — never raw S0/S1 values. This is enforced by callers; the worker
// module itself never touches request payloads.

import { openDb } from "../db/connection.js";

export const DEFAULT_SYNC_TIMEOUT_MS = 8_000;

interface TaskUpdate {
  status: "running" | "succeeded" | "failed" | "cancelled";
  error?: { code: string; message: string };
  attempt?: number;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function markTask(workspaceId: string, taskId: string, update: TaskUpdate): void {
  const db = openDb(workspaceId);
  try {
    const now = nowIso();
    const fields: string[] = ["status = ?", "updated_at = ?"];
    const values: (string | number | null)[] = [update.status, now];

    if (update.status === "running") {
      fields.push("started_at = COALESCE(started_at, ?)");
      values.push(now);
    }
    if (
      update.status === "succeeded" ||
      update.status === "failed" ||
      update.status === "cancelled"
    ) {
      fields.push("finished_at = ?");
      values.push(now);
    }
    if (update.error) {
      fields.push("error = ?");
      values.push(JSON.stringify(update.error));
    }
    if (typeof update.attempt === "number") {
      fields.push("attempts = ?");
      values.push(update.attempt);
    }

    values.push(taskId, workspaceId);
    db.prepare(
      `UPDATE task SET ${fields.join(", ")} WHERE task_id = ? AND workspace_id = ?`
    ).run(...values);
  } finally {
    db.close();
  }
}

export type TimeoutOutcome<T> =
  | { kind: "done"; value: T }
  | { kind: "timeout"; work: Promise<T> };

/**
 * Race a job against a soft timeout. On timeout the caller still holds the
 * work promise so it can attach `.then/.catch` handlers to update task state
 * when the background job finally settles.
 */
export function runWithTimeout<T>(
  job: () => Promise<T>,
  timeoutMs: number
): Promise<TimeoutOutcome<T>> {
  const work = Promise.resolve().then(job);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: "timeout", work });
    }, timeoutMs);

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "done", value });
      },
      () => {
        // Failure: still resolve as "done" with a rejected work so caller can
        // await it and translate to error. We resolve rather than reject so
        // the timer is guaranteed cleared.
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "done", value: work as unknown as T });
      }
    );
  });
}
