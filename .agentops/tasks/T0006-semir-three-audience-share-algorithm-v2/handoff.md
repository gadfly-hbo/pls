# Handoff

## What Changed

- 新增 `apps/model/src/three-audience-share.ts`，实现对象无关的森马七渠道三大人群占比算法 `estimateSemirThreeAudienceShares()`。
- 支持抖音、天猫、京东、线下、唯品会、视频号、拼多多七类渠道，并严格校验 `channel/system` 一一匹配。
- 京东直接消费 T0005 冻结的 `JD_RECOMMENDED_CALIBRATED_MATRIX` 和 `semir_three_audience_v2.1.0-jd-calibrated`，未回退到 v2.0.2 partial-coverage 矩阵。
- 实现契约明确的别名/合并规则：抖音 `Z世代 -> genz`；视频号 `小镇中青年 -> 小镇中老年`、`精致妈妈/精致中产 -> 资深中产`；拼多多按契约合并到抖音八大体系。
- 未映射标签保留在 `unmappedSegments`，并输出 `unmapped_segments_present`；`coverage < 0.8` 输出 `low_coverage`，`0.8 <= coverage < 0.9` 输出 `partial_coverage`。
- 对总和在容差内的轻微溢出执行归一化，避免 `expertPrior` 软回填时出现负 `uncovered` 或负 share；京东额外接受来源四舍五入 `0.0001` 容差并归一化，四份 portable fixture 均可通过统一入口。
- 新增 `apps/model/src/three-audience-share-contract-test.ts`，覆盖七渠道矩阵单元、天猫确认样例、京东校准矩阵、拼多多/视频号合并、默认归一化、显式 prior 软回填、空覆盖、非法输入和结果合计误差。
- 针对 review 补充 regression：合法 `1.0000005` 输入 + prior 不产生负 share，四份 JD portable fixture 均通过统一入口，新增 `partial_coverage` 阈值 case。
- 更新 `apps/model/package.json`，新增 `three-audience-share-contract-test` script。
- 更新 `docs/notes-model.md`，记录实现、验证和边界。

## Files Changed

- `apps/model/src/three-audience-share.ts`
- `apps/model/src/three-audience-share-contract-test.ts`
- `apps/model/package.json`
- `docs/notes-model.md`

## Validation

- `cd apps/model && npm run typecheck` passed.
- `cd apps/model && npm run jd-three-audience-calibration-contract-test` passed with `ok: true`, `failures: []`.
- `cd apps/model && npm run three-audience-share-contract-test` passed with `ok: true`, `failures: []`.

## Risks

- 项目内 brief 指向的 `agentops/memory/opencode-algorithm.md` 仍缺失；已读取 canonical source `/Users/huangbo/Dev/AgentOps/coding-system/agentops/memory/opencode-algorithm.md` 后执行。
- 当前只实现对象无关算法，不定义渠道、店铺、账号画像结构，也不接入 Server / Frontend。
- 未实现趋势、行为强度、动态误差区间或置信度模型；行为层信号仍不得回写 A/B/C 份额。
- 专家先验只在调用方显式传入合法 prior 时软回填，不提供默认 prior。
- 非京东渠道仍遵守通用总和容差 `1e-6`；京东 `0.0001` 容差仅用于吸收已知来源表四舍五入误差，不代表允许任意超额分布。
- 工作区存在多处非本任务既有改动或未跟踪文件；本任务未回滚、未修改这些无关改动。

## Open Questions

- controller 是否批准 `three-audience-share.ts` 作为后续渠道画像适配层的算法入口？
- 后续 Server / Frontend 集成时，适配层需要另行冻结渠道对象画像结构、字段来源、时间窗口和导入契约。
