# PLS Portrait Comparison 结构决策账本

## 1. 目的与状态

- 范围：将 WorkPLS 已验证的画像对比能力按 PLS 架构重新落位。
- 日期：2026-07-18。
- Owner：PLS Controller。
- 当前状态：93 项逐项决定及完整派生结构已获用户整体批准；结构实现 Gate 已释放。
- 整体批准：用户于 2026-07-18 确认。
- 目标：在 PLS 中建立来源可替换、结果不可变、证据可追溯的 Portrait Comparison module。
- 非目标：本轮不建设正式 Dimension Evidence 数据管线，不发布真实 quality policy，不开放 AI explanation，不改造 Flywheel schema，不导入 WorkPLS fixture。

前置产品与架构决定：

1. PLS 信息架构收敛为“画像洞察、预测与匹配、经营飞轮”三条业务主流程，数据管理等能力进入高级入口。
2. PLS workspace 是默认 PortraitSource，AgentHarness 是可选 adapter；ModelEvol 继续拥有正式模型 artifact。
3. 采用 WorkPLS 的不可变 Comparison Run 语义，但在 PLS 中重新设计物理结构。

## 2. 确认统计

| 类别 | 序号 | 数量 | 结果 |
| --- | --- | ---: | --- |
| 业务归属、粒度、身份与模式 | S001-S005 | 5 | 全部一致 |
| 来源、证据、算法与质量 | S006-S013 | 8 | 全部一致 |
| 解释、归档、Flywheel 关系 | S014-S016 | 3 | 全部一致 |
| 物理拆分、workspace、字段与索引 | S017-S050 | 34 | 全部一致 |
| migration、来源 interface 与 capability | S051-S068 | 18 | 全部一致 |
| DTO、查询、审计、实施门槛 | S069-S077 | 9 | 全部一致 |
| 完整性补充决定 | S078-S093 | 16 | 全部一致 |
| **合计** | **S001-S093** | **93** | **无分歧、无阻塞决定** |

## 3. 逐项决策账本

