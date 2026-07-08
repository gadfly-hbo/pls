---
id: "T0002"
slug: "single-product-portrait-api"
status: "queued"
assignee: "mimo"
domain: "backend"
controller: "codex"
base_ref: "b09951dccbdb1fad97661bcbb4a0652d41d9da8d"
batch: "single-product-portrait-frontend"
sequence: "2"
depends_on: 
  - "T0001"
allowed_paths: 
  - "apps/server/src/routes/"
  - "apps/server/src/lib/"
  - "apps/server/src/index.ts"
  - "apps/server/package.json"
  - "apps/server/package-lock.json"
  - "apps/server/scripts/"
  - "apps/server/tsconfig.json"
  - "docs/notes-app.md"
validation: 
  - "cd apps/server && npm run typecheck"
  - "cd apps/server && npm run smoke:single-product-portrait"
---

## 目标

实现单品画像预测专用后端 API，支持 metadata、单款预测、批量 preview、批量 execute。API 第一阶段只做同步预测和结果返回，不写库、不触发匹配、不生成服务端 artifact。

## 背景依据

- 产品 PRD：`docs/prd-single-product-portrait-frontend.md`
- 依赖任务：`M-PORTRAIT-FE-1` / Task Bus `T0001`
- 当前 API 纪律：`AGENTS.md` §五
- 当前应用状态：`docs/notes-app.md`

## 允许范围

- `apps/server/src/routes/`
- `apps/server/src/lib/`
- `apps/server/src/index.ts`
- `apps/server/package.json`
- `apps/server/package-lock.json`
- `apps/server/scripts/`
- `apps/server/tsconfig.json`
- `docs/notes-app.md`

如需修改 `apps/model` 仅限修复跨包类型导出或 import 必需问题，并必须在 handoff 中说明。

## 非目标

- 不写 `prediction` 表。
- 不新增 admin 写操作。
- 不要求 `X-PLS-Admin-Token`。
- 不要求 `Idempotency-Key`。
- 不复用 Tools run/artifact 路由。
- 不调用 CLI 子进程做预测。
- 不做前端 UI。

## API 要求

实现：

- `GET /api/v0/single-product-portrait/metadata`
- `POST /api/v0/single-product-portrait/predict`
- `POST /api/v0/single-product-portrait/predict/batch/preview`
- `POST /api/v0/single-product-portrait/predict/batch`

Header：

- `Authorization: Bearer pls-p0-demo-token`
- `X-PLS-Workspace: ws_demo`

metadata 在模型不可用时仍返回 200，并带：

- `modelAvailable: false`
- `error.code = "model_not_available"`

predict API 在模型不可用时返回业务错误，不伪造结果。

## 批量文件规则

- 支持 `.xlsx` 和 `.csv`。
- `.xlsx` 只读取第一个 sheet。
- multipart field 固定为 `file`。
- 文件大小上限：`2 MB`。
- 数据行数上限：`100`。
- 必须存在表头：`款号`、`版型`、`面料`、`FAB`。
- 额外列忽略并 warning。
- 第一条数据行 `rowNumber = 2`。
- 字段只做 trim 和 CSV BOM 去除，不做语义清洗。
- 空 `版型` 不自动填 `X型`。
- `版型` 必须在 metadata `fitTypes` 中，否则行级错误。
- 重复 `款号` 不阻塞，逐行预测并 warning。

## 错误码

文件级错误：

- `model_not_available`
- `unsupported_file_type`
- `file_too_large`
- `file_parse_failed`
- `missing_required_columns`
- `empty_file`
- `row_limit_exceeded`

行级错误：

- `required_field_empty`
- `unknown_fit_type`
- `field_too_long`

Warning：

- `duplicate_sku_id_in_file`
- `extra_columns_ignored`

## 实现约束

1. `apps/server` 允许新增 `xlsx` 依赖，版本与 `apps/model` 保持一致：`^0.18.5`。
2. multipart 解析优先使用 Hono `c.req.parseBody()`。
3. 服务端默认从 `data/local/single-product-portrait-q2-73sample/model.json` 读取模型。
4. 支持 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` env 覆盖。
5. API 请求不得传任意本地模型路径。
6. preview 与 execute 必须使用同一套解析校验函数。
7. execute 重新上传并重新解析文件，不使用 stagedFileId。
8. execute 只对 valid rows 预测，invalid rows 原样进入错误报告。

## 验证

至少运行：

- `cd apps/server && npm run typecheck`
- `cd apps/server && npm run smoke:single-product-portrait`

新增或扩展 smoke，覆盖：

- metadata 可用。
- metadata 模型不可用。
- 单款预测成功。
- 单款必填缺失、未知版型、字段超长。
- `.xlsx` preview/execute。
- `.csv` preview/execute。
- 缺表头、空文件、超 100 行、超 2 MB。
- 重复款号 warning。
- 额外列 warning。
- 0 valid rows execute 返回完整错误报告。

## Handoff 格式

写 `handoff.md`，包含：

- What Changed
- Files Changed
- Validation
- Risks
- Open Questions

额外说明：

- 实际 route 注册位置。
- metadata response shape。
- batch preview/execute response shape。
- 与 M 域 import 的函数和类型。

## 执行顺序与依赖

- 批次：single-product-portrait-frontend
- 顺序：2
- 依赖：T0001
- 只有依赖任务全部 approved 后才可领取。
