# PLS API 契约 v0.1

> 归属：A 应用后端
> 状态：P0 草案
> 最近更新：2026-07-03

## 1. 目的

本文定义 P0 阶段 PLS 后端对外暴露的 API 契约。目标是让 V 域基于本契约设计工作台页面、让 M 域的预测与匹配输出被稳定封装、让 D 域的数据导入结果被下游消费。

对象定义以以下文档为准，本文只做 API 层引用与补充：

- `docs/profile-taxonomy-v0.md`：标签体系、`ProfileTagScore`、Segment 结构。
- `docs/data-safety-policy.md`：数据准入口径、共享对象最小结构、`recommendation` 枚举。
- `docs/data-spec.md`：训练宽表、`ChannelProfile`、DMP 导入格式。
- `docs/model-plan.md`：预测输出与匹配输出 schema、`modelVersion`、`modelPath`。

P0 原则：

- 契约优先，不承诺实现细节。
- 所有结果对象必须保留 `source`、`confidence`、`generatedAt`；真实聚合数据同时保留 `sampleSize`、`timeWindow`。
- 用户给到 PLS 并要求导入或产品化的数据默认全量放行；API 不因手机号、姓名、地址、订单/会员行级数据、DMP 成员包或 ID 字段自动拒绝。
- JSON 字段一律 `camelCase`；`tagId` 内部继续使用 `<dimension>.<tag>` 点分格式。

## 2. 通用约定

### 2.1 版本与前缀

- 基础路径：`/api/v0`。
- 版本随 P 阶段推进：P0 保持 `v0`，P1 若发生破坏性变更升级为 `v1`。
- 资源子路径：`/products`、`/channels`、`/predictions`、`/matches`、`/batches`、`/audit`、`/taxonomy`。

### 2.2 认证与工作区

P0 采用最小工作区隔离：

- 每个请求必须携带 `X-PLS-Workspace: <workspaceId>`。
- 每个请求必须携带 `Authorization: Bearer <token>`；P0 使用本地生成的静态 token。
- 工作区之间数据物理隔离，不共享 SKU、渠道和预测结果。
- 未来接入多租户 / SSO 需回流总控评审。

### 2.3 请求与响应格式

- 请求体统一为 `application/json; charset=utf-8`。
- 时间字段统一为 ISO 8601 UTC，例如 `2026-07-01T02:15:00Z`。
- ID 字段一律字符串。
- 未知字段客户端应忽略，服务端保留兼容能力。

成功响应包装：

```json
{
  "code": "ok",
  "requestId": "req_20260701_00001",
  "generatedAt": "2026-07-01T02:15:00Z",
  "data": {}
}
```

列表响应包装：

```json
{
  "code": "ok",
  "requestId": "req_20260701_00001",
  "generatedAt": "2026-07-01T02:15:00Z",
  "data": {
    "items": [],
    "page": { "cursor": null, "nextCursor": "cur_abc", "pageSize": 20, "hasMore": true }
  }
}
```

错误响应包装：

```json
{
  "code": "invalid_input",
  "requestId": "req_20260701_00001",
  "generatedAt": "2026-07-01T02:15:00Z",
  "error": {
    "message": "field skuId is required",
    "field": "skuId",
    "hint": "provide a SKU identifier"
  }
}
```

`requestId` 由服务端生成，用于审计日志追踪。客户端可选传入 `X-PLS-Request-Id` 覆盖，但仅在日志显示，不影响幂等。

### 2.4 错误码

| code | HTTP | 说明 |
|---|---:|---|
| `ok` | 200 | 成功 |
| `accepted` | 202 | 异步任务已受理 |
| `invalid_input` | 400 | 请求字段缺失或格式错误 |
| `unauthorized` | 401 | 未认证或 token 无效 |
| `forbidden` | 403 | 工作区不匹配或权限不足 |
| `not_found` | 404 | 目标资源不存在 |
| `conflict` | 409 | 幂等键冲突或状态非法 |
| `payload_too_large` | 413 | 单次导入超过上限 |
| `unprocessable` | 422 | 语法校验通过但违反业务约束 |
| `taxonomy_violation` | 422 | `tagId` 不在标签体系 |
| `dependency_failed` | 424 | 下游模型或数据依赖失败 |
| `rate_limited` | 429 | 限流 |
| `internal_error` | 500 | 内部错误 |

`taxonomy_violation` 是标签体系契约错误码，V 域前端必须能显式展示。隐私字段形态不再触发 API 拒绝。

### 2.5 分页与排序

- 列表接口一律 cursor 分页：`?cursor=<opaque>&pageSize=<int, max 100>`。
- 默认 `pageSize = 20`。
- 排序键固定为 `generatedAt` 降序；额外排序键在具体接口列出。
- 不承诺跨页快照一致性。

### 2.6 幂等

- 创建型接口（`POST /predictions`、`POST /matches`、`POST /batches`）支持 `Idempotency-Key` 头。
- 服务端在工作区 + HTTP method + path 内保留幂等键 24 小时；重复请求返回同一资源 ID 与原响应体。
- 命中缓存时响应头包含 `Idempotency-Replay: true`。
- 同一个 `Idempotency-Key` 可在不同 endpoint 复用，不得跨 endpoint replay。
- 缺省时按业务字段生成隐式幂等键，例如预测任务用 `skuId + dnaHash + modelVersion`。

### 2.7 数据来源与质量元信息

跨域流转的资源必须暴露如下元数据：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `source` | 是 | 数据来源或生成方式，例如 `mock_dmp_aggregate`、`m-p0-baseline-0.1` |
| `sourceType` | 是 | 枚举：`mock` / `sanitized_aggregate` / `manual_mapping` / `derived` |
| `batchId` | 条件必填 | 数据来自导入批次时必填 |
| `timeWindow` | 条件必填 | 聚合数据必填 |
| `sampleSize` | 条件必填 | 聚合数据必填 |
| `confidence` | 是 | 范围 `0-1` |
| `generatedAt` | 是 | ISO 8601 |

预测 / 匹配结果的 `sampleSize`、`timeWindow` 允许为 `null`，但 `source` / `modelPath` 必须能识别为模型输出。

### 2.8 命名规范

- 资源路径：小写复数名词。
- 查询参数与 JSON 字段：`camelCase`。
- ID 前缀：`sku_` / `channel_` / `pred_` / `match_` / `batch_` / `report_` / `task_` / `req_` / `audit_`。
- P0 未接入真实系统时统一带 `mock_` 前缀。

## 3. 核心对象

以下对象是 A 域对外稳定投影；实现层可拆更多子表，但对外只暴露此形态。字段语义以 D/M/X 冻结文档为准，本节只做 API 层组合。

### 3.1 `SKU`

`SKU` 描述新品或历史 SKU 的商品级信息，等价于 `data-safety-policy.md §5.2 ProductInput` + `data-spec.md §4.3 ProductDNA` 的并集。

```json
{
  "skuId": "mock_sku_101",
  "workspaceId": "ws_demo",
  "spuId": "mock_spu_101",
  "categoryLv1": "apparel",
  "categoryLv2": "dress",
  "season": "spring_summer",
  "title": "Mock minimal commute dress",
  "attributes": {
    "styleKeywords": ["minimal", "commute"],
    "colorFamily": "neutral",
    "fitType": "regular",
    "fabricType": "cotton_blend",
    "patternType": "solid",
    "sleeveType": "short_sleeve",
    "lengthType": "midi",
    "priceBand": "mid",
    "launchType": "new_arrival",
    "imageFeatureSummary": { "hasModel": true }
  },
  "assets": [
    { "type": "image", "source": "mock_asset", "description": "front view product image" }
  ],
  "mappedProductTags": [
    {
      "tagId": "style.minimal",
      "score": 0.78,
      "confidence": 0.72,
      "source": "manual_product_mapping"
    }
  ],
  "createdAt": "2026-07-01T02:00:00Z",
  "updatedAt": "2026-07-01T02:00:00Z"
}
```

