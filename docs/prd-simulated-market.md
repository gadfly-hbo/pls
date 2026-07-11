# 模拟市场 PRD

## 目的

在选品策略、分货方案、货渠匹配策略或活动商品方案生成后，PLS 需要提供一个模拟市场，用品牌目标人群画像生成多个目标用户 agent，对策略进行投放前反馈预测。

模拟市场的目标不是替代真实投放，也不是承诺销量预测，而是在策略进入经营飞轮前，提供可追溯的目标用户反应、风险和调整建议。

## 一期结论

一期新增一级模块「模拟市场」。它位于「新品预测 / 人货匹配」之后、「经营飞轮」之前，作为策略压力测试入口。

核心输出是「策略压力测试报告」，不是聊天式用户访谈记录。多 agent 反馈可以作为证据摘要展示，但一等输出必须是结构化报告，便于回看、对比和后续进入经营飞轮。

一期推荐主路径：

```text
新品预测 / 人货匹配 / 活动策略
  -> 选择或粘贴策略方案
  -> 选择目标人群 agent 池
  -> 配置市场场景
  -> 运行模拟
  -> 查看分人群反馈、风险和策略调整建议
  -> 可选进入经营飞轮记录决策
```

说明：新品预测结果页、人货匹配结果页和经营飞轮中的衔接入口在当前产品中不视为已完成能力。本轮只记录为后续衔接点，不作为模拟市场一期验收阻塞。

## 二期口径

二期将模拟市场模型层从「deterministic fallback 即主实现」升级为「LLM agent 模拟优先、deterministic fallback 兜底」。

- 默认路径由 LLM（`provider=minimax`，`modelVersion=minimax-m3`）扮演每个目标用户 agent，输出结构化 `SimulationRun` / `SimulatedMarketResult`。
- `apps/model` 负责 prompt 构建、LLM 响应解析、结果装配和 fallback 兼容；真实 Minimax provider 网络调用由 `apps/server` 在后续任务接入。
- 上游 caller 只有在 LLM 调用成功时才允许使用 `provider=minimax` / `modelVersion=minimax-m3`；模型层 fallback 不得冒充 LLM。
- deterministic fallback 保留为兜底与离线测试路径，provider 不可用时输出 `llm_unavailable_fallback_used`。
- 输出仍是 Derived Result，不是真实销售事实、真实用户反馈或 AB test 结果。

二期扩展支持用户持久化 subagent 与从渠道画像对象派生 subagent：

- 新增 `POST /simulated-market/subagents` 创建用户自定义 subagent，支持 `saved_subagent` 与 `channel_audience_profile` 两种来源。
- 新增 `GET /simulated-market/subagents` 与 `PATCH / DELETE /subagents/:agentId` 管理接口。
- 新增 `POST /simulated-market/subagents/from-channel-object`，从当前 workspace 的 `channel_object_latest` + `audience_profile_latest` 派生 subagent，无可用画像时返回 `unprocessable` 且不编造。
- `GET /simulated-market/agent-templates` 返回 `agents`（ABC 模板）与 `subagents`（已启用持久化 subagent）两个数组，供前端合并为候选 agent 池。
- Subagent 持久化存储按 `workspace_id` 隔离，写操作带 `Idempotency-Key` 与审计。由画像派生的 `profile` 仅作为标签保守摘要，不得声称是真实个人偏好。

## 做

- 支持手动输入策略方案，包含商品、渠道、活动、价格、卖点、分货或投放建议等文本。
- 支持从现有 PLS Derived Result 作为策略来源，包括单品画像预测、人货匹配结果、活动或场景商品策略。
- 支持用品牌三大人群画像生成目标用户 agent，第一期至少覆盖「质感流行派」「都市体面家」「百搭优选客」。
- 支持临时手写 persona，标记为 `manual_persona`，仅用于本次模拟，不进入长期 persona 模板库。
- 支持配置市场场景：渠道对象、活动类型、业务场景、预算或库存约束的文本描述。
- 输出分 agent 的接受度、购买或互动意向、核心顾虑、触发因素、拒绝原因、可行动调整建议。
- 输出整体模拟摘要，包括机会点、风险点、争议点、人群分歧和建议下一步。
- 每次模拟必须保留输入快照、目标 agent 来源、算法或模型版本、质量标记和生成时间。
- 模拟结果必须落库保存为 `SimulationRun` 和 `Simulated Feedback`，属于 Derived Result。

