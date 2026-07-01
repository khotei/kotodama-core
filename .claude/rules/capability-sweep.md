# Capability + design sweep (run it before you lock a design)

**Always-loaded rule.** Before you **lock any non-trivial design decision or write non-trivial code** —
in a plan, a research pass, or an ad-hoc coding session — run a **capability + design sweep**. Do not
jump to the first working approach, and do not merely validate a design you were handed. Aim for the
solution a very experienced engineer would reach for — but every recommendation must be **researched and
weighed**, never unvetted cleverness. Same family as `.claude/rules/deep-modules.md` (this rule *finds*
candidates; deep-modules *filters* them).

The sweep has **two legs, and the best answer usually weaves them:**
- **Leg A — capability:** *what does the platform already do for this?* — the native primitive you don't
  reinvent (Postgres/Drizzle/Effect/HttpApi/…). Reach-for catalogs:
  `.claude/agent-patterns/postgres-capabilities.md`, `effect-stdlib.md`, `type-fest.md`, the vendored
  `repos/`, then official docs (verify version).
- **Leg B — design:** *what structure does the problem itself want?* — the abstraction, seam, and domain
  model a gifted engineer originates, not just picks off a shelf (make illegal states unrepresentable,
  *parse don't validate*, put the seam only where it will change, cross-cutting concerns as decorator
  layers). Recognition map: `.claude/agent-patterns/design-heuristics.md`.

**The taste gate cuts both ways** (`.claude/rules/deep-modules.md`): a candidate — native *or* structural
— earns its place only if it removes more complexity than it adds *here*. So flag reinvention in both
directions: naive code reinventing a native feature, **and** an abstraction/pattern added where flat code
is honest. **Naming where you *declined* a seam is as required as naming where you added one** — knowing
where structure is *not* worth it is the harder half. For any non-trivial interface, **design it twice**
before committing; weigh the second-order consequences (failure modes, cost of the next feature,
coupling).

**When it fires vs. doesn't.** It fires wherever a design is being chosen — `/sdd:plan`, `/sdd:research`,
and normal implementation. It naturally stays quiet where no design is locked — a pure what/why capture
(`/sdd:specify`), a rename, a trivial mechanical edit — the trigger condition self-limits, so this does
**not** license designing during a what/why phase.

**Full protocol + output format** (the findings block to emit *before* code — criteria → recommendation
naming the primitive *and* its abstraction → trade-offs incl. consequences → where you declined a seam →
a citation per claim): `.claude/prompts/capability-sweep.md`. The `/sweep` command runs it on demand.
