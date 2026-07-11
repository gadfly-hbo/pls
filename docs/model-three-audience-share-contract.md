# 森马三大人群占比算法契约 v2.1.0

## 目的

冻结对象无关的森马三大人群占比算法输入、输出、七渠道映射矩阵、覆盖率、可选专家先验和失败边界，供 `apps/model` 实现与后续渠道画像集成复用。

本契约不定义渠道对象画像的存储或 API 形态。

## 入口与版本

建议入口：

```ts
estimateSemirThreeAudienceShares(input: ThreeAudienceEstimateInput): ThreeAudienceEstimateResult
```

本地文件接入可使用只读标签识别入口：

```ts
isSemirThreeAudienceNativeLabel(channel: ThreeAudienceChannel, label: string): boolean
```

该入口必须复用同一渠道矩阵与已冻结别名规则，仅回答某标签是否属于该渠道可计算的原生人群体系；不得解析 share、归一化或产生估算结果。

固定版本：

```text
algorithmVersion = "semir_three_audience_v2.1.0-jd-calibrated"
```

同一版本内不得逐期调整矩阵。

## 输入契约

```ts
type ThreeAudienceChannel =
  | "douyin"
  | "tmall"
  | "jd"
  | "offline"
  | "vip"
  | "wechat_channels"
  | "pinduoduo";

type NativeSegmentSystem =
  | "douyin_eight"
  | "tmall_industry_six"
  | "jd_ten"
  | "offline_industry_six"
  | "vip_eleven"
  | "wechat_channels_seven"
  | "pinduoduo_ten";

interface NativeAudienceSegmentShare {
  label: string;
  share: number;
}

interface ThreeAudiencePrior {
  a: number;
  b: number;
  c: number;
}

interface ThreeAudienceEstimateInput {
  brand: "semir";
  channel: ThreeAudienceChannel;
  distribution: {
    system: NativeSegmentSystem;
    segments: NativeAudienceSegmentShare[];
  };
  expertPrior?: ThreeAudiencePrior;
}
```

约束：

1. `channel` 与 `system` 必须使用本契约指定的一一组合。
2. `share` 必须是有限数且位于 `0-1`。
3. 同一原生标签不得重复；不得由算法猜测合并重复行。
4. 所有渠道的输入总 share 可接受不超过 `1 + 1e-3 + 1e-12` 的来源表四舍五入误差，即约 `100.1%`；超过容差必须显式失败。
5. 当输入总 share 大于 1 但仍在该容差内时，算法必须先将全部输入 share 按总和归一化到 1，再进行标签映射。
6. `expertPrior` 三项必须位于 `0-1` 且合计满足 `abs(sum - 1) <= 1e-6`。
7. 基础属性、兴趣、消费力、折扣敏感度和其他行为信号不是本契约输入。
8. 本地文件上传可先按 `isSemirThreeAudienceNativeLabel` 筛除不属于所选渠道原生体系的行；被筛除行不参与重复、share 或总和校验，也不得进入估算输入。

渠道与体系：

| channel | system |
|---|---|
| `douyin` | `douyin_eight` |
| `tmall` | `tmall_industry_six` |
| `jd` | `jd_ten` |
| `offline` | `offline_industry_six` |
| `vip` | `vip_eleven` |
| `wechat_channels` | `wechat_channels_seven` |
| `pinduoduo` | `pinduoduo_ten` |

## 输出契约

```ts
interface ThreeAudienceShare {
  code: "A" | "B" | "C";
  name: "质感流行派" | "都市体面家" | "百搭优选客";
  share: number;
}

interface ThreeAudienceEstimateResult {
  status: "available" | "unavailable";
  algorithmVersion: "semir_three_audience_v2.1.0-jd-calibrated";
  channel: ThreeAudienceChannel;
  system: NativeSegmentSystem;
  mode: "covered_normalized" | "expert_prior_blended";
  coverage: number;
  uncovered: number;
  shares: ThreeAudienceShare[];
  unmappedSegments: NativeAudienceSegmentShare[];
  qualityFlags: string[];
}
```

规则：