| Sequence | Topic | Recommendation | Reason | User decision | Consistency | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S001 | Run 业务归属 | Comparison Run 由 PLS 拥有并不可变 | 对比结果是 PLS 的产品运行事实，不是来源画像事实 | A | 一致 | Confirmed | 用户确认；`apps/server/src/routes` |
| S002 | Run 粒度 | 每次明确执行创建新 Run，网络重试幂等复用 | 区分用户重跑与传输重试 | A | 一致 | Confirmed | 用户确认；WorkPLS application contract |
| S003 | Run 身份 | 使用 PLS 生成的小写 UUID v4 | 身份不依赖来源字段或时间戳拼接 | A | 一致 | Confirmed | 用户确认；WorkPLS UUID 实现 |
| S004 | 参与方 | 固定 baseline 与 comparison 两侧 | 保持算法、证据和解释接口稳定 | A | 一致 | Confirmed | 用户确认 |
| S005 | 对比模式 | 仅 peer_same_period 与 self_cross_period | 避免与商品渠道匹配语义混淆 | A | 一致 | Confirmed | 用户确认；WorkPLS comparison contract |
| S006 | 来源固化 | 保存稳定引用和最小计算证据快照 | 历史结果可复算且不复制完整原始数据 | A | 一致 | Confirmed | 用户确认 |
| S007 | 候选维度 | 保存全部候选维度及 included/excluded 原因 | coverage 分母和排除原因可审计 | A | 一致 | Confirmed | 用户确认 |
| S008 | 缺失维度 | 不补零，排除计算并降低 coverage | 未知不能被解释为不相似 | A | 一致 | Confirmed | 用户确认 |
| S009 | 单位兼容 | dimensionKey 和 unit 必须完全一致 | 当前没有获批单位转换目录 | A | 一致 | Confirmed | 用户确认 |
| S010 | 质量准入 | 版本化 policy 生成 blocked/limited/ready | 质量状态不能由客户端指定 | A | 一致 | Confirmed | 用户确认 |
| S011 | 版本固化 | 保存算法、质量策略和 contract 版本及 checksum | 支持历史复算与版本审计 | A | 一致 | Confirmed | 用户确认 |
| S012 | 创建幂等 | workspace 内 key 唯一并绑定 request fingerprint | 区分合法重放和 key 误用 | A | 一致 | Confirmed | 用户确认 |
| S013 | 创建事务 | 核心 Run 图单事务，来源读取和解释在事务外 | 避免长写锁和半成品聚合 | A | 一致 | Confirmed | 用户确认 |
| S014 | 解释生命周期 | 追加式 Attempt/Outcome，与确定性 Run 分离 | 解释可失败、重试和升级 | A | 一致 | Confirmed | 用户确认 |
| S015 | 归档删除 | 禁止物理删除，追加 archived/restored 事件 | 保留操作历史和下游引用 | A | 一致 | Confirmed | 用户确认 |
| S016 | Flywheel 引用 | Item 单一不可变主来源，Run 可被多 Item 引用 | 保持经营决策依据稳定 | A | 一致 | Confirmed | 用户确认 |
| S017 | 物理拆分 | 沿用 schema_migration，新增 8 张规范化表 | 数据库可保护关系与证据完整性 | A | 一致 | Confirmed | 用户确认；`apps/server/src/db/schema.ts` |
| S018 | Workspace 字段 | 8 张表均显式保存 workspace_id | 防止错误连接和未来迁移时跨 workspace | A | 一致 | Confirmed | 用户确认；PLS 现有表约定 |
| S019 | Run 执行者 | 保存不透明 createdBy 和可空展示名，不建 User 表 | 当前无稳定用户主数据 contract | A | 一致 | Confirmed | 用户确认 |
| S020 | 时间口径 | 系统时间 UTC 毫秒，业务周期闭合 YYYY-MM-DD | 区分事件时间和业务日期 | A | 一致 | Confirmed | 用户确认 |
| S021 | 来源类型 | 仅 pls_workspace 与 agentharness，并保存 contract version | 落实双 adapter 且控制来源枚举 | A | 一致 | Confirmed | 用户确认 |
| S022 | 对象分类 | family=channel/product；商品侧首期仅 sku | 只持久化已有身份依据的对象类型 | A | 一致 | Confirmed | 用户确认；PLS channel object schema |
| S023 | Participant-Source | 每个 participant 恰好一条独立不可变 source | 避免 Run 间共享可变来源行 | A | 一致 | Confirmed | 用户确认 |
| S024 | 来源必填身份 | snapshot/data version、周期、generatedAt 必填 | 精确标识计算使用的画像快照 | A | 一致 | Confirmed | 用户确认 |
| S025 | 来源可空元数据 | batch/sample/confidence 未提供时使用 NULL | 未知不能伪装成零值或默认值 | A | 一致 | Confirmed | 用户确认 |
| S026 | 质量字段 | 来源 flags 与 policy reasons 分离为 canonical JSON | 区分上游事实和 PLS 派生结论 | A | 一致 | Confirmed | 用户确认 |
| S027 | Evidence 粒度 | 每 participant 每 dimension 最多一条 | 对齐算法单维度输入并拒绝重复 | A | 一致 | Confirmed | 用户确认 |
| S028 | Evidence refs | 保存稳定受控引用，禁止 SQL/path/rowid/raw row | 保留 lineage 且隔离物理实现 | A | 一致 | Confirmed | 用户确认 |
| S029 | Evidence 最小 contract | key/label/value/unit/quality/refs 全部强校验 | 确保每条证据可独立验证和复算 | A | 一致 | Confirmed | 用户确认 |
| S030 | Assessment 粒度 | 每 Run 每候选维度恰好一条 | 固化候选全集和 coverage 分母 | A | 一致 | Confirmed | 用户确认 |
| S031 | 排除枚举 | missing_baseline/comparison/both、unit_mismatch、quality_insufficient | 建立稳定业务解释和约束 | A | 一致 | Confirmed | 用户确认 |
| S032 | Assessment 条件字段 | included 保存双侧 evidence 和计算值，excluded 派生值为空 | 防止排除维度携带伪分数 | A | 一致 | Confirmed | 用户确认 |
| S033 | 总分约束 | 持久化 score/coverage 并与 contribution 交叉校验 | 查询效率和可复算性同时满足 | A | 一致 | Confirmed | 用户确认 |
| S034 | Run 质量结论 | 保存聚合状态和 reasons，blocking 不落库 | 支持列表读取并保持成功 Run 粒度 | A | 一致 | Confirmed | 用户确认 |
| S035 | Request fingerprint | 覆盖 workspace、actor、mode、两侧引用和 contract | 只表达稳定创建意图 | A | 一致 | Confirmed | 用户确认 |
| S036 | Canonical JSON | 版本化 JSON v1，UTF-8 SHA-256 64 位小写 hex | 消除序列化顺序造成的假漂移 | A | 一致 | Confirmed | 用户确认；WorkPLS canonical JSON |
| S037 | Attempt 粒度 | 每次调用一条不可变 Attempt，Run 内递增 sequence | 还原解释重试和生成器升级历史 | A | 一致 | Confirmed | 用户确认 |
| S038 | Generator 类型 | 仅 rule/ai，强制生成器身份与版本 | 防止规则 fallback 冒充 AI | A | 一致 | Confirmed | 用户确认 |
| S039 | Evidence manifest | 只引用同 Run 五类确定性记录 | 禁止循环引用 AI 文本或可变外部事实 | A | 一致 | Confirmed | 用户确认 |
| S040 | Outcome 状态 | 每 Attempt 最多一条 succeeded/failed Outcome；无行表示中断 | 区分失败和进程中断 | A | 一致 | Confirmed | 用户确认 |
| S041 | 成功解释内容 | 受控区块、每类最多三条、每 claim 引用 manifest | 支持结论优先 UI 并约束无证据内容 | A | 一致 | Confirmed | 用户确认 |
| S042 | 失败错误码 | 使用六类受控错误码和脱敏失败信息 | 隔离 provider 原始错误和堆栈 | A | 一致 | Confirmed | 用户确认；WorkPLS explanation service |
| S043 | Archive Event | 追加事件、Run 内 sequence/idempotency/乐观并发 | 保证并发归档顺序明确 | A | 一致 | Confirmed | 用户确认 |
| S044 | 删除行为 | 所有业务外键 ON DELETE RESTRICT | 防止级联抹除证据图 | A | 一致 | Confirmed | 用户确认 |
| S045 | Application interface | 仅 create/list/detail/explanation/archive 受控入口 | 保持深 module 和小 interface | A | 一致 | Confirmed | 用户确认 |
| S046 | HTTP 命名 | 使用 `/api/v0/portrait-comparisons` 和 PLS envelope | 避免迁入 WorkPLS 第二套 transport | A | 一致 | Confirmed | 用户确认；`apps/server/src/lib/response.ts` |
| S047 | 失败持久化 | 失败不写 Comparison 表，仅 audit/log | Run 只表示成功成立的业务事实 | A | 一致 | Confirmed | 用户确认 |
| S048 | ReadModel | 首期 repository 聚合，不建 View/物化表 | 当前查询不足以证明新持久化投影价值 | A | 一致 | Confirmed | 用户确认 |
| S049 | 索引 | 只建立幂等、唯一性、历史和已批准查询索引 | 避免无查询证据的过度索引 | A | 一致 | Confirmed | 用户确认 |
| S050 | 校验分工 | DB 保护结构，application 保护跨行业务不变量 | 兼顾持续保护和算法可版本化 | A | 一致 | Confirmed | 用户确认 |
| S051 | Migration 接入 | V005 持有单一 DDL 真源并同步 fresh schema | 避免 versioned migration 与 schema.ts 双份漂移 | A | 一致 | Confirmed | 用户确认；`apps/server/src/db/migrate.ts` |
| S052 | 历史数据 | V005 不回填 PLS 旧结果或 WorkPLS fixture | 旧记录与新 Run 证据 contract 不同 | A | 一致 | Confirmed | 用户确认 |
| S053 | Runner 加固 | V005 前补漂移拒绝、事务、检查、备份恢复 | 当前 applied migration 不复核 checksum | A | 一致 | Confirmed | 用户确认；`migration-runner.ts` |
| S054 | 旧 checksum | 验证 16 位前缀后一次性升级 64 位 | 兼容旧 workspace 且不掩盖真实漂移 | A | 一致 | Confirmed | 用户确认 |
| S055 | Migration 备份 | workspace 内 owner-only 备份，正式备份首期不自动删除 | 保持升级可恢复且不隐式决定清理周期 | A | 一致 | Confirmed | 用户确认 |
| S056 | PortraitSource interface | capabilities/list objects/list snapshots/resolve snapshot 四能力 | 将来源拼装和 schema 差异隐藏在 adapter | A | 一致 | Confirmed | 用户确认 |
| S057 | Active source | 每 workspace 单一来源，失败时不静默 fallback | 防止相同请求切换权威来源 | A | 一致 | Confirmed | 用户确认 |
| S058 | PLS 本地 capability | 首期仅发现对象/快照，正式 Run 保持 gate | 当前只有 mock、无 unit-bearing evidence | A | 一致 | Confirmed | 用户确认；`ws_demo` 只读查询 |
| S059 | Evidence 建设归属 | 正式 Dimension Evidence 独立 Data task | 数据事实域不能由 Comparison migration 猜测 | A | 一致 | Confirmed | 用户确认 |
| S060 | 创建请求字段 | 只接受 mode 和两侧 object/snapshot 引用 | 禁止客户端注入派生结果 | A | 一致 | Confirmed | 用户确认；PLS API 纪律 |
| S061 | HTTP 状态 | readiness 200；创建/冲突/不可比/依赖失败使用区分状态 | 区分能力查询与正式写入失败 | A | 一致 | Confirmed | 用户确认 |
| S062 | Comparison 幂等实现 | 聚合事务内幂等，不以通用缓存表为权威 | 现有 middleware 使用原始 body hash 且 best-effort | A | 一致 | Confirmed | 用户确认；`lib/idempotency.ts` |
| S063 | Actor 来源 | auth middleware 提供受信任 actor context | body 或固定 api 无法形成可信审计 | A | 一致 | Confirmed | 用户确认；`middleware/auth.ts` |
| S064 | 来源配置 | 复用 data_source 固定 portrait_source 记录 | 现有 registry 已承担 workspace 来源配置 | A | 一致 | Confirmed | 用户确认；`schema.ts` data_source |
| S065 | Quality policy 载体 | 版本化 TypeScript 配置，当前 not_released | 无真实校准时不建设动态策略表 | A | 一致 | Confirmed | 用户确认 |
| S066 | Algorithm config | 版本化 TypeScript module，客户端不可覆盖 | 评分口径必须可 review、测试和固化 | A | 一致 | Confirmed | 用户确认 |
| S067 | 相似度公式 | 迁移线性归一化绝对差公式，配置待真实校准 | WorkPLS 公式已通过确定性测试 | A | 一致 | Confirmed | 用户确认；WorkPLS algorithm |
| S068 | 两种模式算法 | 相似度与稳定度共用公式，仅合法性和文案不同 | 稳定度是同对象跨周期画像相似程度 | A | 一致 | Confirmed | 用户确认 |
| S069 | DTO 边界 | 列表摘要、详情证据化，隐藏内部字段 | 前端不学习数据库、幂等和 provider 实现 | A | 一致 | Confirmed | 用户确认 |
| S070 | 两侧版本 | source system/contract 同版，data version 可不同 | 跨周期版本可能不同但语义 contract 必须一致 | A | 一致 | Confirmed | 用户确认 |
| S071 | 展示名称 | 来源提供的非空快照，缺失时 not_ready | 历史可读性不能依靠补造技术名称 | A | 一致 | Confirmed | 用户确认 |
| S072 | 外部 ID | 原样、BINARY、区分大小写；本地 UUID 标准化 | 避免隐式规范化合并来源身份 | A | 一致 | Confirmed | 用户确认 |
| S073 | 数值精度 | 入库和 DTO 保留未展示舍入值，UI 只显示舍入 | 避免 contribution 累计误差 | A | 一致 | Confirmed | 用户确认 |
| S074 | 归档查询 | 默认隐藏归档，可筛选并读取详情 | 归档是 UI 整理而不是生命周期结束 | A | 一致 | Confirmed | 用户确认 |
| S075 | Audit | 复用 audit_event，仅保存最小 metadata | 避免复制证据和建立第二套审计 | A | 一致 | Confirmed | 用户确认 |
| S076 | Admin 保护 | 8 张表全部加入 protected tables | 防止 truncate/drop 抹除历史证据 | A | 一致 | Confirmed | 用户确认；`lib/dangerous-ops.ts` |
| S077 | 验收门槛 | 完整 migration/schema/application/HTTP/E2E/smoke 验证 | 结构变更不能只靠 typecheck | A | 一致 | Confirmed | 用户确认；项目 AGENTS.md |
| S078 | 子记录身份 | 所有 Comparison 记录使用独立 UUID v4 | manifest、外键和审计需要稳定 record ID | A | 一致 | Confirmed | 用户确认 |
| S079 | 子记录时间 | 核心子记录继承 Run 时间，追加记录有独立事件时间 | 避免原子聚合重复时间字段 | A | 一致 | Confirmed | 用户确认 |
| S080 | JSON 空值 | 集合字段 NOT NULL，空集合统一 `[]` | 避免 NULL/array 双重状态 | A | 一致 | Confirmed | 用户确认 |
| S081 | Attempt actor | 保存实际发起者或明确系统身份 | 解释请求者可能不同于 Run 创建者 | A | 一致 | Confirmed | 用户确认 |
| S082 | 列表分页 | 使用 createdAt + runId 稳定 cursor | 追加数据下避免 offset 重复或漏项 | A | 一致 | Confirmed | 用户确认 |
| S083 | AgentHarness 读取 | 独立只读 query_only 连接和精确 schema gate | 防止写入上游或路径误配 | A | 一致 | Confirmed | 用户确认；WorkPLS PortraitSource tests |
| S084 | Flywheel 实施阶段 | V005 不改 decision_record，后续单独升级来源模型 | 当前决策粒度不兼容通用画像对比 | A | 一致 | Confirmed | 用户确认；`FLYWHEEL_DDL` |
| S085 | Source 配置初始化 | V005 不写 data_source，独立受控配置命令 | schema migration 不应写 workspace 业务配置 | A | 一致 | Confirmed | 用户确认 |
| S086 | Policy 输入固化 | 所有实际质量输入必须进入不可变快照 | 只存结论会失去质量复核能力 | A | 一致 | Confirmed | 用户确认 |
| S087 | Workspace 外键 | 使用 workspace_id + ID 组合外键 | 单列 UUID 外键不能阻止错误 workspace 字段 | A | 一致 | Confirmed | 用户确认 |
| S088 | 日期校验 | DB 校验格式，application 校验日历和窗口 | SQLite 简单字符串规则不能识别非法日期 | A | 一致 | Confirmed | 用户确认 |
| S089 | Archive fingerprint | 幂等键绑定完整归档操作 fingerprint | archive/restore 或不同 actor 不能误重放 | A | 一致 | Confirmed | 用户确认 |
| S090 | Attempt 并发 | 事务分配 sequence、唯一约束、乐观并发 | 防止并发覆盖或重复序号 | A | 一致 | Confirmed | 用户确认 |
| S091 | 首期解释触发 | Run 后自动规则摘要，AI HTTP 入口延期 | 当前无已验证 pi-agent explanation contract | A | 一致 | Confirmed | 用户确认 |
| S092 | 规则阈值 | 仅使用已发布配置，不迁移硬编码 80 分判断 | 未校准阈值不能包装成业务机会 | A | 一致 | Confirmed | 用户确认；WorkPLS rule summary |
| S093 | Manifest checksum | 同时保存 canonical manifest 和完整 checksum | 解释证据集合需要完整性验证 | A | 一致 | Confirmed | 用户确认 |

