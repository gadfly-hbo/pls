# M-P1-D4 Prediction Feedback Design

最近更新：2026-07-02

## 目的

定义预测结果与真实聚合画像的 feedback 回流机制，为后续纠偏、模型评估和版本治理打基础，并与 A 域预留的 `/predictions/{predictionId}/feedback` 对齐。

## Feedback 输入草案

```json
{
  "predictionId": "pred_demo_001",
  "skuId": "mock_sku_101",
  "timeWindow": "2026-05-01/2026-05-31",
  "source": "aggregate_dmp_feedback",
  "sourceType": "sanitized_aggregate",
  "sampleSize": 1200,
  "profileCoverageRate": 0.84,
  "actualProfileTags": [
    {
      "tagId": "demo.age_25_34",
      "score": 0.8,
      "confidence": 0.86,
      "source": "aggregate_dmp_feedback",
      "sampleSize": 1200,
      "timeWindow": "2026-05-01/2026-05-31"
    }
  ],
  "qualityFlags": ["sanitized_aggregate"],
  "redlineScanId": "scan_demo_001"
}
```

## 必填字段

| 字段 | 说明 |
|---|---|
| `predictionId` | A 域 prediction resource ID |
| `skuId` | 脱敏 SKU ID |
| `timeWindow` | 闭合时间窗口 |
| `actualProfileTags` | 真实聚合画像 tag 分布，只允许既有 `tagId` |
| `sampleSize` | 聚合样本量 |
| `profileCoverageRate` | 画像覆盖率 |
| `qualityFlags` | 质量与红线状态 |

## 不可接收数据

- 用户级、订单级、会员级、客户级明细。
- DMP 成员列表、ID 包、设备 ID、openId、广告 ID。
- 原始商品标题、原始评论、原始聊天或投放明细。
- 真实金额；只能使用指数、分层或聚合 rate。

## 进入训练与评估的口径

1. A 域接收 feedback 后先做 safety / taxonomy / quality gate。
2. 通过 gate 的 feedback 进入候选纠偏样本池，不直接覆盖线上结果。
3. M 域按 `predictionId + skuId + timeWindow` 关联预测输出和真实聚合画像，计算误差。
4. 同一 `timeWindow` 的 feedback 只能进入后续窗口训练，不能回灌当前窗口评估，避免未来信息泄漏。
5. 模型版本升级时记录训练窗口、feedback 批次、指标变化和不可用边界。

## 与 A 域契约边界

- A 域拥有 endpoint、持久化、workspace、权限、审计和 schema 变更。
- M 域只定义 feedback 的模型消费字段和评估口径。
- `/predictions/{predictionId}/feedback` 真正启用前必须由 X 总控冻结 API schema 和 DB schema。
