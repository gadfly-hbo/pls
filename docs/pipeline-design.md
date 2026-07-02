# PLS Pipeline 设计 v0.1

> 归属：A 应用后端
> 状态：P0 草案
> 最近更新：2026-07-01

## 1. 目的

本文定义 P0 阶段 PLS 数据与任务流水线的最小可信设计，覆盖：

- 数据流总览（导入 → 预测 → 匹配 → 审计）。
- 任务状态机（预测、匹配、批次导入、taxonomy 校验）。
- 结果存储方案与文件布局。
- 审计日志字段与保留期。
- 幂等、重试、rejected 分支的落地方式。

依赖文档：

- `docs/api-contract.md`：对外 API 契约、核心对象、错误码。
- `docs/data-safety-policy.md`：数据分级、共享对象最小结构。
- `docs/data-spec.md`：训练宽表与 DMP 导入格式。
- `docs/model-plan.md`：预测/匹配算法与 `modelVersion` / `modelPath`。
- `docs/profile-taxonomy-v0.md`：标签坐标系。

P0 原则：

- 本文只锁契约与流程，不锁具体实现语言/框架。
- 所有跨阶段状态迁移必须能在审计日志中还原。
- 任何触发数据安全红线的请求走 `rejected` 分支，不进主库。
- 结果对象一律带 `source / confidence / generatedAt`；聚合数据额外带 `sampleSize / timeWindow`。

## 2. 数据流总览

### 2.1 端到端链路

```
D 域导入器  ──POST /batches──▶  A 域接入层
                                    │
                                    │ sanitize / taxonomy_validate / quality_check
                                    │ 命中红线 → rejected 分支 + 审计
                                    ▼
                                A 域主库（SKU / ChannelProfile / WideTableRow）
                                    │
       V 域前端 ◀── HTTP API ── A 域 ──▶ M 域内部桥（PredictService / MatchService）
                                    │
                                    ▼
                        ProductProfile / MatchResult / AuditEvent
```

### 2.2 阶段职责

| 阶段 | 输入 | 输出 | 归属 |
|---|---|---|---|
| 1. `import` | D 域聚合 CSV/JSONL | `Batch` + 落库的 `SKU`、`ChannelProfile`、宽表行 | A |
| 2. `sanitize` | 上一步 payload | 去敏字段视图 + `sanitize_rejected` 列表 | A |
| 3. `taxonomy_validate` | `tagId` 集合 | 通过 / `taxonomy_violation` / `unmappedInputTokens` | A |
| 4. `quality_check` | 上一步结果 | `qualityReport` + `qualityFlags` | A |
| 5. `predict` | `SKU` + `modelVersion` | `ProductProfile` | A + M |
| 6. `match` | `ProductProfile` + 候选 `ChannelProfile[]` | `MatchResult[]` | A + M |
| 7. `audit` | 各阶段事件 | `AuditEvent[]` | A |

### 2.3 数据准入门禁

任一请求进入主库前必须依次通过：

1. **safety 门禁**（S0/S1 拦截）：字段名黑名单（`phone`、`name`、`address`、`orderId`、`memberId`、`openId`、`adId`、`deviceId`）+ 值级正则（手机号 / 邮箱 / 身份证形态）。命中 → `safety_violation`，全批 `rejected`。
2. **taxonomy 门禁**：`tagId` 必须在 `docs/profile-taxonomy-v0.md` 白名单。未命中且 `mappingRuleId` 存在 → 进入 `unmappedTags`；否则 `taxonomy_violation`。
3. **quality 门禁**：`sampleSize < 100` 标记 `low_sample_size`；`profileCoverageRate < 0.7` 标记 `low_mapping_coverage`。仅告警不拦截，落 `qualityReport`。

## 3. 任务状态机

### 3.1 状态集合

`Task.status` 六态：

| 状态 | 含义 | 终态 |
|---|---|---|
| `queued` | 已受理，未开始 | 否 |
| `running` | 处理中 | 否 |
| `succeeded` | 成功，`resourceId` 已生成 | 是 |
| `failed` | 处理失败（模型异常、依赖失败） | 是 |
| `cancelled` | 用户或系统主动取消 | 是 |
| `rejected` | 数据安全红线拦截（`safety_violation` / `taxonomy_violation`） | 是 |

`rejected` 与 `failed` 语义分离：前者是"违反红线拒绝处理"，后者是"允许处理但内部异常"。V 域展示时二者的运营含义不同。

### 3.2 预测任务状态机