约束：

- `attributes` 字段枚举以 `data-spec.md §6.2` 为准。
- `assets[].source` 可使用本地 mock、用户上传或外部资源标识；是否外暴原图位置由产品展示需求决定。
- `mappedProductTags` 由 D 域预计算并透传；缺失时 M 域按 `model-plan.md §2.3` 回填。
- 未在受控词表内的关键词进入预测结果的 `unmappedInputTokens`，不写入 `attributes`。

### 3.2 `ChannelProfile`

对齐 `data-spec.md §7`，A 域不改字段，只附加 `workspaceId` 与 `batchId` 关联。

```json
{
  "channelId": "mock_douyin_live_001",
  "workspaceId": "ws_demo",
  "channelName": "Mock Douyin Live",
  "channelType": "live_stream",
  "platformType": "content_ecommerce",
  "timeWindow": "2026-05-01/2026-06-30",
  "sampleSize": 5000,
  "source": "mock_channel_aggregate",
  "sourceType": "sanitized_aggregate",
  "batchId": "batch_mock_20260701",
  "generatedAt": "2026-07-01T00:00:00Z",
  "tags": [
    {
      "tagId": "channel.live_stream",
      "score": 0.91,
      "confidence": 0.9,
      "source": "mock_channel_aggregate",
      "sampleSize": 5000,
      "timeWindow": "2026-05-01/2026-06-30"
    }
  ],
  "trafficIndex": 0.68,
  "conversionIndex": 0.54,
  "qualityFlags": []
}
```

### 3.3 `ProductProfile`

A 域对 M 域预测输出的稳定封装，字段与 `model-plan.md §3.3` 对齐，附加 A 侧管理字段（`workspaceId`、`sourceType`、`taskId`、`inputSnapshot`）。

```json
{
  "predictionId": "pred_20260701_0001",
  "workspaceId": "ws_demo",
  "skuId": "mock_sku_101",
  "taskId": "task_pred_20260701_0001",
  "modelVersion": "m-p0-baseline-0.1",
  "modelPath": "gbdt",
  "source": "m-p0-baseline-0.1",
  "sourceType": "derived",
  "generatedAt": "2026-07-01T02:15:00Z",
  "inputSnapshot": {
    "dnaHash": "d5f2a1",
    "categoryLv1": "apparel",
    "categoryLv2": "dress",
    "season": "spring_summer",
    "priceBand": "mid",
    "styleKeywords": ["minimal", "commute"]
  },
  "predictedProfileTags": [
    {
      "tagId": "demo.age_25_34",
      "score": 0.79,
      "confidence": 0.72,
      "source": "m-p0-baseline-0.1",
      "sampleSize": null,
      "timeWindow": null
    }
  ],
  "topSegments": [
    {
      "segmentId": "seg_work_minimal_25_34",
      "name": "25-34 岁简约通勤女性",
      "rank": 1,
      "confidence": 0.68,
      "tags": [
        { "tagId": "demo.age_25_34", "score": 0.79 },
        { "tagId": "style.minimal", "score": 0.74 }
      ],
      "drivers": ["style.minimal", "occasion.work", "price.mid"]
    }
  ],
  "qualityFlags": [],
  "unmappedInputTokens": []
}
```

字段说明：

- `taskId` 关联到预测任务，见 `pipeline-design.md §3`；同一 `taskId` 只应关联一个成功的 `predictionId`。
- `inputSnapshot` 快照建模输入用于审计，禁止包含商品图原文与真实定价策略。
- `predictedProfileTags` 与 `topSegments` 完全按 `model-plan.md §3.3` 输出，A 域不做增删。
- `qualityFlags` 允许出现例如 `low_training_sample`、`fallback_rule_only`、`model_below_threshold`。

### 3.4 `MatchResult`

A 域对 M 域匹配输出的封装，等价于 `model-plan.md §4.4` 的 `channelMatches[i]` 展开成独立资源。单次匹配任务生成多条 `MatchResult`。

```json
{
  "matchId": "match_20260701_0001",
  "workspaceId": "ws_demo",
  "taskId": "task_match_20260701_0001",
  "predictionId": "pred_20260701_0001",
  "skuId": "mock_sku_101",
  "channelId": "mock_douyin_live_001",
  "channelType": "live_stream",
  "modelVersion": "m-p0-baseline-0.1",
  "source": "m-p0-baseline-0.1",
  "sourceType": "derived",
  "generatedAt": "2026-07-01T02:20:00Z",
  "matchScore": 0.71,
  "matchConfidence": 0.66,
  "rank": 1,
  "overlap": 0.68,
  "bestSegmentId": "seg_work_minimal_25_34",
  "bestSegmentMatch": 0.75,
  "positiveDrivers": [
    { "tagId": "style.minimal", "productScore": 0.74, "channelScore": 0.70 }
  ],
  "negativeDrivers": [
    { "tagId": "price.premium", "productScore": 0.12, "channelScore": 0.05 }
  ],
  "recommendation": "test_launch",
  "risks": ["channel_price_sensitivity_gap"],
  "qualityFlags": []
}
```

`recommendation` 枚举来自 `data-safety-policy.md §5.5`：`priority_launch` / `test_launch` / `observe` / `avoid`。总控决策：P0 接受以下映射规则，调整需回流 X 总控。规则按表格顺序自上而下执行，`avoid` 条件命中时优先级最高；`dimension` 从 `tagId` 前缀推导。

| 条件 | recommendation |
|---|---|
| `matchScore >= 0.70` 且 `matchConfidence >= 0.60` | `priority_launch` |
| `matchScore` 在 `[0.50, 0.70)` 且 `matchConfidence >= 0.50` | `test_launch` |
| `matchScore` 在 `[0.35, 0.50)` 或 `matchConfidence < 0.50` | `observe` |
| `matchScore < 0.35` 或 `negativeDrivers` 覆盖 2 个及以上 `dimension` | `avoid` |

`risks` 至少包含以下摘要之一：`channel_price_sensitivity_gap`、`channel_sample_thin`、`prediction_below_threshold`、`no_common_tags`。

### 3.5 `Batch`

`Batch` 表示一次 D 域数据导入（DMP、渠道画像、商品字典），是所有跨域可追溯性的锚。

```json
{
  "batchId": "batch_mock_20260701",
  "workspaceId": "ws_demo",
  "batchType": "dmp_aggregate",
  "source": "mock_dmp_aggregate",
  "sourceType": "mock",
  "timeWindow": "2026-05-01/2026-06-30",
  "rowCount": 1420,
  "entityCounts": { "sku": 32, "channel": 4 },
  "qualityReport": {
    "profileCoverageRate": 0.92,
    "missingFieldRate": 0.04,
    "unmappedFieldCount": 2,
    "lowConfidenceMappingCount": 3,
    "qualityFlags": []
  },
  "createdAt": "2026-07-01T01:50:00Z",
  "createdBy": "user_demo"
}
```

`batchType` 枚举：`dmp_aggregate` / `channel_profile` / `product_catalog` / `training_wide_table`。

### 3.6 `Task`

`Task` 表示一次异步任务（预测、匹配、批次导入），状态机见 `pipeline-design.md §3`。

```json
{
  "taskId": "task_pred_20260701_0001",
  "workspaceId": "ws_demo",
  "taskType": "prediction",
  "status": "succeeded",
  "resourceId": "pred_20260701_0001",
  "modelVersion": "m-p0-baseline-0.1",
  "input": { "skuId": "mock_sku_101" },
  "attempts": 1,
  "createdAt": "2026-07-01T02:14:30Z",
  "startedAt": "2026-07-01T02:14:35Z",
  "finishedAt": "2026-07-01T02:15:00Z",
  "error": null
}
```

