---
description: "Phase 3 (Plan): write the architecture Plan (deep modules + testing strategy) onto the feature page"
argument-hint: "KO-N"
context: fork
agent: planner
---

<!-- Compiled from the Kotodama Notion hub + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 3 (Plan)** of the Kotodama SDD loop on `$ARGUMENTS`.

> **The plan is the feature's contract surface — the one heavy review, spent here where nothing is
> built yet, so nothing is redone.** Phase-4 tasks only *conform* to it. When a later task
> **disproves** the surface (the shape was wrong), revise the surface and let `Blocks`/`Blocked by`
> re-derive the not-yet-built dependent tasks — the exception, not the routine.

**Embedded — do NOT fetch from Notion:** the plan template `@.claude/sdd/plan-template.md` and the
data-source IDs `@.claude/sdd/data-sources.md`.
**Fetch live:** the feature spec (the page body), the Knowledge docs it cites, and the
`kotodama-core/` code that grounds the plan.

## Steps

1. **Re-read the feature spec** (`$ARGUMENTS`) end to end — goal, scope, ACs, References.
2. **Produce the plan** — fill `@.claude/sdd/plan-template.md`. The **Module decomposition**
   (prefer *deep modules* — narrow interface, rich implementation; flag shallow wrappers for
   redesign; don't lock the first workable structure when the decomposition is non-obvious) and
   the **Testing strategy** (external behavior to test per module, the prior art in `kotodama-core/`
   to imitate, what's deliberately left untested) are mandatory. Record non-obvious trade-offs and
   where you declined a seam/abstraction, and why. Call out any Drizzle schema change + its migration
   as an explicit step.
3. **Cite the repo path / existing module** behind every architectural choice (the repo is the
   source of truth for *how* — there is no Notion Tech spec). New architecture not yet in
   `kotodama-core/` → prefix it **`proposal:`** (it must be approved before Phase 4).
4. **Sequence the work** into ordered steps — each step becomes exactly one Phase-4 **Task
   sub-item**. Aim for 5–15 steps; >20 means the feature is too big — say so and recommend a split.
5. **Write the plan into a collapsible "Plan" toggle** on the feature (Work) page (Notion MCP;
   consult `notion://docs/enhanced-markdown-spec` for toggle syntax if unsure). Keep the feature
   **`Status = Shaped`**. On request, the plan's contracts are realised as **code without
   implementation** (Effect schemas / interfaces / types, no bodies) on a branch — the contract
   committed before the fill.
6. **End with one line:** `Plan drafted for $ARGUMENTS. New proposals: <list | none>. Next: /sdd:tasks $ARGUMENTS.`

## Do not

- Do **not** write code. (It's denied to you by tool policy anyway.)
- Do **not** create task sub-items — that's Phase 4 (`/sdd:tasks`). Stop at the ordered step list.
- Do **not** fetch the plan template / data-source IDs from Notion — they're embedded above.
