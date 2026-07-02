# notes-app

## 0. 当前状态

最近更新：2026-07-03（session 收尾：项目级数据准入口径放行到 API / 前端）

进度：

- A-P0-3 / A-P0-B2 / A-P0-C1 已完稿。
- A-P1-B1/B2/B3/B4 已完稿并通过总控复核：match_result latest view、Idempotency-Key、prediction async worker / timeout fallback、API smoke 脚本化均已归档。
- A-P1-E3 已完稿：POST /account-matches 调用 M-P1-E2 `diagnoseAccountFit()`，输出 shape 对齐冻结契约，`qualityFlags` 保留 `algorithm_pending_user_formula`。
- 本次按项目级新规则调整应用侧数据准入：`apps/server/src/lib/safety.ts` 保留 `checkSafety` / `deepScanSafety` 接口，但对用户授权数据始终返回 pass，不再按字段名或值形态拒绝。
- 产品写入路径中的 taxonomy gate 未变：`mappedProductTags` 仍必须来自标签白名单；本次只取消隐私类 safety 拦截。
- 前端 `apps/web/src/pages/Dashboard.tsx` 已去掉“请勿上传含个人隐私...”提示，改为允许录入用户授权进入 PLS 的业务数据。

关键决策：

- match_result 从 latest-overwrite 升级为 append-only；latest 通过 view 提供
- 幂等 hash 只对 `application/json` 生效；PK 按 `(workspace_id, method, path, key)` 隔离
- worker 用同进程 `runWithTimeout`，不引入外部队列
- `simulatedDelayMs` 从公开 body 移除，改用非公开 header `X-PLS-Test-Delay-Ms`
- A-P1-E3 直接调用 M-P1-E2 的 `diagnoseAccountFit()`，不自建 adapter
- POST /account-matches 只处理指定 accountId，不 fallback 全量 channel
- 隐私类 safety gate 不再作为 API 拦截层；后续如需拦截，只能基于用户新的明确规则重新设计。

回补记录（总控审核 3 项阻塞 → 5 项阻塞）：

- B2-1：`idempotency_key` PK 加 method+path，lookup/INSERT 同步更新
- B2-2：`/batches` 按 Content-Type 分派 JSON/multipart
- B3：`simulatedDelayMs` 移至 `X-PLS-Test-Delay-Ms` header，production 禁用
- E3-1：删除自建 adapter，用 M-P1-E2 `diagnoseAccountFit()`；INSERT 写 qualityFlags
- E3-2：POST /account-matches 只处理单 accountId
- E3-3：adjustmentAdvice 对齐冻结契约（adviceId/priority/actionType/direction/rationale/evidence）
- E3-4：mismatchedDimensions 只含 mismatch/unmapped
- E3-5：`migrate.ts` DROP VIEW IF EXISTS 后重建

下一步：

- P1-B 序列全部关闭，A-P1-E3 完稿；等待总控终审标记 done。
- 候选：A-P1-E3 已交付，V 域可消费 `/account-matches` 接口。
- match 链路是否接入 async worker 视 V 域需求。
- A-P1-E3 的 POST /account-matches 暂未接入 Idempotency-Key（可后续补）。
- P1-F 若继续，A-P1-F2 应消费 D-P1-F1 的 PLS 数据对象，API 可返回资产化后的完整 BI 字段，但不能让前端直接依赖原 dashboard 全局变量。

阻塞：

- 无

开放问题：

- P0-C 保留问题：M baseline adapter 是否 P1 拆成单独 model-serving 进程（未变）。
- P1-B2 幂等缓存 prune 每次读时 DELETE；量大后改后台 job。
- P1-B4 smoke 需 server 已在 3100 运行；CI 层需自动拉起。
- A-P1-E3 的 `match_result_latest` view 在已有 DB 上需 migration DROP+recreate（已实现）。

验证：

- `apps/server npm run typecheck` 通过。
- `apps/web npm run build` 通过。

---

## 应用域原则