`taskType`：`prediction` / `match` / `batch_import` / `taxonomy_validate`。
`status`：`queued` / `running` / `succeeded` / `failed` / `cancelled` / `rejected`（业务契约拒绝，例如 taxonomy）。

## 4. 接口清单

以下接口构成 P0 最小可闭环。所有接口默认要求 §2.2 鉴权头。

### 4.1 SKU 与画像

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/products` | 录入 / 更新一个 SKU；重复 `skuId` 走 upsert |
| `GET` | `/products/{skuId}` | 获取 SKU 详情 |
| `GET` | `/products` | 列表；支持 `categoryLv2`、`season`、`priceBand` 过滤 |
| `DELETE` | `/products/{skuId}` | 软删除；对已生成的预测结果无影响 |

### 4.2 渠道画像

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/channels` | 列表；支持 `channelType`、`platformType` 过滤 |
| `GET` | `/channels/{channelId}` | 获取渠道画像详情 |

渠道画像 P0 只能通过 `/batches` 导入，不接受单独 POST 创建。

### 4.3 预测（同步 + 异步双通道）

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/predictions` | 创建预测任务；默认同步返回 |
| `GET` | `/predictions/{predictionId}` | 读取预测结果 |
| `GET` | `/predictions` | 列表；支持 `skuId`、`modelVersion` 过滤 |
| `POST` | `/predictions/{predictionId}/feedback` | P1 预留：回流真实 DMP 结果做纠偏 |

**`POST /predictions` 请求：**

```json
{
  "skuId": "mock_sku_101",
  "modelVersion": "m-p0-baseline-0.1",
  "mode": "sync",
  "timeoutMs": 8000
}
```

- `mode`：`sync`（默认，同步返回预测结果，最长 30s）或 `async`（立即返回 `202` + `Task`）。
- `timeoutMs`：同步等待上限，缺省由服务端配置决定；超时返回 `202 accepted` 与 `Task`，后台任务继续执行。
- 若 `skuId` 不存在返回 `not_found`。
- 若 `modelVersion` 缺省，服务端使用当前默认模型版本。

**同步响应（200）：** `data` 直接是 `ProductProfile`。

**异步响应（202）：**

```json
{
  "code": "accepted",
  "data": {
    "task": {
      "taskId": "task_pred_20260701_0001",
      "status": "queued",
      "resourceUrl": "/api/v0/predictions/pred_20260701_0001"
    }
  }
}
```

`resourceUrl` 在 `succeeded` 前可返回 `not_found`；建议客户端 poll `/tasks/{taskId}`。

### 4.4 匹配

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/matches` | 创建匹配任务 |
| `GET` | `/matches/{matchId}` | 单条匹配结果 |
| `GET` | `/matches` | 列表；至少提供 `predictionId` 或 `skuId` 之一 |
| `GET` | `/matches/heatmap` | 热力图专用聚合视图，见 §4.6 |

`GET /matches` 默认读取 latest 投影，即每个 `workspaceId + skuId + channelId` 只返回最新匹配结果。调试或复盘历史时可传 `history=true` 返回 append-only 历史记录。

**`POST /matches` 请求：**

```json
{
  "predictionId": "pred_20260701_0001",
  "channelIds": ["mock_douyin_live_001", "mock_tmall_store"],
  "topK": 10,
  "mode": "sync"
}
```

- `channelIds` 可省略；缺省时使用工作区所有可用渠道。
- `topK` 默认 10，最大 50。
- `mode` 与预测接口语义一致。

**同步响应（200）：**

```json
{
  "data": {
    "taskId": "task_match_20260701_0001",
    "predictionId": "pred_20260701_0001",
    "modelVersion": "m-p0-baseline-0.1",
    "generatedAt": "2026-07-01T02:20:00Z",
    "channelMatches": []
  }
}
```

### 4.5 批次导入

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/batches` | 创建批次导入任务 |
| `GET` | `/batches/{batchId}` | 查看批次详情（含 quality report） |
| `GET` | `/batches` | 列表 |

`POST /batches` 上传格式：

- Content-Type `application/json`，请求体为 `{ "meta": { ... } }` 或 `{ "meta": "<json string>" }`；该路径支持 `Idempotency-Key`。
- Content-Type `multipart/form-data`，字段 `file`（CSV / JSONL）+ 字段 `meta`（JSON 字符串）。
- `meta` 至少包含 `batchType`、`source`、`sourceType`、`timeWindow`；缺项返回 `invalid_input`。
- 单批最大 100MB；超过返回 `payload_too_large`。
- 用户授权数据不因字段名或值形态被 privacy/safety 门禁拒绝；批次仍会校验 `meta` 必填项、体积上限、JSON 格式和业务质量字段。

说明：P1-B2 只保证 JSON 批次创建路径幂等；multipart 上传的文件摘要与表单字段归一化需后续单独设计。

**响应：** 直接返回 `202` 与 `Task`。批次实际处理见 `pipeline-design.md §4`。

### 4.6 热力图聚合

`GET /matches/heatmap?skuIds=&channelIds=&modelVersion=` 供 V 域一次性拉取热力图数据。

```json
{
  "data": {
    "modelVersion": "m-p0-baseline-0.1",
    "generatedAt": "2026-07-01T02:20:00Z",
    "rows": [
      {
        "skuId": "mock_sku_101",
        "cells": [
          {
            "channelId": "mock_douyin_live_001",
            "matchScore": 0.71,
            "matchConfidence": 0.66,
            "recommendation": "test_launch"
          }
        ]
      }
    ]
  }
}
```

- P0 单次热力图请求限制 `skuIds.length * channelIds.length <= 500`，超限返回 `payload_too_large`。
- 结果直接读缓存的 `MatchResult`，不触发新任务。

### 4.7 任务

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/tasks/{taskId}` | 查询任务详情 |
| `GET` | `/tasks` | 列表；支持 `taskType`、`status` 过滤 |
| `POST` | `/tasks/{taskId}/cancel` | 取消任务；仅允许 `queued` → `cancelled` |

### 4.8 标签体系

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/taxonomy` | 返回当前 `tagId` 白名单、维度、中文名 |
| `POST` | `/taxonomy/validate` | 提交若干 tagId，返回未命中列表 |

`GET /taxonomy` 直接派生自 `docs/profile-taxonomy-v0.md`，A 域缓存版本号并附带 `taxonomyVersion`。

### 4.9 审计日志

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/audit` | 列表；支持 `resourceType`、`resourceId`、`actor`、`from`、`to` 过滤 |

审计条目结构：

```json
{
  "auditId": "audit_20260701_0001",
  "workspaceId": "ws_demo",
  "actor": "user_demo",
  "action": "create_prediction",
  "resourceType": "prediction",
  "resourceId": "pred_20260701_0001",
  "requestId": "req_20260701_00001",
  "modelVersion": "m-p0-baseline-0.1",
  "admissionStage": "admission_ok",
  "occurredAt": "2026-07-01T02:15:00Z"
}
```

`admissionStage` 值：`admission_ok` / `taxonomy_ok` / `taxonomy_rejected` / `quality_ok` / `quality_low`。`taxonomy_rejected` 等业务契约拒绝必须写入审计；用户授权原始输入可按产品需要入库或进入文件系统。

## 5. V 域视角关键接口组合

以下是 V 域构建两个工作台时可直接引用的 API 组合，避免 V 侧再造调用序列。

### 5.1 新品画像工作台

1. `POST /products`：录入新品，得到 `skuId`。
2. `POST /predictions` (`mode = sync`)：拿到 `ProductProfile`。
3. `GET /taxonomy`：拿到 `tagId` 到中文名的映射用于展示。
4. `POST /matches` (`predictionId`, `mode = sync`)：拿到该 SKU 的渠道匹配列表。
5. `GET /audit?resourceId=pred_...`：拿到该次预测的处理链路，供“依据”弹窗。

