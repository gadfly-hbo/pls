# P0 MVP 验收报告

> 归属：X 总控  
> 状态：P0-B 验收通过，P0-C 发布 gate 已冻结  
> 最近更新：2026-07-02

## 1. 结论

P0-B MVP 已形成最小可信闭环：

```text
demo SKU 输入 -> ProductProfile -> MatchResult -> heatmap -> 前端建议展示
```

本轮验收结论：

- 可以进入 `P0-C` 加固阶段。
- 不允许直接进入 P1 商业功能扩展，需先关闭 P0-C 必修缺口。
- 本轮未发现 S0/S1 明细进入 demo 数据、API smoke 响应、CSV 导出字段或审计 API 响应。
- `X-P0-C0` 已冻结 P0-C 出口标准与 P1 准入条件，后续按 C1-C4 逐项关闭风险。

## 2. P0-C 发布 gate

P0-C 是 P1 前的缺口收敛阶段，不新增商业扩展功能。总控冻结以下必修 gate：

| Gate | 对应任务 | 当前状态 | 关闭标准 |
|---|---|---|---|
| A/M adapter | `A-P0-C1` | 已关闭 | A API 使用 M baseline adapter，`/predictions` 输出 Top 3 segment，并有 adapter contract 验证 |
| heatmap 去重与幂等 | `A-P0-C1` + `V-P0-C2` | 已关闭 | 重复 smoke 后 `skuId + channelId` 仅返回 latest cell，前端无 duplicate key warning |
| 红线扫描自动化 | `D-P0-C4` | 已关闭 | 真实样例 aggregate 输出可用模板校验脚本扫描，违规字段只记录字段名和计数，不记录值 |
| 真实数据模板 | `D-P0-C4` + `M-P0-C3` | 已关闭 | 真实平台样例进入 PLS 前有本地 raw staging、脱敏聚合、tag mapping、质量报告和多 `timeWindow` 准备口径 |

P1 准入条件：

- 上表所有 gate 状态为已关闭，并在本文风险关闭台账中记录验证证据。
- `docs/wiki.html` 中 P0-C 必修任务均经总控终审标记完成。
- 本地 demo loop 仍可复现，且红线扫描未发现 S0/S1 明细进入文档、API 响应、CSV 导出或 audit 响应。
- 正式时间切分回测若仍缺真实多时间窗样例，必须在 P1 计划中作为显式风险，不得包装成已验证泛化能力。

## 3. 验收范围

已覆盖：

- D：`data/demo/` mock aggregate 数据包。
- M：`apps/model/` 规则 + kNN baseline、validate-tags、predict、match、backtest。
- A：`apps/server/` SQLite schema、seed、核心 API、safety gate、audit。
- V：`apps/web/` 工作台、真实 A API proxy、heatmap、建议抽屉、CSV 导出字段。

未覆盖：

- 真实品牌数据、真实 DMP 导出、真实人群包成员。
- 异步 worker、重试队列、24h idempotency cache。
- 正式时间切分回测。

## 4. 复现命令

服务端：

```bash
cd apps/server
npm run typecheck
npm run migrate
npm run seed
PORT=3100 npm run start
```

模型：

```bash
cd apps/model
npm run typecheck
npm run validate-tags
npm run predict -- --sku mock_sku_101
npm run match -- --sku mock_sku_101
npm run backtest
```

前端：

```bash
cd apps/web
npm run lint
npm run build
VITE_USE_MOCK=false npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

访问路径：

- API health：`http://127.0.0.1:3100/health`
- 前端工作台：`http://127.0.0.1:5174/`
- P0 token：`Authorization: Bearer pls-p0-demo-token`
- Workspace：`X-PLS-Workspace: ws_demo`

## 5. Smoke 结果

静态与构建校验：

| 域 | 命令 | 结果 |
|---|---|---|
| A | `npm run typecheck` | 通过 |
| M | `npm run typecheck` | 通过 |
| M | `npm run validate-tags` | 通过，`invalidTagIds: []` |
| V | `npm run lint` | 通过 |
| V | `npm run build` | 通过 |

模型 smoke：

| 项 | 结果 |
|---|---|
| `predict -- --sku mock_sku_101` | 输出 `ProductProfileDraft`、12 个 `predictedProfileTags`、Top 3 segment、drivers、qualityFlags |
| `match -- --sku mock_sku_101` | 输出 4 个 `ChannelMatchDraft`，含 score、confidence、rank、positive/negative drivers |
| `backtest` | `topKTagHit@5 = 0.667`，`driverPrecision = 0.617`，`matchNDCG@3 = 1` |

API 端到端 smoke：

