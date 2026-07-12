---
id: "T0032"
slug: "ws-demo-write-isolation-backend"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "39f89991ee61324a5e35692e889e161818fcc3d2"
batch: "ws-demo-fixture-isolation"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/mimo-backend.md"
allowed_paths: 
  - "apps/server/scripts/**/*.mjs"
  - "apps/server/src/**/*.ts"
  - "apps/server/package.json"
  - "scripts/**/*.mjs"
  - "package.json"
  - "docs/notes-backend.md"
  - "docs/notes-data.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run smoke:channel-object-library"
  - "git diff --check"
  - "git diff --name-only -- data/workspaces/ws_demo/db.sqlite"
---

## 目标

从后端 smoke / admin / import 相关脚本层面阻断 `data/workspaces/ws_demo/db.sqlite` 被产品迭代任务误写，建立“写型验证必须使用临时 workspace”的默认路径。

## 背景

PLS 当前反复出现 `ws_demo/db.sqlite` 在产品迭代中被污染的问题。根因是 `ws_demo` 同时承担 demo fixture、开发运行、smoke 验证和真实 API 默认 workspace。后端写型 smoke、import、database rebuild、migration 或真实 API 验证一旦默认使用 `ws_demo`，就会导致 Git 中的二进制 fixture DB 变脏。

本任务是治理批次 `ws-demo-fixture-isolation` 的第一步：先在后端脚本和写型验证入口建立防线。

## 非目标

- 不删除 `data/workspaces/ws_demo/db.sqlite`。
- 不改变生产 API 语义。
- 不重构所有数据库管理能力。
- 不修改前端 Playwright 配置或前端测试；前端由后续任务处理。
- 不提交或清理当前工作区中已有的 T0028-T0031 业务 diff。

## 允许改动范围

- `apps/server/scripts/**/*.mjs`
- `apps/server/src/**/*.ts`
- `apps/server/package.json`
- `scripts/**/*.mjs`
- `package.json`
- `docs/notes-backend.md`
- `docs/notes-data.md`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 所有会写 DB 的 smoke / admin wrapper 必须默认创建临时 workspace，例如 `ws_smoke_<purpose>_<timestamp>`。
- 写型脚本如果目标 workspace 是 `ws_demo`，必须默认失败，除非显式传入只供 controller 使用的 override，并在日志中说明风险。
- 不允许依赖人工记忆来保护 `ws_demo`；必须有脚本级检查或 wrapper 级 guard。
- 不能捏造路由或 API 契约；必须读取真实 route / handler / script 后再改。
- 如果发现已有脚本确实仍需要读取 `ws_demo`，只能保持只读，不得写入。
- 新增或修改 smoke 时必须遵守 AGENTS.md 的 “Smoke 测试的 workspace 隔离” 规则。

## 建议实现方向

- 建立共享 helper，例如 `apps/server/scripts/lib/workspace-guard.mjs` 或项目现有脚本风格中的等价位置。
- 对写型 smoke/admin/import wrapper 注入 `PLS_WORKSPACE=ws_smoke_<purpose>_<timestamp>`。
- 对直接指向 `ws_demo` 的写型入口增加 fail-fast guard。
- 如果已有 `smoke-channel-object-library` 等脚本有 imported/dry-run 模式，检查它们是否仍会污染 `ws_demo`，必要时调整为临时 workspace。

## 验收标准

- 后端写型 smoke / import / admin wrapper 默认不写 `ws_demo`。
- 试图在写型模式下使用 `ws_demo` 会被明确拒绝，并输出可操作错误。
- 相关脚本 README/help 或 notes 说明临时 workspace 口径。
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite` 无输出。

## 验证命令

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run smoke:channel-object-library`
- 如修改顶层脚本：运行对应新增 guard/check 命令
- `git diff --check`
- `git diff --name-only -- data/workspaces/ws_demo/db.sqlite`

## Handoff 格式

- What Changed
- Files Changed
- Workspace isolation behavior
- Validation
- Risks
- Open Questions

## 专业记忆

- domain_memory: `agentops/memory/mimo-backend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/mimo-backend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：ws-demo-fixture-isolation
- 顺序：1
- 依赖：无
