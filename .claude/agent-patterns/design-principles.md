# Design principles — this repo's recurring structural moves

**On-demand reference** (pointer-loaded from `/sweep`; NOT auto-loaded). Generic design theory —
Ousterhout, SOLID, GRASP, the GoF patterns — the model already knows is deliberately omitted; this
keeps only how those moves land **in this codebase**, as anchors `/sweep` can point at. Structure
earns its place only when it removes more complexity than it adds, and **deleting a forwarding layer
or a one-implementation interface is as valid a move as adding a seam** — apply a move because you
can name the symptom it removes *here*, never because it looks "clean."

## Stratified design — each layer is a vocabulary you compose

The codebase is a stack of layers, each a **vocabulary** the layer above composes into features
(Abelson–Sussman; SICP §2.2.4): `platform` verbs ◄ `repositories` ◄ domain (`words`/`content`) ◄
`use-cases` ◄ `apps`. Build a feature as a **composition of the layer below** — reuse before writing,
so the further up you build the less fresh code you add.

- **Reuse first, library before ours.** Reach for an existing primitive — the dependency's (Effect
  stdlib, Drizzle, Postgres; tested, documented, lighter) via the reach-for-the-primitive catalogs
  (`effect-stdlib`, `postgres-capabilities`, `type-fest`), then ours (`@kotodama/utils`). Hand-rolling
  what a dep already gives is the anti-pattern.
- **Compose your own on top.** New logic is small units over those primitives — bare `Effect.fnUntraced`
  with deps on `R` combined by `pipe` (not threaded params), behaviour stacked as `Layer` decorators
  (`…Resilient`/`…Timed`) — each reading as a DSL over the layer below.
- **Extract late (the asymmetry).** A shared abstraction earns its place only on the third real repeat
  of a *knowledge* (not a shape) — "duplication is cheaper than the wrong abstraction" (Metz); one
  caller ⇒ inline. This keeps compounding positive instead of coupling everything.

## Recurring moves

- **Decorator = a single-tag layer at wiring, no props** — `AiServiceResilient`,
  `WordGenerationServiceTimed` wrap the same tag; retry/timeout/tracing never tangle into core logic.
- **Swap seam = a `Context` tag; new behaviour = a new layer at `main.ts`** (OCP/DIP) — `ContentEngine`
  mock↔real; never an `if` inside core, never a dependency constructed in a use case.
- **A fake must honour the tag's full contract** (LSP) — this repo removed its in-memory queue fake
  because it diverged; suites use the real LocalStack layer.
- **Bound wrappers narrow ports** (ISP) — business code yields `JobsQueue.send(body)`, never the
  multi-queue `QueueClient` base it delegates to.
- **Put the computation where the data is** (information expert) — the aggregate in Postgres (`FILTER`,
  a trigger-tally), the invariant in the Schema/`CHECK`, not a loop above.
- **A cross-row shape with a discriminant no column stores → a view/read model at the edge**, its
  leaves derived from the entities.
- **Null object = a no-op layer** (`UnusedStorage`); **builders = blessed constructors** (`stagePatch.*`).
- **One caller ⇒ no abstraction** (YAGNI) — inline it; add a seam the day a real second impl appears.
