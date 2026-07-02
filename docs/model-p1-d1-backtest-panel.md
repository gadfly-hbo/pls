# M-P1-D1 Cutoff Backtest Metric Panel

最近更新：2026-07-02

## 目的

把 cutoff backtest 输出整理为可复现、可阅读的指标面板，支撑 X 总控判断是否进入后续模型增强。

## 使用方式

在 `apps/model/` 下运行：

```bash
npm run backtest:panel
```

默认输入为 `data/p1/multi-timewindow-demo/wide_table.jsonl`。报告只读取 D-P1-A2 mock aggregate 宽表，不读取原始交易、会员、客户或 DMP 成员明细。

## 样本与切分

| 项目 | 值 |
|---|---:|
| train windows | `2026-03-01/2026-03-31`, `2026-04-01/2026-04-30` |
| validation window | `2026-05-01/2026-05-31` |
| train rows | 24 |
| validation rows | 12 |
| train SKUs | 3 |
| validation SKUs | 3 |
| channels | 4 |

## 核心指标

| Metric | Value | 口径 |
|---|---:|---|
| `topKTagHit@5` | 0.8 | 预测 Top 5 tag 与验证窗口真实聚合 Top 5 tag 的交集比例 |
| `segmentTop1Hit` | 0.667 | 预测 Top 1 segment 是否命中验证窗口聚合画像推导出的 Top 1 segment |
| `driverPrecision` | 0.556 | Top segment drivers 命中真实聚合 Top 5 tag 的比例 |
| `matchNDCG@3` | 0.754 | 渠道匹配排序对正向销售表现 channel 的 NDCG@3 |

## 分层指标

### CategoryLv2

| categoryLv2 | trainSize | testSize | topKTagHit@5 | segmentTop1Hit | driverPrecision | qualityFlags |
|---|---:|---:|---:|---:|---:|---|
| `dress` | 8 | 4 | 0.8 | 1 | 0.429 | none |
| `outerwear` | 8 | 4 | 0.8 | 1 | 0.667 | `low_sample_rows_present` |
| `top` | 8 | 4 | 0.8 | 0 | 0.571 | `low_confidence_tags_present`, `low_sample_rows_present` |

### ChannelType

| channelType | trainSize | testSize | matchNDCG@3 | positiveMatchRate | qualityFlags |
|---|---:|---:|---:|---:|---|
| `live_stream` | 6 | 3 | 0 | 0 | `low_sample_rows_present` |
| `private_domain` | 6 | 3 | 0.333 | 0.333 | `low_confidence_tags_present`, `low_sample_rows_present` |
| `shelf_ecommerce` | 6 | 3 | 0.333 | 0.333 | none |
| `short_video` | 6 | 3 | 0.333 | 0.333 | none |

### SampleSize Bucket

| sampleSizeBucket | trainSize | testSize | matchNDCG@3 | positiveMatchRate | qualityFlags |
|---|---:|---:|---:|---:|---|
| `lt_500` | 7 | 2 | 0 | 0 | `low_sample_bucket` |
| `500_999` | 12 | 6 | 0 | 0 | none |
| `gte_1000` | 5 | 4 | 1 | 0.75 | none |

## 不可用边界

- 当前输入是 mock aggregate smoke 数据，只能证明指标面板和 cutoff 链路可运行，不能声明真实样本泛化能力。
- 当前只有 3 个 SKU 和 3 个 `timeWindow`，低于正式模型增强建议的 30 个 SKU 和 6 个窗口。
- 分层指标中 `channelType` 和 `sampleSizeBucket` 的样本量很小，只能作为诊断提示，不能作为稳定优化依据。
- 报告只包含聚合指标和脱敏 ID，不展示原始交易或 DMP 成员数据。
