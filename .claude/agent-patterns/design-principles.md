# Design principles — the "shape the structure" catalog

**On-demand reference** (pointer-loaded from `/sweep`; NOT auto-loaded). A recognition map:
symptom in a design or diff → the structural move that dissolves it, drawn from Ousterhout
(*A Philosophy of Software Design*), SOLID, GRASP, and the classic patterns translated to this
functional/Effect stack.

> **The taste gate is load-bearing, both ways.** Structure earns its place only when it removes
> more complexity than it adds. The failure modes are symmetric: **under-structuring** (a runtime
> check where a type would do; a god-function hiding two decisions) and **over-structuring** (a
> layer that only forwards; an interface with one implementation; a seam for a change that isn't
> coming). Deleting structure is as gifted a move as adding it. Never apply a move because it is
> "clean" — apply it because you can name the complexity symptom it removes *here*.

## Recognition map

| Symptom | Move | Root |
|---|---|---|
| Booleans/nullables that must not co-occur (`isLoading` + `data` + `error`) | Discriminated union over a tag — make illegal states unrepresentable | domain modelling |
| The same value re-checked / re-parsed downstream | Parse, don't validate — constrain once at the boundary, pass the proven type | Alexis King |
| An "error" that is really absence; null-checks everywhere | Define errors out of existence — `Option`, a no-op, a clamp, an idempotent op | Ousterhout §10 |
| An arg threaded through layers only the bottom uses | Context (`R` channel) or compute-at-use — kill the pass-through parameter | Ousterhout §7 |
| A method/layer forwarding with the same signature | Collapse it: give it a real responsibility (e.g. own a binding) or delete it | Ousterhout §7 |
| Two files that always change together | One module owns the decision (information leakage) | Ousterhout §5 |
| Modules mirror order-of-execution (read→process→write) | Group by knowledge, not by time (temporal decomposition) | Ousterhout §5 |
| A cohesive function split only to satisfy a length taste | Keep it deep — split only if each piece is deep alone | Ousterhout §4/§9 |
| Many special-purpose methods (`deleteSelectionAndMoveCursor`) | One general-purpose interface; policy at the call site | Ousterhout §6 |
| Retry / timeout / tracing tangled into pure logic | Decorator layer at wiring — single tag, no props (this repo's `AiServiceResilient`, `…ServiceTimed`) | GoF decorator |
| A `switch` on a type tag repeated at several sites | Polymorphism: a handler record / union match at ONE site | GRASP polymorphism |
| Logic interrogating another module's data (feature envy) | Move the logic to the data's owner — or into the engine (SQL) / the type (Schema) | GRASP information expert |
| One change fans out over many modules (shotgun surgery) | Re-draw the boundary so one module hides that decision | GRASP protected variations |
| A shape assembled across rows + a discriminant no column stores | A view/read model at the edge; leaves derived from entities | this repo |
| A hand-authored type restating an existing shape | Derive it (`.pick`/`.omit`, `$inferSelect`, type-fest) | DRY-of-shape |
| A pattern/interface/config with exactly one caller | Delete the abstraction — inline the plain code | YAGNI |
| The obvious interface feels off but only one was tried | Design it twice — sketch two different shapes, compare signatures first | Ousterhout §11 |

## SOLID / GRASP, translated to this stack

- **SRP** = one module owns one *decision* (not "one function does one thing") — if you can't name
  the single decision a module hides, it hides none or two.
- **OCP / protected variations** = the swap seam is a `Context` tag; a new behavior is a new layer
  provided at the entrypoint, never an `if` added inside core (`ContentEngine` mock↔real).
- **LSP** = every union leaf / layer honors the tag's full contract — a fake that "mostly works"
  is a divergent double (this repo removed its in-memory queue fake for exactly that).
- **ISP** = bound wrappers narrow ports: business code yields `JobsQueue.send(body)`, never the
  multi-queue `QueueClient` (the base) it delegates to.
- **DIP** = depend on tags, wire concretions at `main.ts`; dependencies ride the `R` channel —
  never constructed inside a use case.
- **Information expert** = put the computation where the data is — often *below* the app: the
  aggregate in Postgres (`FILTER`, a trigger-tally), the invariant in the Schema/CHECK, not a loop.
- **Controller** = edges stay thin translators (decode → call → encode); policy constants may live
  at the edge, logic may not.
- **Pure fabrication** = a repo function / codec exists for cohesion even though the domain has no
  such noun — fine; it still owns exactly one decision.

## Classic patterns, functional form

Strategy → a function/config parameter or a tag. Decorator → a single-tag layer wrapping the same
tag. Adapter → a `Client` wrapper over an SDK. Facade → a use-case composer over core + repos.
Null Object → a no-op layer (`UnusedStorage`). Builder → blessed constructors (`stagePatch.*`).
Observer → a stream/queue, not callbacks. Template method → a generator fn taking step functions.
If naming the pattern requires a class hierarchy the stack doesn't have, the functional form above
is the intended reading.

## Philosophy (the tie-breakers)

- **Simplicity** = the fewest moving parts a reader must hold at once — not the fewest lines.
- **Least astonishment**: the obvious reading of a signature must be what it does; a surprising
  contract needs a rename before it needs a comment.
- **Demonstrated need (YAGNI)**: introduce a seam the day a real second impl/swap appears — track
  needs, not possibilities.
- **Pull complexity downward**: it is better for the implementation to suffer than every caller —
  a deep module absorbs the mess behind a small interface.
