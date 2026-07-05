# P5 Portrait Baseline Acceptance

目的：验收 M-P5-PORTRAIT-1 单品画像映射规则 baseline，冻结第一期产品化展示边界和后续 A/V/D/M/X 任务顺序。

## 1. 验收结论

结论：通过，可进入后续 A/V 联调，但只能按“规则 baseline + 单锚点弱校准”的产品口径展示。

允许进入产品化的能力：

- 从受控商品属性输入生成平台画像同构结果：`labelType / label / share / tgi`。
- 展示核心画像维度、规则证据、风险标记和 PLS bridge 覆盖率。
- 保留 `baseline_not_trained_model`、`single_anchor_only`、`manual_rule_weight`、`csv_source_row_anomaly` 等风险，作为 UI / API 必显元数据。
- 对 `10A326100109` 不在商品属性表中的状态输出 `anchor_product_attributes_missing`，未伪造商品属性。

不允许的产品表述：

- 不得称为已训练模型。
- 不得宣称有泛化预测能力。
- 不得把长尾弱先验包装为精准洞察。
- 不得把平台长尾标签强行映射为 PLS taxonomy。

## 2. 复核依据

复核文件：

- `docs/single-product-portrait-algorithm-contract.md`
- `apps/model/src/single-product-portrait.ts`
- `apps/model/src/single-product-portrait-contract-test.ts`
- `apps/model/src/single-product-portrait-smoke.ts`
- `apps/model/README.md`
- `docs/notes-model.md`
- `docs/wiki.html`

验证命令：

```bash
cd apps/model
npm run typecheck
npm run contract-test
npm run single-product-portrait-contract-test
npm run single-product-portrait-smoke
npm run single-product-portrait -- --sku 101524108206
```

验证结论：

- `typecheck` 通过。
- 通用 `contract-test` 通过，`ok: true`。
- `single-product-portrait-contract-test` 通过，`ok: true`、`failures: []`。
- `single-product-portrait-smoke` 读取 103 款商品、25 个画像维度，报告 1 条 CSV 异常，并生成 5 款差异化商品画像。
- 单 SKU CLI 可运行；总控已补齐 `npm run single-product-portrait` 专用脚本并修正 README 示例。

## 3. 核心能力验收

| 项 | 结论 | 说明 |
|---|---|---|
| Source parser | 通过 | XLSX 解析 103 款商品；CSV 解析 2984 条正常画像行，1 条 6 字段异常进入 `anomalyRows` |
| Feature extractor | 通过 | 从 `FAB`、`记忆点`、`商品名称`、`面料`、`特殊功能/材质`、`IP/联名` 提取风格、面料、功能、IP 信号 |
| Rule engine | 通过 | 覆盖性别 / 品类、版型、面料、风格、IP / 功能、锚点弱 prior |
| Calibration | 通过 | 封闭维度归一化；开放维度保留原始 score |
| Evidence | 通过 | 输出 `sourceField`、`sourceValue`、`ruleId`、目标维度、目标标签、权重和 rationale |
| Risk flags | 通过 | 固定输出 baseline / 单锚点 / 手工权重风险，并报告 CSV 异常 |
| PLS bridge | 通过 | 仅白名单映射到已存在 taxonomy tagId，未映射标签显式进入 `unmappedPlatformLabels` |
| Anchor status | 通过 | `10A326100109` 不在商品表时输出 `anchor_product_attributes_missing` |

## 4. 第一期开箱展示维度

以下维度可在 API / UI 中默认展示：

| 维度 | 展示方式 | 说明 |
|---|---|---|
| `预测性别` | Top labels + share | 封闭维度，适合第一屏展示 |
| `预测年龄段` | Top labels + share | 封闭维度，适合第一屏展示 |
| `八大消费群体` | Top 3 | 可展示，但必须保留 baseline 风险 |
| `预测消费能力` | Top labels + share | 封闭维度，可展示 |
| `城市等级` | Top labels + share | 可展示，不等同具体地域 |
| `抖音视频观看兴趣分类` | Top 5 | 只展示直接规则命中的兴趣；弱先验项需标注 |
| `PLS bridge` | 覆盖率 + mapped tags | 展示覆盖率和 unmapped 数量，不能暗示全量映射成功 |
| `evidence` | 默认摘要，支持展开 | 每个核心标签至少可追溯到规则或锚点 |
| `riskFlags` | 必显 | UI / API 都不得隐藏 |

