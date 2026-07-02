# notes-viz

## 0. 当前状态

最近更新：2026-07-02（V-P0-D1 总控归档）

进度：

- 已产出工作台流程文档 `docs/ui-flow.md`。
- 已产出决策建议与输出字段设计 `docs/decision-output.md`。
- `V-P0-4` 已通过 X 总控终审。
- `V-P0-B4` (前端 MVP 工作台骨架) 已通过 X 总控终审，基于 Vite + React-TS 搭建，包含默认 mock API，并已验证真实 A 域 API 的 `/products`、`/predictions`、`/matches`、`/matches/heatmap`、`/matches?skuId=` 联调路径。
- X-P0-B5 复验真实后端模式通过：Dashboard、预测结果、heatmap、匹配详情抽屉、avoid 熔断建议均可展示；截图见 `/tmp/pls-xp0b5-frontend-smoke.png` 与 `/tmp/pls-xp0b5-frontend-avoid.png`。
- `V-P0-C2` (真实后端 heatmap 稳定渲染) 已完成：已实现 heatmap 独立稳定的联合 key `skuId-channelId`；增加了显式的 loading、empty 和 error 状态控制；确保了抽屉获取详情时能够按时间排序取到最新的 match 明细。
- `V-P0-D1` (前端 UI Token 化与设计语言刷新) 已完成并通过总控审核：已迁移至 neutral/dark 双色主题，状态颜色变量收口，实现了跨端自适应的多栏工作台面；修复了 `html lang="zh-CN"` 问题，`color-mix` 代替硬编码的 `rgba`，API 契约、CSV 字段和数据红线保持不变。

下一步：

- 配合 X 总控做 P0-C 总体验收 smoke 和 P1 准入判断。

阻塞：

- 无。

开放问题：

- 无。

---

## 决策沉淀

- **前端交互深度**：P0 阶段直接基于基础组件库搭建低保真 MVP，不设计高保真视觉和动画，重点走通数据展现和流程。
- **UI Token 化与主题**：采用 `hsl` 中性色（neutral）变量方案建立设计系统；通过切换 `html.dark` class 并持久化至 `localStorage` 来实现跨端深浅色模式切换；状态色的透明度运算统一采用原生 CSS `color-mix`（如 `color-mix(in srgb, var(--destructive) 50%, transparent)`）替代硬编码 rgba，以支持主题自适应。
- **数据导出**：基于运营实际痛点，一期保留浏览器端 CSV 纯文本导出能力；导出仅限热力图和 `MatchResult` 派生结果字段，不导出原始输入、DMP 原始字段值或审计原始 payload。

---

## 前端域原则

- 首屏应是工作台，不做营销落地页。
- 画像输出必须同时展示结论、置信度、依据和风险。
- 匹配热力图必须能解释为什么匹配或不匹配。
- 不用“AI 黑盒建议”替代可执行运营动作。
