# X-P1-A4 真实样例红线复核与准入报告

> 归属：X 总控  
> 最近更新：2026-07-02  
> 结论：真实样例进入下游暂缓；mock cutoff smoke 可继续用于工程验证

## 1. 目的

本报告复核 P1-A 真实样例接入链路的当前证据，判断是否允许进入后续模型和工作台增强。

复核对象：

- `D-P1-A1`：真实样例本地脱敏聚合 preflight。
- `D-P1-A2`：mock aggregate 多 `timeWindow` 宽表样例。
- `M-P1-A3`：cutoff 时间切分回测实现。

## 2. 准入结论

真实样例下游准入结论：暂缓。

原因：

- 当前没有 `data/local/raw_staging/<batchId>/` 真实样例输入。
- `D-P1-A1` 只完成 no-input preflight，不能证明真实样例脱敏、聚合、映射和红线扫描链路已跑通。
- `D-P1-A2` 输入是 mock aggregate smoke package，只能用于 cutoff 管线开发验证。
- `M-P1-A3` 已证明 cutoff backtest 主路径可运行，但当前指标不能代表真实样本泛化能力。

允许继续：

- `M-P1-A3` 可继续使用 `data/p1/multi-timewindow-demo/wide_table.jsonl` 做 cutoff smoke。
- P1-B 后端工程化可使用 mock/demo 数据推进幂等、历史表、worker 和 API smoke。
- P1-C 工作台增强可使用 mock/demo 数据推进页面和导出边界。
- P1-D 模型质量任务只能做脚手架、报告结构和 mock 指标面板，不得宣称真实质量提升。
- P1-E 抖音号货匹配迁移可先做契约和字段映射模板，不得接入真实 dashboard 数据到仓库。

暂缓进入：

- 真实样例驱动的模型质量结论。
- 真实样例驱动的工作台演示数据。
- 基于真实业务样例的 P1 准入发布结论。

## 3. 证据复核

| 任务 | 状态 | 复核结论 |
|---|---|---|
| `D-P1-A1` | done | 仅代表 no-input preflight 归档。`data/local/raw_staging/<batchId>/` 未提供真实输入，未生成真实 sanitized / aggregate 输出。 |
| `D-P1-A2` | done | 产出 mock aggregate 多窗口宽表，可供 cutoff smoke。质量报告标记 `demo_only`、`mock_aggregate`、`real_sample_input_absent`。 |
| `M-P1-A3` | done | cutoff backtest 实现可复现，训练窗口和验证窗口隔离，channel profile 从训练窗口聚合。 |
| `D-P1-A5` | todo | 真实样例本地脱敏聚合试跑尚未执行，是解除暂缓的前置任务。 |

## 4. 数据质量与样本量

当前可共享的 P1-A 输入来自 `data/p1/multi-timewindow-demo/`：

| 指标 | 当前值 |
|---|---:|
| rowCount | 36 |
| skuCount | 3 |
| channelCount | 4 |
| timeWindowCount | 3 |
| trainableRowRate | 1 |
| avgSampleSize | 747 |
| profileCoverageRate | 0.843 |
| missingFieldRate | 0.039 |
| unmappedFieldCount | 0 |
| lowConfidenceMappingCount | 6 |

质量边界：

- 当前 3 SKU 低于正式可解释回测建议的 30 SKU。
- 当前 3 个 `timeWindow` 满足 smoke 最低要求，但低于正式可解释回测建议的 6 个窗口。
- 当前输入 `sourceType = mock`，不能作为真实样例准入依据。

## 5. 回测可信度

`M-P1-A3` cutoff smoke 复跑结果：

| 指标 | 当前值 |
|---|---:|
| topKTagHit@5 | 0.8 |
| segmentTop1Hit | 0.667 |
| driverPrecision | 0.556 |
| matchNDCG@3 | 0.754 |

可信度判断：

- 可证明 cutoff backtest 链路可运行。
- 可证明训练窗口早于 cutoff，验证窗口等于 cutoff。
- 可证明 channel profile 从训练窗口聚合，未使用验证窗口构造匹配排序。
- 不能证明真实样本泛化能力。

## 6. 红线复核

本轮复核未发现 P1-A 产物包含 S0/S1 明细。

复核范围：

- `docs/`
- `data/p1/`
- `apps/model/src/`
- `apps/server/src/`
- `apps/web/src/`
- `data/local/aggregate_output/batch_p1_a1_no_input_20260702/`

复核结果：

| 检查项 | 结果 |
|---|---|
| raw staging 输入 | 未发现真实 raw staging 文件；仅有 no-input preflight 本地记录 |
| D-P1-A2 redline report | `status = pass`，`blockedFieldHits = []`，`blockedPatternHits = []` |
| D-P1-A1 no-input redline report | `status = pass`，`rawValueSamplesIncluded = false` |
| docs blocked key scan | 命中项均为政策、任务红线、示例拦截字段或 safety 代码说明；未发现真实样本值 |
| 手机号 / 邮箱 / 身份证形态扫描 | 无命中 |
| CSV 导出边界 | 当前 P1-A 未新增 CSV；P0/V 导出边界仍需在后续 V 任务中复核 |
| audit/API 响应 | 当前 P1-A 未新增真实 API smoke 响应；后续 A/V 任务不得扩大 audit/API payload |

## 7. 复核命令

```bash
node data/scripts/validate-p1-multi-timewindow-demo.mjs data/p1/multi-timewindow-demo
node data/templates/real-sample-ingestion/scripts/validate-real-sample-template.mjs data/templates/real-sample-ingestion
cd apps/model && npm run typecheck
cd apps/model && npm run backtest:cutoff
```

结果：

- P1 多窗口 demo 校验通过：36 行、3 SKU、4 channel、3 个 `timeWindow`。
- 真实样例模板校验通过。
- model typecheck 通过。
- cutoff backtest 通过。

## 8. 后续依赖与风险

| 后续任务 | 准入状态 | 依赖 / 风险 |
|---|---|---|
| `D-P1-A5` | 必须先做 | 需要真实 raw staging 输入；完成本地脱敏聚合、quality report 和 redline scan 后才能重新评估真实样例准入。 |
| `D-P1-A2` 真实版重跑 | 暂缓 | 当前 done 只覆盖 mock aggregate；真实样例到位后需基于真实聚合结果重做多窗口宽表。 |
| `M-P1-A3` 真实版重跑 | 暂缓 | 需要真实多窗口聚合宽表；重跑后仍只能输出聚合指标和脱敏 ID。 |
| `P1-B` | 条件允许 | 可用 mock/demo 数据推进工程化；不得以 mock 数据声明真实准入。 |
| `P1-C` | 条件允许 | 可用 mock/demo 数据做 UI；真实业务演示数据需等 D-P1-A5 和 X 复核。 |
| `P1-D` | 条件允许 | 可做框架和 mock 指标面板；模型质量提升结论需等真实样例。 |
| `P1-E` | 条件允许 | 先做契约、字段映射和 adapter；真实抖音业务数据不得进入仓库或 LLM 上下文。 |

## 9. 总控决定

决定：

- `X-P1-A4` 可归档为 done。
- P1-A 真实样例下游准入结论为暂缓。
- P1 工程任务可以继续使用 mock/demo 数据推进，但所有对外口径必须写明“非真实样例验证”。
- 真实样例进入模型、工作台或报告前，必须完成 `D-P1-A5` 并由 X 总控再次复核。
