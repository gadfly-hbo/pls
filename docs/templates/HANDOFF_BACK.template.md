# Handoff Back: <Domain Name>

## What Changed
- `<完成项1>`
- `<完成项2>`
- `<完成项3>`

## Files Changed
- `<path>`: `<具体改动>`
- `<path>`: `<具体改动>`

## Validation

| Check | Result | Notes |
|---|---|---|
| `<命令/检查项1>` | pass / blocked / skipped | `<关键输出/原因>` |
| `<命令/检查项2>` | pass / blocked / skipped | `<关键输出/原因>` |

## Risks
- `<风险点>`
- `<未覆盖边界>`
- `<回归风险>`

## Open Questions
- `<是否需要控制者决策>`
- `<是否依赖外部决策/信息>`

## Constraint Matrix

> 仅在涉及合同/API/持久化/并发/审计等高风险任务填写；不符合可写 `N/A`

| Brief Bullet | Invariant Family | Authority | Implementation | Positive Evidence | Negative Evidence | Waiver/Blocker |
|---|---|---|---|---|---|---|
| `<brief 条目>` | `<contract/read-model/...>` | `<文件/路径>` | `<实现路径>` | `<测试/命令/路径>` | `<负向用例/失败测试>` | `<none or waiver>` |

## Evidence Map

> 每个完成/覆盖 claim 需要可 grep 证据

| Claim | Evidence Type | Grep-able Evidence | Result |
|---|---|---|---|
| `<claim>` | test/source/command/waiver | `<test 名 / 文件路径 / 输出片段>` | `<pass/waived/blocked>` |

## Handoff Self-Audit

- `/agentops-handoff-self-audit`: `<PASS/FAIL/not run>`
- PASS evidence: `<测试名、命令输出、源码行号>`

## Memory Used

- `agentops/memory/<xxx>.md`: `<具体影响了哪一项决策>`

## Memory Candidates

- lesson_type: `<mistake|success|rule>`
- lesson: `<可复用经验>`
- evidence: `<task id / 命令输出 / 文件路径>`
- expires_at: `<YYYY-MM-DD|permanent>`
- review_by: `<who>/<date>`
- OR: `none`

## Contract Drift

- Original contract: `<path or section>`
- Actual implementation: `<一致/偏差>`
- Recommendation: `<accept/reject/defer/request change>`

## Cross-Domain Impact

| Domain | Impact | Required Action |
|---|---|---|
| `<Domain>` | `<影响>` | `<动作>` |

## Unverified Areas

- `<未验证项1>`
- `<未验证项2>`

## Controller Decisions Needed

1. `<待确认事项>`
2. `<边界/接口/发布决策>`
