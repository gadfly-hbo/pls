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

---

## 三、协作规则

- 总控 Agent 负责产品架构、数据准入口径、跨域契约、任务拆解、终审。
- 域 Agent 只改自己域内文件和任务卡指定文件。
- 接缝层文件、共享类型、DB schema、全局配置由总控持有；如需域 Agent 代笔，必须由总控在任务 brief 中写死口径。
- 所有任务以 `docs/wiki.html` 的任务卡为派发真源。
- 跨 session 连续性以 `docs/notes-<域>.md` 的 `## 0. 当前状态` 为准。
- 域任务回流经 X 总控复核通过后，总控 Agent 必须同步把 `docs/wiki.html` 对应任务卡 `status` 改为 `done`，无需用户另行提醒。

---

## 四、完成标准

每个任务完成后必须说明：

1. 改了什么。
2. 验证了什么。
3. 哪些风险或测试缺口仍存在。
4. 是否需要总控拍板。

代码任务还必须运行相关校验。首版项目未建立构建链路前，至少需要做文件结构检查和文档链接检查；建立工程后再补充 `typecheck`、`build`、单测和端到端 smoke。

---

## 五、当前产品目标

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

This section does not replace the rules above. Existing product rules remain authoritative.
<!-- AGENTOPS:END -->