### 5.2 渠道匹配热力图

1. `GET /products?categoryLv2=...`：拿到候选 SKU 列表。
2. `GET /channels`：拿到候选渠道列表。
3. `GET /matches/heatmap?skuIds=...&channelIds=...`：一次拉取热力图数据。
4. 单元格点击时 `GET /matches/{matchId}` 拿完整 `positiveDrivers` / `negativeDrivers` / `risks` 用于抽屉展示。

## 6. 与 D / M / V 的契约边界

- **D → A：** 通过 `POST /batches` 单向进入 A 域；A 域负责 `admission` / `taxonomy_validate` / `quality_check`。`admission` 对用户授权数据默认放行；taxonomy 和业务质量校验按产品契约处理。
- **M → A：** M 域实现 `PredictService` / `MatchService` 两个内部接口（非公开 HTTP），A 域负责封装为公开 API 并注入 `taskId`、`requestId`。M 域不得直接写库，所有落库通过 A 域。
- **A → V：** V 域只消费公开 HTTP API；不允许绕过 A 域直连 M 或 D 的存储。
- **反馈闭环：** `POST /predictions/{predictionId}/feedback` 是 P1 预留接口。总控批准 P0 A 域先建 endpoint 骨架；P0 固定返回 `not_found`，`error.message = "feedback is not enabled in P0"`，避免 V 域后续接入时 URL 变更。

## 7. 数据准入在 API 层的落点

- `/batches`：入口只校验请求格式、必填 meta、体积上限和幂等；用户授权数据默认放行。
- `/products`：允许写入用户提供或确认导入的业务字段和值，包括手机号、姓名、地址、订单号、会员 ID、平台 ID、DMP 成员字段等。
- `/predictions`、`/matches` 响应：`inputSnapshot` / `positiveDrivers` / `negativeDrivers` 中 `tagId` 必须命中标签体系，否则退回 `taxonomy_violation` 或写入 `unmappedInputTokens`。
- `/audit`：taxonomy、质量告警、任务状态迁移和导入处理必须留痕；原始 payload 是否记录按用户当次产品化要求和存储设计执行。
- 价格策略、成本、投放预算等业务字段不再因“数据分级”自动拒绝；是否展示、导出或建模由产品需求决定。

## 8. 总控决策与 P1 展望

- **同步/异步默认值**：总控批准 P0 定为预测同步、匹配同步；批次异步。同步超时 30s，超时降级为异步并返回 `202 accepted` + `Task`。
- **存储选型**：总控批准 P0 采用 SQLite + 本地文件系统，详见 `pipeline-design.md §7`。依赖安装和 schema 落地属于后续实现任务。
- **鉴权升级**：P1 需要接入基于用户的多租户；本文的 `X-PLS-Workspace` 与 `Authorization` 为占位方案。
- **feedback 接口 schema**：待 M 域纠偏机制落地后回流。
- **热力图缓存策略**：P0 直接读 `MatchResult`；如后续引入投放实时反馈，需追加 `matchScoreAsOf` 字段。

---

## 9. 数据管理底座 API（A-P2-1）

P2 新增。把 PLS 的数据导入、版本、质量和审计能力产品化为通用数据管理底座。所有接口前缀 `/api/v0/data-management`，走 §2.2 鉴权。

### 9.1 设计原则

- **source-agnostic**：API 不耦合抖音 BI。`data_source` 注册表是 source 清单的唯一真源；每个 source 注册一个 adapter，adapter 负责把"版本/行数/latest/质量报告"从具体表中投影出来。
- **不复制 import 元数据**：`batch` 表 + `audit_event` 表仍是导入真源。数据管理 API 只读取和投影这些已有记录，不建并行表。
- **读取优先**：本阶段只做读取型 API + 501 占位写路径。HTTP import endpoint 和版本回滚留待后续 P2 任务。
- **未来扩展**：商品主数据、渠道画像、行动反馈数据源通过注册新 adapter 接入，不改 API shape。

### 9.2 核心对象

**DataSource**

```json
{
  "sourceId": "douyin_bi",
  "sourceKind": "douyin_bi",
  "displayName": "抖音 BI 数据资产",
  "adapter": "douyin_bi",
  "schemaPrefix": "douyin_",
  "status": "active",
  "description": "D-P1-F1 assetized dashboard snapshot...",
  "config": { "primaryTable": "douyin_account", "importScript": "scripts/import-douyin-bi.mjs" },
  "createdAt": "2026-07-03T...",
  "updatedAt": "2026-07-03T..."
}
```

`status` 枚举：`active`（有 backing table 和 adapter 实现）/ `stub`（已注册占位，待上游任务冻结 schema）。

当前注册的 source：

| sourceId | sourceKind | status | 说明 |
|---|---|---|---|
| `douyin_bi` | `douyin_bi` | active | D-P1-F1 资产化包，backed by `douyin_*` 表 |
| `product_master` | `product_master` | stub | 待 D-P2-2 冻结商品主数据 schema |
| `channel_profile` | `channel_profile` | active | A-P2-3 店铺/账号优先 `channel_entity` 投影 |
| `action_feedback` | `action_feedback` | stub | 待 A-P2-10 经营飞轮闭环 |

**DataVersion**

```json
{
  "sourceId": "douyin_bi",
  "sourceKind": "douyin_bi",
  "sourceBatchId": "batch_douyin_bi_20260703",
  "dataVersion": "v1_20260703",
  "generatedAt": "2026-07-03T00:00:00Z",
  "timeWindow": "2026-05-01/2026-05-31",
  "isLatest": false,
  "rowCount": 692
}
```

`isLatest` 由 adapter 按 `MAX(generated_at)` 推导。同一 sourceBatchId 下可有多个 dataVersion；latest projection 由 `/api/v0/bi/douyin/*` 消费。

**DataQualityReport**

```json
{
  "sourceBatchId": "batch_douyin_bi_20260703",
  "dataVersion": "v1_20260703",
  "qualityFlags": ["algorithm_pending_user_formula", "single_baseline_account_only"],
  "coverage": { "accountsWithBenchmarkTags": 1, "productsWithProfileDistribution": 1 },
  "objectCounts": { "accounts": 13, "products": 73, ... },
  "totalRows": 692,
  "admissionPolicy": "user_authorized_full_passthrough",
  "notes": []
}
```

由 D-P1-F1 `quality_report.json` 在导入时写入 `batch.quality_report` 列；adapter 按 `(sourceBatchId, dataVersion)` 查回。

### 9.3 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/data-management/data-sources` | 列出注册的数据源，支持 `?status=` / `?sourceKind=` 过滤 |
| GET | `/data-management/data-sources/:sourceId` | 数据源详情 + versions 列表（含 latestDataVersion） |
| GET | `/data-management/import-batches` | 查询导入批次（读 `batch` 表），支持 `?batchType=` / `?sourceBatchId=` / `?pageSize=` |
| GET | `/data-management/import-batches/:batchId` | 批次详情（含 entityCounts + qualityReport） |
| GET | `/data-management/data-versions` | 跨 source 版本列表，支持 `?sourceId=` 过滤 |
| GET | `/data-management/data-versions/:sourceId/:dataVersion/quality` | 指定版本的质量报告 |
| GET | `/data-management/audit` | 导入与数据管理审计事件查询，支持 `?resourceType=` / `?resourceId=` / `?actor=` / `?event=` |
| POST | `/data-management/import-batches` | **预留** — HTTP 导入 endpoint，当前返回 `501 not_implemented` |
| POST | `/data-management/data-versions/:sourceId/:dataVersion/rollback` | **预留** — 版本回滚，当前返回 `501 not_implemented` |

