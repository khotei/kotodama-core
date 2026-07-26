<!-- Feature body /sdd:specify fills a Work row (Type=Feature) with. Model owner: «Template — Features» in the hub. Re-sync on change. -->

# Feature page template

The body `/sdd:specify` fills when it creates a **Work** row (`Type = Feature`). A Feature carries
only the **why** — Goal · Why · Outcomes · Scope · EARS acceptance criteria · Open questions ·
References. It does **not** describe *how* the code is built: architecture, data model, API shape,
and the design system live in the **repo**, never restated here. The *how* sketch (models, schemas,
contracts) is added later by `/sdd:plan` as the feature's **Plan**; the work splits into **Tasks as
sub-items** via `/sdd:tasks`.

```markdown
> **Appetite:** Small (1-2d) | Batch (1-2w) — how much the work is *worth* (a budget, not an estimate) · **Priority:** P0 | P1 | P2 | P3
> Set the two dials in the row's properties before writing. If the work outgrows the appetite, cut scope — don't extend the budget.
---
## Goal
One paragraph, plain language. The end state in operational terms: what can a user (or the system) *do* on completion that they couldn't before? State the outcome, not the mechanism.

## Why this exists
One paragraph. The strategic / product rationale — why this matters now, for whom, and what compounds if it's done well (or wrong). Link the persona(s) and the product "why" (a Knowledge doc) it serves. If you can't say why, it isn't ready to shape.

## Outcomes (Definition of Done)
- What is TRUE when this ships — observable from outside the implementation, not per-task checks.
- Aim for 4–8. If you have 15, this is two features.

## Scope
### In
- What this feature deliberately includes.
### Out
- What it deliberately excludes (name the successor feature if deferred). The out-list protects the appetite.

## Acceptance criteria (EARS)
Each observable from outside and verifiable by a fresh-context agent or a single command. Number them; Tasks reference them by ID.
- [ ] **AC-1** — WHEN <trigger> THE SYSTEM SHALL <observable response, with a threshold>.
- [ ] **AC-2** — WHILE <state> THE SYSTEM SHALL <observable response>.
- [ ] **AC-3** — IF <error condition> THEN THE SYSTEM SHALL <graceful response>.

## Open questions
- [ ] <A question that would block or reshape the work — what's blocking it, who decides.> Resolve or explicitly defer before moving to Shaped; a silent unknown is a bug.

## References
- **Product "why":** the Knowledge doc(s) this serves (brief, research, personas).
- **Playbooks:** any playbook a task must follow.
- **Repo:** the codebase is the source of truth for *how* — link a path or commit if a reader must open it to act; do not restate architecture, schema, or design tokens here.
```

## Acceptance-criteria notation (Kotodama)

Write ACs in **EARS** — *WHEN \<event\> THE SYSTEM SHALL \<behavior\>* (also WHILE / WHERE /
IF–THEN). EARS only — do **not** mix in Gherkin's *Given/When/Then* (a different system). Each AC
must be observable from outside the implementation and checkable by a fresh-context agent or a
single command. See `@.claude/rules/sdd.md`.
