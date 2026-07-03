# A-P2-3 店铺 / 账号优先的渠道人群 API 验收报告

## 目的

复核 A-P2-3 是否把渠道人群查询从平台渠道优先调整为店铺 / 账号 / 门店实体优先，并为 V-P2-4 提供稳定的 `ChannelEntity` API。

## 结论

结论：通过。

A-P2-3 已完成 `channel_entity` 读优化投影表、`channel_entity_latest` view、幂等同步脚本、`/api/v0/channels/entities` 列表与详情 API、数据源注册升级和 smoke 覆盖。实现保持 `douyin_*` 与 `channel_profile` 源表不变，`channel_entity` 只作为 P2 渠道人群投影层。

## 验收要点

- `channel_entity` 表以 `workspace_id + channel_entity_id + data_version` 为主键，支持历史版本和 latest projection。
- `channel_entity_latest` 按 `workspace_id + channel_entity_id` 分组，以 `generated_at DESC, rowid DESC` 选择最新行。
- `sync:channel-entities` 从 `douyin_account_latest`、`douyin_account_benchmark_tag_latest` 和 `channel_profile` 幂等投影，当前生成 17 个实体。
- `entityType` 覆盖当前线上实体：`shop`、`account`、`content_account`、`livestream_room`；线下 `province`、`city`、`trade_area`、`store` 已在 schema 中预留。
- `/channels/entities` 在 `/channels` 前注册，避免被既有 `/channels/:channelId` 路由误匹配。
- `seed-data-sources` 已将 `channel_profile` 从 stub 升级为 active；`docs/api-contract.md §9` 已同步状态。

## 验证

- `apps/server npm run typecheck` 通过。
- `apps/server npm run migrate` 通过；首次 sandbox 运行因 `tsx` IPC pipe 权限失败，提权重跑后通过。
- `apps/server npm run seed:data-sources` 通过，`channel_profile` 为 active。
- `apps/server npm run sync:channel-entities` 通过：13 douyin + 4 mock = 17 rows，latest entities = 17。
- `apps/server npm run smoke:channel-entities` 通过：15/15。
- `apps/server npm run smoke:douyin-bi` 通过：15/15。
- `apps/server npm run smoke:data-management` 通过：22/22；验收中已修正旧断言，stub source 数量从 3 更新为 2。
- `apps/server npm run smoke` 通过：24/24。

## 风险与后续

- `channel_entity` 是投影表，数据更新需先导入源表再重跑 `sync:channel-entities`；是否自动触发留给后续 X/A 任务拍板。
- `profileTags` 当前对抖音账号为空，待 D 域补充账号画像映射后投影。
- `parentEntityId` 当前为空，账号到店铺、门店到城市 / 省份的层级关系待 D 域提供映射。
- `/channels` 与 `/channels/entities` 并存；V-P2-4 应优先消费 `/channels/entities`，迁移策略后续单独冻结。