## 4. 最终派生结构

### 4.1 Module 与 Interface

`PortraitSource` 是来源 seam，外部 interface 只有：

1. `getCapabilities(workspaceId)`
2. `listPortraitObjects(workspaceId, filters)`
3. `listPortraitSnapshots(workspaceId, objectId)`
4. `resolvePortraitSnapshot(workspaceId, objectId, snapshotId)`

首期 adapters：

- `PlsWorkspacePortraitSource`：默认 adapter；当前只开放对象和快照发现，正式 evidence capability 为 `not_ready`。
- `AgentHarnessPortraitSource`：可选 adapter；必须使用显式绝对路径、独立只读/query-only 连接和精确 schema gate。

每个 workspace 只能有一个 active source。配置复用 `data_source` 中 `source_id=portrait_source`；记录缺失时最终默认解析为 `pls_workspace`，不得在来源不可用时静默 fallback。

### 4.2 新增表

沿用现有 `schema_migration`，由 `V005_portrait_comparison` 新增：

1. `comparison_run`
2. `comparison_participant`
3. `comparison_portrait_source`
4. `comparison_dimension_evidence`
5. `comparison_dimension_assessment`
6. `comparison_explanation_attempt`
7. `comparison_explanation_outcome`
8. `comparison_archive_event`

