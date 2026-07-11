---
id: "T0012"
slug: "three-audience-tolerance-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "three-audience-rounding-tolerance"
sequence: "2"
depends_on: 
  - "T0011"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/utils/three-audience-local-parser.ts"
  - "apps/web/src/pages/ChannelObjectLibrary.tsx"
  - "apps/web/e2e/three-audience-local-estimator.spec.ts"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts"
  - "cd apps/model && npm run three-audience-share-contract-test"
---

## Objective

在 T0011 approved 后，前端本地文件校验改为复用模型层 `threeAudienceInputTotalTolerance(channel)`，使截图中的抖音 `100.01%` 输入可在容差内通过并进入既有归一化计算。

## Required behavior

1. parser 不得再硬编码 `1e-6`、`0.0001` 或其他 share-total 容差；必须导入 T0011 的模型入口。
2. 页面提示应说明约 `100.01%` 以内会按四舍五入误差处理；超过模型返回容差时才显示阻断错误。
3. E2E 覆盖抖音八大标签合计 `100.01%`：确认后无总和错误、无需专家先验可计算，且结果可见；另覆盖略超容差仍被禁用或阻断。
4. 不改变标签筛选、列映射确认、文件格式、API/持久化边界或算法公式。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不复制或改写模型容差、矩阵、算法、Server 或 DB。
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

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：three-audience-rounding-tolerance
- 顺序：2
- 依赖：T0011
- 只有依赖任务全部 approved 后才可领取。
