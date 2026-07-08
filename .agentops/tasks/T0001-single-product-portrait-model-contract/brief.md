---
id: "T0001"
slug: "single-product-portrait-model-contract"
status: "queued"
assignee: "opencode"
domain: "algorithm"
controller: "codex"
base_ref: "b09951dccbdb1fad97661bcbb4a0652d41d9da8d"
batch: "single-product-portrait-frontend"
sequence: "1"
depends_on: []
allowed_paths: 
  - "apps/model/src/single-product-portrait-supervised.ts"
  - "apps/model/src/single-product-portrait-supervised-contract-test.ts"
  - "apps/model/src/single-product-portrait-supervised-smoke.ts"
  - "apps/model/src/cli.ts"
  - "apps/model/README.md"
  - "apps/model/package.json"
  - "docs/notes-model.md"
validation: 
  - "cd apps/model && npm run typecheck"
  - "cd apps/model && npm run single-product-portrait-supervised-contract-test"
  - "cd apps/model && npm run single-product-portrait-supervised-smoke"
---

## 目标

冻结 Q2 73 样本监督单品画像模型给后端 API 消费的稳定契约：metadata、clean input prediction service、错误边界和验证。后续 A 域必须能在 `apps/server` 内跨包 import 模型函数，而不通过 CLI 子进程预测。

## 背景依据

- 产品 PRD：`docs/prd-single-product-portrait-frontend.md`
- 当前模型状态：`docs/notes-model.md`
- 现有监督模型代码：`apps/model/src/single-product-portrait-supervised.ts`
- 当前已有未提交模型侧改动，执行时不得回滚或重置。

## 允许范围

- `apps/model/src/single-product-portrait-supervised.ts`
- `apps/model/src/single-product-portrait-supervised-contract-test.ts`
- `apps/model/src/single-product-portrait-supervised-smoke.ts`
- `apps/model/src/cli.ts`
- `apps/model/README.md`
- `apps/model/package.json`
- `docs/notes-model.md`

如确需修改其他 `apps/model/src/` 文件，必须在 handoff 中说明原因和影响。

## 非目标

- 不重写 Ridge 算法。
- 不重训 Q2 样本。
- 不改 Q2 数据源。
- 不改已确认的 LOO 指标口径。
- 不实现 server API、前端 UI、CSV/XLSX multipart 解析。
- 不写库、不接人货匹配、不进入经营飞轮。

## 具体要求

1. 提供 server 可 import 的稳定 metadata helper，至少能返回：
   - `modelAvailable`
   - `fitTypes`
   - `requiredColumns`
   - `maxBatchRows`
   - `maxFileBytes`
   - `modelVersion`
   - `trainedAt` 或 `generatedAt`
   - `sampleCount`
   - `riskFlags`
   - `metricsSummary`
2. 提供 server 可 import 的单条 clean input 预测函数，输入字段为：
   - `skuId`
   - `fitType`
   - `fabric`
   - `fab`
3. 明确 `model.json` 缺失或不可读时的返回/抛错边界，供 A 域映射为 `model_not_available`。
4. metadata 中的 `fitTypes` 必须来自模型或训练产物，不得由前端硬编码推导。
5. 保持 `SingleProductPortraitPrediction` 输出包含 6 个核心维度、top labels、evidence、risk flags、`modelVersion`。
6. 保持 closed dimension top-N share 归一化口径。
7. 补充或更新 contract test，覆盖 metadata、fitTypes、模型缺失边界、单条预测输出结构。

## 验证

至少运行：

- `cd apps/model && npm run typecheck`
- `cd apps/model && npm run single-product-portrait-supervised-contract-test`
- `cd apps/model && npm run single-product-portrait-supervised-smoke`

如某项无法运行，handoff 必须说明原因、命令、错误摘要和风险。

## Handoff 格式

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

额外说明：

- metadata 字段来源。
- A 域应 import 的函数名和类型名。
- `model.json` 默认路径与 env override 预期。

## 执行顺序与依赖

- 批次：single-product-portrait-frontend
- 顺序：1
- 依赖：无