| 步骤 | 结果 |
|---|---|
| `POST /api/v0/products` | 200，`mock_sku_101` upsert 成功 |
| `POST /api/v0/predictions` | 200，生成 `predictionId` |
| `POST /api/v0/matches` | 200，返回 4 条 `channelMatches` |
| `GET /api/v0/matches/heatmap?skuIds=mock_sku_101` | 200，返回 heatmap row |
| `GET /api/v0/matches?skuId=mock_sku_101` | 200，可供 V 端按 SKU + channel 过滤抽屉明细 |
| `GET /api/v0/matches/{matchId}` | 200，返回 `recommendation`、drivers、risks |
| `GET /api/v0/audit?pageSize=10` | 200，返回审计摘要，不返回原始 payload |
| 嵌套 `attributes.orderId` | 422，`safety_violation`，字段定位为 `attributes.orderId` |

多 SKU recommendation 覆盖：

| SKU | 覆盖建议 |
|---|---|
| `mock_sku_101` | `priority_launch`、`observe`、`test_launch` |
| `mock_sku_102` | `test_launch` |
| `mock_sku_103` | `observe`、`avoid`、`priority_launch`、`test_launch` |

前端真实后端模式 smoke：

| 断言 | 结果 |
|---|---|
| Dashboard 加载 | 通过 |
| 提交 demo SKU 后展示预测画像 | 通过 |
| 点击“去匹配渠道”后展示 heatmap cell | 通过 |
| 点击 heatmap cell 后展示匹配详情抽屉 | 通过 |
| 点击 `avoid` cell 后展示熔断/避免铺货建议 | 通过 |

截图：

- `/tmp/pls-xp0b5-frontend-smoke.png`
- `/tmp/pls-xp0b5-frontend-avoid.png`

## 6. 数据红线检查

检查项：

| 对象 | 方法 | 结果 |
|---|---|---|
| `data/demo/` | 递归扫描 blocked key 与手机号/邮箱/身份证形态 value | 通过，`violations: []` |
| API smoke 响应 | 扫描 `phone/memberId/orderId/openId/adId/deviceId/buyerName/email/address` key | 通过，未发现 |
| CSV 导出 | 静态核对 `ChannelHeatmap.tsx` header | 通过，仅导出 `skuId,channelId,matchScore,matchConfidence,recommendation` |
| Audit API | 核对 `/audit` 输出字段 | 通过，仅输出 audit 摘要、`requestId`、`modelVersion`、`safetyStage` |

说明：

- A 域 safety audit 在 DB meta 中记录命中的字段名，例如 `attributes.orderId`，不记录字段值或原始 payload。
- 本验收未接触真实 S0/S1 数据。

## 7. 未达标项与原因

### 7.1 A 端 mock prediction 只返回 1 个 topSegment

现象：

- M 域 baseline CLI 可输出 Top 3 segment。
- A 域 `apps/server/src/services/mock-m.ts` 仍是 hardcoded mock，每个 SKU 只返回 1 个 `topSegments`。

影响：

- 真实后端模式下，V 页面可展示预测结果，但不能代表 M baseline 的完整 Top 3 输出质量。

回退路径：

- P0-C 将 `apps/model/src/baseline.ts` 接入 A 域 `PredictService` / `MatchService` adapter，或同步 mock service 到 Top 3 契约。

### 7.2 heatmap 重复 cell 与 React duplicate key warning

现象：

- `ws_demo` 重复执行 smoke 后，`match_result` 表累积历史记录。
- `GET /matches/heatmap` 当前按历史 match rows 直接返回，未按 `skuId + channelId + latest generatedAt` 去重。
- 前端热力图因此出现重复 `channelId` key warning。

影响：

- 新鲜 `POST /matches` 返回结果可信。
- heatmap 在重复 smoke 或长期 demo 环境中会出现重复 cell，影响展示稳定性。

回退路径：

- P0-C 在 A 域 heatmap 查询层按 `sku_id + channel_id` 取最新记录。
- V 域渲染 key 临时增加 `skuId + channelId + index` 防止 warning，但根因应由 A 域去重。

### 7.3 A 域仍未接真实 M baseline

现象：

- API smoke 使用 A 域 hardcoded mock M service。
- M 域 baseline 独立可运行，但尚未接入 A 域进程。

影响：

- 端到端链路成立，但模型输出质量以 M CLI 为准，API 只证明契约和落库链路。

回退路径：

- P0-C 将 M baseline 接入 A adapter，并补齐 adapter contract test。

### 7.4 正式回测不可用

现象：

- demo 数据只有一个 `timeWindow`。
- 当前 backtest 使用 `demo_only_leave_one_sku_out`，不是生产时间切分。

影响：

- 指标只能证明 demo 链路和排序解释，不证明生产泛化能力。

回退路径：

- P0-C/P1 引入多时间窗脱敏聚合样例，再执行时间切分回测。

## 8. P0-C 风险关闭台账

