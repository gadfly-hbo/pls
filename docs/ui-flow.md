# PLS P0 UI Flow - 工作台流程

> 归属：V 前端决策
> 状态：P0 设计
> 对应任务：V-P0-4

## 1. 整体信息架构

P0 核心流程分为两个主要工作台视图：
1. **新品预测工作台 (Product Prediction Dashboard)**：专注于单个新品录入与人群画像生成的展示。
2. **人货匹配工作台 (Channel Match Dashboard & Heatmap)**：基于预测画像，进行全量渠道或者选定渠道的匹配测算并生成运营动作。

## 2. 页面流转 (User Journey)

### 阶段一：录入新品 (Input)
- **触发**：用户点击“新增预测”或“录入新品”。
- **表单内容**：
  - 商品基础信息：款式 (SPU/SKU)、一级类目 (categoryLv1)、二级类目 (categoryLv2)、季节 (season)。
  - 商品特征 DNA：设计风格 (styleKeywords，如下拉选择“简约通勤”)、价格带 (priceBand) 等。
  - 视觉素材：上传商品企划图 / 实物图 (P0 后端目前使用 mock_asset，前端做上传控件占位即可)。
- **交互**：点击“开始预测画像” -> 调用 API `POST /products`，后接 `POST /predictions` (mode=sync)。

### 阶段二：预测结果视图 (Prediction Dashboard)
- **核心数据加载**：基于同步返回的 `ProductProfile`。
- **展示板块**：
  1. **Top 3 目标人群包 (Top Segments)**：卡片形式，展示每个 Segment 名称、置信度 (confidence)、占比排序 (rank)。
  2. **核心标签分布 (Profile Tags Radar/Bar)**：以可视化图表（雷达图或条形图）展示 `predictedProfileTags`，中文化显示调用 `GET /taxonomy`。
  3. **归因与驱动力 (Drivers)**：展示系统是如何推断出这些人群的（依据录入的商品 DNA 哪些点，例如“style.minimal”+“price.mid”）。
  4. **风险/警告提示 (Quality Flags)**：若返回 `low_training_sample` 或 `model_below_threshold`，需在明显位置透出黄牌警告。

### 阶段三：渠道匹配与热力图 (Channel Heatmap)
- **触发**：从预测结果页点击“去匹配渠道” 或 从顶导直接进入“人货匹配”。
- **任务生成**：若当前 `predictionId` 尚未生成匹配结果，先调用 `POST /matches` (`mode=sync`) 生成 `MatchResult[]`；若已存在匹配结果，再直接读取热力图。
- **视图结构**：
  - **左侧过滤区**：可筛选目标渠道类型（如短视频、直播、货架电商）和候选 SKU。
  - **核心区（匹配热力图）**：数据来源 `GET /matches/heatmap`。
    - X 轴：渠道列表 (Channels)
    - Y 轴：商品 (SKUs，包含当前刚预测的新品)
  - 单元格 (Cell)：显示匹配度 (matchScore)，以颜色深浅代表匹配度高低（例如，绿色越深匹配度越高；触发熔断的标灰/黑）。
- **单元格点击交互 (Drawer/Modal)**：
  - 点击某个匹配单元格，右侧滑出抽屉，请求 `GET /matches/{matchId}` 调取明细。
  - 抽屉内展示正向驱动标签 (`positiveDrivers`)、负向拦截标签 (`negativeDrivers`)，以及最终的运营建议（分货/投流/熔断）。

### 阶段四：导出匹配报告 (CSV)
- **触发**：在人货匹配热力图右上角点击“导出匹配报告”。
- **数据来源**：仅使用当前页面已加载的 `MatchResult` / `/matches/heatmap` 派生结果。
- **允许字段**：`skuId`、`channelId`、`matchScore`、`matchConfidence`、`recommendation`、`positiveDrivers.tagId`、`negativeDrivers.tagId`、`risks`、`generatedAt`。
- **禁止字段**：原始商品图、原始上传文件、DMP 原始字段值、用户级明细、审计原始 payload。

## 3. 设计原则约束
1. **工作台心智**：非营销着陆页，无多余视觉装饰，首屏直接暴露核心输入输出，紧凑展示。
2. **透明化（非黑盒）**：画像和匹配分数的旁边必须有“Explain”能力（通过 drivers 展示依据），让运营理解背后的原因。
3. **安全与红线提示**：在数据上传和录入区域必须有安全提示（“请勿上传含个人隐私或高敏经营机密的文件”）。
4. **导出安全**：CSV 导出只允许导出 S3/S4 派生结果和聚合展示字段，不允许导出 S0/S1 或原始输入内容。