所有记录使用小写 UUID v4 主键并显式携带 `workspace_id`。父子关系使用 `(workspace_id, id)` 组合外键，业务外键全部 `ON DELETE RESTRICT`。

### 4.3 核心字段组

`comparison_run`：

- ID、workspace、mode、similarity score、coverage、quality status/reasons。
- algorithm、quality policy、comparison contract 的版本与 checksum。
- idempotency key、canonical request fingerprint。
- createdAt、createdBy、可空 createdByDisplayName。

`comparison_participant`：

- Run、role、family、objectType、不透明 objectId、非空 displayName 快照。
- 每 Run 固定 baseline/comparison 两行。

`comparison_portrait_source`：

- Participant、source system/contract、snapshot/data version、业务周期、source generatedAt。
- 可空 source batch/sample size/confidence。
- ready/limited、来源 flags、policy reasons。

`comparison_dimension_evidence`：

- Participant、dimension key/label、有限 value、非空 unit。
- ready/limited、来源 flags、policy reasons、非空受控 evidence refs。
- 每 participant/dimension 最多一行；缺失不建行。

`comparison_dimension_assessment`：

- Run、候选 dimension key/label/expected unit/正权重。
- included/excluded、受控 exclusion reason、两侧条件 evidence 外键。
- included 时保存 normalized values、delta、similarity 和 contribution；excluded 时派生值全为 NULL。

