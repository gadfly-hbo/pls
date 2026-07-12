---
id: "T0030"
slug: "channel-profile-import-analysis-flow-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "39f89991ee61324a5e35692e889e161818fcc3d2"
batch: "channel-profile-ux-productization"
sequence: "3"
depends_on: 
  - "T0029"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/pages/ChannelObjectLibrary.tsx"
  - "apps/web/src/App.tsx"
  - "apps/web/src/pages/MatchCoreWorkbench.tsx"
  - "apps/web/src/services/api.ts"
  - "apps/web/src/types/index.ts"
  - "apps/web/e2e/channel-object-library.spec.ts"
  - "apps/web/e2e/smoke.spec.ts"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts"
  - "git diff --check"
---

## 目标

把“渠道画像”里的导入流程和批量货渠匹配分析流程产品化，形成更清晰的业务操作路径。

## 背景

当前入口已中文化，但仍偏工程化：

- 导入弹窗仍要求用户理解“基础模板 / 高级对象包 / 数据包路径 / confirmText”。
- 批量匹配分析仍是一个表单弹窗，尚未形成清晰的步骤路径。
- “发起匹配”仍留在本模块内，未与正式“货渠匹配”模块形成预填跳转。

## 非目标

- 不新增后端 API。
- 不改变现有 Admin Import 的安全语义：dry-run、confirmText、Idempotency-Key、workspace 隔离、audit 必须保留。
- 不实现自动执行投放或运营动作。
- 不修改模型匹配算法。

## 允许改动范围

- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/MatchCoreWorkbench.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`
- `apps/web/e2e/channel-object-library.spec.ts`
- `apps/web/e2e/smoke.spec.ts`

如需改其他文件，必须在 handoff 中说明原因。

## 约束

- 导入流程应表达为向导或步骤式 UI：选择导入目标 -> 选择模板/数据包 -> 导入前检查 -> 输入确认文本 -> 导入结果。
- 不降低危险操作确认强度；普通用户看不懂的工程字段可以折叠或解释，但不能绕过。
- 批量匹配流程应表达为：选择渠道实体 -> 选择活动/场景上下文 -> 输入商品 SKU -> 生成结果。
- 活动和场景必须作为上下文明确展示，不得被隐藏。
- 如实现跨模块跳转，需给 `ChannelObjectLibrary` 增加最小 prop 或 prefill 机制，避免全局重构。
- Mock 与真实 API contract 必须同构；若真实 API 尚未支持某能力，UI 必须禁用或明确说明“暂未开放”。

## 验收标准

- 导入入口对业务用户可理解，关键步骤有清晰标题和状态。
- 批量匹配分析入口可按步骤完成，并展示活动/场景对匹配上下文的作用。
- “发起匹配”能保留当前模块内路径；如接入正式“货渠匹配”模块，应能带入当前渠道实体或 SKU prefill。
- 真实 API 未开放的动作不伪装成功。
- 390px 宽度无页面级横向溢出。

## 验证命令

- `cd apps/web && npm run build`
- `cd apps/web && npm run smoke -- --project=chromium e2e/channel-object-library.spec.ts`
- `git diff --check`

## Handoff 格式

按 `docs/templates/HANDOFF_BACK.template.md` 回流，至少包含：

- 改了什么。
- 导入流程和批量匹配流程的用户路径。
- 是否新增跨模块 prefill。
- 验证命令与关键结果。
- 风险和未覆盖项。

## 专业记忆

- domain_memory: `agentops/memory/kilo-frontend.md`
- canonical_source: `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/kilo-frontend.md`
- Worker 必须先读取对应 CLI 配置目录下的这份 domain memory，再开始实现。若文件缺失，在 `handoff.md` 的 Risks 或 Open Questions 中说明。

## 执行顺序与依赖

- 批次：channel-profile-ux-productization
- 顺序：3
- 依赖：T0029
- 只有依赖任务全部 approved 后才可领取。
