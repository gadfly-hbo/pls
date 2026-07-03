# notes-infra

## 0. 当前状态

最近更新：2026-07-03（D-P2-7 新品主数据预测输入模板验收通过）

进度：

- 已建立 PLS 第一批协作文档骨架。
- 总控方法论采用“总控 Agent + 多域 Agent + wiki 派发板 + notes 活文档”的方式。
- 当前阶段已完成 P0-B 本地 MVP 闭环验收，进入 P0-C 加固；`X-P0-C0` 已冻结 P0-C 发布 gate。
- 已完成 X-P0-0 冻结草案：`docs/profile-taxonomy-v0.md` 与 `docs/data-safety-policy.md`。
- D/M/A/V 第一轮 P0 文档任务均已完成并通过 X 总控终审。
- 已在 `docs/wiki.html` 创建 P0-B 任务卡：X-P0-B0、D-P0-B1、A-P0-B2、M-P0-B3、V-P0-B4、X-P0-B5，均已完成。
- 已完成 X-P0-B0 集成评审，产出 `docs/p0-integration-review.md`。
- 已完成 D-P0-B1 demo 数据包，产出 `data/demo/`。
- 已完成 X-P0-B5 端到端验收，产出 `docs/p0-acceptance-report.md`。
- 已完成 X-P0-C0 缺口收敛与发布口径，`docs/p0-acceptance-report.md` 已补充 P0-C 发布 gate、P1 准入条件和风险关闭台账。
- 已完成 A-P0-C1，A API 主路径已接 M baseline adapter；后端 heatmap latest 去重已关闭，前端 console 稳定性留给 V-P0-C2 复验。
- 已完成 V-P0-C2，前端 heatmap 联合 key、重复 cell 防御、loading/empty/error 状态和 CSV 导出边界已通过总控审核。
- 已完成 M-P0-C3，`midi` / `dress` 不回流画像词表，P1 时间切分输入要求和 A adapter contract test 已通过总控审核。
- 已完成 D-P0-C4，真实样例本地脱敏、聚合、tag mapping、quality report、redline scan 模板已通过总控终审。
- 已完成 V-P0-D1，PLS 前端已参考苍耳工作台完成 neutral/dark token 化和 UI refresh；API 契约、CSV 字段和数据红线保持不变。
- 已按总控确认解冻 P1 任务池；`X-P1-FREEZE` 已归档为 done，P1-A/B/C/D 已拆为正式 todo 任务卡。
- 已新增 P1-E 抖音号货匹配迁移卡组，覆盖契约冻结、字段映射、算法 adapter、接口承接、前端视图和总控验收；号货匹配度算法公式待用户后续提供。
- 已完成 X-P1-A4，产出 `docs/p1-a4-real-sample-admission-report.md`；真实样例下游准入结论为暂缓，当前仅允许使用 mock/demo 数据推进工程化和契约工作。
- 已完成 A-P1-B1/B2/B3/B4 后端工程化归档：match_result latest view、Idempotency-Key、prediction async worker / timeout fallback 和 API smoke 脚本均通过总控复核。
- `docs/api-contract.md` 已补充 P1-B API 语义：幂等 scope、`Idempotency-Replay`、`GET /matches?history=true`、`POST /predictions.timeoutMs` 和 JSON `/batches`。
- 已完成 X-P1-E0 抖音号货匹配迁移契约冻结，新增 `docs/p1-e0-douyin-account-fit-contract.md`。
- X-P1-E0 决策：抖音账号作为 `ChannelProfile` 的 P1 扩展建模；`AccountProfile`、`ProductAccountFitDiagnostic`、`AdjustmentAdvice` 为 D/M/A/V 共享草案；真实号货匹配度算法由用户后续提供，M 域先按 `AccountFitAdapter` interface 开工。
- 项目级数据准入口径已修订并落到中心规则：用户给到 PLS 系统并要求导入或产品化的数据全部放行，不再因个人敏感、用户级明细、订单/会员行级数据、DMP 成员包或 ID 字段被 agent 自动拦截。
- `AGENTS.md`、`Orchestration.md`、`docs/data-safety-policy.md` 已从“数据红线/数据安全”改为“用户授权数据准入/质量校验”口径。
- 已完成 X-P1-E5 抖音真实业务数据红线复核与迁移验收口径修订，产出 `docs/p1-e5-douyin-migration-acceptance.md`；BI 复刻结论为迁移通过，算法 adapter 仍保留 `algorithm_pending_user_formula` 限制。
- 用户确认 P1-E 的外链/iframe/静态页复刻不是最终目标；P1-F 已将抖音 BI 产品能力重构为 PLS 原生数据资产、API、诊断对象和 React 工作台。
- 已完成 D-P1-F1、A-P1-F2、M-P1-F3、V-P1-F4、V-P1-F5 与 X-P1-F6 总体验收，产出 `docs/p1-f6-douyin-bi-productization-acceptance.md`。
- X-P1-F6 结论为通过：数据包校验、SQLite 入库/API、模型 contract/backtest、前端真实 API smoke、v2 数据更新验收均通过；静态 dashboard、`data.js`、iframe 和“打开完整 BI”不再承担验收主流程。
- 本地 `ws_demo` 保留临时 `v2_20260704_xp1f6` 验收数据，用于证明 latest projection 与 `?dataVersion=v1_20260703` 历史查询可并存；仓库数据真源仍为 `data/p1/douyin-bi/` 的 v1 数据包。
- 用户确认 PLS 后续方向为具备模型预测能力的业务智能 BI 系统，覆盖数据管理、渠道人群、商品人群、人货匹配、新品预测和经营飞轮。
- 已新增 `docs/p2-product-direction-ia.md`，冻结 P2 产品方向草案、6 个一级模块、多角色用户故事、数据对象关系和任务拆分建议。
- `docs/wiki.html` 已升级到 v0.21，并新增 X-P2-0 至 V-P2-11 todo 任务卡，覆盖 P2 信息架构冻结、数据管理底座、商品主数据与渠道实体 schema、店铺 / 账号优先渠道人群、解释型人货匹配、新品预测和经营飞轮最小闭环。
- 已完成 X-P2-0，产出 `docs/p2-0-product-ia-freeze.md`；`docs/wiki.html` 已升级到 v0.22，并将 X-P2-0 标记为 done。
- X-P2-0 冻结结论：`docs/p2-product-direction-ia.md` 作为 P2 产品口径来源；后续实现必须遵循店铺 / 账号优先、解释型匹配、数据可追溯和 P2 初期不自动决策。
- 已完成 A-P2-1 总控复核，产出 `docs/p2-1-data-management-acceptance.md`；`docs/wiki.html` 已升级到 v0.23，并将 A-P2-1 标记为 done。
- A-P2-1 结论为通过：`data_source` 注册表 + adapter 模式满足 source-agnostic 要求，`/api/v0/data-management/*` 读取型 API、quality report、audit 查询和 501 占位写路径可作为 P2 第一阶段交付。
- 已完成 D-P2-2 总控复核，产出 `docs/p2-2-product-channel-schema-acceptance.md`；`docs/wiki.html` 已升级到 v0.24，并将 D-P2-2 标记为 done。
- D-P2-2 结论为通过：`docs/p2-2-product-channel-schema.md` 可作为 P2 数据域结构草案，覆盖 `ProductMaster`、`ChannelEntity`、`FieldMapping`、`DataQualityReport` 和三类 profile 输入边界。
- 已完成 A-P2-3 总控复核，产出 `docs/p2-3-channel-entities-acceptance.md`；`docs/wiki.html` 已升级到 v0.25，并将 A-P2-3 标记为 done。
- A-P2-3 结论为通过：`channel_entity` 投影表和 `/api/v0/channels/entities` API 可作为 P2 店铺 / 账号优先渠道人群读取层；源表 `douyin_*` 与 `channel_profile` 未被合并或破坏。
- 已完成 V-P2-4 总控复核，产出 `docs/p2-4-channel-entity-workbench-acceptance.md`；`docs/wiki.html` 已升级到 v0.26，并将 V-P2-4 标记为 done。
- V-P2-4 结论为通过：`AccountProfileWorkbench` 已成为店铺 / 账号优先的渠道人群工作台，真实 API 主流程已改为消费 `/api/v0/channels/entities`，并保留分析视图与决策视图双轨。
- 已完成 M-P2-5 总控复核，产出 `docs/p2-5-product-channel-fit-contract-acceptance.md`；`docs/wiki.html` 已升级到 v0.27，并将 M-P2-5 标记为 done。
- M-P2-5 结论为通过：`ProductChannelFit` / `FitExplanation` contract 已冻结，解释项覆盖 matched、conflict、missing、low-confidence、unmapped 和 insufficient sample，正式 fit formula 未提供前继续保留 `algorithm_pending_user_formula`。
- 已完成 V-P2-6 总控复核，产出 `docs/p2-6-match-core-workbench-acceptance.md`；`docs/wiki.html` 已升级到 v0.28，并确认 V-P2-6 为 done。
- V-P2-6 结论为通过：`MatchCoreWorkbench` 支持按商品找实体和按实体找商品，真实 API 模式已消费 `/api/v0/channels/entities`，并以 `sourceEntityKey` 兼容当前 match result。
- 已完成 D-P2-7 总控复核，产出 `docs/p2-7-new-product-input-template-acceptance.md`；`docs/wiki.html` 已升级到 v0.29，并将 D-P2-7 标记为 done。
- D-P2-7 结论为通过：`data/templates/new-product-prediction-input/` 可作为新品预测输入模板，覆盖字段组、映射边界和质量规则，且不编造用户尚未提供的业务值。

