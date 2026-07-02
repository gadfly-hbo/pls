# P0-B 集成评审与任务收口

> 归属：X 总控  
> 状态：P0-B 冻结口径  
> 最近更新：2026-07-02

## 1. 目的

本文收口第一轮 X/D/M/A/V 文档契约，作为 P0-B 实现任务的开工边界。下一阶段目标从“文档设计”转为“可运行 MVP 闭环”：

```text
demo SKU 输入 -> ProductProfile -> MatchResult -> heatmap -> 前端建议展示
```

P0-B 不追求完整 SaaS，只追求本地 demo 可复现、数据红线可验证、接口和前端流程可走通。

## 2. 集成结论

### 2.1 可进入实现

以下契约已具备进入实现的条件：

| 域 | 已冻结输入 | P0-B 允许实现 |
|---|---|---|
| X | `profile-taxonomy-v0.md`、`data-safety-policy.md` | tagId 白名单、数据红线、共享对象校验 |
| D | `data-spec.md` | demo 数据包、宽表样例、DMP aggregate 样例 |
| M | `model-plan.md` | 规则 + kNN baseline、匹配算法、最小回测 |
| A | `api-contract.md`、`pipeline-design.md` | SQLite schema、API 服务骨架、Task / Audit |
| V | `ui-flow.md`、`decision-output.md` | 低保真工作台、热力图、抽屉解释、CSV 导出 |

### 2.2 必须统一的接缝口径

| 接缝 | 最终口径 | 执行方 |
|---|---|---|
| demo 数据目录 | `data/demo/` | D 产出，M/A/V 只读消费 |
| 本地运行数据目录 | `data/workspaces/ws_demo/` | A 持有 |
| 存储选型 | SQLite + 本地文件系统 | A |
| 预测同步超时 | 30s，超时返回 `202 accepted` + `Task` | A |
| 匹配同步超时 | 30s，超时返回 `202 accepted` + `Task`；候选渠道数 > 50 强制异步 | A |
| 工作区 | P0 固定 `ws_demo`，请求仍保留 `X-PLS-Workspace` | A/V |
| 鉴权 | P0 静态 token，占位实现即可 | A/V |
| `mappedProductTags` | D 预计算，M 校验和缺失回填 | D/M |
| `predictionId` / `matchId` | A 落库时生成最终 ID；M adapter 可返回临时 ID，但 A 必须覆盖为持久 ID | A/M |
| `recommendation` | A 根据 `api-contract.md §3.4` 阈值映射 | A |
| heatmap | 先 `POST /matches` 生成 `MatchResult`，再 `GET /matches/heatmap` | V/A |
| CSV 导出 | V 端合成，只导出 S4 派生结果字段 | V |

说明：`pipeline-design.md` 中曾出现匹配 60s 候选口径，P0-B 统一改为 30s，避免前端等待策略分叉。

## 3. 数据与红线

### 3.1 P0-B demo 数据要求

D-P0-B1 必须产出 `data/demo/README.md` 和以下 mock 文件：

| 文件 | 内容 | 消费方 |
|---|---|---|
| `data/demo/skus.jsonl` | 至少 3 个服装 SKU，含 ProductDNA 与 `mappedProductTags` | A/M/V |
| `data/demo/channel_profiles.jsonl` | 至少 4 个渠道画像，覆盖货架电商、短视频、直播、私域 | A/M/V |
| `data/demo/wide_table.jsonl` | SKU × channel × timeWindow 宽表样例 | M |
| `data/demo/dmp_aggregate.csv` | DMP 聚合标签导入样例 | A/D |
| `data/demo/dmp_aggregate.jsonl` | DMP 聚合标签 JSONL 等价样例 | A/D |
| `data/demo/batch_quality_report.json` | 批次级质量报告样例 | X/D/M |
| `data/demo/expected_scenarios.md` | priority/test/observe/avoid 四类期望样例 | X/M/V |

数据必须覆盖：

- 至少 3 个 SKU × 4 个渠道。
- 至少一个高匹配、一个中匹配、一个观望、一个熔断样例。
- 所有 `tagId` 来自 `profile-taxonomy-v0.md`。
- 销售表现只使用 `gmvIndex`、`avgSellingPriceBand`、`trafficIndex` 等脱敏字段。

### 3.2 禁止内容

任何 P0-B 文件、API 响应、审计日志、CSV 导出中不得出现：

- 用户级、订单级、会员级、设备级、账号级记录。
- 手机号、姓名、地址、订单号、会员 ID、平台 open id、广告 ID、设备 ID。
- 平台 DMP 原始导出、人群包原始成员、ID 包。
- 真实价格、成本、投流预算、首单量、未发布价格策略。

## 4. 实现边界

### 4.1 A 与 M adapter

A 域公开 API 不直接暴露 M 内部结构。P0-B 内部 adapter 固定为：

```text
PredictService.predict(input) -> ProductProfileDraft
MatchService.match(input) -> ChannelMatchDraft[]
```