```
                 create
     [∅] ─────────────────▶ queued
                                │
                                │ worker pick
                                ▼
        ┌─────────────────── running ──────────────────┐
        │                       │                       │
        │ safety/taxonomy fail  │ predict ok            │ predict error
        ▼                       ▼                       ▼
    rejected               succeeded                  failed
                                │                       │
                                │ ProductProfile 落库    │  retriable=true?
                                ▼                       ▼
                          [ProductProfile]         running (retry, ≤3)
```

规则：

- **入队条件**：`SKU` 存在于工作区内，且 `mappedProductTags` 通过 taxonomy 校验；否则直接 `rejected`。
- **执行超时**：单次 30 秒；超时进入 `failed`，`error.code = "predict_timeout"`。
- **重试**：`failed` 且 `error.retriable = true` 时最多重试 3 次，指数退避 2/4/8 秒。`rejected` 不重试。
- **幂等键**：`workspaceId + skuId + dnaHash + modelVersion`；命中键的重复请求直接返回已有 `Task`。
- **同步降级**：`POST /predictions?wait=1` 时 30s 内到 `succeeded` 返回 `200 ok + ProductProfile`；否则 `202 accepted + Task`，客户端后续用 `GET /tasks/{taskId}` 或 `GET /predictions/{predictionId}` 拉取。

### 3.3 匹配任务状态机

```
              create
    [∅] ──────────────▶ queued
                          │
                          │ worker pick
                          ▼
                       running
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
   safety fail    ProductProfile missing   match ok
        │                 │                  │
        ▼          auto trigger predict      ▼
    rejected     ────────┐                succeeded
                          │                  │
                    predict fail             │ MatchResult[] 落库
                          ▼                  ▼
                       failed          [MatchResult × N]
```

规则：

- **依赖注入**：请求中仅给 `skuId` 无 `predictionId` 时，A 域先触发 / 复用最新 `ProductProfile`；缺失且预测失败 → `dependency_failed`。
- **候选渠道来源**：默认为工作区内 `ChannelProfile` 全集；请求可传 `channelIds[]` 过滤。空候选 → `invalid_input`。
- **超时**：单次 30 秒；候选渠道数 > 50 时强制异步。
- **重试**：同预测任务。
- **幂等键**：`workspaceId + predictionId + sha1(sorted(channelIds))`。
- **结果分片**：单任务生成 N 个 `MatchResult` 一次性落库；任一 `MatchResult` 违反 taxonomy 则整任务 `rejected`。

### 3.4 批次导入任务状态机

```
   [∅] ─create─▶ queued ─worker─▶ running ─sanitize/tax/qc─▶ succeeded
                                     │                       │
                                     │ safety hit            │ qualityFlags 非空
                                     ▼                       ▼
                                 rejected             succeeded (with warnings)
                                     │
                                     │ worker crash
                                     ▼
                                  failed
```

规则：

- 批次任务允许"warnings 通过"：`qualityReport.qualityFlags` 非空但无红线命中时，API 响应仍是 `succeeded` + `qualityFlags`。
- `rowCount > 100000` 拒绝：`payload_too_large`。
- 批次任务**无自动重试**：重试语义由客户端重发 + 新 `batchId` 显式表达。

### 3.5 taxonomy 校验任务

工具型任务，独立于业务流。用于 V 域上传预览：

- 输入：`tagIds[]`。
- 输出：`{ valid: [], invalid: [], suggestions: [] }`。
- 状态机：`queued → running → succeeded` 或 `failed`（同步实现，`Task` 记录仅供审计）。

### 3.6 状态迁移事件

每次迁移必须写入审计日志（§5），字段：

| 字段 | 说明 |
|---|---|
| `taskId` | 关联任务 |
| `fromStatus` / `toStatus` | 迁移前后状态 |
| `event` | `enqueue` / `start` / `succeed` / `fail` / `cancel` / `reject` / `retry` |
| `reasonCode` | 错误码或触发原因（例如 `predict_timeout`、`safety_violation`） |
| `attempt` | 第几次尝试 |
| `at` | ISO 8601 |

## 4. 幂等、重试与并发

### 4.1 幂等键规则

| 任务 | 隐式键 | 显式键 |
|---|---|---|
| `prediction` | `workspaceId + skuId + dnaHash + modelVersion` | `Idempotency-Key` header 覆盖 |
| `match` | `workspaceId + predictionId + sha1(sorted(channelIds))` | 同上 |
| `batch_import` | 客户端 `batchId`（必填） | 同上 |
| `taxonomy_validate` | 无（同步无幂等） | — |

- 幂等窗口：24 小时。
- 命中已有 `succeeded` → 返回同一 `resourceId` + 原响应体。
- 命中已有 `running` → 返回同一 `taskId`，客户端等待。
- 命中已有 `failed` / `rejected` → 视为新请求（不复用错误结果）。

