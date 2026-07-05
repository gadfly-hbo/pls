# Controller Review Checklist

## Scope

- Task: `<task or issue>`
- Domain: `<domain>`
- Handoff: `<handoff path or message>`

## Boundary

- [ ] Changed files are inside the assigned domain or explicitly approved.
- [ ] Shared files were not modified without a controller-written contract.
- [ ] No unrelated refactor, cleanup, dependency, or formatting churn was introduced.

## Contracts

- [ ] API/schema/model/event/UI contracts still match their source of truth.
- [ ] Any contract drift is documented as a change request.
- [ ] Shared terminology matches `CONTEXT.md`.
- [ ] New terminology has controller approval.

## Data And Safety

- [ ] Product data rules were read and preserved.
- [ ] Sensitive data handling matches product policy.
- [ ] External model/API calls follow the allowed data boundary.

## Implementation

- [ ] Error handling is explicit.
- [ ] Types are specific and avoid broad `any`.
- [ ] Cross-domain communication uses the approved adapter, API, or contract.
- [ ] Runtime behavior was checked when typecheck/build cannot prove correctness.

## Validation

- [ ] Required commands were run.
- [ ] Failures are explained with relevant output.
- [ ] Skipped checks have a reason.
- [ ] UI changes have visual or browser evidence when applicable.

## Decision

- [ ] Approved.
- [ ] Changes requested.
- [ ] Blocked pending controller/user decision.

## Notes

- `<Risks, follow-up tasks, or ADR/context updates needed>`
