# M-P1-A3 Cutoff Backtest Report

最近更新：2026-07-02

## 目的

把 P0 `demo_only_leave_one_sku_out` 回测升级为可复现的 cutoff 时间切分 smoke，验证模型域可以读取 D-P1-A2 多 `timeWindow` 宽表，并按时间隔离训练窗口和验证窗口。

## 输入边界

- 输入路径：`data/p1/multi-timewindow-demo/wide_table.jsonl`
- 输入来源：D-P1-A2 mock aggregate smoke package
- grain：`skuId + channelId + timeWindow`
- 数据规模：3 个 SKU、4 个 channel、3 个 `timeWindow`、36 行宽表
- 红线：未读取原始订单、会员、客户、DMP 成员、设备、账号或 ID 包明细

## 运行方式

在 `apps/model/` 下运行：

```bash
npm run backtest:cutoff
```

等价显式命令：

```bash
npm run backtest -- --mode cutoff --cutoff 2026-05-01/2026-05-31
```

## Cutoff 口径

- `cutoffTimeWindow`：`2026-05-01/2026-05-31`
- 训练窗口：`2026-03-01/2026-03-31`、`2026-04-01/2026-04-30`
- 验证窗口：`2026-05-01/2026-05-31`
- 训练行数：24
- 验证行数：12
- 训练 SKU 数：3
- 验证 SKU 数：3
- channel 数：4

## 指标结果

```json
{
  "topKTagHit@5": 0.8,
  "segmentTop1Hit": 0.667,
  "driverPrecision": 0.556,
  "matchNDCG@3": 0.754
}
```

## Quality Flags

- `low_confidence_tags_present`
- `low_sample_rows_present`
- `low_sku_count`
- `mock_aggregate_input`

## 不可用边界

- 当前输入是 mock aggregate smoke 数据，只能证明 cutoff backtest 链路可运行，不能声明真实样本泛化能力已验证。
- 当前只有 3 个 SKU，低于正式可解释回测建议的 30 个 SKU。
- 当前只有 3 个 `timeWindow`，满足 smoke 最低要求，但低于正式可解释回测建议的 6 个窗口。
- 真实样本接入后仍需重新运行，并只输出聚合指标和脱敏 ID。