## 不做

- 不自动执行投放、上架、调价、铺货或广告动作。
- 不把模拟反馈写成真实销售事实、真实用户反馈或 AB test 结果。
- 不新增 taxonomy tagId；目标 agent 只能消费已批准的画像、三大人群或显式手写 persona。
- 不从任意渠道画像、DMP 明细、会员明细自动生成 agent。
- 不做长期 persona 库管理。
- 不让 agent 继承 tool、读取外部资料或执行外部动作。
- 不引入未确认的新依赖或外部平台写操作。
- 不复刻 pi-xanthil 的 UI；只借鉴「选择对象、配置模拟、运行、查看结果」的交互骨架。

## 领域对象

### SimulatedMarketInput

```ts
interface SimulatedMarketInput {
  sourceType:
    | "manual_strategy"
    | "single_product_portrait"
    | "product_channel_match"
    | "campaign_product_strategy";
  sourceRef?: {
    id: string;
    type: string;
  };
  strategyText: string;
  marketContext: {
    channelEntityId?: string;
    marketingEventId?: string;
    businessScenarioId?: string;
    contextText?: string;
  };
  targetAgentSet: TargetUserAgent[];
}
```

### TargetUserAgent

```ts
interface TargetUserAgent {
  agentId: string;
  name: string;
  sourceType:
    | "three_audience_segment"
    | "manual_persona"
    | "saved_subagent"
    | "channel_audience_profile";
  sourceRef?: {
    segmentCode?: "A" | "B" | "C";
    segmentName?: "质感流行派" | "都市体面家" | "百搭优选客";
    profileVersion?: string;
    subagentId?: string;
    canonicalObjectKey?: string;
    profileId?: string;
    dataVersion?: string;
  };
  profile: {
    demographics?: string[];
    preferences?: string[];
    concerns?: string[];
    decisionFactors?: string[];
  };
  weight?: number;
}
```

`sourceType` 说明：
- `three_audience_segment`：品牌三大人群模板（质感流行派 / 都市体面家 / 百搭优选客）。
- `manual_persona`：本次模拟临时手写 persona，不进入长期 persona 库。
- `saved_subagent`：用户在 PLS 中新增并持久化的 subagent，需在 `sourceRef.subagentId` 记录 lineage。
- `channel_audience_profile`：由 PLS 渠道画像对象 / `AudienceProfile` 派生的 subagent，需在 `sourceRef` 记录 `canonicalObjectKey`、`profileId`、`dataVersion` 等 lineage。

### SimulationRun

```ts
interface SimulationRun {
  runId: string;
  workspaceId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  inputSnapshot: SimulatedMarketInput;
  result?: SimulatedMarketResult;
  provider: "minimax" | "deterministic_fallback" | string;
  modelVersion: "minimax-m3" | string;
  generatedAt: string;
  qualityFlags: string[];
}
```

### SimulatedMarketResult

```ts
interface SimulatedMarketResult {
  overall: {
    acceptanceScore: number;
    purchaseIntentScore: number;
    confidence: number;
    opportunitySummary: string[];
    riskSummary: string[];
    recommendedAdjustments: string[];
  };
  agentFeedback: Array<{
    agentId: string;
    acceptanceScore: number;
    purchaseIntentScore: number;
    positiveDrivers: string[];
    objections: string[];
    quoteSummary: string;
    suggestedAdjustment: string;
  }>;
}
```

## 评分口径

- `acceptanceScore` 表示目标用户对策略整体合理性的模拟接受度，范围 `0-100`。
- `purchaseIntentScore` 表示目标用户在该场景下的模拟购买或互动意向，范围 `0-100`。
- `confidence` 表示输入信息和目标画像是否足以支撑模拟，范围 `0-1`。
- 低输入质量必须输出 `qualityFlags`，例如 `strategy_text_too_short`、`missing_target_agent_profile`、`missing_market_context`、`llm_unavailable_fallback_used`。
- 默认 LLM 模型采用与 pi-xanthil 一致的 `minimax-m3` 口径。若 provider 不可用、超时或未配置，必须使用 deterministic fallback，并输出 `llm_unavailable_fallback_used`。
- 模拟结果必须记录 `provider`、`modelVersion` 和是否使用 fallback。