下一步：

- 按 wiki 派发 P2 任务；X-P2-0、A-P2-1、D-P2-2、A-P2-3、V-P2-4、M-P2-5、V-P2-6、D-P2-7 已完成，下一步可优先派发 M-P2-8 新品人群预测 baseline contract，或推进 A/M 对正式 ProductChannelFit API 的后端落地。
- P2 主路径为：数据管理 -> 渠道人群 / 商品人群 -> 人货匹配 -> 新品预测 -> 经营飞轮；店铺 / 账号优先，解释型匹配优先，真实数据导入和版本审计作为底座。
- P2 hardening 与产品化任务已合并进任务池：HTTP import / 导入审计、channel_profile 同步策略、正式 fit 公式、benchmark tags 补齐、API schema、分页、前端状态回归、新品主数据预测和飞轮闭环。
- P1-E 复刻结果只作为参考或过渡，不再作为最终产品化完成标准；后续验收不得依赖“打开完整 BI”、iframe、截图预览或静态整页嵌入。
- 若 V 域需要 match 也走 async，需单独派发 A 后续任务；当前 A-P1-B3 只要求 predictions 链路支持 async / timeout fallback。

阻塞：

- 暂无 P0-B 实现阻塞。
- 暂无数据隐私准入阻塞；用户提供的数据默认放行。
- D-P1-A5 阻塞于 `data/local/raw_staging/<batchId>/` 真实样例输入缺失。
- P1-E 的号货匹配度算法公式尚未冻结；M 域当前 `AccountFitAdapter` 只能作为 rule baseline 和 contract test，待用户提供算法后替换 implementation 并重跑 X 验收。
- P1-F 总体验收已通过；若后续新增页面重新以外链、iframe、静态 HTML 或截图承担主流程，需退回并重做产品化承接。
- 旧归档文档中仍可能存在历史“红线/S0/S1”表述；当前执行入口以 `AGENTS.md`、`Orchestration.md`、`docs/data-safety-policy.md`、`docs/wiki.html` 当前任务卡和各域 notes 为准。
- multipart `/batches` 幂等未纳入当前契约，未来若需要需设计文件摘要 + form fields hash。

