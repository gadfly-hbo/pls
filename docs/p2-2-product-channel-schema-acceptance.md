# D-P2-2 商品主数据与渠道实体 Schema 草案验收报告

## 目的

复核 D-P2-2 是否完成 P2 商品主数据、渠道实体、字段映射和质量报告草案，并确认 D/M/A/V 能据此推进新品预测、店铺 / 账号优先渠道人群和解释型人货匹配。

## 结论

结论：通过。

`docs/p2-2-product-channel-schema.md` 可作为 P2 数据域结构草案。它覆盖 `ProductMaster`、`ChannelEntity`、`FieldMapping`、`DataQualityReport`，并明确 `ProductProfile`、`PredictedProductProfile`、`ChannelProfile` 的输入边界。文档未编造真实商品字段、业务 ID 或未批准画像标签。

## 验收要点

- `ProductMaster` 字段组覆盖身份、类目、价格 / 季节、卖点、材质、风格、场景、图文资产、相似商品、原始业务字段、lineage 和 upsert key。
- `ChannelEntity` 字段组覆盖线上平台、店铺、账号、直播间、内容账号，以及线下省份、城市、商圈、门店。
- `FieldMapping` 模板支持源字段、目标字段、映射规则、未映射原因、覆盖率、置信度、owner 和版本。
- `DataQualityReport` 模板支持对象行数、字段覆盖率、mapping 覆盖率、平均置信度、blocking issues、warnings、quality flags 和准入口径。
- 输入边界清晰：`ProductProfile` 使用历史 / 在售真实画像，`PredictedProductProfile` 限定为上新前可得字段和相似商品，`ChannelProfile` 以 `ChannelEntity` 为主键，平台只作为维度。
- taxonomy 边界清晰：不新增 `tagId`；显式引用的 `demo.female`、`demo.male` 均存在于 `docs/profile-taxonomy-v0.md`。

## 验证

- 文档结构检查通过：`ProductMaster`、`ChannelEntity`、`FieldMapping`、`DataQualityReport`、`Input Boundaries`、`Cross-Domain Handoff` 段落均存在。
- taxonomy 引用检查通过：显式 `tagId` 引用均存在于 `docs/profile-taxonomy-v0.md`。
- 文档层级检查通过：已修正四级标题，当前无 `####` 或更深标题。
- `docs/notes-data.md` 已包含 D-P2-2 当前状态和沉淀。

## 风险与后续

- `ProductMaster` / `ChannelEntity` 是否成为物理 SQLite 顶层表，留给 A-P2-3 / A-P2-9 设计时由 X/A 冻结。
- 线下区域层级是否需要统一地理字典，等真实线下数据样例到位后再评审。
- `priceBand`、`seasonBand`、`platformType` 当前只作为 D 域草案枚举，不作为全局冻结枚举；如要进入 API schema 或模型 contract，需另行 X 总控确认。
