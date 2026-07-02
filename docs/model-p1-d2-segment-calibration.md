# M-P1-D2 Segment Template Calibration Report

最近更新：2026-07-02

## 目的

评估当前 6 个 P0 segment template 权重是否应基于 P1 cutoff smoke 样本调整，同时保持 `segmentId` 语义向下兼容。

## 使用方式

在 `apps/model/` 下运行：

```bash
npm run segment-calibration
```

## 当前结论

本轮不调整 segment template 权重。

原因：当前输入为 D-P1-A2 mock aggregate smoke 数据，只有 3 个 SKU、3 个 `timeWindow`，带有 `low_sku_count` 和 `mock_aggregate_input`。在该样本上调权会过拟合 smoke fixture，不能作为真实模型增强依据。

## Baseline 指标

| 项目 | 值 |
|---|---:|
| template count | 6 |
| segmentTop1Hit | 0.667 |
| recommendation | `requires_more_data` |

## 权重变更记录

| candidateId | 说明 | segmentTop1Hit | delta | 结论 |
|---|---|---:|---:|---|
| `current_manual_weights` | 保持 X-approved P0 manual segment template weights | 0.667 | 0 | 保持 |

## 低置信度与无法校准项

- `seg_trendy_young_18_24` 在 `top` 类目 smoke 样本上 Top1 未命中，但样本量不足，不能据此调权。
- `seg_sporty_daily`、`seg_gift_seasonal` 当前 demo 覆盖不足，无法用本轮样本校准。
- 所有 segment 仍可还原到既有 `tagId`，未新增黑盒人群名。

## 后续准入条件

- 至少 30 个 SKU。
- 至少 6 个连续 `timeWindow`。
- 覆盖所有 P0 segment 的正负样本。
- 任何新增 tag 或 segment 语义变化必须回流 X 总控。