- `available` 时 `shares` 固定按 A、B、C 顺序返回，合计为 1。
- `coverage === 0` 时返回 `unavailable`，`shares=[]`，不得伪造均分结果。
- `coverage < 0.8` 时至少输出 `low_coverage`。
- `0.8 <= coverage < 0.9` 时至少输出 `partial_coverage`。
- 存在不参与矩阵的输入标签时输出 `unmapped_segments_present` 并保留原标签与 share。
- 输出 share 保留未格式化数值；百分比和小数位属于调用方展示职责。

## 统一计算

对每个输入标签 `i`，矩阵权重为 `(wAi, wBi, wCi)`：

```text
当 input_total > 1 且处于 `1e-3 + 1e-12` 容差内：
x_people_i = input_share_i / input_total
否则：
x_people_i = input_share_i
```

```text
A_raw = Σ x_people_i × wAi
B_raw = Σ x_people_i × wBi
C_raw = Σ x_people_i × wCi
coverage = A_raw + B_raw + C_raw
uncovered = 1 - coverage
share_cov = normalize(A_raw, B_raw, C_raw)
```

无专家先验：

```text
share_final = share_cov
mode = covered_normalized
```

有专家先验：

```text
share_final = coverage × share_cov + uncovered × expertPrior
mode = expert_prior_blended
```

不得使用未提供的默认先验。不得把 behavior signals 写入 raw 公式。

## 七渠道矩阵

### 抖音八大

| 标签 | A | B | C |
|---|---:|---:|---:|
| 新锐白领 | 0.80 | 0.10 | 0.10 |
| genz | 0.45 | 0.05 | 0.50 |
| 精致妈妈 | 0.15 | 0.50 | 0.35 |
| 资深中产 | 0.10 | 0.70 | 0.20 |
| 都市蓝领 | 0.05 | 0.10 | 0.85 |
| 小镇青年 | 0.10 | 0.05 | 0.85 |
| 都市银发 | 0.05 | 0.30 | 0.65 |
| 小镇中老年 | 0.00 | 0.10 | 0.90 |

实现可接受已在来源文档明确的 `Z世代` 到 `genz` 标准化别名，但不得扩展未确认别名。

### 天猫与线下六大

| 标签 | A | B | C |
|---|---:|---:|---:|
| 潮流人群 | 1.00 | 0.00 | 0.00 |
| 高阶时尚 | 0.40 | 0.60 | 0.00 |
| 品质生活 | 0.00 | 1.00 | 0.00 |
| 大众实用 | 0.00 | 0.25 | 0.75 |
| 低价实惠 | 0.00 | 0.00 | 1.00 |
| 低价有颜 | 0.00 | 0.00 | 1.00 |

`tmall` 与 `offline` 共用权重，但 system 必须分别为 `tmall_industry_six` 与 `offline_industry_six`。

### 京东十大

| 标签 | A | B | C |
|---|---:|---:|---:|
| 都市Z世代 | 0.80 | 0.00 | 0.20 |
| 学生一族 | 0.270308 | 0.336340 | 0.393351 |
| 都市家庭 | 0.210938 | 0.563334 | 0.225728 |
| 都市中产 | 0.2000 | 0.8000 | 0.0000 |
| 小镇中产 | 0.159378 | 0.481636 | 0.358986 |
| 小镇青年 | 0.1000 | 0.0000 | 0.9000 |
| 小镇家庭 | 0.213047 | 0.165829 | 0.621123 |
| 都市蓝领 | 0.0500 | 0.0000 | 0.9500 |
| 银发一族 | 0.00 | 0.30 | 0.70 |
| 小镇中年 | 0.00 | 0.10 | 0.90 |

本表是 v2.1.0 京东校准后的唯一实现口径。京东十行矩阵每行 `A+B+C=1`；当十大靶群输入合计为 1 时，`coverage=1`，不再保留京东 uncovered 池。所有渠道统一吸收已确认来源表的四舍五入误差：输入合计在 `1 + 1e-3 + 1e-12` 以内时先归一化，再计算 coverage。矩阵由 `deriveJdTargetCalibratedMatrix()` 按固定先验、2025/2026 年均十大靶群 fixture、业务目标归一化和最小 L2 偏移 tie-break 确定性推导。业务展示目标为 2024 年 `22.5/32.6/44.8`（无原始十大靶群文件，仅记录目标）、2025 年 `22.1/32.9/45.0`、2026 年 `21.1/34.7/44.1`；2026 目标合计为 `99.9%`，拟合前归一化为 `21.12/34.73/44.14`。校准依据、候选矩阵与 fixture before/after 见 `docs/model-jd-three-audience-calibration.md`。