开放问题：

- 抖音 BI `douyin_*` 数据当前投影到 `channel_entity`，不合并进通用 `channel_profile`；后续如需反向写入 `channel_profile` 需单独拍板。
- 正式 fit formula、商品主数据字段和真实行动反馈字段仍待用户后续提供或冻结。
- `data_source` 当前以 `source_id` 单列为主键；若后续支持多 workspace 复用同名 sourceId，需评估是否迁移为 `(workspace_id, source_id)` 复合主键。

验证：

- data 三项校验通过：真实样例模板、抖音 mapping 模板、多 timeWindow demo。
- app 侧验证通过：`apps/server npm run typecheck`、`apps/web npm run build`。
- X-P1-F6 验证通过：`node data/scripts/validate-p1-douyin-bi.mjs data/p1/douyin-bi`、`apps/server npm run typecheck`、`npm run migrate`、`npm run import:douyin-bi`、`npm run smoke:douyin-bi`、`npm run smoke`、`apps/model npm run typecheck`、`npm run account-fit-contract-test`、`npm run validate-tags`、`npm run contract-test`、`npm run backtest`、`npm run backtest:cutoff`、`apps/web npm run lint`、`npm run build`、`VITE_USE_MOCK=false npm run smoke`。
- A-P2-1 验证通过：`apps/server npm run typecheck`、`npm run migrate`、`npm run seed:data-sources`、`npm run smoke:data-management`、`npm run smoke:douyin-bi`、`npm run smoke`。
- D-P2-2 验证通过：文档结构检查、taxonomy 引用检查、标题层级检查；显式 `demo.female` / `demo.male` 均存在于 `docs/profile-taxonomy-v0.md`。
- A-P2-3 验证通过：`apps/server npm run typecheck`、`npm run migrate`、`npm run seed:data-sources`、`npm run sync:channel-entities`、`npm run smoke:channel-entities`、`npm run smoke:douyin-bi`、`npm run smoke:data-management`、`npm run smoke`。
- V-P2-4 验证通过：`apps/web npm run lint`、`npm run build`、Mock Playwright smoke、真实 API Playwright smoke；真实 API smoke 前已执行 `apps/server npm run migrate`、`npm run seed:data-sources`、`npm run sync:channel-entities`；desktop / mobile 视觉检查未发现明显溢出、遮挡和重叠。
- M-P2-5 验证通过：`apps/model npm run typecheck`、`npm run contract-test`；contract-test 返回 `ok: true`，覆盖 matched、mismatch、low_confidence、unmapped、insufficient_sample。
- V-P2-6 验证通过：`apps/web npm run lint`、`npm run build`、Mock Playwright smoke、真实 API Playwright smoke；desktop / mobile 工作台与解释面板截图未发现明显溢出、遮挡和重叠。
- D-P2-7 验证通过：`node data/templates/new-product-prediction-input/scripts/validate-new-product-prediction-template.mjs`，结果 `0 error / 0 warning`。

