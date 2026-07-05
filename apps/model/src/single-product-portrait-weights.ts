/**
 * Configurable rule weights for the single-product portrait rule baseline.
 *
 * The baseline remains a manually-tuned, explainable rule engine. This module
 * exposes the scalar weights so that M-P5-PORTRAIT-7 can evaluate alternative
 * weight sets with leave-one-out validation without turning the engine into a
 * trained neural network.
 */

export interface GenderRuleWeights {
  femalePrior: number;
  neutralPrior: number;
  evidenceWeight: number;
}

export interface AgePriorWeights {
  base: Record<string, number>;
  categoryShifts: Record<string, number>;
  fitBoosts: Array<{
    condition: "fitType" | "styleKeyword" | "fabricSignal";
    value: string;
    label: string;
    amount: number;
  }>;
  evidenceWeight: number;
}

export interface SpendingPriorWeights {
  base: { high: number; mid: number; low: number };
  fabricHighBoost: number;
  styleHighBoost: number;
  functionMidBoost: number;
  styleLowBoost: number;
  evidenceWeight: number;
}

export interface CityPriorWeights {
  base: { high: number; low: number };
  styleHighBoost: number;
  styleLowBoost: number;
  categoryHighBoost: number;
  evidenceWeight: number;
}

export interface ConsumerGroupPriorWeights {
  base: Record<string, number>;
  boosts: Array<{
    type: "styleKeyword" | "fabricSignal" | "functionSignal" | "gender";
    value: string;
    group: string;
    amount: number;
  }>;
  evidenceWeight: number;
}

export interface LifeStagePriorWeights {
  base: Record<string, number>;
  boosts: Array<{
    type: "styleKeyword" | "fabricSignal" | "categoryGender";
    value: string;
    stage: string;
    amount: number;
  }>;
  evidenceWeight: number;
}

export interface InterestMappingWeight {
  keyword: string;
  labelType: string;
  label: string;
  weight: number;
}

export interface IpFunctionRuleWeight {
  matchAny: Array<{ feature: "ipSignal" | "functionSignal"; value: string }>;
  labelType: string;
  label: string;
  weight: number;
}

export interface FitToAgeRuleWeight {
  fitPattern: string;
  label: string;
  score: number;
  evidenceWeight: number;
  rationale: string;
}

export interface AnchorWeakPriorWeights {
  multiplier: number;
  evidenceWeight: number;
}

export interface SingleProductPortraitRuleWeights {
  gender: GenderRuleWeights;
  agePrior: AgePriorWeights;
  spendingPrior: SpendingPriorWeights;
  cityPrior: CityPriorWeights;
  consumerGroupPrior: ConsumerGroupPriorWeights;
  lifeStagePrior: LifeStagePriorWeights;
  interestMappings: InterestMappingWeight[];
  ipFunctionRules: IpFunctionRuleWeight[];
  fitToAgeRules: FitToAgeRuleWeight[];
  anchorWeakPrior: AnchorWeakPriorWeights;
}

