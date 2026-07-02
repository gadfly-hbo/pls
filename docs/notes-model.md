# notes-model

## 0. 当前状态

最近更新：2026-07-02（X-P1-A4 准入暂缓）

进度：

- M-P0-2 已通过 X 总控终审并 `done`，产出 `docs/model-plan.md` v0.1（418 行）。
- 交付要点：商品 DNA 特征集合、预测输出 schema、匹配算法、回测指标、6 个 P0 Segment 模板、14 词受控词表。
- 收尾校验：taxonomy tagId 全覆盖（0 越界）、markdown fence 平衡、3 段 JSON 全部可解析、跨文档引用可达（profile-taxonomy-v0 / data-spec / data-safety-policy 均存在）。
- M-P0-B3 已通过 X 总控终审并 `done`，新增 `apps/model/`，只读消费 `data/demo/` 与 `docs/profile-taxonomy-v0.md`。
- `ProductProfileDraft` 输出包含 `modelVersion`、`modelPath`、`predictedProfileTags`、Top 3 `topSegments`、`qualityFlags`、`unmappedInputTokens`。
- `ChannelMatchDraft[]` 输出包含 `matchScore`、`matchConfidence`、`rank`、`overlap`、`bestSegmentId`、`bestSegmentMatch`、positive/negative drivers、`qualityFlags`。
- demo 回测采用 `demo_only_leave_one_sku_out`：`topKTagHit@5 = 0.667`，`driverPrecision = 0.617`，`matchNDCG@3 = 1`。
- 已通过 `npm run typecheck`、`npm run validate-tags`、`npm run predict -- --sku mock_sku_101`、`npm run match -- --sku mock_sku_101`、`npm run backtest`。
- X-P0-B5 复验通过：`topKTagHit@5 = 0.667`，`driverPrecision = 0.617`，`matchNDCG@3 = 1`；A 端尚未接入真实 M baseline adapter。
- M-P0-C3 已完成准备稿 `docs/model-c3-prep.md`：明确 `midi` / `dress` 不回流画像词表，作为已有 ProductDNA 结构字段处理。
- P1 时间切分回测输入要求已明确：至少 3 个连续 `timeWindow` 才能做 smoke，正式可解释回测建议 6 个窗口、30 个 SKU、4 个 channel。
- 已新增 A adapter contract test：`apps/model/src/contract-test.ts` 与 `npm run contract-test`，校验 `ProductProfileDraft` / `ChannelMatchDraft[]` 必备字段和分数范围。
- M-P0-C3 已通过总控审核归档；`npm run typecheck`、`npm run contract-test`、`npm run validate-tags`、`npm run predict -- --sku mock_sku_101`、`npm run match -- --sku mock_sku_101`、`npm run backtest` 均通过。
- M-P1-A3 已实现 cutoff 时间切分 backtest：新增 `npm run backtest:cutoff`，默认读取 `data/p1/multi-timewindow-demo/wide_table.jsonl`，训练早于 cutoff 的窗口并验证 cutoff 窗口。
- 本次 cutoff smoke 指标：`topKTagHit@5 = 0.8`，`segmentTop1Hit = 0.667`，`driverPrecision = 0.556`，`matchNDCG@3 = 0.754`；报告见 `docs/model-p1-a3-cutoff-backtest.md`。
- 已通过 `npm run typecheck`、`npm run contract-test`、`npm run validate-tags`、`npm run backtest`、`npm run backtest:cutoff`。
- M-P1-A3 已经 X 总控复核标记 done；总控复验确认 cutoff 训练窗口和验证窗口隔离，channel profile 由训练窗口聚合，当前结果仅代表 D-P1-A2 mock aggregate cutoff smoke。
- X-P1-A4 已归档，真实样例下游准入结论为暂缓；M 域当前 cutoff 指标只能作为 mock aggregate smoke，不得声明真实样本泛化能力。

下一步：

- 等待 D-P1-A5 完成真实样例本地脱敏聚合，并由 D 域基于真实聚合结果重做多 `timeWindow` 宽表；拿到 X 总控准入后重新运行 cutoff backtest。

阻塞：

- 无实现阻塞。D-P1-A2 mock 多窗口输入已存在，但当前结果只能作为 cutoff smoke，不能声明真实泛化能力。

已解决问题：

- P0 baseline 定为 LightGBM per-tag 多标签回归 + kNN 相似检索 + 规则三级兜底（可解释、样本稀疏可退化）。
- 多峰人群输出定为 Top 3 segment（基于固定模板 + 分布重合分数），P1 再切换到真实聚类。

开放问题：

- `segmentTemplate` 权重当前手工设定，P1 可在样本量足够后用真实分布聚类校准。
- `channel.*` 加成在实现阶段需要通过 smoke case 检查，避免与 `channelType` 硬对齐重复计权。
- demo 数据只有一个 `timeWindow`，无法做正式时间切分回测；当前脚手架用 leave-one-SKU-out 作为 P0-B 替代说明。
- `midi` / `dress` 已判定不回流画像词表；若结构 token 高频污染 `unmappedInputTokens`，建议 D 域后续输出 `structuralTokens` 或在 title token 生成阶段过滤。

---

## 模型域原则

- 首版优先可解释，不追求复杂模型。
- 预测输出必须包含置信度和关键驱动标签。
- 回测必须采用时间切分，避免随机切分导致未来信息泄漏。
- 新品真实 DMP 回流后，预测误差必须能进入纠偏样本。
- `mappedProductTags` 由 D 域预计算，M 域校验和缺失回填。
- Segment 模板、关键词受控词表和匹配维度权重变更必须回流 X 总控。

## M-P0-C3 收尾记录

- 词表决策：`midi` / `dress` 不回流画像词表，分别由 `lengthType` / `categoryLv2` 结构字段承载。
- 时间切分准备：正式回测必须等待 D 域提供多 `timeWindow` 宽表；当前单窗口 demo 只能保留 `demo_only_leave_one_sku_out`。
- Adapter 接缝：A 域可用 `npm run contract-test` 校验 M 输出字段，但持久化 ID、workspace、recommendation、risks 仍由 A 域补齐。
- 风险：若后续 `titleTokens` 中结构 token 持续污染 `unmappedInputTokens`，应由 D 域在 token 生成阶段过滤或显式输出 `structuralTokens`。
