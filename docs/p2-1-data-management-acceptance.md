# A-P2-1 数据管理底座与导入审计 API 验收报告

## 目的

复核 A-P2-1 是否把 PLS 的数据导入、版本、质量和审计能力产品化为通用数据管理底座，并确认其不是只服务抖音 BI 的一次性接口。

## 结论

结论：通过。

A-P2-1 已完成读取型数据管理 API、`data_source` 注册表、adapter 投影模式、抖音 BI 首个 active source、三个未来 source stub、质量报告回读、导入审计查询和 501 占位写路径。现有抖音 BI API 与基础 smoke 均未回退。

## 验收要点

- `data_source` 注册表与 `services/data-source-registry.ts` adapter 模式成立；路由层通过 source registry 调度 adapter，不直接绑定 `douyin_*` 物理表。
- `douyin_bi` adapter 可投影 versions、row counts、latest 状态和 quality report；`product_master`、`channel_profile`、`action_feedback` 以 stub source 预注册，满足未来扩展口径。
- `/api/v0/data-management/*` 已挂载，覆盖 data-sources、import-batches、data-versions、quality、audit。
- `POST /data-management/import-batches` 与 `POST /data-management/data-versions/:sourceId/:dataVersion/rollback` 返回 `501 not_implemented`，符合 A-P2-1 第一阶段读取优先、写路径待 X 冻结的范围。
- `docs/api-contract.md §9` 已记录数据管理底座 API contract、核心对象、接口清单、audit 口径和未来数据源接入方式。

## 验证

- `apps/server npm run typecheck` 通过。
- `apps/server npm run migrate` 通过；首次 sandbox 运行因 `tsx` IPC pipe 权限失败，提权重跑后通过。
- `apps/server npm run seed:data-sources` 通过，注册 4 个 source。
- `apps/server npm run smoke:data-management` 通过：22/22。
- `apps/server npm run smoke:douyin-bi` 通过：15/15。
- `apps/server npm run smoke` 通过：24/24。

## 风险与后续

- `data_source` 当前以 `source_id` 单列为主键。当前 `ws_demo` 验收不受影响；若后续支持多个 workspace 复用相同 sourceId，建议在后续迁移中评估是否改为 `(workspace_id, source_id)` 复合主键。
- HTTP import endpoint 和版本回滚语义仍未冻结；后续需要 X 拍板上传协议、latest 指针语义和 rollback 是否删除物理行。
- 抖音 BI 是否同步或投影到通用 `channel_profile` 仍由 A-P2-3 给方案。
- 本地 `ws_demo` 存在早期测试残留孤儿 batch 行，不影响本次 API 正确性；如需清理，应单独确认影响范围。
