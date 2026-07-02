# M-P1-D3 Unmapped And Structural Token Governance

最近更新：2026-07-02

## 目的

治理 `unmappedInputTokens` 中的结构 token 和未知业务 token，降低无效告警，同时避免把商品结构词伪装成人群画像标签。

## 使用方式

在 `apps/model/` 下运行：

```bash
npm run token-governance
```

## 分类口径

| 类型 | 处理方式 | 示例 |
|---|---|---|
| 商品结构 token | 忽略，不进入 `unmappedInputTokens`，不映射为画像 tag | `midi`, `dress`, `top`, `outerwear`, `chiffon` |
| 可映射画像 token 候选 | 进入 D/X review queue，不自动扩展 taxonomy | `premium -> price.premium` |
| 未知业务 token | 保留为未知项，统计频次和脱敏 SKU 示例 | 当前无 |

## 当前治理结果

- `midi` / `dress` 已按 M-P0-C3 决策作为结构 token 忽略。
- `chiffon` / `wool` 作为 `fabricType` 结构 token 忽略，不回流画像词表。
- `premium` 进入 review queue，原因是可能与已有 `priceBand = premium` / `price.premium` 重复，需要 D/X 判断是否需要 keyword mapping。
- 本轮不扩展 `docs/profile-taxonomy-v0.md`。

## 红线

- 不私自新增 taxonomy tag。
- 不把 `categoryLv2`、`lengthType`、`fabricType` 结构词映射成人群画像标签。
- 只输出 token 频次和脱敏 SKU ID，不输出真实商品标题或原始业务文案。