### 4.2 重试策略

- 只重试 `failed` 且 `error.retriable = true`。
- 可重试错误码：`predict_timeout`、`match_timeout`、`internal_error`、`dependency_failed`（下游 5xx）。
- 不可重试错误码：`safety_violation`、`taxonomy_violation`、`invalid_input`、`unprocessable`、`payload_too_large`、`forbidden`。
- 退避：指数 2/4/8 秒；`attempts` 计数写入 `Task.attempts`。
- 达到重试上限 → 终态 `failed`，写审计事件 `event=fail, reasonCode=retry_exhausted`。

### 4.3 并发

- P0 单 worker 池；单工作区内并发上限 = 4（预测/匹配共享）；超出入 `queued`。
- 同一幂等键并发只允许 1 个 `running`；后到者复用 `taskId`。
- 批次导入独占 worker，与预测/匹配互不阻塞；同一工作区禁止两个 `batch_import` 同时 `running`（防止主库锁竞争）。

## 5. 审计日志

### 5.1 `AuditEvent` 结构

```json
{
  "auditId": "audit_20260701_000123",
  "workspaceId": "ws_demo",
  "at": "2026-07-01T02:14:35Z",
  "actor": "system:worker",
  "requestId": "req_20260701_00001",
  "taskId": "task_pred_20260701_0001",
  "resourceType": "prediction",
  "resourceId": "pred_20260701_0001",
  "event": "start",
  "fromStatus": "queued",
  "toStatus": "running",
  "reasonCode": null,
  "attempt": 1,
  "meta": {
    "modelVersion": "m-p0-baseline-0.1",
    "modelPath": "gbdt"
  }
}
```

字段约束：

- `actor` 枚举：`user:<userId>` / `system:worker` / `system:scheduler` / `system:sanitizer`。
- `event` 与 `fromStatus / toStatus` 的组合以 §3.6 状态机为准，其他组合视为异常并触发 `internal_error` 审计。
- `meta` 不得包含 S0/S1 原文；仅允许写入 `modelVersion`、`modelPath`、`dnaHash`、`sourceType` 等元信息。
- **禁止字段**：payload 原始 JSON、真实字段值、请求 body 全文；仅保留字段名与是否命中黑名单的布尔标记。

### 5.2 特殊事件

| 场景 | `event` | 附加要求 |
|---|---|---|
| 数据红线拦截 | `reject` | `reasonCode = safety_violation`，`meta.fieldName` 只记字段名不记值 |
| 标签体系拦截 | `reject` | `reasonCode = taxonomy_violation`，`meta.tagId` 记录违规 tagId |
| 超时降级 | `fail` | `reasonCode = predict_timeout` 或 `match_timeout` |
| 重试消耗完 | `fail` | `reasonCode = retry_exhausted` |
| 主动取消 | `cancel` | `actor = user:<userId>`；`meta.cancelReason` 可选 |

### 5.3 保留期与访问

- P0 全量保留 90 天，之后按 `resourceType` 抽样保留。
- 访问接口：`GET /audit?resourceId=&taskId=&event=`（见 `api-contract.md §4`）。
- 只读；任何修改必须通过新增 `event = amend` 事件表达，禁止就地改写历史。

## 6. 结果存储方案（P0）

### 6.1 选型决策

P0 采用 **SQLite + 本地文件系统** 组合存储。理由：

- 单机 / 单开发者场景，无外部依赖，`docker-compose` 不必要。
- SQLite 对 JSON 字段有 `->` / `->>` 原生支持，够用于 `ProfileTagScore[]`、`topSegments` 等嵌套结构。
- 迁移路径清晰：schema 稳定后可 dump 到 Postgres（列结构基本兼容）。

候选方案对比：

| 方案 | 优点 | 缺点 | P0 结论 |
|---|---|---|---|
| **SQLite + JSON 列** | 零运维、单文件、事务完善 | 并发写入弱 | **采用** |
| 纯 JSON / JSONL 文件 | 极简、可 diff | 无事务、无索引、并发差 | 拒绝 |
| Postgres | 生产级、并发好 | P0 阶段过重 | P1 迁移目标 |

总控已批准（见 `api-contract.md §8`）。

### 6.2 主表结构（P0 逻辑视图）