`ProductProfileDraft` 必须包含：

- `modelVersion`
- `modelPath`
- `predictedProfileTags`
- `topSegments`
- `qualityFlags`
- `unmappedInputTokens`

`ChannelMatchDraft` 必须包含：

- `channelId`
- `channelType`
- `matchScore`
- `matchConfidence`
- `rank`
- `overlap`
- `bestSegmentId`
- `bestSegmentMatch`
- `positiveDrivers`
- `negativeDrivers`
- `qualityFlags`

A 域负责补齐或覆盖：

- `predictionId`
- `matchId`
- `workspaceId`
- `taskId`
- `source`
- `sourceType`
- `generatedAt`
- `recommendation`
- `risks`

M 域不得直接写 SQLite；所有持久化通过 A 域。

### 4.2 API 最小闭环

A-P0-B2 最小必须实现：

| 接口 | P0-B 要求 |
|---|---|
| `POST /api/v0/products` | upsert SKU，写入 `sku` 表 |
| `GET /api/v0/products/{skuId}` | 读取 SKU |
| `GET /api/v0/channels` | 读取 demo 渠道画像 |
| `POST /api/v0/predictions` | 同步优先，超时降级 Task |
| `GET /api/v0/predictions/{predictionId}` | 读取 ProductProfile |
| `POST /api/v0/matches` | 同步优先，生成 MatchResult[] |
| `GET /api/v0/matches/{matchId}` | 读取单条 MatchResult |
| `GET /api/v0/matches/heatmap` | 读取已生成 MatchResult 的聚合视图 |
| `GET /api/v0/tasks/{taskId}` | 查询 Task |
| `GET /api/v0/taxonomy` | 返回 tagId 白名单 |

`POST /batches`、`/audit` 可先做最小实现，但数据安全门禁和审计写入必须在核心路径有落点。

### 4.3 前端最小闭环

V-P0-B4 首屏必须是工作台。最小流程：

1. 录入或选择 demo SKU。
2. `POST /products`。
3. `POST /predictions`。
4. 展示 Top 3 segment、标签分布、drivers、qualityFlags。
5. `POST /matches`。
6. `GET /matches/heatmap`。
7. 点击 cell 后 `GET /matches/{matchId}` 展示解释抽屉。
8. 导出 CSV，只导出允许字段。

## 5. 依赖顺序

P0-B 按以下顺序推进：

1. **D-P0-B1** 先完成 demo 数据包。  
   M/A/V 没有 demo 数据时只能做 mock 结构，不得终审。

2. **M-P0-B3** 与 **A-P0-B2** 可并行，但必须在 adapter 字段上对齐本文 §4.1。  
   A 可先用 mock M service，M 完成后替换 adapter。

3. **V-P0-B4** 可先用 mock API，但终审必须连 A 本地 API smoke。  
   若 A 尚未完成，V 只能标记为 blocking，不得 done。

4. **X-P0-B5** 最后执行端到端验收。  
   不接受单域自测替代端到端 smoke。

## 6. 各域验收门槛

### 6.1 D-P0-B1

- `data/demo/` 文件齐全。
- 通过 tagId 白名单检查。
- 通过敏感字段扫描。
- `expected_scenarios.md` 能说明四类 recommendation 期望。

### 6.2 M-P0-B3

- 输出 `ProductProfileDraft` 与 `ChannelMatchDraft[]`。
- 至少一个 demo SKU 能输出 Top 3 segment。
- 至少 4 个渠道能输出匹配排序和 drivers。
- 提供运行命令和最小指标。

### 6.3 A-P0-B2

- SQLite schema 可初始化。
- 核心 API smoke 成功。
- 预测和匹配结果可落库并读取。
- `safety_violation` / `taxonomy_violation` 至少有一条可验证路径。

### 6.4 V-P0-B4

- 本地页面能走完整链路。
- risks 长尾和 drivers 长文本不破坏布局。
- CSV 导出字段符合 §3.2 红线。
- 提供截图或本地访问地址。

## 7. 风险清单

| 风险 | 影响 | P0-B 处理 |
|---|---|---|
| demo 数据过少导致回测指标无意义 | M 指标不稳定 | 允许标注 demo-only 指标，P0-B 重点验证链路 |
| A/M adapter 字段漂移 | API 落库失败 | 以本文 §4.1 为准 |
| 匹配同步等待过长 | V 交互卡顿 | 30s 降级异步，候选 > 50 强制异步 |
| CSV 导出越界 | 数据安全风险 | 只导出 S4 字段，禁导原始输入和审计 payload |
| SQLite schema 后续迁移 | 实现返工 | P0-B 允许 JSON 列，P1 再规范化 |

## 8. 结论

P0-B 可以开工。下一张应优先派发的任务是 `D-P0-B1`，因为 demo 数据是 M/A/V 共同依赖。A/M 可在 D 进行时并行搭骨架，但终审必须使用 `data/demo/` 数据完成 smoke。
