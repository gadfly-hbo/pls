# PLS 项目约定（AGENTS.md）

> 本文件汇总跨 session 必须遵守的工程、数据与协作约定。任何 agent 开工前必须先读本文件。

---

## 一、数据准入规则

本项目采用用户授权准入：凡是用户给到 PLS 系统、要求导入或要求产品化的数据，均视为已授权的项目数据，可直接进入仓库、代码、prompt、fixture、API、CSV、audit、前端展示和后续 agent 协作。

| 数据类型 | LLM 可读 | 处理规则 |
|---|---|---|
| 用户提供或确认导入的数据 | 允许 | 全量放行，保留原始字段和值，不因个人敏感、用户级、订单/会员行级、设备级、DMP 成员包或 ID 字段被 agent 自动拦截 |
| 商品基础信息 / 商品图文 | 允许 | 按产品需要直接使用，保留来源 |
| 渠道画像 / DMP / 业务 BI 数据 | 允许 | 可作为产品功能、fixture、演示数据和开发输入直接使用 |
| 预测画像 / 匹配结果 / 报告 | 允许 | 作为衍生产物使用，需保留来源与置信度 |
| 公开趋势 / 公域内容摘要 | 允许 | 需记录来源、时间窗口和提取口径 |

硬约束：

1. agent 不再设置数据隐私红线；用户给到系统的数据全部放行。
2. 不再因为手机号、姓名、地址、订单号、会员 ID、平台 open id、广告 ID、设备 ID、DMP 成员 ID、用户级明细、订单/会员行级数据等字段或值形态拒绝任务、拒绝导入或拒绝写入项目文件。
3. 脱敏、聚合、抽样、指数化只在用户明确要求或产品建模确实需要时执行，不作为默认安全前置条件。
4. 仍需保留工程质量约束：字段来源、时间窗口、样本量、置信度、质量标记和跨域契约要可追溯。
5. 涉及第三方外发、线上生产发布或外部共享时，按用户当次发布口径执行；当前本地开发与 PLS 系统内使用默认放行。

---

## 二、通用开发约定

- 默认中文回复；代码、变量、注释用英文；技术术语保留英文。
- TypeScript 优先，Python 次之。
- 有类型注解，避免 `any`，错误处理显式不吞异常。
- 只做任务范围内的最小改动，不主动重构整个项目。
- 不安装未确认的新依赖。
- 删除、覆盖、重命名文件前必须先确认。
- 新建文件、只读操作可直接执行。
- 不回滚他人或其他 agent 的改动。
- 多来源回退取值时，不得提前用 `?? {}` / `?? default` 固化请求体字段；必须保留 undefined / null 直到最终 fallback 解析点，确保后续来源（如关联表、配置、环境变量）有机会生效。

### 2.x Smoke 测试的 workspace 隔离（A-P3-DB-MGMT-3）

任何会写入或破坏目标 workspace 的 smoke 脚本必须满足以下约束：

