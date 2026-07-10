---
id: "T0007"
slug: "three-audience-local-estimator-ui"
status: "queued"
assignee: "kilo"
domain: "frontend"
controller: "codex"
base_ref: "3b3baee267cf0ccf3eb8987b6245e3f7f8cfa245"
batch: "semir-three-audience-local-estimator"
sequence: "1"
depends_on: []
domain_memory: "agentops/memory/kilo-frontend.md"
allowed_paths: 
  - "apps/web/package.json"
  - "apps/web/package-lock.json"
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

在 `ChannelObjectLibrary` 的详情 Header 中，将“三大人群”作为“编辑”后的 Tab。实现纯浏览器本地的单文件人群分布解析、渠道算法选择、可选专家先验重算和结果展示。

以 [docs/prd-three-audience-local-estimator-ui.md](../../../docs/prd-three-audience-local-estimator-ui.md) 为产品边界，以 [docs/model-three-audience-share-contract.md](../../../docs/model-three-audience-share-contract.md) 为算法输入输出真源。

## Required behavior

1. 新 Tab 位于“编辑”后，且选中渠道对象后可达。
2. 支持用户通过文件选择器选择一个 `.csv`、`.md` 或 `.xlsx` 文件；支持选择文件夹后列出其中这些扩展名的候选文件，再由用户明确选定一个文件。不得自动合并文件。
3. CSV/XLSX 仅读首张表，Markdown 仅读首个 GFM 表格；从有限同义列名中候选标签列和占比列。必须让用户确认或更改列映射，才可计算。
4. 行级输入必须可见：标签、原始占比、解析后的 share。接受 `0-1` 和带 `%` 的百分数；空值、重复标签、非数值、负数或大于 100% 必须阻止计算并显示明确错误。
5. 渠道选项固定为 `douyin`、`tmall`、`jd`、`offline`、`vip`、`wechat_channels`、`pinduoduo`，选择后必须映射到已冻结的对应 `NativeSegmentSystem`。
6. 计算必须直接复用 `apps/model/src/three-audience-share.ts` 的 `estimateSemirThreeAudienceShares` 和其类型；不得复制或改写七渠道矩阵、京东矩阵、coverage 或 prior 公式。
7. 默认不传 `expertPrior`。页面可输入 A/B/C 先验；仅当三项合法时传入，且只存在于组件 state 中。不得访问 API、写对象、数据库、URL 或浏览器持久化存储。
8. 可计算结果展示 A/B/C 名称和百分比、coverage、uncovered、algorithmVersion、mode、qualityFlags、unmappedSegments；`unavailable` 或算法输入错误必须展示失败原因，不得编造结果。
9. 明示“文件和结果仅在当前浏览器会话保留，不上传、不落库”。使用现有 panel、metric-card、alert-banner、data-table-wrapper 风格，并在 390px 下避免页面级横向溢出和长文本重叠。

## Dependency exception

用户已确认允许在 `apps/web/package.json` 和 `apps/web/package-lock.json` 增加项目已有的 `xlsx@^0.18.5`。仅为浏览器解析 XLSX 使用；如确有必要，可在 `apps/web` 运行受控的 `npm install` 以更新 lockfile。不得添加任何其他新依赖。

## Non-goals

- Do not broaden scope beyond allowed_paths.
- 不新增 Server API、DB schema、文件上传、持久化、对象版本或导入任务。
- 不定义渠道/店铺/账号画像的后续真实数据结构，不读取当前 `AudienceProfile.tags` 来推断原生人群份额。
- 不支持 PDF、图片、HTML、JSON、任意本地绝对路径、批量估算、多文件合并、自动选择渠道或历史结果。
- 除已明确允许的 `xlsx@^0.18.5` 外，不安装依赖；不提交、push 或执行破坏性清理。

## Allowed implementation scope

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/src/pages/ChannelObjectLibrary.tsx`
- `apps/web/src/utils/three-audience-local-parser.ts`（新建：文件解析、列候选和严格校验；不得承载算法矩阵）
- `apps/web/e2e/three-audience-local-estimator.spec.ts`（新建）
- `docs/notes-viz.md`（仅追加本任务状态）

若直接 import 模型模块导致 Vite/TypeScript 无法构建，不得复制算法实现；停止并在 handoff 的 Open Questions 中报告真实报错与最小所需共享模块方案。

## Validation

1. `cd apps/web && npm run build`
2. `cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts`
3. `cd apps/model && npm run three-audience-share-contract-test`

定向 Playwright 至少覆盖 Tab 可达、CSV 解析后确认列、天猫渠道计算结果及 coverage、非法输入不可计算、页面在 mock 模式下未请求后端、390px 无页面级横向溢出。XLSX/Markdown 解析需要有至少一个单元或浏览器路径证明，不能只实现未验证代码。

## Controller unblock gate

T0008 `three-audience-browser-compatibility` 是本任务当前的前置兼容修复。Kilo 仅可在 T0008 变为 `approved` 后，使用 `/agentops-task-next` 恢复本任务；届时必须以 `../../../model/src/three-audience-share` 的正确路径实际 import 并完成全部原始交付与验证。

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

- 批次：semir-three-audience-local-estimator
- 顺序：1
- 依赖：无
