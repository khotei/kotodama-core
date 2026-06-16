# core/async-word-jobs — `@lexiai/core-async-word-jobs`

Word-generation orchestration + the build-state read — the core-layer sibling of
`repositories/async-word-jobs`. Three services own three independent decisions:

**`WordBuildRequester`** is the single, restricted creation path: it reads current state (via
`WordBuildState`) and the one-build-per-`(word, language)` policy is decided here and nowhere else —
seed the stage rows + enqueue for an absent word (`Option.none`) (or a retry of a `failed` one). Every
other state is a **typed failure**, not success data: a `running` word ⇒ `WordBuildInProgressError`
(HTTP 409), a `succeeded` word ⇒ `WordAlreadyReadyError` (HTTP 409), and unbuildable input ⇒
`InvalidWordInputError` (HTTP 422). **Input is normalized first** (`word-input.ts`'s `normalizeWordInput`,
colocated with this consumer): empty / symbol-only input fails `InvalidWordInputError` (no build) and a
phrase builds its first word. On a successful start it **returns the freshly-seeded `running`
`WordStateModel`** (the just-created resource); the three rejections + infra faults ride the error
channel (the handler surfaces the three domain errors, `die`s
infra). It only **enqueues** (`@lexiai/queue`); the worker consumes and runs the build.

**`WordBuildState`** is the pure build-state read (`get` method) behind `GET .../:word/state`. It is
the **imperative shell**: it fetches both halves — `WordsRepo.find` (the word row) +
`AsyncWordJobsRepo.findStages` (the stage half) — and hands
them to **`deriveWordState`**
(`word-state-derive.ts`), the pure (`R = never`) single author of the collapse — a `words` row ⇒
`succeeded`, a terminal stage failure ⇒ `failed`, active stages ⇒ `running`, nothing ⇒ `Option.none`
(`null` on the wire). The derivation being pure is why the four-state logic (ordering, first-terminal-
failure) is unit-tested without a database (`test/word-state-derive.test.ts`); `get` never writes.

**`WordBuilder`** is the pass runner the worker invokes (never the API): it advances each `wordJobStage`
in declaration order via `ContentEngine.produce` + `saveStages` (`stagePatch.running`→`.succeeded`), and on
`final_review` success **assembles the stage results, decodes them through `Word` at the write
boundary, then promotes via `WordsRepo.create`** — so a `words` row appears only after the whole pipeline
plus final review (the pristine invariant). A pass that fails (`ContentEngineError` → `not_found`/`failed`)
or exceeds its **per-pass bounded lifetime** (`Effect.timeoutOption` → `timed_out`) is recorded on its
stage as a typed `JobError` and stops the run (no promotion; later passes stay `pending`) — the `failed`
state the read surfaces. The lifetime is the `WordBuilderStageTimeout` `Context.Reference` (default 10s,
under the mock's 30s slow word; tests `Layer.succeed` a tiny budget — no layer factory); recovery is a
fresh request (a retry resets the stages), never an auto-retry. It
depends solely on the `ContentEngine` `Context.Service` — the swap boundary — never a concrete engine.

- **`WordStateModel`** (`word-state.model.ts`) — the build-state **read model** behind
  `GET .../:word/state`: a computed `succeeded|running|failed` union with no backing row (absence is
  `Option.none`, `null` on the wire — not a variant), owned by its producer `WordBuildState` (the one
  place the state derivation lives; the API contract composes it, never recomputes it). The discriminant
  is the job-status vocabulary. Its leaf payloads derive from `database/` entity / content schemas so
  they can't drift — `WordEntity` for `succeeded`,
  `StageProgress = AsyncWordJobEntity.pick(['stage','status'])`, `JobErrorView = JobError.omit(['cause'])`;
  only the discriminant + assembly are authored here. There is **no per-row model** — single rows are
  the `database/` rows/entities themselves (the old `AsyncWordJobModel` alias and `core/words`'
  `WordModel`/`toWord` were deleted; see `core/words/CLAUDE.md` for the decision).
- **Owns the build-dispatch message:** `WordBuildMessage` `{ language, word }` + its JSON codec
  (`@lexiai/queue` stays message-agnostic, so the message shape is authored here, beside its producer).
  The build errors (`WordAlreadyReadyError` etc.) live next to `WordBuildRequester`. The API contract imports
  these from here.
- **Convergence rests on a cross-file coupling:** the `stagePatch.pending` seed (`saveStages`' idempotent
  upsert on `UNIQUE(word, language, stage)` — no duplicate rows even under a concurrent race) **plus** the
  state guard (no second enqueue once a word is seeded). Re-seeding a `failed` word's rows is the retry
  path. Which stages a build comprises is decided here (`WordBuildRequester` maps `WORD_JOB_STAGES`),
  not in the repo.
- **Promotion validates at the write boundary:** the assembled content + provenance decodes through
  `@lexiai/database`'s `WordEntityInsert` (`createSelectSchema` + jsonb overrides — a runtime-typed
  insert schema; `drizzle-effect.md`); the readonly→mutable bridge to `WordContent` is a localized
  cast. `sourceVersions` provenance is a milestone
  placeholder (`{ model: 'mock', … }`) until the real engine threads its model/prompt through the boundary.
- **The async boundary is load-bearing:** `WordBuildRequester` + `WordBuildState` wire into `apps/api`;
  `WordBuilder` wires into `apps/worker`. They are deliberately separate services — do **not** merge them.
- **May import:** `core/*` (the `ContentEngine` boundary), `repositories/*`, `@lexiai/database`,
  `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`.