1. **禁止硬编码对主 workspace（`ws_demo`）特定业务数据的依赖**（如特定 `dataVersion`、import job、business row）。所有需要"先导入数据再验证"或"需要真实破坏性闭环"的场景，必须在独立临时 workspace 上运行。
2. **临时 workspace 由 wrapper 脚本创建**：通过 Admin API `POST /api/v0/admin/database/rebuild`（带 `Idempotency-Key` + `confirmText: "RESET <ws>"` + `skipSnapshot: true`）初始化完整 schema，再受控导入 demo / douyin-bi 等数据。workspace 命名统一为 `ws_${purpose}_${timestamp}`（例如 `ws_empty_${ts}` / `ws_imported_${ts}` / `ws_smoke_${purpose}_${ts}`）。
3. **wrapper 注入 `PLS_WORKSPACE` 环境变量**到子脚本；子脚本仍可作为独立入口运行（默认 `ws_demo`），但通过 `PLS_ADMIN_SMOKE_MODE=empty|dry-run|imported` 等开关控制行为模式。
4. **危险操作写型端点的 confirmText 校验必须先于"目标不存在"短路**。`POST /api/v0/admin/database/import-jobs`、`DELETE /api/v0/admin/database/versions/:dataVersion` 等端点的 handler 应在打开 DB / 查询影响前校验 `body.confirmText`，否则对不存在目标 / 空库的错误 confirmText 会误返回 404 或 200 success。
5. **每个 smoke 入口必须在 README / 脚本 help 中显式声明前置假设**：目标 workspace 当前状态、是否需要导入数据、是否会产生临时 workspace、清理方式。
6. **JSON summary runner**（如 `smoke-admin-summary.mjs`）按顺序运行各模式 wrapper 并输出合并 JSON；每条子脚本末尾输出 `RESULT: {...}` JSON 行供 wrapper 解析汇总。
7. **Fixture DB 清理前必须对比 HEAD 基线**：如果 smoke 污染了被跟踪的 fixture DB（如 `data/workspaces/ws_demo/db.sqlite`），清理前必须先用 `git show HEAD:<db-path>` 或等效方式确认 `HEAD` 基线行数和关键行内容。只删除超出基线的生成数据，保留 `HEAD` 已存在的 fixture/demo 行；禁止仅凭 "smoke-style" 键名或时间戳就删除整表数据。推荐做法：先 `git checkout HEAD -- <db-path>` 恢复基线，再运行 `npm run migrate` 重新应用 schema/migration，最后验证相关表 `COUNT(*)` 与 HEAD 一致。
8. **Fixture DB / 生成产物清理必须用 git diff 复核**：恢复被跟踪的 fixture DB 或 Playwright 报告等生成产物后，不能只依赖 `git diff --check` 或口头判断。必须对目标路径运行 `git status --short -- <path>` 和 `git diff --name-only -- <path>`，binary DB 还应按需运行 `git diff --stat -- <path>`；只有这些命令确认目标路径不再出现在 diff 中，handoff 才能声明已清理。产品迭代 handoff 前必须运行 `npm run guard:worktree`（根目录），自动拦截 `ws_demo/db.sqlite`、`apps/web/playwright-report/index.html`、`apps/web/test-results/` 等生成产物进入 diff。运行会创建临时 workspace 的 smoke 后，还必须检查并清理对应 `data/workspaces/ws_<purpose>_<timestamp>/` 目录；这些临时 DB 属验证产物，不得留作未跟踪文件进入 handoff。除固定受保护路径外，handoff 前应对本次 smoke 日志中出现的临时 workspace 路径运行 `git status --short -- <path>`，确认无输出或在 handoff 中说明为何该路径是任务允许产物。

---

## 三、协作规则

- 总控 Agent 负责产品架构、数据准入口径、跨域契约、任务拆解、终审。
- 域 Agent 只改自己域内文件和任务卡指定文件。
- 接缝层文件、共享类型、DB schema、全局配置由总控持有；如需域 Agent 代笔，必须由总控在任务 brief 中写死口径。
- AgentOps/CDI 工作流的任务创建、派发、review、状态流转与收口记录以 `.agentops/tasks/` Task Bus 为准。
- `docs/wiki.html` 已被 AgentOps Task Bus 替代，后续不再作为任务真源、任务派发入口、任务状态看板或 session 收尾必更新文档。
- 除非用户明确点名要求修改 `docs/wiki.html`，否则不要在 product iteration、task create/review、session end、commit/push 等流程中读取、更新或校验它。
- 跨 session 连续性以 `docs/notes-<域>.md` 的 `## 0. 当前状态` 为准。
- 总控复核或 `/learn` 沉淀时，不只记录总控自己的执行经验；凡是在 PLS 任务审核中发现的 D/M/A/V/Infra 等域 agent 可复发错误模式，也应沉淀为项目级规则、notes 或后续任务约束。沉淀重点包括契约误读、真实 API / Mock 漂移、数据质量口径遗漏、UI 真实运行风险、smoke 隔离问题和跨域边界误改；一次性 typo 或局部实现细节不沉淀。

### 3.x 多任务清单与下一步强制提示

