# core/words — `@lexiai/core-words`

Word creation + input + build-admission policy. **There is no per-row word "model"** — backend code speaks the `database/`
shapes directly: `WordRow` (`$inferSelect`) flows through reads, and the wire contract composes
`WordEntity` (the runtime schema). The single-word read **`selectWord`** (`Option<WordRow>`; absence
is a value, never an error) lives one layer down in `@lexiai/repositories-words` next to `selectWords`,
**not here** — see `repositories/words/CLAUDE.md`. `core/async-word-jobs`' `readWordBuildSnapshot` (the
shell behind the build policy + the GET-state view) and `apps/api`'s `getWord` handler call it directly.

**`createWord`** (`word-creator.ts`) is the act of **word creation, end to end** — and **pure of
infrastructure**: generate the content (`WordGenerationService.generate`, `@lexiai/core-content`), which
returns the merged content **bundled with the engine's `sourceVersions`**, then **commit it
uninterruptibly** — decode through `WordEntityInsert` (a malformed assembly `die`s — impossible state for
a conforming producer), stamp the provenance, `upsertWords`. It owns one piece of knowledge: the
**pristine invariant** (a row appears *only* on full content). No retry, no wall-clock budget here — both
are decorator layers configured at the worker entrypoint (see the decision below). A plain
`Effect.fnUntraced`, not a service: its `WordGenerationService | DB` requirement rides `R`. `buildWord`
wraps it, recording the outcome onto `async_word_jobs` — keeping word *creation* (here) and job
*tracking* (there) separate.

> **Decision — generation budget is a decorator layer, not a `createWord` parameter (2026-06-29,
> infra-as-layer).** The straddle bug: a whole-build timeout wrapping the fused generate→commit could
> fire *during* the commit (`raceFirst` fixes `TimeoutError` the instant its sleep wins) and strand a
> committed word as `timed_out`. The fix moves the timeout off `createWord` entirely: generation is now a
> service (`WordGenerationService`, `@lexiai/core-content`) wrapped by a `WordGenerationServiceTimed(budget)`
> **decorator layer** at the worker entrypoint, so `generate` is timed *as a unit* and `createWord` just
> does `generate → uninterruptible(promote)` — the commit runs strictly *after* the timeout race resolves
> (closed by **scope**, not by `uninterruptible`). `createWord` lost its `buildTimeout` param and its
> `Effect.timeout`/`Duration` import; the `uninterruptible` stays only to defend the commit against an
> ambient interrupt (worker shutdown), not the straddle. Why a layer: it pulls all infra (retry +
> timeout) out of pure core and lets the budget/presets be chosen at wiring without threading props —
> same shape as `AiServiceResilient`. (Superseded the earlier same-day "`createWord` takes the budget,
> timeout inside" design, which superseded the whole-run `timeoutOption`/post-`if`.) Provenance now rides
> `generate`'s **result** (not a direct `ContentEngine.sourceVersions` read), so `ContentEngine` dropped
> out of `createWord`'s `R` entirely — one service in, no leak.

> **Decision — `core/words` now depends on `core/content`; `assembleWord` folded into `createWord`
> (2026-06-22, user-driven; supersedes the earlier "`core/words` never depends on `core/content`" rule).**
> Creation *is* generation + assembly; splitting them left the composition homeless in the top-level
> use-case, where nothing could reuse it. The standalone `assembleWord` (a content→row leaf) was
> **absorbed** into the creation logic — decode + upsert live inside `createWord`'s uninterruptible
> commit (see the 2026-06-29 decision above). The `core/words → core/content` edge is acyclic (content never
> imports words) and Biome-legal (the `core/**` glob bans only use-cases/apps). Cross-domain composition
> inside a domain package — accepted as the price of an explicit, reusable creation home, over deferring
> it to a use-case the user does not reuse.

**`word-input.ts`** owns **input normalization** — the pure `normalizeWordInput` (a raw query ⇒ the word
it targets: a phrase yields its first word, empty / symbol-only ⇒ `invalid`; the FE-shareable, unit-tested
rule) + `parseWordInput`, its Effect-channel adapter to `Effect<string, InvalidWordInputError>` (422). It
lives **here, not in `core/async-word-jobs`** — it is pure **word-identity** logic with zero build coupling
(imports only `effect`), so it belongs with the word entity, not the build machinery. Its only consumer
today is `requestWordBuild` (`@lexiai/use-cases`); the API contract imports `InvalidWordInputError` from
here for the `buildWord` endpoint's error union.

**`word-build-policy.ts`** owns the **build-admission guard** — `ensureWordBuildable`, the
one-build-per-`(word, language)` policy. A **word-creation gate** sibling to `parseWordInput` (input ⇒
422), it decides *whether a word may be created*, so it lives here with the word: the decision is
word-domain — it only **reads** the job state as evidence, never operates on jobs (the snapshot fetch,
`readWordBuildSnapshot`, stays in `core/async-word-jobs` — querying stages is "working with jobs"). **Pure**:
it takes just the inline `{ word, stages }` snapshot and **succeeds** (void) for a buildable word (absent,
or a `failed` retry), else fails a typed 409: a present `word` ⇒ `WordAlreadyReadyError`, active
non-failed stages ⇒ `WordBuildInProgressError`. Both 409s are **payload-less** — the `(language, word)`
is the request URL (`POST /words/:language/:word/build`), so echoing it would be redundant; the guard
needs no identity, only state. The 409s are declared on the `buildWord` endpoint (`apps/api`);
`requestWordBuild` (`@lexiai/use-cases`) calls the guard and propagates them. Unit-tested DB-free
(`test/word-build-policy.test.ts`).

The package re-exports `Language` (authored in `database/`) so the API speaks the vocabulary through core.

> **Decision — `WordModel`/`toWord` deleted (2026-06-12, user-driven "rows flow, schemas guard the
> boundaries").** The model was the entity minus `sourceVersions` plus a per-call runtime projection.
> The field is no longer hidden (provenance may ride to the client), and even when a field *is*
> boundary-hidden, Schema encoding at the contract already strips non-schema keys by default — a
> per-call runtime strip duplicates that. `.view.ts`/`.model.ts` are reserved for **computed view/read
> models** (`WordStateView` at the API edge) — shapes with no backing row. If a read ever has to truly transform storage
> (presign `StorageKey`s), that's when a projection earns its way back.

- **May import:** `core/content` (`createWord` needs `WordGenerationService` — see the decision above),
  `repositories/*`, `@lexiai/database`, `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`, `use-cases/*`. No HTTP code — that lives in `apps/api`.
  `@lexiai/database/factories` (pulls faker, a devDependency) belongs in tests, not `src/**`.
