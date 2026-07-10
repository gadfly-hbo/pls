# What Changed

- Replaced `ThreeAudienceInputError` TypeScript parameter property with an explicit `public readonly code: string` instance property and constructor assignment.
- Preserved `error.code`, `error.message`, and `error.name === "ThreeAudienceInputError"` behavior.
- Added a focused contract assertion that invalid-input errors retain the `ThreeAudienceInputError` name.

# Files Changed

- `apps/model/src/three-audience-share.ts`
- `apps/model/src/three-audience-share-contract-test.ts`

# Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run three-audience-share-contract-test` passed with `{"ok": true, "failures": []}`.
- `cd apps/model && ../server/node_modules/.bin/tsc --noEmit --target es2023 --module esnext --moduleResolution bundler --erasableSyntaxOnly true src/three-audience-share.ts` passed with no output.
- `cd apps/web && npm run build` passed; Vite built successfully.

# Risks

- The brief-listed repository memory path `agentops/memory/opencode-algorithm.md` was missing. I read the canonical memory at `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md` before editing.
- `apps/model/src/three-audience-share.ts` and its contract test are currently untracked in this worktree, so `git diff` does not show a normal tracked-file patch for these files.

# Open Questions

- None.
