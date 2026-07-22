# <Product Name> Context

## Purpose

Describe the product-wide domain model, shared vocabulary, cross-domain interfaces, and invariants that every agent must preserve.

## Glossary

| Term | Meaning | Avoid |
|---|---|---|
| `<DomainTerm>` | `<Precise definition>` | `<Ambiguous names>` |

## Domains

| Domain | Owns | Does Not Own |
|---|---|---|
| `<D>` | `<Files, concepts, runtime responsibilities>` | `<Out-of-bound areas>` |

## Cross-Domain Interfaces

| Upstream | Downstream | Contract | Source of Truth |
|---|---|---|---|
| `<Domain A>` | `<Domain B>` | `<Object, endpoint, event, schema>` | `<File or doc path>` |

## Global Invariants

- `<Invariant that must hold across domains>`
- `<Data safety, contract, taxonomy, or workflow rule>`

## Shared Data Rules

- `<What data can be read, transformed, sent to model calls, stored, or displayed>`
- `<What data requires explicit user approval or local-only processing>`

## Validation Baseline

| Change Type | Required Validation |
|---|---|
| `<API change>` | `<Command or smoke path>` |
| `<UI change>` | `<Command, browser check, or screenshot requirement>` |

## Change Control

- Terminology changes require controller approval.
- Cross-domain contract changes require a contract change request.
- Domain-private implementation details may change inside the assigned brief.
