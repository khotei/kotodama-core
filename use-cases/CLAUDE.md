# use-cases — `@lexiai/use-cases`

The **top application tier**, directly below `apps/*`: the user-flow composers that aggregate core
reads/decisions + repositories into a single entry an app binds. A use case owns **no primitive decision of
its own** — it wires the building blocks (`core/*` functions, the repo functions) for one end-to-end
flow, so the same flow is reachable from any entrypoint (API, worker, a future CLI/cron) without duplicating
it. The composers are **bare `Effect.fnUntraced` functions** (verb-first, role-noun-free), **not**
`Context.Service`s — they own no resource and are never test-swapped, so their dependencies ride the `R`
channel and the app entrypoint provides the boundary services. See "Service vs plain function" in
`.claude/rules/effect-conventions.md`.

- **`requestWordBuild`** (API, `POST .../build`) — the creation flow: normalizes the raw query
  (`parseWordInput` ⇒ the plain word, or `InvalidWordInputError` 422 — `@lexiai/core-words`), reads the
  current `{ word, stages }` snapshot (`readWordBuildSnapshot`, `@lexiai/core-async-word-jobs`), asks
  `ensureWordBuildable` (admission guard, `@lexiai/core-words`) whether it may be built, then performs the action itself — seed
  **every** stage `pending` (`upsertWordJobStages` + `stagePatch`) and enqueue one build
  (`JobsQueue`). **No resume:** a retry reseeds *all* stages from scratch — a regeneration re-runs the
  whole pipeline. **Returns the seeded rows** (no read-back); the API handler collapses the
  running view (`WordStateView` is a presentation shape owned at the edge, `apps/api`, not here). The
  three rejections + infra faults ride the error channel. Normalization + snapshot read + seed + enqueue
  are orchestration (a pure parse, a read, a repo write, a queue trigger), not primitive decisions — so
  they live here; the admission policy stays in core. `R = DB | JobsQueue` (the repos `yield* DB`, the
  enqueue needs the queue) — `apps/api` provides both.
- **`buildWord`** (worker) — manages the **job** (`async_word_jobs`) around the **word** (`createWord`,
  `@lexiai/core-words`). `createWord` generates the content and commits the `words` row uninterruptibly;
  this flow just **records the outcome** onto the stages. The clean ownership line: **`core` writes
  `words`, this use-case writes `async_word_jobs`**. **Build-outcome-integrity invariant:** a committed
  word is never journalled `timed_out` — the generation budget (the `WordGenerationServiceTimed` decorator
  wired at the worker entrypoint) bounds generation, which commits nothing, and `createWord` commits
  *after* that race resolves. **No live tracking, no resume:** the stages move in **one batch at the
  end** — success ⇒ every stage `succeeded`; `catchTag('WordGenerationError')` ⇒ its `succeeded`/`failed`
  passes recorded (passes that never ran stay `pending`); a generation timeout (`catchTag('TimeoutError')`)
  ⇒ every stage `timed_out` (no word). A retry regenerates the whole pipeline. The budget is **no longer
  owned here** — `WordBuildTimeout` (the `Context.Reference`) was retired; the timeout is a decorator
  layer at wiring, so `buildWord` only *reacts* to its `TimeoutError`. A transient DB error on the
  *success-path* journal write is swallowed (the word is ready — no redrive); a commit-path error
  propagates. `R = WordGenerationService | DB`.

- **No wiring lives here** (`effect-conventions.md`: never construct dependencies inside a use case).
  Each function *declares* its boundary requirements in `R`; `apps/*/main.ts` provides them (`DatabaseLive`,
  `JobsQueueLive`, the `ContentEngine` layer). So this package holds the flow, not the wiring — and no
  `provideService`-at-layer-build dance is needed, since nothing here is a service whose `R` must be `never`.
- **May import:** `core/*`, `repositories/*`, `@lexiai/database`, `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`. Nothing below (core, repositories, database, packages) may import
  **upward** into `@lexiai/use-cases` — enforced by Biome `noRestrictedImports` (see
  `.claude/rules/dependency-hierarchy.md`).
- **Why a tier, not a `core/` folder:** a user flow aggregates *across* core domains + repos; keeping
  the composers above `core` lets core stay single-decision building blocks and apps stay thin transport
  adapters. The building blocks stay in core: the admission guard `ensureWordBuildable` in `core/words`
  (a word-creation gate), the snapshot read `readWordBuildSnapshot` + the message schema in
  `core/async-word-jobs`; the view collapse (`collapseWordState` + `WordStateView`) lives at the API edge.