`comparison_explanation_attempt/outcome`：

- Attempt 保存 Run 内序号、rule/ai 生成器身份、contract、manifest/checksum、开始时间和 actor。
- Outcome 每 Attempt 最多一行；成功保存受控 content，失败保存六类错误码、failure contract、retryable 和脱敏 message。

`comparison_archive_event`：

- Run 内递增 sequence、archived/restored、操作 fingerprint、idempotency key、可空 reason、actor 和发生时间。
- 当前归档状态由最后事件推导。

### 4.4 算法与质量

- 算法 identity 使用 `pls-portrait-comparison`。
- 两种 mode 使用相同的线性归一化绝对差公式。
- 缺失不补零，单位必须完全一致。
- coverage 以全部候选权重为分母，similarity 在 included 权重内重新归一化。
- quality policy 与 algorithm config 均为版本化 TypeScript module。
- 当前没有真实单位化 evidence 和校准配置，正式 Run 创建必须保持关闭。

### 4.5 HTTP Contract

- `POST /api/v0/portrait-comparisons/readiness`
- `POST /api/v0/portrait-comparisons/runs`
- `GET /api/v0/portrait-comparisons/runs`
- `GET /api/v0/portrait-comparisons/runs/:comparisonRunId`
- `PATCH /api/v0/portrait-comparisons/runs/:comparisonRunId/archive`

