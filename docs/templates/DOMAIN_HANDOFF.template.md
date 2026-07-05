# Handoff: <Domain Name>

## Goal

`<One concrete outcome.>`

## Non-Goals

- `<What this agent must not solve.>`

## Domain Boundary

Responsible for:

- `<Allowed responsibility>`

Not responsible for:

- `<Out-of-bound responsibility>`

## Allowed Files

- `<path or glob>`

Do not edit:

- `<shared contract, other domain file, generated file, or sensitive path>`

## Inputs

| Source | Contract | Notes |
|---|---|---|
| `<Upstream domain>` | `<Object or endpoint>` | `<Required fields, source docs>` |

## Outputs

| Consumer | Contract | Notes |
|---|---|---|
| `<Downstream domain>` | `<Object or endpoint>` | `<Required fields, source docs>` |

## Shared Terms

- `<Term from CONTEXT.md>`

## Dependencies

- Blocking: `<Issue, file, contract, or user decision>`
- Parallel-safe: `<Task that can proceed at the same time>`

## Validation Required

- `<Command, smoke test, screenshot, schema check, or review step>`

## Handoff Back Format

Return:

- Completed items.
- Changed files.
- Validation run and result.
- Contract drift or change requests.
- Cross-domain impact.
- Risks and unverified areas.
- Controller decisions needed.
