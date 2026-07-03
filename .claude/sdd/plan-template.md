<!-- Generated from SDD playbook §6.3 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

# Plan template (§6.3)

What `/sdd:plan` writes into the **Plan** toggle inside the feature page. The two load-bearing
sections are **Module decomposition** (prefer deep modules — narrow interface, rich
implementation) and **Testing strategy** — don't drop them.

```markdown
# Plan — F-NNN <title>

## Goal recap
(One sentence — what success looks like for this feature.)

## Architecture sketch
- Components touched (cite <Tech spec §>)
- New components introduced
- Diagram (mermaid or ASCII)

## Module decomposition (deep modules)
- List the major modules to build or modify. For each, prefer a *deep module* — substantial functionality behind a simple, stable, testable interface.
- Flag shallow modules (thin wrapper / leaky interface) for redesign. Note each module's public interface and what it hides.

## Data model deltas
- New tables / columns / enums (with types)
- Migration plan (zero-downtime? backfill?)

## API contract changes
- New / modified endpoints
- Request / response schemas (TypeScript or JSON)
- Error contract

## Sequencing
1. Step 1 (becomes Task T-NNN-001)
2. Step 2 (becomes Task T-NNN-002)
... each step is one task.

## Testing strategy
- What to test: the external, observable behavior of each module — not implementation details.
- Which modules get tests (happy + failure path), and the prior art in `lexi-ai/` to imitate.
- What is deliberately left untested, and why.

## Risks
| Risk | L | I | Mitigation |
|---|---|---|---|

## Cost & performance budget
- LLM tokens per request: ≤ X
- Image generations: ≤ Y/day per user
- p95 latency budget: <800 ms first paint / <5 s full content

## Out of scope (for this plan)
- ...
```

## LexiAI notes

- **Cite the Tech spec section** behind every architectural choice (`Tech spec §2.6`). Ground it in
  the existing `lexi-ai/` code where one exists to imitate.
- **New architecture not yet in the Tech spec → prefix `proposal:`** in the plan. A `proposal:` must
  be approved before Phase 4 (`/sdd:tasks`); it is not a settled decision.
- **Sequencing aims for 5–15 steps.** >20 steps means the feature is too big — split it. Each step
  becomes exactly one task in Phase 4.
- **Do not create task rows here** — that's `/sdd:tasks`. The plan stops at the ordered step list.