继续使用 PLS 的 `Authorization`、`X-PLS-Workspace`、request ID 和统一 envelope。创建 Run 的 body 只接受 mode 与两侧 object/snapshot 引用，`Idempotency-Key` 使用 header。客户端派生字段必须返回 400。

## 5. Migration 与验证

V005 前先加固 runner：

- 已应用 migration 的 name/checksum 漂移拒绝。
- 旧 16 位 checksum 验证前缀后升级为完整 SHA-256。
- 单 migration 事务、`foreign_key_check`、`quick_check`。
- workspace 内受控备份、失败恢复和未知高版本拒绝。
- V005 不回填旧 PLS 记录、不导入 WorkPLS fixture、不写 `data_source` 配置数据。

实施完成必须通过 S077 定义的 migration、schema、application、algorithm、HTTP、真实 contract、临时 workspace smoke、worktree guard 和 diff hygiene 校验。

## 6. 延期项与风险

1. 正式 Dimension Evidence 的来源、taxonomy、单位、导入和持久化结构需要独立 Data contract/task。
2. quality policy 的真实候选维度、阈值、min/max、权重和 coverage 门槛等待真实样本校准。
3. AI explanation 的 pi-agent generator contract 与公共写入口延期。
4. Flywheel 统一来源模型延期；V005 不修改 `decision_record`。
5. AgentHarness Admin 配置切换和 UI 延期；首期只保留 adapter 与受控配置命令。
6. 当前 `ws_demo` 画像为 `mock_sample` 且没有 unit-bearing Dimension Evidence，不能宣称正式对比已上线。
7. Explanation content 和 HTTP payload 的具体容量上限需在 transport 实施时基于真实 payload 定标；禁止静默截断。

