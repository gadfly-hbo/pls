# learning_proposal.md

## Learned Lesson

Any product iteration that uses a tracked fixture database (e.g., `data/workspaces/ws_demo/db.sqlite`) or generated E2E artifacts (e.g., `apps/web/playwright-report/index.html`, `apps/web/test-results/`) must run a worktree diff guard before handoff. The guard fails the handoff if any forbidden generated artifact appears in the worktree diff, and provides clear recovery instructions. This prevents fixture DB contamination and generated artifacts from being silently committed or reviewed.

## Evidence

- T0032 (ws_demo write isolation): The tracked fixture DB `data/workspaces/ws_demo/db.sqlite` was repeatedly dirtied by (1) smoke scripts running on `ws_demo`, (2) read-only GET endpoints writing `audit_event` rows, and (3) idempotency middleware pruning on failed requests. The acceptance criterion required `git diff --quiet -- data/workspaces/ws_demo/db.sqlite` to be clean.
- T0034 (ws-demo diff guard tooling): To avoid relying on manual `git status` checks before every review, we created `scripts/check-worktree-guard.mjs` and exposed it as `npm run guard:worktree` from the root `package.json`. It checks `git diff --name-only`, `git diff --cached --name-only`, and `git ls-files --others --exclude-standard` against a configurable list of forbidden paths.
- Validation: the guard passed on the clean worktree, correctly failed when `apps/web/test-results/` was created, and exited 0 with a warning when `PLS_ALLOW_DIRTY_WORKTREE=1` was set.

## Classification

Skill — reusable multi-step SOP for setting up and running a worktree diff guard before product iteration handoff.

## Target File

Create `/Users/huangbo/.codex/skills/guard-worktree/SKILL.md` (or equivalent under `.config/mimocode/skills/guard-worktree/SKILL.md`).

## Proposed Change

New skill content:

```md
# guard-worktree

Use this skill when a product uses tracked fixture databases or generated artifacts that must not appear in the worktree diff at handoff time.

## When to use

- The project has a tracked fixture DB (e.g., `data/workspaces/ws_demo/db.sqlite`) used by smoke tests or demos.
- The project generates E2E/browser artifacts (e.g., `playwright-report/`, `test-results/`).
- A task involves smoke tests, imports, or frontend E2E runs that could dirty the worktree.

## What to do

1. Identify the forbidden generated artifacts for this product. Common defaults:
   - `data/workspaces/ws_demo/db.sqlite`
   - `apps/web/playwright-report/index.html`
   - `apps/web/test-results/`
2. Add a guard script at `scripts/check-worktree-guard.mjs` that checks:
   - `git diff --name-only`
   - `git diff --cached --name-only`
   - `git ls-files --others --exclude-standard`
3. The script should:
   - Match exact files or directory prefixes.
   - Exit 0 when no forbidden artifact is in the diff.
   - Exit 1 when a forbidden artifact is detected, printing the path and recovery command.
   - Support a controller-only override such as `PLS_ALLOW_DIRTY_WORKTREE=1`.
4. Expose the script as `npm run guard:worktree` in the root `package.json`.
5. Document the requirement in the project AGENTS.md or notes: handoff must run `npm run guard:worktree` before controller review.
6. Run the guard before handoff and include the result in `handoff.md` validation.

## Why

`git diff --check` only catches whitespace errors; it does not prevent binary fixture DBs or generated HTML reports from entering the diff. Manual `git status` checks are easy to forget, especially when a background server can re-dirty the fixture DB after validation. A guard automates the check and provides a clear recovery path.
```

## Scope

Global AgentOps skill, applicable to any product iteration that uses tracked fixture DBs or generated E2E artifacts.

## Risks

- Overfitting: the default forbidden paths are PLS-centric. Skill users must adjust the list to their own fixture DBs and artifact directories.
- Conflict: if a project already has a similar guard under a different name, this would duplicate it. Search existing `scripts/*guard*` and `package.json` scripts before creating.
- Maintenance: adding a root `package.json` when one does not exist may conflict with future workspace tooling. The skill should recommend keeping it minimal.

## Approval Needed

Reply "确认" to create the skill file at the proposed target, or describe changes to the proposal.
