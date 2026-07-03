# D-P2-7 新品主数据预测输入模板验收报告

## 目的

复核 D-P2-7 是否在用户提供具体新品字段前，冻结新品主数据预测输入模板的字段组、质量要求和映射边界，为 M-P2-8 与 A-P2-9 打底。

## 结论

结论：通过。

D-P2-7 已新增 `data/templates/new-product-prediction-input/` 模板目录，基于 D-P2-2 `ProductMaster` 草案定义新品预测输入结构、字段映射模板、质量报告模板和本地校验脚本。模板阶段未生成真实商品 ID、业务枚举默认值、业务字段值或未批准 `tagId`。

## 验收要点

- 输入模板覆盖 `identity`、`category`、`priceAndSeason`、`sellingPoints`、`material`、`styleAndScenario`、`assets`、`similarProducts`、`lineage`、`quality` 字段组。
- 真实输入时必填商品身份 / source key、一级类目或等价映射字段，以及 `sourceBatchId`、`dataVersion`、`generatedAt`、`sourceType` 等 lineage。
- 模板文件中用户待提供字段保持 `null`、`[]` 或 `{}`，不提前编造新品 ID、SKU/SPU、价格带、季节、品牌、卖点或图文资产。
- 字段映射模板只允许映射到现有 taxonomy namespace：`demo`、`style`、`price`、`occasion`、`intent`、`channel`。
- 质量规则覆盖 missing、conflict、unmappable、low confidence 四类，并保留 `user_authorized_full_passthrough` 准入口径。

## 使用方式

D/A 后续导入真实新品主数据时，可先将源字段映射到 `new_product_prediction_input.template.json` 对应结构，再生成 `field_mapping` 和 `quality_report`。M-P2-8 可基于其中的上新前可得字段、`mappedProductTags`、相似商品和图文摘要定义预测 baseline。

## 示例

- 身份字段：真实输入到位后填充 `productMaster.identity.productId` 与 `sourceProductKey`。
- 类目字段：真实输入到位后填充 `productMaster.category.categoryLv1`，或通过字段映射提供等价类目字段。
- 不可映射字段：进入 `productMaster.styleAndScenario.unmappedProductFields`，保留 `sourceField`、`sourceValue`、原因、处理建议和 confidence。

## 验证

- `node data/templates/new-product-prediction-input/scripts/validate-new-product-prediction-template.mjs` 通过，结果 `0 error / 0 warning`。
- 复核模板文件、README、字段映射 CSV、质量报告模板和校验脚本，未发现未批准 `tagId` 或假业务值。
- `docs/wiki.html` 在总控复核前保持 `D-P2-7` 为 `todo`，未被域 agent 提前标记完成。

## 注意事项

- 当前 JSON Schema 是模板结构校验，不是最终 API request schema；A-P2-9 可基于它收紧真实输入校验。
- `priceBand`、`seasonBand` 等仍是 D 域映射输出，不代表全局枚举冻结。
- 图文资产和相似 SKU 只定义引用 / 摘要结构，不定义具体特征抽取算法；M-P2-8 需冻结 baseline 使用口径。