- API 输出要保留 `source`, `confidence`, `sampleSize`, `generatedAt`。
- 用户授权进入 PLS 的数据默认放行；应用层不再按隐私字段名或值形态做 safety 拦截。
- taxonomy gate、quality gate 和产品对象契约仍然有效。
- pipeline 每一步要可追溯，便于后续回测和纠偏。

## A-P0-3 沉淀

- 契约定型见 `## 0` 关键契约点段落。
- V 域调用序列已定型两套（新品画像工作台 5 步、渠道匹配热力图 4 步）。
- 数据准入门禁当前口径：
  - safety 接口保留但默认 pass；不再因 `phone` / `name` / `address` / `orderId` / `memberId` / `openId` / `adId` / `deviceId` 或手机号/邮箱/身份证形态拒绝。
  - taxonomy 门禁：`tagId` 必须在标签体系白名单；未命中且有 `mappingRuleId` 进 `unmappedTags`；否则 `taxonomy_violation`。
  - quality 门禁：`sampleSize < 100` 与 `profileCoverageRate < 0.7` 只告警不拦截，落 `qualityReport`。
- 存储 6 张主表（`pipeline-design.md §6.2`）：`workspace` / `sku` / `channel_profile` / `wide_table_row` / `batch` / `prediction` / `match_result` / `task` / `audit_event`。索引：`(workspaceId, createdAt DESC)`、`(workspaceId, skuId)`、`(workspaceId, taskType, status)`、`(taskId)`、`(predictionId)`。
- 审计事件默认记录处理阶段和摘要；是否记录原文按用户授权口径和产品调试需求决定。

## 风险与踩坑记录

- **超长中文 + JSON 混排 payload 触发 write/edit 工具层 JSON parser `Unterminated string`**。多次可复现，主要发生在 write 单次载荷 > 10KB 且含大量 JSON schema + 中文表格混排时。变通方案：先 Write < 200 行骨架，再 Edit 分段追加，每段控制在 < 2000 字符。本 session 全程沿用该策略，两份文档均无残缺。
- **文件读 offset 越界不代表内容缺失**：本 session 收尾 turn 曾用 `Read(offset=150)` 读 88 行文件收到 out-of-range，一度误判 `pipeline-design.md` 只有骨架。实际是完整 349 行 v0.1。教训：越界 error 时先 `Read` 无 offset 拿完整文件，或用 `wc -l` 等价手段（此环境 bash 不可用则改用 Grep 数章节数）确认真实长度，再做状态判断。
- **上游冻结锚定策略生效**：M-P0-2 已 done，A 域契约直接锚定 `model-plan.md §3.3 / §4.4` 字段，不再需要反向对齐。这一模式适用于所有下游域：优先直接引用上游冻结 schema，不预留占位。
- **`recommendation` 阈值表规则顺序**：按表格自上而下执行，`avoid` 优先级最高；`dimension` 从 `tagId` 前缀推导。已在 `api-contract.md §3.4` 明文写入，覆盖需回流 X。
- **本地 `3100` 端口可能已有残留 server 进程**：收尾 smoke 如遇 `EADDRINUSE`，通常代表前一轮本地实例仍在运行；可直接复用已启动实例验证接口，不影响 API 结果判读，但若要复现实验需先清理端口占用。
- **SQLite NOT NULL DEFAULT 只在列不出现在 INSERT 时生效**：显式传 NULL 违反约束，即使列有 DEFAULT。INSERT 必须只列有值的列，或显式传非 NULL 值。A-P1-E3 的 INSERT 调试中踩过此坑。
- **Node.js `tsx` 不热加载已 kill 的进程**：`kill -9` 后 `nohup npm start` 可能仍加载旧代码缓存。确认方式：在关键路径加 `console.log` 检查新逻辑是否执行。
- **跨包 typecheck 引用 model 源码需在 tsconfig 纳入**：`apps/server/tsconfig.json` 需包含 `../model/src/account-fit.js`，否则 `diagnoseAccountFit` 的类型推断断裂。
