# PLS 文档索引

> 本目录是 PLS 项目的协同与产品设计文档区。

---

## 活文档

| 文件 | 持有 | 内容 |
|---|---|---|
| [wiki.html](wiki.html) | X 总控 | 任务派发、快修、常用 prompt、版本历史 |
| [notes-infra.md](notes-infra.md) | X 总控 | 横切契约、红线、架构决策、当前状态 |
| [notes-data.md](notes-data.md) | D | 数据接入、DMP、商品/渠道画像、数据质量 |
| [notes-model.md](notes-model.md) | M | 商品 DNA、预测模型、匹配算法、回测 |
| [notes-app.md](notes-app.md) | A | API、pipeline、存储、权限、任务流 |
| [notes-viz.md](notes-viz.md) | V | 前端工作台、热力图、报告、决策输出 |
| [profile-taxonomy-v0.md](profile-taxonomy-v0.md) | X 总控 | P0 画像标签体系、标签 ID、DMP 映射原则 |
| [data-safety-policy.md](data-safety-policy.md) | X 总控 | P0 数据安全分级、LLM 准入边界、共享对象约束 |
| [data-spec.md](data-spec.md) | D | 历史 SKU 训练宽表、DMP 聚合导入、商品和渠道字段 |
| [model-plan.md](model-plan.md) | M | 商品画像预测、商品 × 渠道匹配算法、回测指标 |
| [channel-profile-2.0-plan.md](channel-profile-2.0-plan.md) | X 总控 | 渠道画像 2.0 对象库、活动/场景、导入、匹配权重和第一期范围 |
| [model-p6-channel-entity-fit-contract.md](model-p6-channel-entity-fit-contract.md) | M | 渠道画像 2.0 商品适配与活动/场景权重匹配契约 |
| [single-product-portrait-algorithm-contract.md](single-product-portrait-algorithm-contract.md) | X 总控 | 单品商品属性到平台人群画像的规则 baseline contract、输出形态、验证标准和实现任务边界 |
| [p5-portrait-baseline-acceptance.md](p5-portrait-baseline-acceptance.md) | X 总控 | 单品画像规则 baseline 总体验收、第一期展示边界和后续任务顺序 |
| [p5-portrait-bridge-review.md](p5-portrait-bridge-review.md) | X 总控 | 单品平台画像到 PLS taxonomy 的 bridge 映射边界、不可映射理由和 taxonomy 扩展提案条件 |
| [api-contract.md](api-contract.md) | A | P0 API 契约、核心对象、接口清单、V 域调用序列 |
| [pipeline-design.md](pipeline-design.md) | A | 任务状态机、pipeline 阶段、存储分层、审计与反馈骨架 |
| [ui-flow.md](ui-flow.md) | V | 新品画像工作台、渠道匹配热力图、页面流转 |
| [decision-output.md](decision-output.md) | V | 运营建议话术、归因解释、风险预警和导出边界 |
| [p0-acceptance-report.md](p0-acceptance-report.md) | X 总控 | P0-B 端到端验收、红线检查、指标、风险缺口与 P0-C 任务拆解 |
| [tools-module-design.md](tools-module-design.md) | X 总控 | 本地工具模块方案、数据包契约、API 草案和任务拆分 |
| [../data/templates/channel-profile-object-library/README.md](../data/templates/channel-profile-object-library/README.md) | D | 渠道画像 2.0 对象库导入模板、字段字典、质量报告和样例包 |

---

## 根目录文档

| 文件 | 内容 |
|---|---|
| [../AGENTS.md](../AGENTS.md) | 项目通用规则与数据安全 |
| [../Orchestration.md](../Orchestration.md) | 多 Agent 总控章程 |
| [../KICKOFF-P0.md](../KICKOFF-P0.md) | P0 开工任务书 |

---

## 子目录

| 目录 | 内容 |
|---|---|
| [backlog/](backlog/README.md) | 暂不开发但需要保留的方案池 |
| [templates/](templates/) | CDI 任务 brief、回流、契约变更和总控审核模板 |

---

## CDI 模板规则

新增跨域任务卡时，brief 必须声明使用 `docs/templates/DOMAIN_HANDOFF.template.md`。

域 Agent 回流必须按 `docs/templates/HANDOFF_BACK.template.md`。

涉及 schema、API、pipeline、taxonomy、model-output、DB 或 UI contract 变化时，必须附 `docs/templates/CONTRACT_CHANGE_REQUEST.template.md` 或在回流中说明无需变更契约的原因。

X 总控终审按 `docs/templates/REVIEW_CHECKLIST.template.md`，并决定是否需要更新 `CONTEXT.md`、contract、ADR、notes 或 `docs/wiki.html` 任务状态。

历史任务卡不强制回填；从下一张新增跨域任务卡开始执行。

---

## 接手开发顺序

1. 读 `AGENTS.md`。
2. 读 `Orchestration.md`。
3. 读对应 `docs/notes-<域>.md` 的 `## 0. 当前状态`。
4. 从 `docs/wiki.html` 复制任务 brief。
5. 完成后回报改动、验证和风险，由总控终审。
