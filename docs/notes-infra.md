# notes-infra

## 0. 当前状态

最近更新：2026-07-02（V-P0-D1 归档完成）

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

下一步：

- 执行 P0-C 总体验收 smoke，确认 C1-C4 验证证据可复现后再判断是否进入 P1。

阻塞：

- 暂无 P0-B 实现阻塞。
- 如用户提供真实数据，必须先完成本地脱敏、聚合和安全检查。

开放问题：

- P1 是否扩展线下门店、区域商圈、会员生命周期和品牌私域分层，需等待 P0-C 总体验收后再拍板。

---

## 长效决策

- P0 先做“服装新品冷启动画像预测 + 渠道匹配”闭环。
- P0 画像标签先冻结 6 个维度、36 个核心标签，后续通过总控审批扩展。
- P0 渠道先覆盖电商、内容电商和抖音类流量渠道；线下门店作为 P1 扩展。
- P0 demo 数据先使用脱敏 mock 口径，用户真实数据必须本地脱敏聚合后才能进入开发协作。
- P0-B demo 数据目录固定为 `data/demo/`；本地运行数据目录固定为 `data/workspaces/ws_demo/`。
- P0-B 预测和匹配同步超时统一为 30s，超时返回 `202 accepted` + `Task`；候选渠道数 > 50 强制异步。
- P0-B 持久化 ID 由 A 域落库时生成最终 `predictionId` / `matchId`，M adapter 不直接写库。
- P0 存储选型采用 SQLite + 本地文件系统；Postgres + 对象存储作为 P1 迁移目标。
- P0 前端采用低保真 MVP 工作台，不做营销落地页；保留浏览器端 CSV 导出，但只导出 S3/S4 派生结果字段。
- 真实客户/订单/会员明细不得进入 LLM。
- 平台 DMP 原始导出只允许转成聚合标签分布后使用。
- `docs/wiki.html` 是任务派发与版本历史真源。
- P0-C 是 P1 前的发布 gate，不新增商业扩展功能；必修 gate 为 A/M adapter、heatmap 去重、红线扫描自动化和真实数据模板。
- P0-C A 域去重口径采用 latest-result overwrite；如需同时保留完整历史与 latest 视图，需另行总控拍板。
