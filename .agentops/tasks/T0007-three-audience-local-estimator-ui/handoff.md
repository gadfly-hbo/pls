# T0007 Handoff

## What Changed

完成 controller 返修要求的两项修订：

1. **显式“确认列映射”门槛**：
   - 文件解析或列映射变更后，状态为“未确认”。
   - 新增“确认列映射”按钮；只有用户点击确认后，才根据当前标签列/占比列构建并校验行级 segments，同时显示“行级输入”表格、错误列表和“渠道与专家先验”面板。
   - 未确认时，“计算三大人群”按钮及其所在面板不渲染，彻底阻止计算。
   - 更新 E2E：在 CSV/Markdown/XLSX/非法输入/无后端请求/390px 溢出测试中，均断言确认前 calculate 按钮不存在，确认后才可进行后续操作。

2. **类型精确化**：
   - `CHANNEL_SYSTEM` 从 `Record<ThreeAudienceChannel, string>` 改为 `Record<ThreeAudienceChannel, NativeSegmentSystem>`。
   - 在调用 `estimateSemirThreeAudienceShares` 时移除 `as any` 强制转换，保持模型输入类型约束。

未复制算法，未扩大范围，未修改 `apps/web/tsconfig.app.json`。

## Files Changed

- `apps/web/package.json`：`xlsx@^0.18.5` 依赖。
- `apps/web/package-lock.json`：同步更新。
- `apps/web/src/utils/three-audience-local-parser.ts`：文件解析、列候选、严格校验、模型复用入口。
- `apps/web/src/pages/ChannelObjectLibrary.tsx`：新增“三大人群”Tab、显式列映射确认、精确类型。
- `apps/web/e2e/three-audience-local-estimator.spec.ts`：7 条定向 E2E，含确认门槛断言。
- `docs/notes-viz.md`：T0007 完成状态。

## Validation

1. `cd apps/web && npm run build`：通过。
2. `cd apps/web && npm run lint`：通过。
3. `cd apps/web && npx playwright test e2e/three-audience-local-estimator.spec.ts`：7 passed。
4. `cd apps/web && npm run smoke`：31 项中 25 passed / 6 skipped。
5. `cd apps/model && npm run three-audience-share-contract-test`：通过 `{ ok: true, failures: [] }`。

## Risks

- 同前版 handoff：XLSX 按需加载 chunk 较大；文件夹选择器依赖 `webkitdirectory` 的浏览器支持。
- 无新增风险。

## Open Questions

- 无。返修要求已全部完成并通过验证。