1. 跨多个 Task Bus 任务的产品迭代必须维护一份持久化 batch 清单，逐项记录稳定清单编号、Task ID（创建后回填）、domain、assignee、sequence、depends_on、状态与完成证据；Task Bus `approved` 才能标记为完成。
2. 默认只创建当前 dependency-ready 的下一任务；后续项保持 `planned`，不得提前创建空壳任务。当前任务 `approved` 后，总控必须在同一轮更新清单，并创建已解除依赖的下一任务；只有用户明确暂停或存在已记录 blocker 时才可不创建。
3. 每次 task review 或阶段收口的用户回复必须明确说明：刚完成/未通过的任务、清单整体进度、下一任务的目标、domain、assignee、依赖状态，以及 worker 应执行的命令。禁止在仍有 `planned` 项时仅回复“当前没有可领取任务”或不说明后续工作。
4. `changes_requested` 时，下一步必须明确为同一 assignee 执行 `/agentops-task-next` 继续修正同一 Task ID；不得跳到后续任务。
5. batch 只有在全部实施项、验收项和退役/收口项均 `approved` 后才能宣称完成。若某能力按批准范围明确延期或放弃，必须在最终清单和退役审计中记录依据、保留位置与恢复方式，不能静默当作已迁移。

---

## 四、LLM 调用规则

1. PLS 内所有需要调用 LLM 的产品功能，必须通过 `pi-agent` 调用；不得在 PLS 业务代码中直接调用 Minimax、OpenAI 或其他第三方模型 HTTP API。
2. `pi-xanthil` 是 `pi-agent` 的套壳产品，只能作为交互和默认模型口径参考；PLS 运行时不得依赖 `pi-xanthil` 作为 LLM provider。
3. 模型选择通过 `pi-agent` 的模型标识表达，例如模拟市场默认使用 `SIMULATED_MARKET_PI_MODEL=minimax-cn/MiniMax-M3`，产品对外结果可继续记录业务口径 `provider=minimax` / `modelVersion=minimax-m3`。
4. LLM provider 不可用、超时、返回非法结构或显式禁用时，允许使用 deterministic fallback，但必须在 `qualityFlags` 中标记 fallback；fallback 不得冒充真实 LLM agent 输出。
5. 新增 LLM 能力前必须先查真实 `pi-agent` CLI / SDK 调用方式、输出事件格式、超时与错误语义，再写 adapter、contract test 和 smoke；不得凭 `pi-xanthil` UI 行为反推底层契约。

---

## 五、ModelEvol 模型协作契约

ModelEvol 是 PLS 的模型能力中心。`product-channel-fit` / `single-product-portrait` 的模型治理、模型源码主版本、训练实验、评估、locked artifact、发布记录均以 ModelEvol 为准；PLS 是产品消费方，不再作为正式模型来源。

### 5.1 正式模型来源

1. PLS 正式运行环境必须通过 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` 显式指向 ModelEvol locked artifact。
2. 当前 artifact marker 以 `.modelevol/capabilities/product-channel-fit/runtime-artifact.json` 为准，agent 在验证或联调前必须先读取该文件，确认 `locked_artifact_path` 与 `locked_artifact_sha256`。
3. PLS 本地 `data/local/single-product-portrait-q2-73sample/model-calibrated.json` 只作为 fallback / legacy compatibility，不再作为正式模型来源。
4. 缺少 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH` 的运行不得宣称为正式 ModelEvol-backed runtime。

### 5.2 PLS 不手动维护正式模型

1. PLS 开发者 agent 不应手动更新 PLS 本地 `model-calibrated.json` 来代表正式模型版本。
2. 如需升级模型，必须等待 ModelEvol 产出新的 locked / released artifact，并更新 `.modelevol` runtime marker 或运行环境变量指向该 artifact。
3. 不得将本地 fallback 模型、临时训练输出或手工替换的 JSON 冒充正式模型。

### 5.3 模型代码 ownership

1. ModelEvol 是 `product-channel-fit` 模型源码的 canonical source。
2. `.modelevol/capabilities/product-channel-fit/ownership.json` 记录 PLS 内的 source-sync managed files；`apps/model/src` 中相关模型代码是产品运行副本 / 分发目标，不应被视为模型主源码。
3. 如果需要修改模型算法、权重逻辑、训练逻辑或评估逻辑，应优先在 ModelEvol 中完成，再由 ModelEvol 分发到 PLS。

### 5.4 PLS 可改与不可改范围