## 落库口径

一期模拟结果必须保存，支持列表和详情回看。保存对象属于 Derived Result，不属于真实市场事实。

保存内容：

- 输入策略快照。
- 目标 agent 快照。
- 市场场景快照。
- 输出报告。
- provider / modelVersion。
- qualityFlags。
- generatedAt。

不得写入：

- `sales`、`gmv`、`conversion` 等真实反馈事实。
- `Fact Table`。
- 自动创建的经营飞轮决策。

后续可提供「从模拟结果创建经营决策」入口，但必须由用户显式点击触发，不得自动写入经营飞轮。

## API 草案

一期后端建议前缀：`/api/v0/simulated-market`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent-templates` | 返回可用目标用户 agent 模板（ABC 三大人群）与已启用 subagent 候选 |
| GET | `/subagents` | 查询当前 workspace 的 subagent 列表；支持 `?enabled=true\|false` |
| POST | `/subagents` | 创建 subagent |
| GET | `/subagents/:agentId` | 查询单个 subagent |
| PATCH | `/subagents/:agentId` | 更新 subagent（只允许 `name`/`enabled`/`persona`/`profile`/`weight`） |
| DELETE | `/subagents/:agentId` | 删除当前 workspace 的 subagent |
| POST | `/subagents/from-channel-object` | 从当前 workspace 的 `channel_object` + `audience_profile` 派生 subagent |
| POST | `/runs` | 创建并执行一次模拟 |
| GET | `/runs` | 查询模拟记录 |
| GET | `/runs/:runId` | 查询单次模拟详情 |

响应必须遵守 PLS 统一 wrapper：`{ code, requestId, generatedAt, data }`。如果后续返回 artifact 文件，应在任务 brief 中单独声明 raw body 例外，不能默认复用 wrapper。

由渠道画像派生 subagent 时，`profile` 从 `AudienceProfile.tags` 保守提取，保留 `canonicalObjectKey` / `profileId` / `dataVersion` 到 `sourceRef`，不得声称这些标签是真实个人偏好。若目标对象没有可用 `AudienceProfile`，返回 `unprocessable` 且不编造画像。

## 前端形态

一级导航新增「模拟市场」。首屏是工作台，不做营销页。

页面建议分为四区：

- 策略输入区：选择来源或粘贴策略文本。
- 目标用户区：展示三大人群 agent，支持勾选和查看画像摘要。
- 市场场景区：选择渠道、活动、业务场景，并补充本次模拟重点。
- 结果区：展示整体评分、分 agent 反馈、风险、调整建议和进入经营飞轮入口。

UI 必须沿用现有 AppShell、panel、segmented-control、metric-card、alert-banner、data-table-wrapper 风格；390px 窄屏不得出现文字或工具栏重叠。

后续衔接点：

- 新品预测结果页可增加「送入模拟市场」。
- 人货匹配结果页可增加「模拟目标用户反馈」。
- 经营飞轮可增加「从模拟结果创建决策」。

这些衔接点不进入本轮一期验收，需后续另开任务。

## 验证要求

- model：contract test 覆盖 agent 模板生成、评分范围、质量标记和 fallback 行为。
- backend：typecheck、schema check、smoke 覆盖 agent templates、run create、run detail、workspace 隔离和错误输入。
- frontend：lint、build、mock smoke、`VITE_USE_MOCK=false` contract test，确保真实请求命中 `/api/v0/simulated-market/*`。
- 总控验收时必须说明模拟结果是 Derived Result，不是真实市场反馈。

## 开放问题

- 是否将模拟结果直接写入经营飞轮：一期不自动写入，只记录后续入口。
- 目标 agent 后续是否扩展到渠道画像、DMP segment 或长期 persona 库，需要另开任务。
- 新品预测、人货匹配、经营飞轮三个既有模块的入口衔接需要后续另开任务。
