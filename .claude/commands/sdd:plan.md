---
description: "Phase 3 (Plan): write the architecture Plan (deep modules + testing strategy) onto the feature page"
argument-hint: "F-AREA-NNN"
context: fork
agent: planner
---

<!-- Generated from SDD playbook §7.4 (+ §6.3 template) — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

You are running **Phase 3 (Plan)** of the LexiAI SDD playbook on `$ARGUMENTS`.

**Embedded — do NOT fetch from Notion:** the plan template `@.claude/sdd/plan-template.md` and the
data-source IDs `@.claude/sdd/data-sources.md`.
**Fetch live:** the feature spec (the page body), the Tech spec sections it cites, and the
`lexi-ai/` code that grounds the plan.

## Steps

1. **Re-read the feature spec** (`$ARGUMENTS`) end to end — goal, scope, ACs, the `Reflects:`
   pointer.
2. **Run a capability + design sweep first, then produce the plan.** Before locking any decomposition,
   run the sweep in `@.claude/prompts/capability-sweep.md` across the subsystems *and* the core design
   decisions this feature turns on — **both legs**: platform capabilities (leg A) and the
   design/structure recognition map `@.claude/agent-patterns/design-heuristics.md` (leg B). Do not
   settle for the first workable structure — surface the deepest platform + design option, weighed.
   Then fill `@.claude/sdd/plan-template.md`: the sweep drives the **Module decomposition** (decompose
   per `@.claude/rules/deep-modules.md` — prefer *deep modules*, apply its taste gate, flag shallow
   wrappers for redesign), and its **findings block goes into the plan** (criteria → chosen approach,
   naming the native primitive *and* the abstraction that houses it → trade-offs incl. second-order
   consequences → **where you deliberately declined a seam/abstraction, and why**). The **Testing
   strategy** (external behavior to test per module, the prior art in `lexi-ai/` to imitate, what's
   deliberately left untested) is mandatory.
3. **Cite the Tech spec section** behind every architectural choice. Architecture **not yet** in the
   Tech spec → prefix it **`proposal:`** (it must be approved before Phase 4).
4. **Sequence the work** into ordered steps — each step becomes exactly one Phase-4 task. Aim for
   5–15 steps; >20 means the feature is too big — say so and recommend a split.
5. **Write the plan into a collapsible "Plan" toggle** inside the Notion feature page (Notion MCP;
   consult `notion://docs/enhanced-markdown-spec` for toggle syntax if unsure). Set the feature
   **`Status = In design`**.
6. **End with one line:** `Plan drafted for $ARGUMENTS. New tech-spec proposals: <list | none>. Next: /sdd:tasks $ARGUMENTS.`

## Do not

- Do **not** write code. (It's denied to you by tool policy anyway.)
- Do **not** create task rows — that's Phase 4 (`/sdd:tasks`). Stop at the ordered step list.
- Do **not** fetch the plan template / data-source IDs from Notion — they're embedded above.
