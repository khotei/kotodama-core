# core/async-word-jobs — `@lexiai/core-async-word-jobs`

The **job-side building blocks of the word-build flows** — the core-layer sibling of
`repositories/async-word-jobs`. The flows themselves (`requestWordBuild`, `buildWord`) live one tier up
in **`@lexiai/use-cases`** and *compose* the single-purpose pieces authored here. This package owns the
pieces that **work with the job state**: the snapshot read (`readWordBuildSnapshot`) and the build-dispatch
message — nothing else.

> **The build-admission guard moved to `core/words`.** `ensureWordBuildable` + its two 409 errors
> (`WordAlreadyReadyError` / `WordBuildInProgressError`) are a **word-creation gate** (sibling to
> `parseWordInput`), so they live with the word — see `core/words/CLAUDE.md`. This package only **reads**
> the job state for that decision; the decision itself is word-domain, not job machinery.

> **The view collapse + its `WordStateView` moved to `apps/api`** (`word-state-collapse.ts` +
> `word-state.view.ts`): the stepper view is presentation, so it lives at the edge that owns the wire
> contract (see `apps/api/CLAUDE.md`).

**`readWordBuildSnapshot`** (`word-build-snapshot.ts`) is the one imperative read behind both the admission
policy and the API view. It pairs `selectWord` (`@lexiai/repositories-words`) + `selectWordJobStages` (the job repo) into a
`{ word, stages }` snapshot — the ready `WordRow` (if any) + its stage rows — which the two pure consumers
take DB-free: `ensureWordBuildable` (`core/words`) and `collapseWordState` (the API). The snapshot is an
**inline structural shape**, not a named type — each consumer declares `{ word, stages }` itself. The fetch
lives **here** because querying the job stages is "working with jobs"; the pure word-build decision and the
view live elsewhere. A plain `Effect.fnUntraced` function (its `DB` requirement rides `R`), not a
`Context.Service` — see "Service vs plain function" in `.claude/rules/effect-conventions.md`.

- **Owns the build-dispatch message:** `WordBuildMessage` `{ language, word }` + its JSON codec
  (`@lexiai/queue` stays message-agnostic, so the message shape is authored here). `requestWordBuild`
  (`@lexiai/use-cases`) encodes it to enqueue; the worker decodes it. Round-trip-tested in
  `test/word-build-message.schema.test.ts`.
- **No per-row model** — single rows are the `database/` rows/entities themselves (the old
  `AsyncWordJobModel` alias and `core/words`' `WordModel`/`toWord` were deleted; see `core/words/CLAUDE.md`
  for the decision).
- **Convergence rests on a cross-file coupling:** the `stagePatch.pending` seed (`upsertWordJobStages`'
  idempotent upsert on `UNIQUE(word, language, stage)` — no duplicate rows even under a concurrent race)
  **plus** the policy guard (`ensureWordBuildable`, `core/words`, admits no second build once a word is
  running). Re-seeding a `failed` word's rows is the retry path. The seed + enqueue + which stages a build
  comprises (mapping `WORD_JOB_STAGES`) live in `requestWordBuild` (`@lexiai/use-cases`), **not** here and
  **not** in the repo — this package owns the snapshot read (`readWordBuildSnapshot`) and the message.
- **The async boundary is load-bearing:** the flows that consume these blocks are deliberately separate —
  `requestWordBuild` (`@lexiai/use-cases`) wires into `apps/api`, `buildWord` (`@lexiai/use-cases`)
  into `apps/worker`. Do **not** merge them, and do not pull the flows back down into this package.
- **May import:** `core/*`, `repositories/*`, `@lexiai/database`, `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`, `@lexiai/use-cases` (the tier above — that would invert the layer).
