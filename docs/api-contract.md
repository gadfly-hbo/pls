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