PLS 可以修改：

- 产品 API / route / UI 调用方式。
- PLS runtime env 配置。
- 与模型调用相关的 adapter glue code。
- smoke test / integration test。

PLS 不应擅自修改：

- 正式模型 artifact。
- locked artifact checksum。
- 模型训练数据。
- 模型训练流程。
- ModelEvol 的模型治理规则。
- 将本地 fallback 模型冒充正式模型。

### 5.5 后续联动流程

如果 PLS 需要新模型版本：

1. PLS 先提出产品需求、输入输出约束、线上问题或评估反馈。
2. ModelEvol 负责启动 experiment、准备数据、训练、评估、review、lock、release。
3. ModelEvol 发布新的 locked artifact。
4. ModelEvol / controller 更新 PLS `.modelevol/capabilities/product-channel-fit/runtime-artifact.json`，使 `locked_artifact_path` 指向新 artifact。
5. PLS 启动脚本、smoke 与验证命令从 runtime marker 读取 `locked_artifact_path`，再注入 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`；不得把某个 v0.x artifact 路径写死为长期运行配置。
6. PLS server 必须重启后才会使用新的 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`；仅更新 marker 或 artifact 文件但不重启，不得宣称运行时已切换到新版本。
7. PLS 再做产品侧 API / UI / smoke / integration 验证。

### 5.6 验证要求