### 9.4 audit 落库口径

数据管理 API 的查询操作统一写 `audit_event`：

- `resource_type`：`bi_data_source` / `bi_data_version` / `bi_batch`（复用已有 `bi_*` 前缀，不新增枚举段）。
- `event`：`query`（读操作）/ `import_completed`（导入脚本写入，已由 A-P1-F2 落地）。
- `meta`：记录查询参数摘要、返回 count、sourceId / dataVersion 等。

### 9.5 未来数据源接入方式

新数据源接入只需 3 步：

1. 在 `data_source` 表 `INSERT OR IGNORE` 一行（sourceId / sourceKind / adapter / status）。
2. 在 `services/data-source-registry.ts` 实现 adapter（`listVersions` + `getQualityReport`），注册到 `ADAPTERS`。
3. 导入脚本在写业务数据时同步写 `batch` 表（`batch_type` 与 sourceKind 对齐）+ `audit_event`。

不需要改 `/data-management/*` 路由层。`/bi/douyin/*` 等业务读取 API 仍由各域自行维护；数据管理底座只负责"有什么数据、哪个版本、质量如何、谁导的"。

---

## 10. 渠道人群实体 API（A-P2-3）

P2 新增。以店铺 / 账号 / 门店为第一分析实体，替代平台优先查询。所有接口前缀 `/api/v0/channels/entities`，走 §2.2 鉴权。

### 10.1 设计原则

- **实体优先**：`ChannelEntity` 是 P2 渠道人群的 first-class 锚。平台只作为 `platformType` 维度，不作为主查询轴。
- **投影表，非运行时合并**：`channel_entity` 表是读优化投影，由 `sync:channel-entities` 脚本从 `douyin_account_latest` + `channel_profile` 填充。源表不修改、不合并。
- **source-agnostic**：投影表带 `source_id` 字段，未来新数据源（product_master、action_feedback）通过同步脚本接入，不改 API shape。
- **latest 语义**：默认走 `channel_entity_latest` view（按 `channel_entity_id` 分组 + `MAX(generated_at)` 取最新）；`?dataVersion=` 可查历史投影。

### 10.2 核心对象

**ChannelEntity**

```json
{
  "channelEntityId": "douyin:shop:douyin_account_semir_official_flagship_baseline",
  "entityType": "shop",
  "sourceEntityKey": "douyin_account_semir_official_flagship_baseline",
  "displayName": "森马官方旗舰店(基准)",
  "platformType": "content_ecommerce",
  "platformName": "抖音",
  "parentEntityId": null,
  "entityStatus": "active",
  "shopId": "douyin_account_semir_official_flagship_baseline",
  "accountId": null,
  "accountKind": "douyin_shop",
  "profileTags": [],
  "benchmarkTags": [{ "dimension": "age", "optionLabel": "24-30", "sharePercent": 34.83 }],
  "performanceMetrics": {},
  "unmappedProfileFields": [],
  "sourceId": "douyin_bi",
  "sourceBatchId": "batch_douyin_bi_20260703",
  "dataVersion": "v1_20260703",
  "generatedAt": "2026-07-03T00:00:00Z",
  "timeWindow": "2026-05-01/2026-05-31",
  "qualityFlags": []
}
```

**entityType 枚举**（来自 `docs/p2-2-product-channel-schema.md`）：

| entityType | 含义 | 当前来源 |
|---|---|---|
| `shop` | 线上店铺 / 商城店 | `douyin_shop` → shop；`shelf_ecommerce` → shop |
| `account` | 社交 / 内容 / 电商账号 | `douyin_account` → account；`private_domain` → account |
| `livestream_room` | 直播间 | `douyin_live_room` → livestream；`live_stream` → livestream |
| `content_account` | 内容账号 | `douyin_short_video_account` → content；`short_video` → content |
| `province` / `city` / `trade_area` / `store` | 线下层级 | 预留，当前无数据 |

### 10.3 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/channels/entities` | 实体列表，支持 `?entityType=` / `?platformType=` / `?sourceId=` / `?dataVersion=` / `?pageSize=` |
| GET | `/channels/entities/:entityId` | 实体详情（含 profileTags / benchmarkTags / performanceMetrics / qualityFlags），支持 `?dataVersion=` |

**注意**：`/channels/entities` 必须在 `/channels` 之前注册，否则 Hono 的 `/:channelId` 会错误匹配 `entities` 路径。

### 10.4 投影策略与风险

**方案**：`channel_entity` 表由 `sync:channel-entities` 脚本从源表读取并 INSERT OR REPLACE。脚本幂等，重跑不产生重复行。`channel_entity_latest` view 自动取 `MAX(generated_at)` 作为 latest。

**当前数据源**：

| source_id | 实体数 | entityType | 投影来源 |
|---|---|---|---|
| `douyin_bi` | 13 | shop(3) + account(6) + content_account(3) + livestream(1) | `douyin_account_latest` + `douyin_account_benchmark_tag_latest` |
| `channel_profile` | 4 | shop(1) + account(1) + content_account(1) + livestream(1) | `channel_profile`（P0 mock） |

**风险与后续**：

- `channel_entity` 是投影表，不是源表。数据更新需先导入源表（`import:douyin-bi`），再重跑 `sync:channel-entities`。
- 当前 `profileTags` 为空（账号级无 mapped tags）；未来 D 域可补充账号画像后在同步脚本中投影。
- 线下层级（province / city / trade_area / store）预留字段已建，等真实线下数据接入后填充。
- `parentEntityId` 为 null（无 hierarchy）；未来 account → shop、store → city → province 的层级关系需 D 域提供 parentEntityKey 映射。
- `/channels`（P0 mock）和 `/channels/entities`（P2 投影）并存；V-P2-4 应优先消费 `/channels/entities`。

### 10.5 渠道画像对象库 API（A-P6-CHANNEL-3）

P6 新增。对象与导入契约以 `docs/channel-profile-2.0-plan.md` 为准，前缀 `/api/v0/channel-objects`。所有接口要求普通 API 鉴权头 `Authorization: Bearer <token>` 与 `X-PLS-Workspace: <workspaceId>`，响应继续使用统一 `{ code, requestId, generatedAt, data }` 包装。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/channel-objects` | 对象库列表。支持 `?objectType=` / `?platformType=` / `?sourceBatchId=` / `?dataVersion=` / `?cursor=` / `?pageSize=` |
| GET | `/channel-objects/:canonicalObjectKey` | 对象详情。缺省读取 latest view；传 `?dataVersion=` 读取历史版本 |
| GET | `/channel-objects/:canonicalObjectKey/audience-profiles` | 对象人群画像列表。缺省 latest，支持 `?dataVersion=` |
| GET | `/channel-objects/:canonicalObjectKey/product-fit-profiles` | 对象商品适配画像列表。缺省 latest，支持 `?dataVersion=` |
| GET | `/channel-objects/:canonicalObjectKey/bindings` | 对象绑定关系列表。支持 `?bindingType=` / `?dataVersion=` |

`GET /channel-objects` 遵循本文件 `2.5` 分页约定：默认 `pageSize=20`、最大 `100`，返回 `data.items` 与 `data.page`。排序为 `generatedAt DESC`，并以 `objectType/displayName/canonicalObjectKey` 做稳定次级排序。当前 cursor 为服务端 opaque token，客户端只能原样传回，不得解析含义。

对象字段包含：`objectType`、`canonicalObjectKey`、`objectVersionId`、`dataVersion`、`sourceBatchId`、`generatedAt`、`timeWindow`、`displayName`、`platformName`、`platformType`、`targetObject`、`entityAttributes`、`possibleDuplicate`、`duplicateCandidateKeys`、`manualReviewStatus`、`qualityFlags`、`source`、`sourceType`。

导入仍走 Admin Database 统一入口：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/database/import-jobs/dry-run` | Body `{ "packageType": "channel-profile-object-library" }`，返回 `OperationImpact` + `qualityReport` |
| POST | `/admin/database/import-jobs` | Body `{ "packageType": "channel-profile-object-library", "confirmText": "IMPORT CHANNEL OBJECT LIBRARY <sourceBatchId>" }`，必须带 `X-PLS-Admin-Token` 与 `Idempotency-Key` |