| 表 | 主键 | 关键列 |
|---|---|---|
| `workspace` | `workspaceId` | `name`、`createdAt` |
| `sku` | `skuId` | `workspaceId`、`attributes` (JSON)、`mappedProductTags` (JSON)、`updatedAt` |
| `channel_profile` | `channelId` | `workspaceId`、`channelType`、`tags` (JSON)、`batchId` |
| `wide_table_row` | `(skuId, channelId, timeWindow)` | `workspaceId`、`batchId`、full row (JSON) |
| `batch` | `batchId` | `workspaceId`、`batchType`、`qualityReport` (JSON) |
| `prediction` | `predictionId` | `workspaceId`、`skuId`、`taskId`、`modelVersion`、`modelPath`、`predictedProfileTags` (JSON)、`topSegments` (JSON) |
| `match_result` | `matchId` | `workspaceId`、`taskId`、`predictionId`、`skuId`、`channelId`、`matchScore`、`matchConfidence`、`positiveDrivers` (JSON)、`negativeDrivers` (JSON)、`recommendation` |
| `task` | `taskId` | `workspaceId`、`taskType`、`status`、`resourceId`、`attempts`、`error` (JSON) |
| `audit_event` | `auditId` | `workspaceId`、`taskId`、`event`、`fromStatus`、`toStatus`、`reasonCode`、`meta` (JSON) |

- 所有表带 `createdAt` / `updatedAt`；`audit_event` 只写不改。
- 索引：`(workspaceId, createdAt DESC)`、`(workspaceId, skuId)`、`(workspaceId, taskType, status)`、`(taskId)`、`(predictionId)`。

### 6.3 文件系统布局

原始素材与派生大文件不进 SQLite，只在文件系统按工作区隔离存放：

```
data/
├── workspaces/
│   └── ws_demo/
│       ├── db.sqlite                     # 主库
│       ├── batches/
│       │   └── batch_mock_20260701/
│       │       ├── raw.jsonl             # 原始导入（脱敏后）
│       │       ├── quality_report.json
│       │       └── unmapped_tags.jsonl
│       ├── assets/
│       │   └── sku/mock_sku_101/
│       │       └── image_front.jpg       # sanitized_upload 类型
│       └── audit/
│           └── 2026-07/
│               └── events.jsonl          # 审计事件月度归档（超出 SQLite 保留期后）
```

- SQLite 主库文件不跨工作区共享。
- `assets/` 只放 `sanitized_upload` 类型资源；`mock_asset` 类型的引用不占本地存储。
- 90 天前的 `audit_event` 从 SQLite 迁到 `audit/YYYY-MM/events.jsonl` 归档。

### 6.4 备份与恢复

- P0 每天本地快照 `db.sqlite` 到 `data/backups/ws_<id>/YYYY-MM-DD/`；保留最近 14 份。
- 恢复策略：直接替换 `db.sqlite`；文件系统素材通过 `batchId` 关联，缺失时不阻塞恢复但记 `qualityFlags`。
- P0 不做异地备份；P1 视部署形态再定。

## 7. 待总控决策清单

以下问题在 P0 契约中已给出**候选方案 + A 域推荐**，但最终裁定权归 X 总控。

| # | 问题 | 候选 | A 域推荐 | 影响面 |
|---|---|---|---|---|
| 1 | 存储层选型 | SQLite / JSON 文件 / Postgres | **SQLite**（见 §6.1） | D、M、V 全域；决定 schema 迁移成本 |
| 2 | 预测任务同步 vs 异步 | 全同步 / 全异步 / 同步 30s 降级异步 | **同步 30s 降级**（见 §3.2） | V 域交互；工作台是否需要轮询 |
| 3 | 匹配任务同步 vs 异步 | 全同步 / 全异步 / 同步 30s 降级 | **同步 30s 降级**；候选渠道 > 50 强制异步 | V 域热力图；后台任务栏是否需要 |
| 4 | 鉴权 | 静态 token / SSO / API key | **P0 静态 token**；P1 SSO | 多品牌 / 多品牌方使用场景 |
| 5 | `MatchResult.recommendation` 阈值表 | 单一阈值 / 分维度阈值 / 品牌可覆盖 | **P0 冻结单表**（`api-contract.md §3.4`），覆盖需回流总控 | V 域运营建议展示 |
| 6 | 审计保留期 | 30 / 90 / 180 天 | **P0 90 天**，超出后归档 JSONL | 磁盘占用；合规 |
| 7 | 前端导出 CSV/Excel | 支持 / 不支持 | **P0 只提供 API 层数据源**，导出由 V 域客户端合成 | V 域需求，`notes-viz.md` 开放问题 |
| 8 | 反馈闭环接口 schema | 现在定 / P1 再定 | **P0 只留 endpoint 骨架**（`api-contract.md §6`） | M 域纠偏机制 |

以上项如未在 P0 结束前收到总控裁定，A 域按"A 域推荐"列执行；如后续裁定与推荐冲突，走 breaking change 升级 `v1` 路径。
