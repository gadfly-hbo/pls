# notes-infra

## 0. 当前状态

最近更新：2026-07-06（X-P6-CHANNEL-0：渠道画像 2.0 总控契约冻结；当前 wiki 任务已新增 P6 渠道画像任务卡）

进度：

- `docs/channel-profile-2.0-plan.md` 已从草案收口为 P6 总控冻结契约，作为 D/M/A/V 后续渠道画像对象库、活动/场景、导入、匹配权重和 UI 边界的共同真源。
- X-P6-CHANNEL-0 冻结 6 类对象库：平台、商圈、店铺、账号、活动、场景；线上层级为平台 -> 线上店铺 -> 账号，线下层级为商圈 -> 线下门店。
- 活动 / 场景作为长期对象库，可绑定任意渠道实体但不改变实体归属层级；组合渠道包第一期只作为分析视图，不作为长期对象落库。
- 第一期只做 AudienceProfile + ProductFitProfile；流量画像、转化画像、运营约束作为后续扩展，不进入 P6 第一期验收。
- 第一期开工权重冻结：`baseScore = 0.7 * audienceFit + 0.3 * productFit`；活动 / 场景只做权重调节，不生成独立 eventScore / scenarioScore。
- P2 既有 `livestream_room` / `content_account` 不要求删除或迁移历史数据；P6 新增主路径收敛到 `account`，用 `contentFormats` / `accountKind` 保留来源差异。
- `docs/wiki.html` 当前 changelog `v0.62` 为 current；本 session P5 主线已完成 D-P5-PORTRAIT-3、X-P5-PORTRAIT-4、A-P5-PORTRAIT-5、V-P5-PORTRAIT-6、M-P5-PORTRAIT-7。
- infra 域本 session 关键交付为 A-P5-PORTRAIT-5：注册 `single-product-portrait` 工具，通过 `POST /api/v0/tools/runs` 运行受控样本包，生成 derived artifact `prediction.json` / `report.md`，不写主业务画像表。
- `single-product-portrait` 工具边界：只消费 `data/templates/single-product-portrait-<packageId>/sample_package/` 受控样本包；前端 / 调用方不得传任意本地文件路径。
- artifact 读取边界：`GET /api/v0/tools/runs/:runId/artifacts/prediction.json` 返回原始 artifact body，不是 Hono `{ code, data }` wrapper；前端 V-P5 已按此契约修正。
- A-P5-PORTRAIT-5 总控已修正并验收多 SKU 样本隔离：`platform_portrait.csv` 按 `skuId + sourceProductKey` 过滤，避免其他 SKU 画像行混入当前预测。
- `prediction.json` 顶层保留 `sourceFiles`，用于追溯 `product_attributes.jsonl` 与 `platform_portrait.csv`。
- tools run / artifact 读取保持 workspace 隔离；跨 workspace 读取 run、artifact 或 artifact list 应返回不可见。
- 当前 P5 后端工具仍是本地 derived artifact 机制，不导入主业务 portrait 表；真实样本导入、artifact 清理策略、主业务表落地仍需后续任务卡。

本次收尾验证：

- `apps/server npm run typecheck` 通过。
- `apps/server npm run smoke:single-product-portrait` 通过：39/39，覆盖 tool registry、dry-run、run、prediction/report artifact、`sourceFiles`、未知 SKU 失败、异常 CSV risk flag、多 SKU 隔离、workspace 隔离、缺失 skuId、非法 packageId。
- `apps/server npm run smoke:tools` 通过：27/27，覆盖通用 tools registry、dry-run/run、artifact list/read、path traversal、run list、workspace 隔离。

下一步：

- D/M/A/V 可按 wiki 中 D-P6-CHANNEL-1、M-P6-CHANNEL-2、A-P6-CHANNEL-3、V-P6-CHANNEL-4 复制 brief 开工；必须先读 `docs/channel-profile-2.0-plan.md`。
- 如需真实 P5 样本进入系统，应继续按 D-P5 样本包标准进入，后续再开 A/D 任务实现受控导入或真实解析器。
- 如需将单品画像结果写入主业务 portrait 表，必须另开任务卡设计 schema、幂等、audit、回滚和前端展示边界；当前 artifact 不等于业务表落库。
- `data/local/tool-runs/` 会累积 derived artifacts，清理策略仍需单独任务。
- admin token 获取方式、tool-run retention、真实平台解析器 / SQL 导出解析器仍是 P4/P5 后续 infra 增强点。

阻塞：

- infra 本轮无实现阻塞。
- P5 真实校准 / 真实画像产品化仍受限于 >=5 款真实画像商品样本和平台大盘 TGI 基准。

开放问题：

- artifact API 原始 body 与 Hono wrapper 响应并存，前端 adapter 和 E2E mock 必须按真实路由逐个对齐，不能统一假设所有 `/api/v0` GET 都是 `{ code, data }`。
- 多 workspace tool-run 产生的本地文件保留多久、如何清理、是否需要 UI 暴露清理入口，尚未拍板。

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

## A-P5-PORTRAIT-5 / Tools Artifact 沉淀

- 决策：`single-product-portrait` 只通过 tools runner 生成 derived artifacts，不写主业务 portrait 表；业务表落库需要另开任务设计 schema、幂等、audit 和回滚。
- 决策：工具参数只接受受控 `packageId` 与 `skuId`，后端映射到 `data/templates/single-product-portrait-<packageId>/sample_package/`；不得开放任意本地路径输入。
- 踩坑：artifact read route 返回原始文件 body，例如 `prediction.json` 是 JSON 文件本体，不是 `{ code, data }` wrapper。前端 mock / Playwright route 必须与真实 artifact body 同构。
- 踩坑：多 SKU 样本包必须用 `skuId + sourceProductKey` 同时过滤 `platform_portrait.csv`，只按 `skuId` 或完全不滤都会造成画像标签泄漏。
- 风险：`data/local/tool-runs/` 会随 smoke 和本地调试累积 artifact；当前没有 retention / cleanup 策略。
- 风险：tool-run 与 artifact 均依赖 workspace 隔离；后续新增 import / preview / cleanup API 时必须保留跨 workspace 不可见约束。