正式 import 必须先复用 dry-run 结果。若 dry-run 存在 blocking errors（如 `missing_parent_reference`、`unapproved_tag_id`、`invalid_object_type`、`missing_profile_lineage`、`event_or_scenario_as_channel_entity`），即使 `confirmText` 正确也返回 `400 invalid_input`，`error.field = "dryRun"`，不得写入业务表。

---

## 11. 新品预测 API（A-P2-9）

P2 新增。为新品主数据预测提供 API，并把预测画像结果接入人货匹配链路。前缀 `/api/v0/new-products`。

### 11.1 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/new-products/predictions` | 提交新品预测（sync）。Body: `NewProductMasterPredictionInput`。返回 `PredictedProductProfile`。 |
| GET | `/new-products/predictions` | 列表，支持 `?skuId=` / `?pageSize=` |
| GET | `/new-products/predictions/:predictionId` | 详情 |
| POST | `/new-products/predictions/:predictionId/match` | 将预测画像投入匹配链路。Body: `{ channelIds?: string[] }`。返回匹配结果列表。 |

### 11.2 核心对象

#### NewProductMasterPredictionInput

对齐 `docs/p2-7-new-product-input-template/` 模板结构。必填字段：
- `productMaster.identity`：productId 或 sourceProductKey（至少一个）
- `productMaster.category.categoryLv1`：一级类目
- `productMaster.lineage`：sourceBatchId + dataVersion

可选字段：`priceAndSeason`、`styleAndScenario.mappedProductTags`、`similarProducts`、`quality`。

#### PredictedProductProfile

对齐 `docs/model-p2-8-new-product-prediction-contract.md`。关键字段：
- `skuId`：解析后的商品 ID（缺失身份时为 null）
- `predictedProfileTags`：预测画像标签（使用 taxonomy 已有 tagId）
- `confidence`：综合置信度（0-1）
- `riskFlags`：风险标记（如 `baseline_not_trained_model`、`missing_required_identity`）
- `unavailableReasons`：不可用原因
- `modelPath`: `"new_product_explainable_baseline"`

### 11.3 匹配衔接

`POST /new-products/predictions/:predictionId/match` 调用 `toProductChannelFitProfile()` 将预测结果桥接为 `ProductProfileDraft`，再调用 `matchFromPredictionAndChannels()` 生成匹配结果存入 `match_result` 表。如果 `skuId` 为 null，桥接函数会抛错，阻止无可追溯身份的结果进入匹配链路。

---

## 12. 经营飞轮 API（A-P2-10）

P2 新增。为经营飞轮提供决策记录、行动记录、反馈导入和复盘状态。前缀 `/api/v0/operations`。

### 12.1 设计原则

- **只记录与复盘**：P2 Phase 1 不做自动策略执行。
- **从匹配建议或模拟市场结果创建决策**：`decision_record` 关联 `match_result` 或 `simulation_run`。
- **反馈数据保留来源**：每条 feedback 带 source / sourceBatchId / dataVersion / qualityFlags。
- **状态流转**：decision status: `pending` → `verified` / `needs_adjustment`；review status: `pending_review` / `verified` / `needs_adjustment`。
- **不自动写入**：`POST /simulated-market/runs` 只保存模拟结果，不会自动创建 `decision_record`；经营飞轮决策必须由 `POST /operations/decisions` 显式创建。

### 12.2 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/operations/decisions` | 从匹配建议或模拟市场结果创建决策。Body: `{ skuId, channelId, recommendation, rationale?, matchId?, simulationRunId?, sourceType?, sourceRef?, simulationSummary? }` |
| GET | `/operations/decisions` | 列表，支持 `?status=` / `?skuId=` |
| GET | `/operations/decisions/:decisionId` | 详情（含 actions / feedbacks / reviews） |
| POST | `/operations/decisions/:decisionId/actions` | 记录行动。Body: `{ actionType, detail?, status?, scheduledAt? }` |
| POST | `/operations/decisions/:decisionId/feedback` | 导入反馈。Body: `{ feedbackType, metricName, metricValue?, source?, timeWindow?, ... }` |
| POST | `/operations/decisions/:decisionId/review` | 创建复盘。Body: `{ reviewStatus, adjustmentType?, rationale?, reviewer? }` |
| GET | `/operations/decisions/:decisionId/review` | 复盘记录列表 |

**`POST /operations/decisions` 请求体：**

```json
{
  "skuId": "mock_sku_101",
  "channelId": "mock_douyin_live_001",
  "recommendation": "test_launch",
  "rationale": "模拟市场反馈整体可接受，但价格敏感度存在分歧",
  "matchId": "match_20260701_0001",
  "simulationRunId": "sim_20260701_0001",
  "sourceType": "manual_strategy",
  "sourceRef": {
    "id": "pred_20260701_0001",
    "type": "single_product_portrait"
  },
  "simulationSummary": {
    "acceptanceScore": 62,
    "purchaseIntentScore": 55,
    "confidence": 0.65,
    "opportunitySummary": ["..."],
    "riskSummary": ["..."],
    "recommendedAdjustments": ["..."]
  }
}
```

约束：

- `skuId`、`channelId`、`recommendation` 必填。
- `simulationRunId` 与 `matchId` 建议至少提供其一以明确来源，但 API 不强制互斥，保持旧路径兼容（仅 `skuId` + `channelId` + `recommendation` 仍可创建决策）；两者也可同时提供（例如模拟结果基于某次匹配建议）。
- 当请求携带 `simulationRunId` 时，必须存在且属于当前 `workspaceId`；不存在或跨 workspace 返回 `not_found`。
- `sourceType` 枚举：`product_channel_match` / `single_product_portrait` / `campaign_product_strategy` / `manual_strategy`；携带 `simulationRunId` 时若未提供，默认使用 `simulation_run.inputSnapshot.sourceType`。
- `sourceRef` 为策略来源引用，JSON 对象；携带 `simulationRunId` 时若未提供，默认使用 `simulation_run.inputSnapshot.sourceRef`。
- `simulationSummary` 为模拟输出摘要，JSON 对象；携带 `simulationRunId` 时若未提供，服务端自动从 `simulation_run.result.overall` 提取 `acceptanceScore`、`purchaseIntentScore`、`confidence`、`opportunitySummary`、`riskSummary`、`recommendedAdjustments`。

**响应示例：**

```json
{
  "code": "ok",
  "requestId": "req_20260701_00001",
  "generatedAt": "2026-07-01T02:15:00Z",
  "data": {
    "decisionId": "dec_20260701_0001",
    "status": "pending"
  }
}
```

**`GET /operations/decisions` 与 `GET /operations/decisions/:decisionId` 额外返回字段：**

```json
{
  "simulationRunId": "sim_20260701_0001",
  "sourceType": "manual_strategy",
  "sourceRef": { "id": "pred_20260701_0001", "type": "single_product_portrait" },
  "simulationSummary": {
    "acceptanceScore": 62,
    "purchaseIntentScore": 55,
    "confidence": 0.65,
    "opportunitySummary": ["..."],
    "riskSummary": ["..."],
    "recommendedAdjustments": ["..."]
  }
}
```

### 12.3 行动类型

`actionType` 枚举（P2 初期）：`listing`（上架）、`distribution`（铺货）、`advertising`（投放）、`content`（内容）、`livestream`（直播）、`promotion`（活动）、`pricing`（价格策略）、`other`。

