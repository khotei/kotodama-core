# Deep modules (how to decompose) — with taste

**Always-loaded rule.** This encodes the design philosophy from John Ousterhout's *A Philosophy of
Software Design*, with SOLID/GRASP as **lenses, not laws**. Apply it whenever writing, reviewing, or
refactoring code here. It describes **how to decompose** code — it sits on top of, not instead of,
the project's style/lint conventions. Same family as `@.claude/rules/comments.md` (code says *what*,
prose says *why*) and `@.claude/rules/claude-md.md` (docs cache what code can't).

**The single goal: reduce complexity.** Complexity is anything about the structure that makes the
system hard to understand or change. It shows up as (1) *change amplification* — one logical change
touches many places; (2) *cognitive load* — how much you must hold in your head to make a change;
(3) *unknown unknowns* — it's not obvious what you must change or know. **Optimize for the reader**;
code is read far more often than written.

## The taste gate (apply before invoking any rule below)

Cargo-culting a principle is itself a smell. Before applying *any* rule here — or DRY, SRP, a GRASP
role — do three things:
1. **Name the concrete complexity symptom** it removes *here* (which of change-amplification /
   cognitive-load / unknown-unknowns, and how).
2. **Weigh what it adds** — an interface, a layer, an indirection, boilerplate.
3. **Apply only if it removes more than it adds.** If it's a wash, leave the code and say so.

**Never split solely to shorten.** **Design it twice** before committing a non-trivial interface.
**Surface — don't silently apply — changes that fight a local convention;** pick the lower-complexity
option and name the tradeoff.

## 1. Prefer deep modules

A "module" is any unit with an interface and a hidden implementation: function, method, class, package.
- **Interface** = everything a caller must know to use it correctly — signature, return values, side
  effects, ordering/timing, errors. This is the *cost* the module imposes on everything else.
- **Implementation** = the work; the *benefit*, and it should be hidden.

**Maximize functionality per unit of interface.** A *deep* module hides a lot behind a small
interface; a *shallow* one's interface is large relative to what it does. Between two designs, pick
the **simpler interface even if its implementation is more complex** — pull complexity downward.
> Mental model: the module is a rectangle. Area = functionality. Width of the top edge = interface
> cost. Want tall and narrow.

## 2. Do NOT split code just to make functions short

"Functions must be tiny" is rejected. Length is not a defect. A split is worth it only when **each
piece is itself deep and understandable independently.** Before extracting, check:
- Does the new piece have a clean, narrow interface? If it needs many params, or the caller must know
  its internals, the split made it worse — leave it inline.
- Must the two pieces be **read and changed together** to be understood? Then they're *conjoined* —
  keep them together.
- Am I splitting to hit a line/complexity target? Not a reason.

A 60-line method doing one cohesive thing behind a clean signature beats six 10-line methods that
leak details into each other.

## 3. Each module owns one design decision (information hiding)

A module *encapsulates a piece of knowledge* — a file format, a protocol, a caching/dedup policy — so
it lives in exactly one place.
- **Red flag — information leakage:** one design decision reflected in two+ modules, so changing it
  edits both. If two files always change together, the knowledge belongs in one.
- **Red flag — temporal decomposition:** structure mirrors *order of execution* (read → process →
  write as three classes) instead of grouping by knowledge. Group by what's *known*, not *when* it runs.

## 4. Interfaces make the common case trivial

- The most frequent usage needs the least code and fewest decisions; push rare options to optional
  params or separate calls.
- Prefer **somewhat general-purpose** interfaces over many special-purpose ones. `insert(text)` /
  `delete(range)` is deeper than `deleteSelectionAndShiftCursor()`. General-purpose ≠ speculative
  features — it means not *over-specializing* the ones you do need. (The opposite trap is just as
  real: a fully-configurable `find(opts)` that warps its return type and leaks query semantics is
  *shallow*, not flexible.)

## 5. Different layer, different abstraction

Each layer should *change* the abstraction, not relay it.
- **Red flag — pass-through method:** does little but call another with the same signature; adds
  interface cost, zero benefit. Give it real responsibility or delete it and let the caller go direct.
- **Red flag — pass-through variable:** an arg threaded through many layers only the bottom uses.
  Deliver it another way (context object, or compute where needed).

## 6. Define errors out of existence

Exceptions and special cases are interface complexity. Reduce them:
- **Define away:** design semantics so the "error" can't occur — a delete on a missing key is a
  no-op; **absence is `Option.none`, not an error channel**; a substring that clamps instead of throws.
- **Mask:** handle low, don't propagate. **Aggregate:** handle many cases in one place, not at every
  call site.

Throwing is sometimes right, but each exception is a thing every caller must now know. In Effect:
`Effect.fail` only for what the caller can genuinely handle (a tagged domain error); `Effect.die` for
impossible states; capture deps at `Layer` build so a service's `R` channel is `never`.

## 7. Comments describe what code cannot

Capture the *why*, invariants, units, the contract a caller relies on — never restate the code. An
interface comment must let someone use the symbol **without reading the body**; if you can't write
one, the interface is too complex — redesign it. Full discipline: `@.claude/rules/comments.md`.

## 8. Design it twice

For anything non-trivial, sketch two genuinely different interface designs before committing —
comparing is the fastest route to a deeper one. For a refactor: state the current interface's cost,
then propose the deeper alternative (new signature/usage first, implementation second).

---

## Review checklist (a diff or a file)

- [ ] Deep — small interface, meaningful functionality — or a shallow wrapper?
- [ ] Can I write a one-sentence interface comment that lets someone use it without the body?
- [ ] Does any single design decision leak across modules?
- [ ] Pass-through methods or variables to collapse?
- [ ] Anything split into pieces that now must be read together?
- [ ] Does the common-case caller need more setup/params than it should?
- [ ] How many exceptions/special cases does the interface expose — can any be defined away?
- [ ] Does each layer offer a *different* abstraction than the one below?

## How to apply here

1. Identify the **interface** vs **implementation** of each module touched; estimate its depth.
2. Name the specific symptom (change amplification / cognitive load / unknown unknowns) and the rule
   it violates.
3. Propose as *current interface cost → deeper interface* — signature/usage first, implementation second.
4. Don't propose splits whose only justification is shortening.
5. Flag, don't auto-apply, changes that conflict with a local convention — surface the tradeoff.

> **Not universal law.** This is one well-argued school. The small-objects tradition (Sandi Metz,
> "prefer duplication over the wrong abstraction") sometimes pulls the other way. When a rule here
> clashes with a clear local convention or a genuinely simpler small-object design, say so rather than
> applying it dogmatically — that's the taste gate at the top.