默认展示口径：

- 第一屏只展示核心画像、风险和证据摘要。
- `baseline_not_trained_model`、`single_anchor_only`、`manual_rule_weight` 必须位于核心结果附近。
- 若存在 `csv_source_row_anomaly`，应在质量区域显示，不阻塞结果展示。

## 5. 默认折叠维度

以下维度第一期不进入首屏默认展示，只能放入“长尾画像 / 调试详情 / 原始平台画像”折叠区：

- `地域分布`
- `城市`
- `电商品类成交偏好`
- `电商品牌成交偏好`
- `触点互动偏好`
- `手机品牌`
- `手机价格`
- `头条用户阅读兴趣分类`
- `西瓜视频观看兴趣分类`
- `抖音视频观看兴趣分类v2`
- `美妆行业特色人群`
- `电商消费频次`
- `电商消费金额`
- 其他未被核心规则直接命中的平台长尾维度

折叠区展示要求：

- 标注“锚点弱先验”或“平台原始长尾维度”。
- 不得作为运营建议的主要依据。
- 默认不导出为决策 CSV，除非用户选择导出完整调试结果。

## 6. API / UI 禁止口径

后续 A/V 任务必须遵守：

1. 前端不得传任意本地文件路径给后端。
2. 后端不得把预测结果直接写入主业务画像表；第一期只保存 derived prediction artifact。
3. UI 不得隐藏 `baseline_not_trained_model`、`single_anchor_only`、`manual_rule_weight`。
4. 长尾弱 prior 不得用于默认排序、推荐或结论摘要。
5. `tgi = null` 必须显示为“暂无大盘基准”，不能显示为 0。
6. `PLS bridgeCoverageRate` 低不是错误，但必须可见。

## 7. 后续任务顺序

推荐顺序：

1. `D-P5-PORTRAIT-3`：真实样本包模板。先解决样本进入方式，避免继续依赖散落本地文件。
2. `X-P5-PORTRAIT-4`：PLS taxonomy bridge 复核。冻结映射边界，避免 A/V/M 各自解释。
3. `A-P5-PORTRAIT-5`：预测 API 与 artifact 存储。只消费受控样本包、workspace artifact 或 tools 输出。
4. `V-P5-PORTRAIT-6`：工作台接入。按本报告展示边界实现。
5. `M-P5-PORTRAIT-7`：规则权重校准框架。等待样本包结构稳定后实现，真实校准需 >=5 款带画像商品。

## 8. 剩余风险

| 风险 | 状态 | 后续归属 |
|---|---|---|
| 仅 1 款真实画像 Y | 未关闭 | 用户 / D / M |
| `10A326100109` 缺商品属性 | 未关闭 | D-P5-PORTRAIT-3 |
| 平台大盘 TGI 基准缺失 | 未关闭 | 用户 / X |
| 规则权重手工设定 | 未关闭 | M-P5-PORTRAIT-7 |
| PLS bridge 覆盖率低 | 未关闭 | X-P5-PORTRAIT-4 |
| 单 SKU CLI 输出包含全量 products | 非阻塞 | 后续 A 接入前可优化 |
| 长尾弱 prior 容易被误读 | 已设展示约束 | V-P5-PORTRAIT-6 |

## 9. 总控拍板项

- 第一期开箱展示只允许核心维度；长尾维度默认折叠。
- `single_product_portrait_rule_baseline` 可以进入 A/V 联调。
- 后续真实样本必须以标准样本包进入，不再依赖单个 Downloads 文件。
- taxonomy bridge 扩展必须单独经 X / 用户确认，不能由 M 或 V 直接新增。