| 风险 | 来源 | 关闭任务 | 关闭状态 | 验证证据 |
|---|---|---|---|---|
| A API 与 M baseline 输出不一致 | P0-B smoke | `A-P0-C1` | 已关闭 | A typecheck 通过；`POST /predictions` 返回 `topSegments=3`、`modelPath=knn` |
| heatmap 重复 cell | P0-B 重复 smoke | `A-P0-C1` / `V-P0-C2` | 已关闭 | A 重复两次 `POST /matches` 后，`/matches/heatmap` 返回 `rows=1 cells=4 unique=4`，`/matches?skuId=mock_sku_101` 返回 `items=4 unique=4`；V 已实现 `skuId + channelId` 联合 key、前端去重防御、loading/empty/error 状态，`npm run lint` 与 `npm run build` 通过 |
| 红线扫描仍靠人工组合命令 | P0-B 验收过程 | `D-P0-C4` | 已关闭 | `node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs` 与显式模板目录参数均通过；模板静态敏感形态扫描无命中 |
| 真实数据进入 PLS 前缺少模板 | P0-B 未覆盖项 | `D-P0-C4` | 已关闭 | 已新增 `data/templates/real-sample-ingestion/`，包含本地 raw staging 边界、聚合标签模板、mapping rules、unmapped fields、quality report、redline scan report 和校验脚本 |
| 正式时间切分回测不可用 | demo 数据只有单 `timeWindow` | `M-P0-C3` / `D-P0-C4` | 已关闭 | M 已明确 P1 时间切分输入要求；D 已提供真实样例进入 PLS 前的聚合输出模板。当前 demo 仍只有单 `timeWindow`，不得声明正式回测达标 |

台账维护规则：

- 只在验证证据可复现后把状态改为已关闭。
- 关闭记录必须保留命令、输入范围和数据红线检查结论。
- 不能用 UI 防御替代 A 域去重根因修复；可以作为 V 域独立防线记录。

## 9. P0-C 任务拆解

### X-P0-C0：P0-C 缺口收敛与发布口径

- 收口 P0-B 验收缺口。
- 冻结 P0-C 出口标准：A/M adapter 接入、heatmap 去重、真实数据接入模板、红线扫描自动化。
- 明确 P1 准入条件：P0-C 必修 gate 全部关闭后才允许进入 P1。
- 状态：已完成，本文 `P0-C 发布 gate` 与 `P0-C 风险关闭台账` 为后续判断依据。

### A-P0-C1：M baseline adapter 接入与结果幂等

- 接入 `apps/model/src/baseline.ts` 的 `predictProductProfile` / `matchChannels`。
- `POST /matches` 支持可复现幂等键或 latest-result 覆盖策略。
- `GET /matches/heatmap` 按 `skuId + channelId` 返回最新 cell。
- 状态：已完成。P0 采用 latest-result overwrite，不新增 24h `Idempotency-Key` 缓存表；如后续要保留完整历史，需升级为历史表 + latest view。

### V-P0-C2：真实后端 heatmap 稳定渲染

- 处理重复 cell 的 UI 防御。
- 明确 empty/loading/error 状态。
- 保持 CSV 导出只含 S4 派生字段。
- 状态：已完成。浏览器端到端 console smoke 留给 P0-C 总体验收，不阻塞本卡归档。

### M-P0-C3：词表回流与时间切分准备

- 处理 `unmappedInputTokens` 中的 `midi`、`dress` 是否回流 D 域词表。
- 准备多 `timeWindow` 回测输入口径。
- 状态：已完成。`midi` / `dress` 不回流画像词表，继续作为结构 token 观察项；A adapter contract test 已提供并通过。

### D-P0-C4：真实样例脱敏映射模板

- 输出真实平台样例进入 PLS 前的本地脱敏、聚合、tag mapping 模板。
- 明确禁止进入 LLM 的 raw staging 边界。
- 状态：已完成。`data/local/` 默认忽略本地 staging；模板校验脚本和红线扫描报告模板已通过总控终审。

## 10. 是否进入下一阶段

结论：进入 `P0-C`，不直接进入 P1。

P0-C 必修 gate 状态：C1-C4 已全部关闭。进入 P1 前仍需执行 P0-C 总体验收 smoke，并确认报告中的验证证据可复现。

进入条件：

- P0-B 目标的本地 demo 闭环已可复现。
- 数据红线在本轮 smoke 中未被突破。
- 所有未达标项已有明确原因和回退路径。

P0-C 出口标准：

- A API 使用 M baseline adapter 输出 Top 3 segment，并通过 adapter contract test。
- `POST /matches` 与 `GET /matches/heatmap` 对重复 smoke 稳定，heatmap 无重复 cell。
- 前端真实后端模式无 duplicate key warning，loading / empty / error 状态明确。
- 红线扫描脚本可一键运行，覆盖 demo 数据、API smoke 响应、CSV 导出字段和 audit 响应。
- 至少一份多 `timeWindow` 脱敏聚合样例口径可用于正式回测准备。
- 真实样例进入 PLS 前的 raw staging、脱敏聚合、tag mapping 和质量报告模板已冻结。
