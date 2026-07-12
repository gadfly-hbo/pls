#!/usr/bin/env node
import { execSync } from "node:child_process";

/**
 * Worktree diff guard for PLS product iterations.
 *
 * Fails if any forbidden generated artifact (tracked fixture DB, Playwright
 * reports, test-results, etc.) appears in the current worktree diff. This is a
 * gate to run before handoff / controller review, not a replacement for
 * `git diff --check`.
 *
 * Default forbidden patterns:
 *   - data/workspaces/ws_demo/db.sqlite
 *   - apps/web/playwright-report/index.html
 *   - apps/web/test-results/
 *
 * Override: PLS_ALLOW_DIRTY_WORKTREE=1 (controller-only escape hatch).
 * Custom patterns: PLS_WORKTREE_GUARD_FORBIDDEN=path1:path2/:path3/
 */

const DEFAULT_FORBIDDEN = [
  "data/workspaces/ws_demo/db.sqlite",
  "apps/web/playwright-report/index.html",
  "apps/web/test-results/",
];

function getPatterns() {
  const env = process.env.PLS_WORKTREE_GUARD_FORBIDDEN;
  if (env) {
    return env.split(":").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_FORBIDDEN;
}

function matchesForbidden(path, patterns) {
  for (const p of patterns) {
    if (p.endsWith("/")) {
      const dir = p.slice(0, -1);
      if (path === dir || path.startsWith(p)) {
        return p;
      }
    } else if (path === p) {
      return p;
    }
  }
  return null;
}

function collectPaths() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { encoding: "utf-8", cwd: process.cwd() }).trim();
    } catch {
      return "";
    }
  };

  const modified = run("git diff --name-only").split("\n").filter(Boolean);
  const staged = run("git diff --cached --name-only").split("\n").filter(Boolean);
  const untracked = run("git ls-files --others --exclude-standard").split("\n").filter(Boolean);

  return new Set([...modified, ...staged, ...untracked]);
}

function main() {
  const override = process.env.PLS_ALLOW_DIRTY_WORKTREE === "1";
  const patterns = getPatterns();
  const paths = collectPaths();

  const dirty = [];
  for (const path of paths) {
    const matched = matchesForbidden(path, patterns);
    if (matched) {
      dirty.push({ path, matched });
    }
  }

  if (dirty.length === 0) {
    console.log("OK: no forbidden generated artifacts in worktree diff.");
    process.exit(0);
  }

  console.error("FAIL: forbidden generated artifacts detected in worktree diff:");
  for (const { path, matched } of dirty) {
    console.error(`  - ${path} (matched pattern: ${matched})`);
  }
  console.error("\nTo restore a clean state:");
  console.error("  git checkout HEAD -- <path>");
  console.error("  rm -rf <path>       # for untracked generated directories");
  console.error("\nTo bypass (controller-only): PLS_ALLOW_DIRTY_WORKTREE=1 npm run guard:worktree");

  if (override) {
    console.warn("\nWARN: PLS_ALLOW_DIRTY_WORKTREE=1 override active; exiting 0 despite dirty artifacts.");
    process.exit(0);
  }

  process.exit(1);
}

main();