## 7. 完整性复核

| 复核类别 | 结论 |
| --- | --- |
| 业务目的与 owner | PLS 拥有 Comparison 运行事实；PortraitSource 拥有画像事实；ModelEvol 拥有模型 artifact。 |
| 粒度与身份 | Run、两侧 participant/source、维度 evidence/assessment、Attempt/Outcome、Archive Event 均已明确。 |
| 字段语义 | 必填、NULL、空数组、枚举、时间、外部 ID、checksum 和条件字段已确认。 |
| 关系与删除 | 组合 workspace 外键、唯一性、基数和 `ON DELETE RESTRICT` 已确认。 |
| 生命周期 | Run 和核心证据不可变；解释与归档追加；失败不写 Comparison 业务表。 |
| 来源与 lineage | 双 adapter、单 active source、最小证据快照和稳定 refs 已确认。 |
| 读写入口 | 深 PortraitSource interface、受控 application interface、PLS `/api/v0` transport 已确认。 |
| 校验与治理 | DB/application 分工、quality gate、Admin 保护、audit 和验收矩阵已确认。 |
| Migration | V005、runner 加固、旧 checksum 升级、备份恢复和无回填策略已确认。 |
| 分期 | Comparison supporting structure 为本轮；正式 evidence、AI、Flywheel 和配置 UI 延期。 |

复核结论：本轮结构实现所需的适用类别已覆盖，没有未确认的结构决定。用户已整体批准，后续实现只能在本账本授权范围内进行；发现新结构决定时必须暂停并返回确认流程。

## 8. 已批准实施范围

本轮仅授权：

1. 加固 PLS migration runner 及其测试。
2. 实施 V005 和 8 张 Comparison 表、schema check、Admin 保护。
3. 迁移 canonical JSON/checksum、Comparison algorithm、持久化与规则摘要的适用代码，并按本账本改名和收紧 contract。
4. 建立中性 PortraitSource interface、PLS 本地发现 adapter、可选 AgentHarness read-only adapter。
5. 实施 readiness、受 gate 的 Run API、列表/详情/归档 API 和真实 contract 测试。
6. 在 PLS React 前端实现三步画像对比 readiness 流程，但不得伪造正式 Run 可用状态。

不授权正式 Dimension Evidence schema、quality policy 数值发布、AI explanation HTTP、Flywheel schema 变更或 WorkPLS 数据导入。
