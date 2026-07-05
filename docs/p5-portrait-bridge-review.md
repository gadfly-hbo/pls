# P5 Portrait PLS Bridge Review

目的：冻结单品平台画像到 PLS taxonomy 的第一期 bridge 边界，确保 A/V/M 后续按同一口径消费 `plsBridge`，且不把平台长尾标签伪造成 PLS `tagId`。

## 1. 结论

结论：通过，但需收窄两个弱兴趣映射。

本卡复核依据：

- `docs/profile-taxonomy-v0.md`
- `docs/single-product-portrait-algorithm-contract.md`
- `docs/p5-portrait-baseline-acceptance.md`
- `apps/model/src/single-product-portrait.ts`

总控冻结：

- 第一期 bridge 只允许映射到既有 `profile-taxonomy-v0.md` tagId。
- 不新增 taxonomy tagId。
- 平台画像仍以 `labelType / label / share / tgi` 为主形态；PLS bridge 只是辅助投影，不替代平台画像。
- `bridgeCoverageRate` 低不是错误，必须在 API / UI 可见。
- 未映射标签必须进入 `unmappedPlatformLabels`，不得静默丢弃或改写成相近 tag。

本次代码口径调整：

- 保留性别、年龄段、消费能力、城市等级和少量明确兴趣映射。
- 移除 `抖音视频观看兴趣分类 / 创意 -> style.trendy`：语义过宽，不能证明等价于潮流个性。
- 移除 `抖音视频观看兴趣分类 / 科技 -> style.street`：PLS v0.1 没有科技兴趣 tag，映射到街头中性缺少语义依据。

## 2. 允许映射

| 平台维度 | 平台标签 | PLS tagId | 置信度 | 原因 |
|---|---|---|---:|---|
| `预测性别` | `女` | `demo.female` | 0.85 | 平台性别倾向与 PLS 女性倾向语义直接对应 |
| `预测性别` | `男` | `demo.male` | 0.85 | 平台性别倾向与 PLS 男性倾向语义直接对应 |
| `预测年龄段` | `18-19` | `demo.age_18_24` | 0.70 | 完全落在 PLS 18-24 岁年龄桶内 |
| `预测年龄段` | `20-23` | `demo.age_18_24` | 0.75 | 完全落在 PLS 18-24 岁年龄桶内 |
| `预测年龄段` | `24-30` | `demo.age_25_34` | 0.80 | 与 PLS 25-34 岁主力年龄桶高度重叠，24 岁边界偏差可接受 |
| `预测年龄段` | `31-35` | `demo.age_25_34` | 0.75 | 与 PLS 25-34 岁主力年龄桶高度重叠，35 岁边界偏差可接受 |
| `预测年龄段` | `36-40` | `demo.age_35_44` | 0.70 | 完全落在 PLS 35-44 岁年龄桶内 |
| `预测年龄段` | `41-45` | `demo.age_35_44` | 0.65 | 与 PLS 35-44 岁年龄桶高度重叠，45 岁边界偏差可接受 |
| `预测年龄段` | `46-50` | `demo.age_45_plus` | 0.65 | 落在 PLS 45 岁以上成熟客群范围内 |
| `预测年龄段` | `51-60` | `demo.age_45_plus` | 0.65 | 落在 PLS 45 岁以上成熟客群范围内 |
| `预测消费能力` | `高消费` | `price.premium` | 0.70 | 高消费能力与高客单 / 品质品牌偏好近似对应 |
| `预测消费能力` | `中消费` | `price.mid` | 0.70 | 中消费能力与中端主流价格接受度近似对应 |
| `预测消费能力` | `低消费` | `price.value` | 0.65 | 低消费能力只可弱映射为价格敏感 / 性价比倾向 |
| `城市等级` | `一线` | `demo.city_high_tier` | 0.75 | PLS 高线城市明确包含一线 |
| `城市等级` | `新一线` | `demo.city_high_tier` | 0.75 | PLS 高线城市明确包含新一线 |
| `城市等级` | `二线` | `demo.city_high_tier` | 0.60 | PLS 高线城市包含二线，但消费力差异较大，降低置信度 |
| `城市等级` | `三线` | `demo.city_lower_tier` | 0.60 | PLS 下沉市场包含三线及以下 |
| `城市等级` | `四线` | `demo.city_lower_tier` | 0.60 | PLS 下沉市场包含三线及以下 |
| `城市等级` | `五线` | `demo.city_lower_tier` | 0.55 | PLS 下沉市场包含三线及以下，平台城市等级颗粒更细 |
| `城市等级` | `六线` | `demo.city_lower_tier` | 0.55 | PLS 下沉市场包含三线及以下，平台城市等级颗粒更细 |
| `抖音视频观看兴趣分类` | `运动` | `style.sporty` | 0.55 | 运动兴趣可弱映射为运动休闲风格倾向 |
| `抖音视频观看兴趣分类` | `户外` | `style.sporty` | 0.55 | 户外兴趣可弱映射为运动休闲 / 机能场景倾向 |
| `抖音视频观看兴趣分类` | `时尚` | `style.trendy` | 0.55 | 时尚兴趣可弱映射为潮流个性风格倾向 |