1. PLS 验证模型接入时，不要只看 `apps/model/src` 的默认路径。
2. 必须优先读取 `.modelevol/capabilities/product-channel-fit/runtime-artifact.json`，确认当前 ModelEvol artifact 路径和 checksum。
3. 正式验证时必须显式设置 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`。
4. 验证结论必须说明使用的是 ModelEvol locked artifact 还是 PLS fallback / legacy 模型。
5. 判断运行时是否已升级到新的 ModelEvol artifact 时，不得只看 `modelVersion` 字段；artifact 内部 `modelVersion` 可能不是 v0.x 语义版本。必须结合 runtime marker 的 `locked_artifact_path` / checksum，以及 API metadata 中的 `sampleCount`、`trainedAt` 等 artifact 特征确认。
6. 如果页面或 API metadata 仍显示 PLS 本地 fallback artifact 的 `sampleCount` / `trainedAt`，优先检查运行中 server 环境是否缺少 `SINGLE_PRODUCT_PORTRAIT_MODEL_PATH`，以及是否在 marker 更新后完成 server 重启。

---

## 六、完成标准

每个任务完成后必须说明：

1. 改了什么。
2. 验证了什么。
3. 哪些风险或测试缺口仍存在。
4. 是否需要总控拍板。

代码任务还必须运行相关校验。首版项目未建立构建链路前，至少需要做文件结构检查和文档链接检查；建立工程后再补充 `typecheck`、`build`、单测和端到端 smoke。代码任务在运行 lint / build / typecheck / smoke 之外，handoff 前再运行 `git diff --check`，确保没有空白字符、行尾空行等 diff hygiene 问题。

---

## 七、API 联调与契约纪律

为避免“半盲开发”与基于猜想的错误联调，凡涉及前后端对接、真实 API 接入或 E2E Mock 开发时，必须遵守以下铁律：

1. **先查契约，再写代码**：严禁直接利用前端旧 Mock 数据结构凭空推导真实后端的接口形态。在编写 Adapter 或对接逻辑前，必须先通过工具强制读取后端的真实路由定义文件（如 `apps/server/src/routes/` 下的文件）及对应 Schema 声明。
2. **强制沙盘推演与 Header 对齐**：涉及前后端联调、真实 API 接入、危险操作或 E2E Mock 时，在代码实现前必须先列出完整的端到端请求期望（包含 HTTP Method、精准 URL 路径、鉴权与防重放 Headers、确切 Body 结构）。特别注意后端中间件严格要求的 Header：如受控写入 / 正式执行接口中后端要求的 `Idempotency-Key`、权限要求的 `X-PLS-Admin-Token` / `Authorization: Bearer ...`，以及正确的上下文 `X-PLS-Workspace`（严禁误写为 `-Id`）。涉及受控写入、导入、staging、dry-run -> execute 两阶段流程时，沙盘推演还必须明确：staged reference 的生成与校验方式、是否允许 overwrite/upsert、重复执行策略、目标资源白名单、before/after snapshot 的真实统计口径，以及 audit/import job 的写入点；未获 X 明确拍板时，默认不得使用 overwrite、replace 或 upsert 语义。确保对齐后再动工；纯样式、文案、局部无接口 bugfix 不强制输出完整推演。
3. **Adapter 层强隔离（防解包崩溃）**：面对前后端字段定义分歧（如后端的 `truncatable` 对应前端的 `isClearable`，或需要通过嵌套对象推导平铺状态时），禁止将后端响应或原生错误直接透传给 UI 组件，必须在接口请求层提供严格的属性映射清洗。特别注意：Hono 后端通过统一响应返回 `data` 包装对象（如 `ok(c, { tools: [] })` 的 HTTP 响应为 `{ code, requestId, generatedAt, data: { tools: [] } }`），前端 Adapter 必须按真实层级精准解包，严禁靠猜测使用 `.items`。
4. **Mock 与真实形态同构**：任何针对前端测试、本地开发的 Mock 数据或 Playwright E2E 路由拦截响应，其数据层级、属性命名、类型形态必须与真实后端返回保持同构；确需差异时，必须在测试或任务说明中显式标注差异原因、适用范围和不覆盖的真实行为，避免脱节的“自欺欺人”测试。
5. **本地 Mock 与 E2E 拦截防坑纪律（USE_MOCK 陷阱）**：
   - **拦截盲区**：前端代码库中的 `USE_MOCK=true` 机制（如 `api.ts`）会直接在代码层短路并返回数据，**不发起真实网络请求**。这会导致 Playwright 的 `page.route` 拦截失效。若需通过 `page.route` 验证真实 contract 或拦截真实请求，必须显式使用 `VITE_USE_MOCK=false` 或绕开本地 Mock 短路；否则测试只能验证 Local Mock 兜底路径。
   - **路由匹配陷阱**：在编写 Playwright `page.route` 匹配规则时，严禁将 HTTP Method 当作 URL Path 进行匹配（例如，拦截 `DELETE /api/versions/1` 时不能写成 `**/versions/*/delete*`）。必须根据真实发出的精确 URL 进行 glob 匹配。
   - **Mock 演进同步**：修改后端契约，或修改用于代表真实契约 / 默认本地体验的前端拦截响应时，必须同步更新 `api.ts` 中的本地 `USE_MOCK` 实现。仅用于单个测试场景的临时拦截可不更新 `api.ts`，但必须在测试或任务说明中标明其适用范围，防止本地无后端的体验出现“Mock 漂移”导致的验证阻断。
   - **契约形态哨兵测试**：凡是 UI 逻辑依赖后端响应字段的类型或字段名（例如 `blockingErrors` 是 number 还是数组、`sampleErrors.rowNumber/rawValue` 等），不得只用本地 Mock 或默认 `npm run smoke` 证明通过。必须至少有一条 `VITE_USE_MOCK=false` 的 contract 测试，或在测试中显式断言目标 `page.route` 被真实请求命中；拦截响应必须逐字段复制真实 contract / route / schema 的类型形态，不能用前端自造的近似结构。
   - **Real API 冒烟测试数据隔离**：在编写定向 `VITE_USE_MOCK=false` 的 Playwright E2E 冒烟测试（如 `smoke-real.spec.ts`）时，严禁将断言或交互写死为前端本地的 Mock 数据（例如 Mock 工具名“生意参谋人群提取”）。必须使用后端真实注册的基础数据（如“Sample Profile Extract”），防止因数据上下文错配导致真实测试全盘失败。
---

## 八、当前产品目标

产品定位：

> 面向零售品牌的“商品冷启动人群预测 + 渠道人货匹配决策系统”。

P0 目标：

1. 建立统一画像标签体系。
2. 构建历史 SKU 训练宽表。
3. 完成新品商品画像预测 MVP。
4. 完成渠道画像导入与人货匹配 MVP。
5. 提供一个可演示的新品画像工作台和渠道匹配热力图。

<!-- AGENTOPS:BEGIN -->
## AgentOps Product Entry

This product is registered in the multi-agent coding system.

- System root: `/Users/huangbo/Dev/AgentOps/coding-system`
- Product overlay: `/Users/huangbo/Dev/AgentOps/coding-system/products/pls/AGENTS.overlay.md`
- Routing guide: `/Users/huangbo/Dev/AgentOps/coding-system/docs/agent-routing.md`
- Domain memory guide: `/Users/huangbo/Dev/AgentOps/coding-system/docs/agent-domain-memory.md`
- Cross-project prompt template: `/Users/huangbo/Dev/AgentOps/coding-system/templates/CROSS_PROJECT_IMPLEMENTATION_PROMPT.template.md`

This section does not replace the rules above. Existing product rules remain authoritative for local product behavior. The standard below defines the minimum handoff and approval gates for changes requested across repository boundaries.

## AgentOps 跨项目协调标准

### 目的

当一个项目依赖另一个仓库的持久化变更时，保留目标项目的自治权，同时提供一份可以直接交给目标项目、且不丢失证据、范围、契约、验证和依赖 gate 的实施 brief。

### 强制规则

- 当请求项目需要另一个项目实施代码、配置、schema、模型、contract 或其他持久化变更时，请求项目 Controller 不得代替目标项目直接实施，也不得只给出口头摘要。
- 请求项目 Controller 必须使用 AgentOps 跨项目实施 prompt 模板，输出一段可直接转发给目标项目 Controller 或开发者 agent 的完整 prompt。Prompt 至少包含请求仓库与目标仓库、建议的目标 `domain` 与 `assignee`、权威证据与已批准决定、目标与 non-goals、建议的 `allowed_paths`、约束与执行顺序、验证要求、handoff 格式、contract gate、依赖关系和阻塞处理。
- 请求项目可以建议目标 `domain`、`assignee` 和 `allowed_paths`，但无权替目标项目批准。目标项目 Controller 必须根据目标仓库自身的 `AGENTS.md`、`Orchestration.md`、contracts、路由规则和当前仓库证据确认或调整。
- 目标项目必须使用自身的 Controller 与 worker 生命周期。适用 AgentOps Task Bus 时，任务创建、领取、handoff 和 review 必须发生在目标仓库的 Task Bus。ModelEvol experiment state machine 等项目专属生命周期保持权威，不得被通用 Task Bus 流程替代。
- 请求项目不得把目标项目尚未批准的输出视为可消费 contract。依赖目标变更的下游任务必须保持显式阻塞，直到目标项目 Controller 批准上游 handoff，并明确可供下游消费的 contract、artifact、version、path 或其他证据。
- 如果证据缺失、项目规则冲突、请求超出批准范围、出现 contract drift、验证失败，或目标项目无法采用建议路由，目标 agent 必须停止扩张范围，并把 blocker 交回目标项目与请求项目 Controller 决策。

### 使用方式

1. 确认当前仓库之外确实需要实施变更；建议路由或路径前先读取目标仓库规则。
2. 使用 `templates/CROSS_PROJECT_IMPLEMENTATION_PROMPT.template.md`，填写已验证证据，并显式标记未知项。
3. 通过目标项目 Controller intake 交付 prompt。最终任务拆解、路由、批准和 handoff review 由目标项目 Controller 负责。
4. 把跨项目执行顺序记录为显式依赖。只有目标 handoff 与 contract gate 获批后，请求项目的下游工作才能开始。

### 示例

某产品需要 AgentHarness 新增字段。产品 Controller 引用现有 consumption contract，提出 AgentHarness 目标 domain 与路径建议，并阻塞产品集成任务。AgentHarness Controller 按本项目规则确认路由，完成实施与验证并批准 handoff。产品 Controller 随后记录已批准的 contract 证据，再释放下游集成任务。

### 注意事项

- 读取其他仓库获取证据，不等于获得该仓库的写权限。
- 可转发 prompt 是 intake artifact，不是绕过目标项目 Controller 的授权。
- 项目规则可以设置更严格的 gate；目标仓库规则和项目专属生命周期对其实施保持权威。

## AgentOps 墓碑代码治理标准

### 目的

防止已经完成短期使命的临时代码进入长期维护或正式交付，同时保护正式回归测试、生产诊断能力和可复用工程资产。

### 强制规则

- “墓碑代码”是已经完成短期使命、但仍遗留在项目中的临时代码，包括一次性测试、调试打印、临时测试接口、写死的假数据和一次性脚本。
- 功能实现并通过正式验证后，必须盘点本轮新增的临时代码，列出所在文件、原用途和删留建议；清理动作必须等待用户确认，并继续遵守目标项目的操作安全规则。
- 应清理已经失去用途的临时代码，但不得误删正式回归测试、生产诊断日志、审计日志，以及具有长期复用价值且用途明确的工具脚本。
- 临时测试接口、绕过权限或校验的入口、可能写入假数据的逻辑，必须作为高风险项优先报告，不得带入正式交付。
- 无法确认代码用途、调用关系或生命周期时，不得猜测或擅自删除；应提供文件、引用或运行证据，说明风险并请求确认。
- 默认只盘点和清理当前任务产生的墓碑代码；历史遗留内容必须作为独立范围进行全局扫描、列清单并单独确认。
- 清理完成后，必须重新运行相关正式测试、typecheck、lint 或最小 smoke 验证，并报告结果和未验证项。

### 使用方式

1. 在功能实现和正式验证完成后，检查本轮 diff、未跟踪文件和运行产物。
2. 按“删除、保留、待确认”分类列出临时代码及证据。
3. 获得用户确认后执行清理，不扩大到未授权的历史遗留范围。
4. 重跑相关正式验证，并在 handoff 或最终回复中报告清理与验证结果。

### 示例

为排查接口问题新增的无鉴权调试路由在问题解决后属于高风险墓碑代码，应先列出文件、用途和删除建议，获得确认后移除并重跑接口回归测试。覆盖该问题的正式回归测试应保留。

### 注意事项

- 目标项目可以设置更严格的删除、验证和审批 gate；更严格的项目规则优先。
- 测试、日志或脚本不能仅凭名称判定为墓碑代码，应根据用途、调用关系、生命周期和维护价值判断。
- 读取其他仓库进行排查不等于获得该仓库的清理权限。

# AgentOps 产品功能前端先行开发标准

## 目的

让业务负责人通过可操作、可视觉验收的前端尽早澄清产品功能，再用真实后端验证数据、规则和技术链路，降低先完成后端后才发现业务理解偏差的返工风险。

核心准则：前端帮助业务负责人想清楚，真实后端帮助证明产品成立；先用前端表达，但不要长时间停留在假数据阶段。

## 强制规则

- 产品功能开发默认先实现可操作、可视觉验收的前端流程，再开发对应后端；不得仅因工程习惯默认后端先行。
- 前端先行阶段必须覆盖核心用户任务、关键页面状态、操作反馈和异常表现，使业务负责人能够通过实际操作确认功能含义与流程。
- 前端流程确认后，必须优先打通一条最小真实数据闭环，不得在真实数据链路尚未验证时继续大范围扩展 mock 页面。
- mock 数据必须明确标注，并遵守目标项目的数据与契约规则；不得捏造业务 ID、枚举值、指标口径、标签或默认值。
- 开发前可以先澄清业务对象、字段语义、输入输出、错误状态和最小 contract；这些是前端开发所需的契约澄清，不视为后端先行。
- 纯后端、基础设施、安全修复、数据迁移或其他没有用户界面的任务，可以不执行前端先行。
- 当数据可得性、算法可行性、性能上限或外部集成是产品能否成立的首要风险时，可以建议后端先行；计划必须列出证据、原因和验证方式，并在实施前获得业务负责人确认。
- 用户或已批准的任务 brief 明确指定后端先行时，按已批准顺序执行。

## 使用方式

1. 在功能计划中先描述可操作的前端验收路径，并列出支撑页面所需的数据、状态和操作。
2. 实现最小前端流程，使用已确认或明确标注的临时数据完成业务验收。
3. 前端流程获确认后，立即实现对应的最小真实后端链路，并用真实数据重新验收。
4. 按同一节奏逐个扩展功能闭环，避免先完成整套前端或整套后端。
5. 如需后端先行，在计划中显式记录适用例外及批准证据。

## 示例

开发运营分析功能时，先提供可操作的筛选、指标卡片、列表、详情和异常状态，让业务负责人确认信息结构与操作路径；确认后立即接入一个真实指标和一条真实查询链路，核对数据来源与计算结果，再扩展其他指标。若首要问题是外部数据源能否访问，则先提交后端可行性验证计划并获得业务负责人确认。

## 注意事项

- 前端先行不是前端全部完成后再启动后端，而是以前端确认业务、以最小真实闭环验证成立。
- 页面展示正确不代表数据正确；接入真实后端后必须抽样核对来源、口径、权限和状态流转。
- 页面字段不要求与数据库字段一一对应；业务负责人确认业务语义，工程实现仍应遵守目标项目的架构和数据契约。
- 目标项目更严格的安全、数据、contract 和审批规则继续生效。

# Worker Delivery Governance

目的：定义所有 AgentOps worker 在开工、实现、验证、handoff 前必须满足的交付硬规则。该策略适用于所有 assignee，不替代产品仓库自己的 `AGENTS.md`、contract、schema 或 domain memory；产品规则更严格时按更严格规则执行。

## 开工前约束矩阵

- 任务涉及 contract、persistence、API、read model、并发或审计时，worker 必须先在工作记录或 `handoff.md` 草稿中写出 constraint matrix，再开始编码。
- constraint matrix 至少包含：brief bullet、invariant family、权威来源、实现位置、正向证据、负向证据、waiver 或 blocker。
- 如果任务同时跨越 schema、application、read model、HTTP、audit、concurrency、UI 等多个 invariant family，worker 必须先反馈“建议拆分”或列出分阶段 acceptance；不得直接把大范围交付合并成一个不可审查 handoff。

## 证据映射

- 每个 brief bullet 必须对应至少一个可验证证据：正向测试、负向测试、命令输出、源码路径或明确 waiver。
- `handoff.md` 中每个“已完成”“已覆盖”“已验证” claim 都必须能 grep 到 test name、源码实现、命令输出或 waiver；grep 不到就不要 claim。
- changes_requested 后，worker 必须先整理完整 blocker checklist，再统一闭环；不得一轮只补一个 reviewer 点名项就重新 handoff。

## Durable Read Model

- Durable read model 必须写 corruption tests，覆盖缺行、多行、错 FK、错 workspace、错 sequence、错 checksum、错数值、非法 JSON。
- read model corruption 必须 fail closed；不得用 fallback、过滤、默认值或 best-effort 映射掩盖 contract drift。
- corruption test 的 fixture 必须真实触发目标 validator 或 mapper；不得被上游 guard 短路后仍宣称覆盖。

## Transaction 与 Idempotency

- transaction、idempotency、retry、locking 或 queue claim 相关任务必须包含 rollback tests。
- 并发相关任务必须包含真实 race-window tests；不得用顺序可见性测试冒充并发测试。
- 外部数据、持久化、HTTP、模型、跨域 adapter 边界默认 fail closed；contract drift 必须作为 blocker 或 `CONTRACT_CHANGE_REQUEST` 暴露。

## Audit 与 Logging

- audit/logging 证据必须断言 exactly-one、`reason_code`、workspace、actor、request、run 以及脱敏字段。
- 只断言“有 audit”“有 log”“写入成功”不算覆盖审计要求。
- audit/logging 的负向路径必须证明失败事务不会留下误导性成功审计；若产品 contract 要求失败审计，则必须断言失败审计的 reason 和上下文。

## Handoff Gate

- `/agentops-handoff-self-audit` 是交付 gate，不是文案步骤；要求执行时，worker 必须把 PASS 证据写进 `handoff.md`。
- self-audit PASS 必须引用可复查证据：test name、文件路径、命令输出摘录或明确 waiver。
- blocked 或 failed handoff 也必须列出已验证项、未验证项、blocker checklist 和下一步所需决策。

## Waiver

- waiver 必须明确说明：对应 brief bullet、无法验证原因、风险、替代证据、谁可以解除 waiver。
- “时间不够”“未执行”“待后续”不是有效 waiver，除非同时给出可复现 blocker 和可执行下一步。
<!-- AGENTOPS:END -->