export function defaultSingleProductPortraitRuleWeights(): SingleProductPortraitRuleWeights {
  return {
    gender: {
      femalePrior: 0.72,
      neutralPrior: 0.5,
      evidenceWeight: 0.4,
    },
    agePrior: {
      base: {
        "18-19": 0.05,
        "20-23": 0.18,
        "24-30": 0.35,
        "31-35": 0.22,
        "36-40": 0.12,
        "41-45": 0.05,
        "46-50": 0.02,
        "51-60": 0.01,
      },
      categoryShifts: {
        短袖T恤: -1,
        卫衣: -1,
        POLO衫: -1,
        开襟毛衫: 1,
        长袖衬衫: 1,
        茄克: 1,
        半裙: -0.5,
        牛仔长裤: -0.5,
      },
      fitBoosts: [
        { condition: "fitType", value: "修身", label: "24-30", amount: 0.08 },
        { condition: "styleKeyword", value: "显瘦", label: "24-30", amount: 0.08 },
        { condition: "styleKeyword", value: "学院", label: "20-23", amount: 0.08 },
        { condition: "styleKeyword", value: "休闲", label: "20-23", amount: 0.08 },
        { condition: "styleKeyword", value: "通勤", label: "24-30", amount: 0.06 },
        { condition: "fabricSignal", value: "品质保暖", label: "31-35", amount: 0.06 },
        { condition: "fabricSignal", value: "品质亲肤", label: "31-35", amount: 0.06 },
      ],
      evidenceWeight: 0.25,
    },
    spendingPrior: {
      base: { high: 0.25, mid: 0.45, low: 0.3 },
      fabricHighBoost: 0.12,
      styleHighBoost: 0.08,
      functionMidBoost: 0.08,
      styleLowBoost: 0.08,
      evidenceWeight: 0.25,
    },
    cityPrior: {
      base: { high: 0.45, low: 0.55 },
      styleHighBoost: 0.12,
      styleLowBoost: 0.08,
      categoryHighBoost: 0.05,
      evidenceWeight: 0.25,
    },
    consumerGroupPrior: {
      base: {
        GenZ: 0.12,
        新锐白领: 0.22,
        精致妈妈: 0.15,
        都市蓝领: 0.12,
        小镇青年: 0.14,
        资深中产: 0.1,
        都市银发: 0.05,
        小镇中老年: 0.1,
      },
      boosts: [
        { type: "styleKeyword", value: "通勤", group: "新锐白领", amount: 0.1 },
        { type: "styleKeyword", value: "设计感", group: "新锐白领", amount: 0.1 },
        { type: "fabricSignal", value: "亲肤品质", group: "精致妈妈", amount: 0.1 },
        { type: "fabricSignal", value: "品质保暖", group: "精致妈妈", amount: 0.1 },
        { type: "styleKeyword", value: "学院", group: "GenZ", amount: 0.08 },
        { type: "styleKeyword", value: "休闲", group: "GenZ", amount: 0.08 },
        { type: "functionSignal", value: "功能户外", group: "都市蓝领", amount: 0.08 },
        { type: "styleKeyword", value: "工装", group: "都市蓝领", amount: 0.08 },
        { type: "styleKeyword", value: "复古", group: "小镇青年", amount: 0.06 },
        { type: "styleKeyword", value: "街头", group: "小镇青年", amount: 0.06 },
        { type: "styleKeyword", value: "高级", group: "资深中产", amount: 0.06 },
        { type: "gender", value: "男", group: "都市蓝领", amount: 0.04 },
      ],
      evidenceWeight: 0.25,
    },
    lifeStagePrior: {
      base: {
        单身: 0.2,
        新婚: 0.15,
        二人世界: 0.2,
        家有小学生: 0.1,
        家有中学生: 0.1,
        家有婴幼儿: 0.1,
        成熟期: 0.1,
        养老期: 0.05,
      },
      boosts: [
        { type: "styleKeyword", value: "通勤", stage: "二人世界", amount: 0.08 },
        { type: "styleKeyword", value: "设计感", stage: "二人世界", amount: 0.08 },
        { type: "fabricSignal", value: "亲肤", stage: "家有婴幼儿", amount: 0.06 },
        { type: "styleKeyword", value: "学院", stage: "单身", amount: 0.06 },
        { type: "styleKeyword", value: "休闲", stage: "单身", amount: 0.06 },
      ],
      evidenceWeight: 0.25,
    },
    interestMappings: [
      { keyword: "运动", labelType: "抖音视频观看兴趣分类", label: "运动", weight: 0.25 },
      { keyword: "户外", labelType: "抖音视频观看兴趣分类", label: "户外", weight: 0.2 },
      { keyword: "科技", labelType: "抖音视频观看兴趣分类", label: "科技", weight: 0.2 },
      { keyword: "设计感", labelType: "抖音视频观看兴趣分类", label: "创意", weight: 0.18 },
      { keyword: "复古", labelType: "抖音视频观看兴趣分类", label: "时尚", weight: 0.15 },
      { keyword: "通勤", labelType: "抖音视频观看兴趣分类", label: "职场", weight: 0.15 },
      { keyword: "甜美", labelType: "抖音视频观看兴趣分类", label: "美妆", weight: 0.12 },
      { keyword: "高级", labelType: "抖音视频观看兴趣分类", label: "汽车", weight: 0.1 },
    ],
    ipFunctionRules: [
      {
        matchAny: [
          { feature: "ipSignal", value: "科技国潮" },
          { feature: "functionSignal", value: "科技功能" },
        ],
        labelType: "抖音视频观看兴趣分类",
        label: "科技",
        weight: 0.25,
      },
      {
        matchAny: [
          { feature: "ipSignal", value: "科技国潮" },
          { feature: "functionSignal", value: "科技功能" },
        ],
        labelType: "八大消费群体",
        label: "GenZ",
        weight: 0.1,
      },
      {
        matchAny: [{ feature: "functionSignal", value: "功能户外" }],
        labelType: "抖音视频观看兴趣分类",
        label: "户外",
        weight: 0.2,
      },
      {
        matchAny: [{ feature: "ipSignal", value: "潮流联名" }],
        labelType: "抖音视频观看兴趣分类",
        label: "时尚",
        weight: 0.18,
      },
    ],
    fitToAgeRules: [
      {
        fitPattern: "修身",
        label: "24-30",
        score: 0.1,
        evidenceWeight: 0.1,
        rationale: "修身版型倾向24-30岁职场人群",
      },
      {
        fitPattern: "紧身",
        label: "24-30",
        score: 0.1,
        evidenceWeight: 0.1,
        rationale: "修身版型倾向24-30岁职场人群",
      },
      {
        fitPattern: "宽松",
        label: "20-23",
        score: 0.08,
        evidenceWeight: 0.08,
        rationale: "宽松版型倾向年轻休闲人群",
      },
      {
        fitPattern: "阔腿",
        label: "20-23",
        score: 0.08,
        evidenceWeight: 0.08,
        rationale: "宽松版型倾向年轻休闲人群",
      },
    ],
    anchorWeakPrior: {
      multiplier: 0.3,
      evidenceWeight: 0.1,
    },
  };
}
