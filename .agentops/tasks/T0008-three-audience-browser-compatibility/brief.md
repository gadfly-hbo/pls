---
id: "T0008"
slug: "three-audience-browser-compatibility"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "3b3baee267cf0ccf3eb8987b6245e3f7f8cfa245"
batch: "semir-three-audience-local-estimator"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/opencode-algorithm.md"
allowed_paths: 
  - "apps/model/src/three-audience-share.ts"
  - "apps/model/src/three-audience-share-contract-test.ts"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run three-audience-share-contract-test"
  - "cd apps/web && npm run build"
---

## Objective

仅修复 `apps/model/src/three-audience-share.ts` 被 `apps/web` 的 `erasableSyntaxOnly: true` 编译时拒绝的 TypeScript parameter property，使已审核的三大人群算法源码可被浏览器前端直接 import。

现有阻塞证据：`ThreeAudienceInputError` 使用 `constructor(public readonly code: string, ...)`，在前端以正确相对路径 import 时触发 `TS1294`。这是 T0007 本地估算 UI 的前置兼容修复。

## Required change

1. 将 `ThreeAudienceInputError` 改为等价的显式只读实例属性与构造器赋值，例如 `public readonly code: string; constructor(code: string, message: string) { ... this.code = code; }`。
2. 保持 `error.code`、`error.message`、`error.name === "ThreeAudienceInputError"`、抛出时机和全部算法输入输出语义不变。
3. 不改变渠道矩阵、京东校准、coverage、expert prior、容差、算法版本或任何公开类型字段。
4. 若有必要，仅在既有 contract test 中补充 `ThreeAudienceInputError` 的语义断言；不得为兼容而复制模型或放宽 `apps/web` tsconfig。

## Validation

1. `cd apps/model && npm run typecheck`
2. `cd apps/model && npm run three-audience-share-contract-test`
3. `cd apps/model && ../server/node_modules/.bin/tsc --noEmit --target es2023 --module esnext --moduleResolution bundler --erasableSyntaxOnly true src/three-audience-share.ts`

第三条必须作为浏览器兼容性证据记录完整输出。`apps/web npm run build` 只作为回归检查，不能单独证明跨 app import，因为 T0007 当前阻塞占位尚未保留 import。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不改 `apps/web`、T0007 任务文件、Vite/TypeScript 配置、依赖或共享包结构。
- 不改算法语义、测试基准、映射矩阵或契约版本。
- 不提交、push、安装依赖或执行破坏性清理。
- Do not commit, push, install dependencies, or run destructive cleanup.

## Handoff Format

Write handoff.md with these sections:

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

## 专业记忆

- domain_memory: `agentops/memory/opencode-algorithm.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：semir-three-audience-local-estimator
- 顺序：1
- 依赖：无
