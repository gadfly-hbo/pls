---
id: "T0010"
slug: "three-audience-local-file-filter"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "68bc75f50b8141d519be186f8333a479f9bd45de"
batch: "three-audience-native-filter"
sequence: "2"
depends_on: 
  - "T0009"
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/src/pages/ChannelObjectLibrary.tsx"
  - "apps/web/src/utils/three-audience-local-parser.ts"
  - "apps/web/e2e/three-audience-local-estimator.spec.ts"
  - "docs/notes-viz.md"
validation: 
  - "cd apps/web && npm run build"
  - "cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts"
  - "cd apps/model && npm run three-audience-share-contract-test"
---

## Objective

修复“三大人群”本地文件估算界面把通用画像所有行纳入校验的问题。用户选择渠道后，页面只能保留该渠道原生人群体系支持的标签与已冻结别名；其余画像维度行必须忽略而非报错。

前置：T0009 已 approved，并提供 `isSemirThreeAudienceNativeLabel`。以 `docs/prd-three-audience-local-estimator-ui.md` 与 `docs/model-three-audience-share-contract.md` 的筛选约束为准。

## Required behavior

1. 将渠道选择放在或早于列映射确认；默认不得以天猫体系过滤用户尚未选择的文件。
2. 列映射确认时先用模型层 `isSemirThreeAudienceNativeLabel` 对原始标签筛选，再只对保留行做重复、share 和总和校验。
3. 被忽略的行不得进入 `threeAudienceSegments`、重复错误、share 总和或算法输入；页面明确展示“已忽略 N 行非该渠道原生人群标签”。
4. 用户变更渠道或列映射后，必须使既有确认/结果失效并要求重新确认；切换抖音后只保留八大人群及别名。
5. 不复制渠道矩阵、标签集合或别名规则；只通过 parser 调用 T0009 的模型入口。
6. E2E 新增通用抖音画像混合数据：包含八大标签与重复的兴趣/地域/设备等无关标签。确认后应只保留八大标签、无重复/超额错误、显示忽略计数，并可不填专家先验完成计算。
7. 保持 CSV、Markdown、XLSX 支持，以及 390px 无横向溢出；不新增 API、上传或持久化。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不在前端实现或硬编码任何算法标签/别名/矩阵。
- 不修改模型算法、Server、DB、依赖、URL 或浏览器持久化。
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

- 批次：three-audience-native-filter
- 顺序：2
- 依赖：T0009
- 只有依赖任务全部 approved 后才可领取。
