# M-P1-E2 Account Fit Adapter

最近更新：2026-07-02

## 目的

为用户后续提供的号货匹配度算法预留稳定 adapter，并在正式公式到位前提供可解释 rule baseline，用于 contract test 和 A/V 后续对接判断。

## 使用方式

在 `apps/model/` 下运行：

```bash
npm run account-fit-contract-test
```

## Interface

实现文件：`apps/model/src/account-fit.ts`

稳定输入：`AccountFitAdapterInput`

- `skuId`
- `accountChannelId`
- `productProfileTags`
- `accountProfileTags`
- `productTopTags`
- `accountBenchmarkTopTags`
- `qualityMetadata`

稳定输出：`AccountFitDiagnostic`

- `fitScore`
- `fitConfidence`
- `recommendation`
- `matchedDimensions`
- `mismatchedDimensions`
- `positiveDrivers`
- `negativeDrivers`
- `adjustmentAdvice`
- `qualityFlags`

## Rule Baseline

当前 `diagnoseAccountFit` 按 `demo/style/price/occasion/intent/channel` 维度比较商品 Top tag 与账号基准 Top tag。

- 同一维度 Top tag 相同：记为 `matched`，进入 `positiveDrivers`。
- Top tag 不同：按 gap 记为 `partial` 或 `mismatch`，进入 `negativeDrivers` 和 `adjustmentAdvice`。
- 缺失商品或账号 Top tag：记为 `unmapped`，进入 `qualityFlags` 和 mapping review advice。
- 所有输出 drivers 和 advice 都引用 `tagId`，不输出 dashboard 原始字段值。

## Contract Test 场景

| 场景 | 目的 |
|---|---|
| matched | 强匹配，应输出 `priority_launch` 和多个 positive drivers |
| partial_mismatch | 部分错配，应同时输出 positive / negative drivers |
| high_priority_adjustment | 大 gap 错配，应输出 high priority adjustment advice |
| low_confidence | 低样本低覆盖，应输出低置信 quality flags，不能推荐 `priority_launch` |

## 替换点

用户提供正式公式后：

1. 保持 `AccountFitAdapterInput` 和 `AccountFitDiagnostic` 不变。
2. 替换 `diagnoseAccountFit` 内部评分、置信度和 advice 排序逻辑。
3. 保留 `account-fit-contract-test` 四类场景，并新增用户公式专属回归样例。
4. 输出仍必须可追溯到 `tagId`，不能输出黑盒结论。

## 红线

- 不读取或写入真实账号、订单、会员、DMP 成员或 ID 包明细。
- contract fixture 只使用 mock tag 分布和脱敏 ID。
- 当前 baseline 始终输出 `algorithm_pending_user_formula`，不得包装成正式号货匹配算法。