### 12.4 反馈类型

`feedbackType` 枚举：`sales`（销量）、`gmv`（GMV）、`conversion`（转化）、`roi`（ROI）、`return_rate`（退货）、`repurchase`（复购）、`crowd_deviation`（人群偏差）、`other`。

### 12.5 状态流转

```text
decision:   pending ──→ verified (review confirmed)
            pending ──→ needs_adjustment (review flagged)

review:     pending_review ──→ verified
            pending_review ──→ needs_adjustment
```

---

## 13. 模拟市场 API（A-P7-SIM-1）

P0 新增。对选品策略、人货匹配方案或活动商品方案进行投放前目标用户反馈模拟。前缀 `/api/v0/simulated-market`。

### 13.1 设计原则

- **Derived Result**：模拟结果保存为 `SimulationRun`，属于 Derived Result；不写入真实销售事实、真实反馈事实或经营飞轮决策。
- **目标用户 Agent**：一期默认支持三大人群模板（`质感流行派`、`都市体面家`、`百搭优选客`），同时支持手写 `manual_persona`；二期扩展支持 `saved_subagent`（持久化 subagent）与 `channel_audience_profile`（渠道画像派生 subagent），模型层按 `sourceType` 保存 lineage 并复用现有模拟链路。
- **LLM 优先 + Deterministic Fallback**：默认通过 `pi-agent` 调用 Minimax M3（结果记录为 `provider=minimax`，`modelVersion=minimax-m3`）。当 `pi-agent` 不可用、请求超时、返回非法 JSON 或模型层校验失败时，自动回退到 `deterministic_fallback`，并在 `qualityFlags` 中同时标记 `deterministic_fallback_used` 和 `llm_unavailable_fallback_used`。
- **Workspace 隔离**：所有记录按 `workspaceId` 隔离；跨 workspace 读取返回 `not_found`。
- **Idempotency**：`POST /runs` 支持 `Idempotency-Key`，服务端缓存 24 小时；命中缓存时返回 `Idempotency-Replay: true`。

### 13.2 核心对象

#### `TargetUserAgent`

```json
{
  "agentId": "agent-template-a",
  "name": "A / 质感流行派",
  "sourceType": "three_audience_segment",
  "sourceRef": {
    "segmentCode": "A",
    "segmentName": "质感流行派",
    "profileVersion": "v1",
    "subagentId": null,
    "canonicalObjectKey": null,
    "profileId": null,
    "dataVersion": null
  },
  "profile": {
    "demographics": ["京东平台目标人群"],
    "preferences": ["设计感", "质感", "细节工艺"],
    "concerns": ["撞款", "廉价感"],
    "decisionFactors": ["面料质感", "剪裁细节"]
  },
  "weight": 1
}
```

`sourceType` 枚举：`three_audience_segment` / `manual_persona` / `saved_subagent` / `channel_audience_profile`。

`sourceRef` 字段根据 `sourceType` 按需填写：
- `three_audience_segment`：`segmentCode`、`segmentName`、`profileVersion`。
- `saved_subagent`：`subagentId`、`profileVersion`（可选）。
- `channel_audience_profile`：`canonicalObjectKey`、`profileId`、`dataVersion`、`profileVersion`（可选）。
- 额外 lineage 字段保留向后扩展，未知字段客户端应忽略。

由渠道画像派生（`channel_audience_profile`）的 `profile.preferences` / `profile.decisionFactors` 中的字符串为“标签摘要”形态，不得被展示为真实个人偏好。派生结果属于 Derived Result，仅作为策略压力测试输入。

#### `SimulatedMarketInput`

```json
{
  "sourceType": "manual_strategy",
  "sourceRef": { "id": "pred_20260701_0001", "type": "single_product_portrait" },
  "strategyText": "...",
  "marketContext": {
    "channelEntityId": "account:mock_account_douyin_style",
    "marketingEventId": "marketing_event:mock_event_618",
    "businessScenarioId": "business_scenario:new_product_launch:mock_style",
    "contextText": "..."
  },
  "targetAgentSet": [TargetUserAgent]
}
```

`sourceType` 枚举：`manual_strategy` / `single_product_portrait` / `product_channel_match` / `campaign_product_strategy`。

#### `SimulatedMarketResult`

```json
{
  "overall": {
    "acceptanceScore": 62,
    "purchaseIntentScore": 55,
    "confidence": 0.65,
    "opportunitySummary": ["..."],
    "riskSummary": ["..."],
    "recommendedAdjustments": ["..."]
  },
  "agentFeedback": [
    {
      "agentId": "agent-template-a",
      "acceptanceScore": 65,
      "purchaseIntentScore": 58,
      "positiveDrivers": ["..."],
      "objections": ["..."],
      "quoteSummary": "...",
      "suggestedAdjustment": "..."
    }
  ]
}
```

评分范围：`acceptanceScore` / `purchaseIntentScore` 为 `0-100` 整数；`confidence` 为 `0-1` 浮点数。

#### `SimulationRun`

```json
{
  "runId": "sim_20260701_0001",
  "workspaceId": "ws_demo",
  "status": "succeeded",
  "inputSnapshot": SimulatedMarketInput,
  "result": SimulatedMarketResult,
  "provider": "minimax",
  "modelVersion": "minimax-m3",
  "generatedAt": "2026-07-01T02:15:00Z",
  "qualityFlags": []
}
```

Fallback 示例（provider 未配置或调用失败时）：

```json
{
  "runId": "sim_20260701_0001",
  "workspaceId": "ws_demo",
  "status": "succeeded",
  "inputSnapshot": SimulatedMarketInput,
  "result": SimulatedMarketResult,
  "provider": "deterministic_fallback",
  "modelVersion": "deterministic-fallback-0.1",
  "generatedAt": "2026-07-01T02:15:00Z",
  "qualityFlags": ["deterministic_fallback_used", "llm_unavailable_fallback_used"]
}
```

`modelVersion` 取值：LLM 成功时等于实际调用时使用的 `SIMULATED_MARKET_MODEL`（默认 `minimax-m3`），不是固定写死的值；fallback 时等于 `deterministic-fallback-0.1`。

### 13.3 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/simulated-market/agent-templates` | 返回可用目标用户 Agent 模板与已启用 subagent 候选，分为 `agents`（ABC 默认模板）和 `subagents`（workspace 内启用 subagent）两个数组 |
| GET | `/simulated-market/subagents` | 查询当前 workspace 的 subagent 列表；支持 `?enabled=true\|false` |
| POST | `/simulated-market/subagents` | 创建 subagent；Body 见下方 |
| GET | `/simulated-market/subagents/:agentId` | 查询单个 subagent |
| PATCH | `/simulated-market/subagents/:agentId` | 更新 subagent；只允许更新 `name`、`enabled`、`persona`、`profile`、`weight` |
| DELETE | `/simulated-market/subagents/:agentId` | 删除当前 workspace 的 subagent |
| POST | `/simulated-market/subagents/from-channel-object` | 从当前 workspace 的 `channel_object_latest` + `audience_profile_latest` 派生 subagent |
| POST | `/simulated-market/runs` | 创建并执行一次模拟。Body: `SimulatedMarketInput`。返回 `SimulationRun`。 |
| GET | `/simulated-market/runs` | 查询模拟记录列表。支持 `?cursor=` / `?pageSize=`。 |
| GET | `/simulated-market/runs/:runId` | 查询单次模拟详情。跨 workspace 返回 `not_found`。 |

**`POST /runs` 请求示例：**

