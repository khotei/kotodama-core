<!-- Plan /sdd:plan writes into the feature's Plan (kept as part of the Feature). Re-sync on change. -->

# Plan template

What `/sdd:plan` writes into the **Plan** toggle on the feature page — the feature's *how* sketch
(models, schemas, contracts), kept **as part of the Feature**. The two load-bearing sections are
**Module decomposition** (prefer deep modules — narrow interface, rich implementation) and
**Testing strategy** — don't drop them.

```markdown
# Plan — <feature title>

## Goal recap
(One sentence — what success looks like for this feature.)

## Architecture sketch
- Components touched (cite the repo path / existing module)
- New components introduced
- Diagram (mermaid or ASCII)

## Module decomposition (deep modules)
- The major modules to build or modify. For each prefer a *deep module* — substantial functionality behind a simple, stable, testable interface. Note each module's public interface and what it hides.
- Flag shallow modules (thin wrapper / leaky interface) for redesign.

## Data model deltas
- New tables / columns / enums (with types)
- Migration plan (zero-downtime? backfill?)

## API / contract changes
- New / modified endpoints or function signatures
- Request / response schemas (TypeScript or JSON)
- Error contract

## Sequencing
1. Step 1 (becomes one Task sub-item)
2. Step 2 (becomes one Task sub-item)
... each step is one task.

## Testing strategy
- What to test: the external, observable behavior of each module — not implementation details.
- Which modules get tests (happy + failure path), and the prior art in this repo to imitate.
- What is deliberately left untested, and why.

## Risks
| Risk | L | I | Mitigation |
|---|---|---|---|

## Out of scope (for this plan)
- ...
```

## Kotodama notes

- **Ground every architectural choice in the repo** — cite the existing code / module to imitate
  (the repo is the source of truth for *how*; there is no Notion "Tech spec"). New architecture not
  yet in the repo → prefix `proposal:`; a `proposal:` is approved before `/sdd:tasks`, not a settled
  decision.
- **The Plan is part of the Feature.** It stays on the feature page (models / schemas / contracts as
  a design sketch). On request, those contracts are realised as **code without implementation**
  (types / schemas / interfaces, no bodies) on a branch — the contract committed before the fill.
- **Sequencing aims for 5–15 steps.** >20 means the feature is too big — split it. Each step becomes
  exactly one Task sub-item in `/sdd:tasks`.
- **Do not create task sub-items here** — that's `/sdd:tasks`. The plan stops at the ordered step list.