---

## 长效决策

- P0 先做“服装新品冷启动画像预测 + 渠道匹配”闭环。
- P0 画像标签先冻结 6 个维度、36 个核心标签，后续通过总控审批扩展。
- P0 渠道先覆盖电商、内容电商和抖音类流量渠道；线下门店作为 P1 扩展。
- P0 demo 数据仍保留 mock 口径；用户真实数据按最新项目规则可直接进入开发协作。
- P0-B demo 数据目录固定为 `data/demo/`；本地运行数据目录固定为 `data/workspaces/ws_demo/`。
- P0-B 预测和匹配同步超时统一为 30s，超时返回 `202 accepted` + `Task`；候选渠道数 > 50 强制异步。
- P0-B 持久化 ID 由 A 域落库时生成最终 `predictionId` / `matchId`，M adapter 不直接写库。
- P0 存储选型采用 SQLite + 本地文件系统；Postgres + 对象存储作为 P1 迁移目标。
- P0 前端采用低保真 MVP 工作台，不做营销落地页；浏览器端 CSV 导出按 PLS 数据对象边界执行。
- 用户确认导入 PLS 的真实客户/订单/会员/DMP/BI 数据可进入 LLM、fixture、API、CSV、audit 和前端展示。
- `docs/wiki.html` 是任务派发与版本历史真源。
- P0-C 是 P1 前的发布 gate，不新增商业扩展功能；必修 gate 为 A/M adapter、heatmap 去重、数据准入模板和真实数据模板。
- P0-C A 域去重口径采用 latest-result overwrite；如需同时保留完整历史与 latest 视图，需另行总控拍板。