```json
{
  "sourceType": "manual_strategy",
  "strategyText": "本季主打修身显瘦通勤连衣裙，采用高支棉面料，主打简约通勤与多场景穿搭，定价中档，计划通过抖音直播间与天猫旗舰店同步首发。",
  "marketContext": {
    "channelEntityId": "account:mock_account_douyin_style",
    "contextText": "抖音直播首发 + 天猫旗舰店"
  },
  "targetAgentSet": [
    {
      "agentId": "agent-template-a",
      "name": "A / 质感流行派",
      "sourceType": "three_audience_segment",
      "profile": {
        "preferences": ["设计感", "质感"],
        "concerns": ["撞款"]
      }
    }
  ]
}
```

**`GET /simulated-market/agent-templates` 响应示例：**

```json
{
  "code": "ok",
  "requestId": "req_20260701_00001",
  "generatedAt": "2026-07-01T02:15:00Z",
  "data": {
    "agents": [TargetUserAgent],
    "subagents": [TargetUserAgent]
  }
}
```

`agents` 固定为 ABC 三大人群模板；`subagents` 为当前 workspace 中 `enabled=true` 的持久化 subagent，均按 `TargetUserAgent` 形态返回。前端可将两者合并为候选 agent 池，也可按 `sourceType` 区分来源。

**`POST /simulated-market/subagents` 请求体：**

```json
{
  "name": "夏季高潜通勤人群",
  "enabled": true,
  "persona": "保守摘要：偏好通勤、简约、透气面料",
  "profile": {
    "demographics": ["25-34 岁一线城市白领"],
    "preferences": ["通勤", "透气", "简约"],
    "concerns": ["闷热", "打理麻烦"],
    "decisionFactors": ["面料舒适度", "版型合体"]
  },
  "sourceType": "saved_subagent",
  "sourceRef": { "subagentId": "sub_001" },
  "weight": 1
}
```

- `name` 必填，`profile` 必填且为对象。
- `enabled` 默认 `true`。
- `sourceType` 默认 `saved_subagent`；允许 `saved_subagent` / `channel_audience_profile` / `manual_persona`。不允许 `three_audience_segment`（仅限 ABC 模板使用，不得通过用户 API 创建）。
- `sourceRef` 为对象；`saved_subagent` 时默认写入 `{ subagentId: <agentId> }`。
- `persona` 为 subagent 侧描述字段，不进入 `TargetUserAgent`。

**`POST /simulated-market/subagents/from-channel-object` 请求体：**

```json
{
  "canonicalObjectKey": "douyin:account:mock_account_douyin_style",
  "profileId": "profile_001",
  "name": "抖音账号高潜粉丝画像",
  "enabled": true
}
```

- `canonicalObjectKey` 必填，必须对应当前 workspace `channel_object_latest` 中的对象。
- `profileId` 可选；缺省时取该对象最新的 `audience_profile_latest`。
- 若对象不存在或没有可用的 `AudienceProfile`，返回 `unprocessable` / 422，不编造画像。
- 派生的 `profile` 从 `AudienceProfile.tags` 保守提取，来源信息写入 `sourceRef.canonicalObjectKey` / `profileId` / `dataVersion`。

**`PATCH /simulated-market/subagents/:agentId` 请求体：**

```json
{
  "name": "更新后的人群名",
  "enabled": false,
  "persona": "更新后的描述",
  "profile": { ... },
  "weight": 1.2
}
```

- 只允许更新 `name`、`enabled`、`persona`、`profile`、`weight`。

**错误响应：**

- `invalid_input` / 400：`sourceType` 非法、`name` 缺失、`profile` 非法、请求体不是合法 JSON。
- `not_found` / 404：`runId` / `agentId` 不存在或属于其他 workspace。
- `unprocessable` / 422：`from-channel-object` 目标对象不存在或没有可用 `AudienceProfile`。
- `conflict` / 409：`Idempotency-Key` 已用于不同请求体。

**幂等：** 所有 subagent 写操作（`POST /subagents`、`PATCH /subagents/:agentId`、`DELETE /subagents/:agentId`、`POST /subagents/from-channel-object`）均支持 `Idempotency-Key` 头。POST 使用 `idempotencyMiddleware()`（位于 `apps/server/src/lib/idempotency.ts`）；PATCH/DELETE 使用同 scope 内的手动幂等实现，共享同一个 `idempotency_key` 表，缓存 24 小时，命中时返回 `Idempotency-Replay: true`，不同请求体命中同一 key 返回 409 `conflict`。

### 13.4 环境变量与 Provider 配置

模拟市场 LLM provider 在 server 启动时读取环境变量（server 重启后生效）。PLS 业务代码不直连第三方模型 HTTP API；真实 LLM 调用统一通过本机 `pi-agent`（默认 CLI: `pi`）执行。

| 环境变量 | 默认值 | 是否必填 | 说明 |
|---|---|---|---|
| `PLS_PI_BIN` | `pi` | 否 | `pi-agent` CLI 命令路径；未设置时使用 PATH 中的 `pi`。 |
| `SIMULATED_MARKET_MODEL` | `minimax-m3` | 否 | 写入 `SimulationRun.modelVersion` 的业务模型口径。 |
| `SIMULATED_MARKET_LLM_TIMEOUT_MS` | `30000` | 否 | LLM 调用超时时间（毫秒）。仅接受正整数；非法、空字符串或非数字值会回退为 `30000`。 |
| `SIMULATED_MARKET_FAKE_LLM` | `false` | 否 | 设置为 `true` 时，后端直接返回预置 fake LLM 响应，不发起真实网络请求；用于本地开发和 CI smoke。 |
| `SIMULATED_MARKET_PI_MODEL` | `minimax-cn/MiniMax-M3` | 否 | 传给 `pi-agent` 的真实模型标识，保持与 pi-xanthil 默认模型一致。 |
| `SIMULATED_MARKET_DISABLE_PI_LLM` | `false` | 否 | 设置为 `true` 时禁用 `pi-agent` LLM 调用；默认 smoke 的 fallback phase 会使用该开关。 |

测试与运行口径：

- 默认 CI / `npm run smoke:simulated-market` 使用 `SIMULATED_MARKET_FAKE_LLM=true` 验证 LLM 成功路径，并在 fallback phase 显式禁用 `pi-agent` LLM；默认验证不依赖真实模型调用。
- 真实 LLM 验证为可选：仅当 `RUN_SIMULATED_MARKET_LIVE_LLM=1` 且本机 `pi-agent` 可用时，才会在 smoke 中调用真实 LLM；否则该 Phase 自动跳过并说明原因，不会导致 smoke 失败。
- 手动运行真实 LLM smoke 示例：`cd apps/server && RUN_SIMULATED_MARKET_LIVE_LLM=1 SIMULATED_MARKET_PI_MODEL=minimax-cn/MiniMax-M3 npm run smoke:simulated-market`。

### 13.5 数据来源与质量元信息

- `sourceType` / `sourceRef`：追溯策略来源（手写、单品画像、人货匹配、活动策略）。
- `provider` / `modelVersion`：记录实际生成模型。LLM 成功时为 `minimax` / 当前 `SIMULATED_MARKET_MODEL` 值（默认 `minimax-m3`）；fallback 时为 `deterministic_fallback` / `deterministic-fallback-0.1`。
- `qualityFlags`：fallback 时同时包含 `deterministic_fallback_used` 和 `llm_unavailable_fallback_used`。输入质量不足时可能附加 `strategy_text_too_short`、`missing_target_agent_profile`、`missing_market_context`。

### 13.6 与上下游的衔接

- 后续可选从单品画像、人货匹配结果页「送入模拟市场」；一期只保留 `sourceRef` 能力，不实现入口。
- 已从模拟结果创建经营飞轮决策：`POST /operations/decisions` 支持 `simulationRunId`，并在验证该 run 属于当前 workspace 后写入 `decision_record`；`POST /simulated-market/runs` 仍不自动创建决策。

---