消费规则：

- A 域保存 artifact 时应同时保存原始平台画像与 `plsBridge`，不能只保存 bridge 后标签。
- V 域展示时应把 PLS bridge 标为“PLS 标签投影”或同等弱化文案，不得显示为平台原始标签。
- M 域后续校准时可使用 bridge 标签做兼容输入，但真实目标仍应来自平台画像行。

## 3. 暂不映射

| 平台维度 / 标签 | 不可映射理由 | 后续处理 |
|---|---|---|
| `八大消费群体` 全量 | 平台人群包不是 PLS v0.1 的原子 tag，常混合年龄、职业、消费力和场景 | 保留在平台画像和 evidence，不进入 `ProfileTagScore` |
| `地域分布` 全量 | PLS v0.1 没有省份 / 区域 tag；地域不是城市等级 | 长尾画像折叠展示 |
| `城市` 全量 | PLS v0.1 没有城市 tag；具体城市不能映射为高线 / 下沉以外的标签 | 可由后续 X 单独评估城市 taxonomy |
| `电商品类成交偏好` 全量 | 品类偏好是商品类目，不是 PLS audience/style/price/occasion/intent/channel tag | 保留平台原始维度 |
| `电商品牌成交偏好` 全量 | 品牌偏好不是 PLS v0.1 taxonomy 维度 | 保留平台原始维度 |
| `触点互动偏好` 全量 | 触点互动与 PLS `channel.*` 可能相近，但缺少稳定平台字段定义和等价规则 | 暂不映射，等待平台字段字典 |
| `手机品牌` / `手机价格` 全量 | 设备属性不是 PLS v0.1 画像标签 | 保留平台原始维度 |
| `头条用户阅读兴趣分类` 全量 | 内容兴趣长尾，PLS v0.1 没有足够细分 tag | 保留平台原始维度 |
| `西瓜视频观看兴趣分类` 全量 | 内容兴趣长尾，PLS v0.1 没有足够细分 tag | 保留平台原始维度 |
| `抖音视频观看兴趣分类v2` 全量 | 与 v1 口径差异未冻结，不能复用 v1 bridge | 等字段字典后复核 |
| `抖音视频观看兴趣分类 / 创意` | 语义过宽，不等价于 `style.trendy` 或 `intent.try_new` | 暂不映射 |
| `抖音视频观看兴趣分类 / 科技` | PLS v0.1 没有科技兴趣 tag，映射到 `style.street` 缺少依据 | 暂不映射 |
| `美妆行业特色人群` 全量 | 行业特色人群不属于服装 P0 核心 taxonomy | 保留平台原始维度 |
| `电商消费频次` / `电商消费金额` 全量 | 消费行为强度不是当前 PLS price tag 的直接等价物 | 后续如需建模，先进入样本特征，不进 taxonomy |

## 4. Taxonomy 提案

本卡不新增 `tagId`。第一期不需要扩展 taxonomy 才能进入 A/V 联调。

后续如果真实样本显示平台兴趣长尾稳定贡献预测，可以单独提交 taxonomy 扩展提案：

| 候选方向 | 候选 tagId | 触发条件 |
|---|---|---|
| 科技 / 机能兴趣 | `interest.tech` 或 `style.tech_functional` | 至少 5 个真实样本中该兴趣与商品功能 / 人群画像稳定相关 |
| 创意 / 设计兴趣 | `style.design_forward` | 有明确平台定义，且可与 `style.trendy` 区分 |
| 触点互动 | `channel.content_interaction` 等 | 平台字段字典能证明与 `channel.*` 的关系 |
| 具体城市 / 区域 | `geo.*` | 产品决策确实需要城市级运营画像 |

新增 taxonomy 的最低材料：

- `tagId`、中文名、业务含义。
- 平台字段到 tag 的映射规则。
- 置信度建议。
- 展示边界和不可映射反例。
- 对现有 A/V/M contract 的影响评估。

## 5. 后续要求

- `PLS_BRIDGE_MAP` 只能包含本文“允许映射”表中的项。
- 任何未列入允许表的平台标签都必须进入 `unmappedPlatformLabels`，reason 使用“不在 approved bridge mapping”同等语义。
- A-P5-PORTRAIT-5 artifact schema 必须保留 `platformPortraitRows`、`plsBridge.predictedProfileTags`、`plsBridge.unmappedPlatformLabels` 和 `bridgeCoverageRate`。
- V-P5-PORTRAIT-6 第一屏可展示 PLS bridge 覆盖率和 mapped tags，但不能把 unmapped 作为错误。
- M-P5-PORTRAIT-7 不得用 bridge 后 tag 替代平台原始画像目标；bridge 仅作跨 PLS 旧模块兼容投影。
