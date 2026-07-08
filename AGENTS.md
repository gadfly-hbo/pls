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

### 2.x Smoke 测试的 workspace 隔离（A-P3-DB-MGMT-3）

任何会写入或破坏目标 workspace 的 smoke 脚本必须满足以下约束：

1. **禁止硬编码对主 workspace（`ws_demo`）特定业务数据的依赖**（如特定 `dataVersion`、import job、business row）。所有需要"先导入数据再验证"或"需要真实破坏性闭环"的场景，必须在独立临时 workspace 上运行。
2. **临时 workspace 由 wrapper 脚本创建**：通过 Admin API `POST /api/v0/admin/database/rebuild`（带 `Idempotency-Key` + `confirmText: "RESET <ws>"` + `skipSnapshot: true`）初始化完整 schema，再受控导入 demo / douyin-bi 等数据。workspace 命名统一为 `ws_${purpose}_${timestamp}`（例如 `ws_empty_${ts}` / `ws_imported_${ts}` / `ws_smoke_${purpose}_${ts}`）。
3. **wrapper 注入 `PLS_WORKSPACE` 环境变量**到子脚本；子脚本仍可作为独立入口运行（默认 `ws_demo`），但通过 `PLS_ADMIN_SMOKE_MODE=empty|dry-run|imported` 等开关控制行为模式。
4. **危险操作写型端点的 confirmText 校验必须先于"目标不存在"短路**。`POST /api/v0/admin/database/import-jobs`、`DELETE /api/v0/admin/database/versions/:dataVersion` 等端点的 handler 应在打开 DB / 查询影响前校验 `body.confirmText`，否则对不存在目标 / 空库的错误 confirmText 会误返回 404 或 200 success。
5. **每个 smoke 入口必须在 README / 脚本 help 中显式声明前置假设**：目标 workspace 当前状态、是否需要导入数据、是否会产生临时 workspace、清理方式。
6. **JSON summary runner**（如 `smoke-admin-summary.mjs`）按顺序运行各模式 wrapper 并输出合并 JSON；每条子脚本末尾输出 `RESULT: {...}` JSON 行供 wrapper 解析汇总。

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

---

## 四、完成标准

每个任务完成后必须说明：

1. 改了什么。
2. 验证了什么。
3. 哪些风险或测试缺口仍存在。
4. 是否需要总控拍板。

代码任务还必须运行相关校验。首版项目未建立构建链路前，至少需要做文件结构检查和文档链接检查；建立工程后再补充 `typecheck`、`build`、单测和端到端 smoke。

---

## 五、API 联调与契约纪律

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

## 六、当前产品目标

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

This section does not replace the rules above. Existing product rules remain authoritative.
<!-- AGENTOPS:END -->
