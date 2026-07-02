# PLS 项目约定（AGENTS.md）

> 本文件汇总跨 session 必须遵守的工程、数据与协作约定。任何 agent 开工前必须先读本文件。

---

## 一、数据安全分级

本产品处理品牌私有数据、平台 DMP 画像和消费者人群画像，数据安全是第一约束。

| 数据类型 | 敏感度 | LLM 可读 | 处理规则 |
|---|---:|---|---|
| 原始订单 / 会员 / 客户明细 | 最高 | 禁止 | 不得直接进入 LLM；只允许本地工具做统计、脱敏、聚合 |
| 平台 DMP 原始画像导出 | 高 | 受控 | 仅允许标签分布、聚合画像、字段说明进入 LLM |
| 商品基础信息 / 商品图文 | 中 | 允许 | 涉及未发布款式、IP、价格策略时按品牌私密数据处理 |
| 渠道画像聚合数据 | 中 | 允许 | 仅使用聚合标签和比例，不传用户级明细 |
| 预测画像 / 匹配结果 / 报告 | 低 | 允许 | 作为衍生产物使用，需保留来源与置信度 |
| 公开趋势 / 公域内容摘要 | 低 | 允许 | 需记录来源、时间窗口和提取口径 |

硬约束：

1. 禁止把原始行级客户、订单、会员、浏览、加购、支付明细发送给 LLM。
2. 禁止把平台导出的完整 DMP 明细、ID 包、人群包原始成员发送给 LLM。
3. 允许使用经过本地工具处理后的聚合标签、比例、分布、置信度和字段说明。
4. 训练样本、eval 样本、demo 数据必须脱敏，不能包含真实手机号、姓名、地址、订单号、账号 ID。
5. 涉及品牌未上市商品、企划案、成本、首单量、投流预算时，默认按商业机密处理。

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

- 总控 Agent 负责产品架构、数据红线、跨域契约、任务拆解、终审。
- 域 Agent 只改自己域内文件和任务卡指定文件。
- 接缝层文件、共享类型、DB schema、全局配置由总控持有；如需域 Agent 代笔，必须由总控在任务 brief 中写死口径。
- 所有任务以 `docs/wiki.html` 的任务卡为派发真源。
- 跨 session 连续性以 `docs/notes-<域>.md` 的 `## 0. 当前状态` 为准。

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
