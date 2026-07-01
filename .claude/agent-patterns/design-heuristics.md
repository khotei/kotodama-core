# Design heuristics — the "shape the abstraction first" catalog

**On-demand reference** (pointer-loaded from `.claude/rules/deep-modules.md` and the capability sweep;
NOT auto-loaded). This is the *structure* sibling of `.claude/agent-patterns/postgres-capabilities.md`:
that one pushes a **data-shape** concern into the engine; this one pushes a **design** concern into the
**type system and the module boundary**. Same reflex, one layer up — **before hand-writing a runtime
check, a boolean-flag combo, a forwarding layer, or a threaded argument, check whether a better
decomposition or domain model makes the whole class of code (or bug) disappear.**

Not a design textbook — a **recognition map**: left = the symptom you notice while designing or reading a
diff, right = the structural move that dissolves it. Scan the index; dive into the section. It is the
generative arm of the capability sweep (`.claude/prompts/capability-sweep.md`, leg B); the *filter* is
`.claude/rules/deep-modules.md` — apply its taste gate to every move here.

> **The taste gate is load-bearing, both ways.** Structure earns its place *only* when it removes more
> complexity than it adds. The two failure modes are symmetric: **under-structuring** (a runtime check
> where a type would do, a god-function hiding two decisions) and **over-structuring** (a layer that only
> forwards, an interface for one caller, a seam for a change that isn't coming). The gifted move is as
> often *deleting* structure as adding it — §13 exists for exactly that. Never apply a move here because
> it's "clean"; apply it because you can name the complexity symptom it removes *here*.

## Trigger index

| You notice while designing / in a diff | Reach for | § |
|---|---|---|
| Booleans that must not co-occur (`isLoading` + `hasError` + `data`) | Discriminated union over a tag (`Schema.Union`) | 1 |
| The same value re-checked / re-parsed in many places downstream | Parse, don't validate — constrain once at the boundary | 2 |
| An "error" that is really *absence*; null-checks everywhere | Define errors out of existence (`Option.none`, no-op, clamp) | 3 |
| An arg threaded through many layers only the bottom uses | Pass-through variable → context / compute-at-use | 4 |
| A method/layer that forwards to another with the same signature | Collapse the pass-through: real responsibility or delete | 5 |
| Two files/functions that always change together | One module owns the decision (information leakage) | 6 |
| Classes/modules mirror order-of-execution (read→process→write) | Group by knowledge, not by time (temporal decomposition) | 7 |
| A cohesive function split only to hit a line/complexity target | Keep it deep — don't split unless each piece is deep alone | 8 |
| Many special-purpose calls (`deleteSelectionAndShiftCursor`) | One general-purpose interface (`insert` / `delete(range)`) | 9 |
| Retry / timeout / tracing tangled into pure core logic | Decorator layer at wiring — single tag, no props | 10 |
| A shape assembled across rows + a discriminant no column stores | View / read model; leaves derived from entities | 11 |
| A hand-authored type restating a shape you already have | Derive it (`.pick`/`.omit`, `$inferSelect`, type-fest) | 12 |
| You reached for a pattern/interface/config but there's one caller | Delete the abstraction — inline the plain code (§ taste gate) | 13 |
| The obvious interface feels off but you've only tried one | Design it twice — sketch two different shapes, compare | 14 |

Domain examples use the lexi-ai schema: **`WordStateView`** (a computed shape with a synthesized
`succeeded|running|failed` discriminant no column stores; leaves are `WordEntity` /
`AsyncWordJobEntity.pick(['stage','status'])`), **`words`** (a row exists ⇔ the word is *ready*), and
**`async_word_jobs`** (one row per `(word, language, stage)`). Effect shapes follow
`.claude/rules/effect-conventions.md` and the `.claude/agent-patterns/effect-*.md` cheat-sheets.

---

## 1. Co-occurring booleans → discriminated union

Symptom: a state carried as several independent flags where only some combinations are legal
(`{ isLoading, hasError, data, error }` — but `isLoading && hasError` is nonsense). Every reader must
re-derive which combos are real; a wrong combo is a latent bug the type permits.

Move: **make illegal states unrepresentable** — one tagged union, so "exactly one of these, never two" is
enforced by the type, not by discipline. In this repo: `Schema.Union` of `Schema.TaggedStruct`s, decoded
with a `_tag` discriminant (as `WordStateView` does with `succeeded | running | failed`). The branches
carry *only* the fields legal in that state — `succeeded` carries `WordEntity`, `failed` carries the
error, and neither can carry the other's.

```
WordStateView = Schema.Union(
  Schema.TaggedStruct('succeeded', { word: WordEntity }),
  Schema.TaggedStruct('running',   { stages: StageProgress }),
  Schema.TaggedStruct('failed',    { error: JobErrorView }),
)
```

Removes: whole classes of "impossible" branches and the defensive `if`s that guard them. Adds: one union
type. Almost always a win when ≥3 flags interact. See `effect-schema.md`;
[make illegal states unrepresentable](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/).

## 2. Re-checked value → parse, don't validate

Symptom: the same raw input (a string that "should" be a language code, a number that "should" be
positive) is re-validated at every function that touches it, because its type is still `string`/`number`.
Validation is scattered and a missed call is a bug.

Move: **parse once at the boundary into a constrained type**, and let every downstream signature *demand*
that type — the check becomes unrepresentable-to-skip because you can't call the function without the
parsed value. In this repo: `effect/Schema` `decode` at the HTTP/queue edge produces the domain type;
core functions take `Language`, `WordRow`, `WordContent` — never a bare `string` they must re-trust.

Removes: every downstream re-validation and the "did someone check this already?" doubt. Adds: one parse
site and a named type. This is the type-safety hard default of the sweep expressed as a design move.
[Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) — canonical statement by Alexis King.

## 3. Absence-as-error → define errors out of existence

Symptom: a `NotFound`/`Missing` error channel threaded through many callers, each forced to handle a case
that is really just "nothing here." Or a substring/delete that throws on an edge instead of doing the
obvious benign thing.

Move: **design the error away.** Absence is `Option.none`, not a failure — `selectWord` returns
`Option<WordRow>`, so the caller pattern-matches instead of catching. A delete on a missing key is a
no-op; a clamp instead of a throw. Reserve `Effect.fail` for what a caller can *genuinely handle*
(a tagged domain error), `Effect.die` for impossible states. See deep-modules §6, `effect-errors.md`.

Removes: an error case from *every* caller's type. Adds: nothing — it's a semantics choice. Pure win
where the "error" is not actionable.

## 4. Threaded argument → context / compute-at-use

Symptom: a value passed down through many layers where only the bottom one reads it (a `traceParent`, a
request id, a config flag). Every intermediate signature carries a parameter it doesn't use — a
pass-through variable (deep-modules §5).

Move: **deliver it another way** — capture it in an Effect service/context provided at the layer boundary
(deps ride the `R` channel, provided once at the app entrypoint), or compute it where it's needed. This
is exactly the `infra-as-decorator-layers` reflex: cross-cutting state lives in the wiring, invisible to
the pure core. See `effect-context-and-layer.md`.

Removes: the parameter from every intermediate signature. Adds: a context tag. Win when the chain is ≥3
layers or the arg is cross-cutting.

## 5. Forwarding layer → collapse the pass-through

Symptom: a method/module that does little but call another with essentially the same signature — it adds
interface cost and zero abstraction (deep-modules §5).

Move: give it **real responsibility** (a different abstraction than the layer below — each layer must
*change* the abstraction, not relay it) or **delete it** and let the caller go direct. A repo function
that just wraps one `db` call *with the domain query* is real; one that renames a method is not.

Removes: a layer a reader must step through. Adds: nothing. This is over-structuring — see §13.

## 6. Two things that change together → one owner

Symptom: two files/functions that must be edited in lockstep for any change to work — a format known in
the writer *and* the reader, an enum duplicated in two layers. Information leakage (deep-modules §3): one
design decision reflected in two modules.

Move: **hoist the decision into one module** that owns that knowledge; the other consumes the exported
shape. In this repo this is why `database/` is the single author of the word vocabulary (content
schemas, value tuples, `WordEntity`) — `core/`, `use-cases/`, `apps/` consume it, so a shape change is
one edit, not a scavenger hunt.

Removes: change amplification. Adds: one dependency edge (downward, legal). Strong win — the smell "these
always change together" is the signal.

## 7. Execution-order structure → group by knowledge

Symptom: modules named for *when* they run — `WordReader`, `WordProcessor`, `WordWriter` — so a change to
the word format touches all three. Temporal decomposition (deep-modules §3).

Move: **group by what's *known*, not when it runs.** The knowledge of the word's shape belongs in one
place regardless of read/transform/write timing. Decompose by information hidden, not by pipeline stage.

Removes: change amplification across the pipeline. Adds: rethinking the boundary. Win whenever a single
concept is smeared across stage-named modules.

## 8. Split-to-shorten → keep it deep

Symptom: a cohesive 60-line function carved into six 10-line helpers that leak details into each other
and must be read together to be understood. The split was to hit a length target (deep-modules §2).

Move: **don't split unless each piece is itself deep** — a clean narrow interface, understandable
without its siblings. A 60-line function doing one cohesive thing behind one clean signature beats six
conjoined fragments. Length is not a defect.

Removes (by *not* splitting): the cognitive load of tracing between fragments. This is the most common
over-structuring reflex — resist it. See deep-modules-examples.md.

## 9. Many special-purpose calls → one general-purpose interface

Symptom: a family of narrow methods each baking in a specific use (`deleteSelectionAndShiftCursor`,
`insertHeaderAndReflow`) — shallow, and every new use needs a new method.

Move: a **somewhat general-purpose** interface the common cases compose from (`insert(text)`,
`delete(range)`) — deeper, fewer methods, the caller expresses intent. *Not* speculative generality: a
fully-configurable `find(opts)` that warps its return type is shallow, not flexible (deep-modules §4).
The target is *not over-specializing the uses you actually have*.

Removes: method count and the leaked policy in each. Adds: the caller composes. Win when you see 3+
near-duplicate special methods.

## 10. Cross-cutting concern in core → decorator layer

Symptom: retry, timeout, tracing, caching woven into pure business logic — the core function is now
half-policy, and the policy changes for its own reasons (a flaky dependency, an SLA).

Move: keep the core pure; wrap the boundary service in a **single-tag decorator layer at wiring** that
adds the concern transparently (no `Raw` tag, no props threaded through). This is the recorded repo
direction ([[infra-as-decorator-layers]], [[telemetry-invisible-to-app-code]]): infra is invisible to
app code, added at the `Layer` composition. See `effect-context-and-layer.md`.

Removes: policy from the core's signature and tests. Adds: a decorator layer at the entrypoint. Win for
any concern orthogonal to the domain.

## 11. Assembled-shape-with-discriminant → view / read model

Symptom: a presentation shape built across several rows plus a status that **no column stores**
(`succeeded|running|failed` synthesized from the jobs' states). Assembling it ad-hoc at each call site
duplicates the collapse logic.

Move: a named **view/read model** at the layer that assembles it — `.view.ts`/`View` at the API edge,
`.model.ts`/`Model` in core — whose **leaf payloads derive from entities/content schemas** so they can't
drift, with only the discriminant + assembly hand-authored (`WordStateView`; `StageProgress =
AsyncWordJobEntity.pick(['stage','status'])`). See `.claude/rules/naming.md`.

Removes: duplicated collapse logic and drift between leaves and storage. Adds: one model file. Win when
the shape is used in >1 place or the discriminant is non-trivial. **Not** for a 1:1 field-hide — that's
an alias, not a model (§13).

## 12. Restated type → derive it

Symptom: a hand-written interface that re-lists fields already defined by a table, an entity, or another
type — it drifts on the next rename (the "restating the code surface" smell).

Move: **derive, don't restate** — `Entity.pick([...])` / `.omit([...])`, Drizzle `$inferSelect` for the
row type, type-fest utilities for mapped/conditional transforms (consult `type-fest.md` before
hand-rolling). The derived type is a compile error when the source changes, not a silent lie.

Removes: a drift point. Adds: nothing. Near-always a win. See `type-fest.md`, `.claude/rules/naming.md`
(`<Name>Row` = `$inferSelect`).

## 13. Abstraction for one caller → delete it

Symptom: an interface with a single implementation, a config object read by one call site, a "strategy"
with one strategy, a layer inserted "for flexibility" with no second use in sight. Over-structuring —
speculative generality (deep-modules taste gate).

Move: **inline the plain code.** An abstraction pays off at the *second* caller; before that it's pure
interface cost and a reader indirection. Add the seam **when the second use arrives** (or when the task
explicitly names the coming change — see §14/step-1 of the sweep). Prefer duplication over the wrong
abstraction until the shape is known.

Removes: an indirection and a decision the reader must understand. Adds: nothing. This is the half of
taste most often skipped — **name where you *declined* to abstract in the sweep's findings.**

## 14. One design → design it twice

Symptom: you've written the first interface that worked and are about to commit it — but haven't compared
it to anything.

Move: for any non-trivial interface, **sketch two genuinely different shapes and compare** (deep-modules
§8) — comparison is the fastest route to a deeper design. State the obvious interface's cost, then the
alternative — signature/usage first, implementation second. Ousterhout's own Tk example: the second
design won.
([design it twice](https://blog.pragmaticengineer.com/a-philosophy-of-software-design-review/))

Removes: settling for the first-draft interface everyone else pays for forever. Adds: minutes of design
time. Do it for every interface others will depend on.