### 唯品会十一大

| 标签 | A | B | C |
|---|---:|---:|---:|
| 青年女士 | 0.22 | 0.28 | 0.50 |
| 中年女士 | 0.12 | 0.42 | 0.46 |
| 妈妈人群 | 0.12 | 0.42 | 0.46 |
| 年轻女士 | 0.38 | 0.05 | 0.57 |
| 青年男士 | 0.22 | 0.28 | 0.50 |
| 新生代女士 | 0.38 | 0.05 | 0.57 |
| 中年男士 | 0.12 | 0.52 | 0.36 |
| 年轻男士 | 0.38 | 0.05 | 0.57 |
| 新生代男士 | 0.38 | 0.05 | 0.57 |
| 银发男士 | 0.05 | 0.30 | 0.65 |
| 银发女士 | 0.05 | 0.30 | 0.65 |

### 视频号七大

输入标准化仅使用来源文档明确规则：`小镇中青年 -> 小镇中老年`，`精致妈妈` 与 `精致中产 -> 资深中产`。

| 标签 | A | B | C |
|---|---:|---:|---:|
| 新锐白领 | 0.80 | 0.10 | 0.10 |
| Z世代 | 0.45 | 0.10 | 0.45 |
| 资深中产 | 0.10 | 0.55 | 0.35 |
| 都市银发 | 0.05 | 0.50 | 0.45 |
| 都市蓝领 | 0.05 | 0.15 | 0.80 |
| 小镇青年 | 0.10 | 0.10 | 0.80 |
| 小镇中老年 | 0.00 | 0.20 | 0.80 |

### 拼多多十大

先执行来源文档明确的合并：

| 原始标签 | 合并后标签 |
|---|---|
| 都市白领 | 新锐白领 |
| 都市Z世代 | genz |
| 都市中产 | 资深中产 |
| 小镇银发 | 小镇中老年 |
| 学生 | genz |
| 小资中年 | 资深中产 |

其他同名标签直接保留。合并后使用“抖音八大”矩阵。

## 示例

天猫样例六大人群：

```ts
const input = {
  brand: "semir",
  channel: "tmall",
  distribution: {
    system: "tmall_industry_six",
    segments: [
      { label: "潮流人群", share: 0.3937 },
      { label: "大众实用", share: 0.2035 },
      { label: "低价实惠", share: 0.0437 },
      { label: "品质生活", share: 0.1217 },
      { label: "低价有颜", share: 0.0642 },
      { label: "高阶时尚", share: 0.0737 }
    ]
  }
} satisfies ThreeAudienceEstimateInput;
```

计算过程：

```text
A_raw = 0.3937 + 0.4 × 0.0737 = 0.42318
B_raw = 0.1217 + 0.6 × 0.0737 + 0.25 × 0.2035 = 0.216795
C_raw = 0.0437 + 0.0642 + 0.75 × 0.2035 = 0.260525
coverage = 0.9005
```

默认归一化结果约为 A `0.46994`、B `0.24075`、C `0.28931`。

## 测试与注意事项

contract test 至少覆盖：

1. 七类渠道各一个标准输入。
2. 天猫确认样例及未提前舍入。
3. 京东校准矩阵十行 row sum、合法十大靶群输入 `coverage=1`。
4. 拼多多合并与视频号合并。
5. 默认归一化与显式 prior 软回填。
6. 空覆盖、未知体系、channel/system 不匹配、重复标签、越界 share、渠道容差内归一化、总和超过渠道容差、非法 prior。
7. 未映射标签被保留且不进入份额公式。

注意：

- 测试数据只可来自两份算法文档或用户确认的天猫样例，不得编造业务基准。
- 为验证单行矩阵可使用“某一已定义标签 share=1”的数学 contract case，但必须标注为矩阵单元测试，不得描述为真实业务样本。
- 本契约中的 quality flags 是算法诊断，不是 Profile Tag。
- 后续渠道画像结构确定后，适配层负责把真实数据转换为本契约输入；算法层不得读取 UI、DB row 或导入包原始结构。
