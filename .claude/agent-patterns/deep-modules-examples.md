# Deep modules — examples & a worked refactoring

**On-demand companion to `.claude/rules/deep-modules.md`.** It lives in `agent-patterns/`, so it is
**not** auto-loaded — read it when designing or reworking an interface. Two parts: a compact gallery of
shallow→deep BAD/GOOD pairs (each tagged to a principle `§N` and pointing at the repo's real code),
then one full move-by-move refactoring. Canonical pairs are Ousterhout's (*APoSD*) and from
well-designed std libs (Clojure).

## Gallery — shallow → deep pairs

**Many shallow calls vs one deep call (§1).** Java file I/O makes you stack three objects to read one file:

```ts
new ObjectInputStream(new BufferedInputStream(new FileInputStream(name))) // BAD: 3 interfaces, 1 task; buffering you must remember to add
```

Unix `open/read/write/lseek/close` hides disk layout, block allocation, caching, scheduling, and
permissions behind five signatures that have outlived decades of filesystem rewrites. The *deepest*
module has **no** interface at all — a garbage collector, a TCP retransmit timer.
→ `WordsRepo.create(content)` is one call hiding insert-vs-replace, the `UNIQUE(word, language)`
conflict target, and the atomic batch path — `repositories/words/src/words-repo.ts`.

**A pile of special-purpose methods vs one general read (§4).**

```ts
findById · findByWord · findByLanguage · searchByPrefix · findByIdAndLanguage … // BAD: N shallow methods, combinatorial — a new filter is a new method
find(query) · findOne(query)                                                    // GOOD: every read is one shape of a single query type
```

Removes cognitive load + change amplification. The gold standard is Clojure's **seq**: one interface
(`first`/`rest`/`cons`; `(seq coll)`) under which `map`/`filter`/`reduce` work over *every* collection,
with `get`/`assoc`/`conj` uniform across map, vector, set — depth is in the *generality*. **Opposite
trap, still real:** a `find(opts)` so configurable it warps its own return type is shallow again —
general ≠ infinitely parameterised.
→ `WordsRepo.find`/`findOne`, `AsyncWordJobsRepo.findStages` — one flexible query type, no slice-explosion.

**Special cases the caller must handle vs errors defined away (§6).**

```ts
"abc".substring(2, 99)       // BAD (Java): throws — every caller bounds-checks  → GOOD: clamp to length
delete(absentKey)            // BAD: "no such key"  → GOOD: no-op (the deletion already holds)
findById(id): Word           // BAD: throws NotFound → findOne(q): Option<Word>  (absence is Option.none)
create(c): "already exists"  // BAD                  → create(c): upsert         (re-create / regen idempotent)
```

The strongest form pushes the special case *out of the type*: the **`words` table is pristine — a row
exists ⇔ the word is ready**, so there is no `status` column, no half-word, and therefore no "is it
ready yet?" branch anywhere downstream. Canonical kin: Clojure **nil-punning** — `(seq coll)` is `nil`
for empty, so `(when (seq coll) …)` needs no empty-check. *Taste note:* Hickey himself calls this
*complecting* (nil conflates absent/false/empty) — defining-away is powerful, but each conflation it
introduces is a cost to weigh (the taste gate).
→ `findOne`→`Option`, the `create`/`initializeStages` upserts, `wordsTable` — `database/schema/words/words.table.ts`.

**Structure by execution-order vs by knowledge (§3).** Splitting an HTTP handler into `Reader → Parser
→ Writer` classes that *each* know the message format means a format change edits all three (leakage +
temporal decomposition). Keep the format in one module; let order be internal.
→ The `wordJobStage` pgEnum is the **single source** of pipeline + display order (reorder it ⇒ the UX
stepper reorders; no second list to sync) — `database/schema/async-word-jobs/async-word-jobs.enums.ts`;
and `patchStages` derives `startedAt`/`finishedAt`/`attempts` from `status` in **one** place.

**Pass-through layer vs abstraction-changing layer (§5).**

```ts
class WordsService { create = (c) => this.repo.create(c) } // BAD: same signature, pure interface tax
```

A real layer *changes vocabulary*: `DBLive` turns a `PgClient` + relations into the `DB` service repos
consume; `WordsRepo` turns the whole Drizzle query builder into four domain methods.
→ `database/src/db.ts`.

**The taste gate, embodied.** `AsyncWordJobsRepo.patchStages(stage, status, result?, error?)` is exactly
the `mark(status, …)` shape the rule flags as a footgun (a caller juggling status + result + error +
timestamps). Chosen anyway — because the footgun is *contained* (timestamps/attempts are derived inside
the method, never passed in) and it retired a `start`/`succeed`/`fail` slice-explosion. Removes more
than it adds ⇒ it wins; that weighing, not the default, is the rule.
→ `repositories/async-word-jobs/src/async-word-jobs-repo.ts`.

---

## A worked refactoring — status verbs → one general method

The same lesson end to end: the naive "a-method-per-transition" repo a first draft reaches for → the
deep `initializeStages` / `findStages` / `patchStages` shape `AsyncWordJobsRepo` actually ships. The
canonical parallel is Ousterhout's text-editor refactor (special-purpose `backspace` / `delete` /
`insertChar` → general `insert(pos, text)` / `delete(range)`).

> Code below is **simplified for the lesson** — Effect error channels, the single-or-array overloads,
> and the transaction `Executor` threading are elided so the *design* is legible. The production
> version is `repositories/async-word-jobs/src/async-word-jobs-repo.ts`. `eqStage(l, w, s)` is shorthand
> for `and(eq(word), eq(language), eq(stage))`.

### The task

`async_word_jobs` is flat — **one row per `(word, language, stage)`**. A word's six-stage generation
advances each row through a status lifecycle, `pending → running → (succeeded | failed)`, carrying
`startedAt` / `finishedAt` timestamps and an `attempts` counter. The worker drives the transitions; the
API reads progress. We need a repository over that table.

### BAD — a method per transition

The obvious first cut gives each transition its own verb, and each read question its own getter:

```ts
export class WordJobsRepo extends Context.Service<WordJobsRepo, {
  // writes — one verb per transition
  readonly createRun:    (language: Language, word: string) => Effect.Effect<void>
  readonly startStage:   (language: Language, word: string, stage: WordJobStage) => Effect.Effect<void>
  readonly succeedStage: (language: Language, word: string, stage: WordJobStage, result: StageResult) => Effect.Effect<void>
  readonly failStage:    (language: Language, word: string, stage: WordJobStage, error: JobError) => Effect.Effect<void>
  readonly retryStage:   (language: Language, word: string, stage: WordJobStage) => Effect.Effect<void>
  // reads — one getter per question
  readonly getProgress:     (language: Language, word: string) => Effect.Effect<AsyncWordJobRow[]>
  readonly getActiveStages: (language: Language, word: string) => Effect.Effect<AsyncWordJobRow[]>
  readonly getNextPending:  (language: Language, word: string) => Effect.Effect<Option<AsyncWordJobRow>>
  readonly didStagePass:    (language: Language, word: string, stage: WordJobStage) => Effect.Effect<boolean>
}>()('…/WordJobsRepo') {}
```

The write implementations — watch the lifecycle rule get copied around:

```ts
const startStage = (language, word, stage) =>
  db.update(asyncWordJobsTable)
    .set({ status: 'running', startedAt: new Date(),                       // ← status→timestamp+attempts rule, copy 1
           attempts: sql`${asyncWordJobsTable.attempts} + 1` })
    .where(eqStage(language, word, stage))

const retryStage = (language, word, stage) =>
  db.update(asyncWordJobsTable)
    .set({ status: 'running', startedAt: new Date(),                       // ← copy 2: near-identical to startStage,
           attempts: sql`${asyncWordJobsTable.attempts} + 1`, error: null }) //   the only difference is `error: null`
    .where(eqStage(language, word, stage))

const succeedStage = (language, word, stage, result) =>
  db.update(asyncWordJobsTable)
    .set({ status: 'succeeded', finishedAt: new Date(), result })          // ← terminal-timestamp rule, copy 3
    .where(eqStage(language, word, stage))

const failStage = (language, word, stage, error) =>
  db.update(asyncWordJobsTable)
    .set({ status: 'failed', finishedAt: new Date(), error })              // ← terminal-timestamp rule, copy 4
    .where(eqStage(language, word, stage))
```

A caller — the worker running one stage:

```ts
yield* repo.startStage(enumLanguage.en, 'lacuna', enumWordJobStage.enrich_tiers)
const out = yield* generateTiers('lacuna')              // Either<JobError, StageResult>
yield* Either.match(out, {
  onLeft:  (e) => repo.failStage(enumLanguage.en, 'lacuna', enumWordJobStage.enrich_tiers, e),
  onRight: (r) => repo.succeedStage(enumLanguage.en, 'lacuna', enumWordJobStage.enrich_tiers, r),
})
```

#### Why it's shallow

Nine methods, and every one is **thin** — each is a single `UPDATE`/`SELECT` with a different literal,
so the interface is large relative to the work it does. Concretely:

- **Information leakage → change amplification (§3).** The rule *"`running` ⇒ stamp `startedAt` + bump
  `attempts`; a terminal status ⇒ stamp `finishedAt`"* is **copied into four methods**. "Also clear
  `error` when a stage re-enters `running`" is a two-method edit (`startStage` *and* `retryStage`) — and
  easy to half-do. The lifecycle lives in 4 places instead of 1.
- **Special-purpose explosion (§4).** `startStage` and `retryStage` differ only by `error: null` — that's
  a *flag*, not a *method*. The write side is one operation ("set a stage's status") wearing five hats;
  the read side is one query ("select a word's stages, filtered") wearing four.
- **Unknown-unknowns → ordering leaked to callers.** Nothing stops `succeedStage` before `startStage`;
  the legal order lives in callers' heads. And the caller hand-writes status strings (`'running'`), so a
  typo compiles — LexiAI bans literal enum strings precisely for this (`.claude/rules/naming.md`).
- **No batch path.** "Mark these three stages succeeded atomically" has no expression — you'd loop the
  verbs and lose all-or-nothing.

### The refactor, in four moves

**Move 1 — collapse the transition verbs into one `patchStages(patch)`.** They differ only in
*(status, which extra fields)*. Promote `status` to a parameter; make the extras optional:

```ts
type StagePatch = {
  readonly stage:   WordJobStage
  readonly status:  AsyncJobStatus
  readonly result?: StageResult   // only meaningful on success
  readonly error?:  JobError      // only meaningful on failure
}
//  start   → { stage, status: running }
//  succeed → { stage, status: succeeded, result }
//  fail    → { stage, status: failed, error }
```

Five verbs become one method whose *argument* carries the variation. `retry` vanishes — it's just
`{ status: running }` again, and idempotency (Move 4) makes the re-run safe.

**Move 2 — pull the lifecycle bookkeeping *inside* the method (kill the leak, §3/§6).** The
status→timestamps+attempts rule now lives in exactly **one** place, derived from `status`, so the caller
supplies only the *outcome*:

```ts
const running  = patch.status === enumAsyncJobStatus.running
const terminal = patch.status === enumAsyncJobStatus.succeeded
              || patch.status === enumAsyncJobStatus.failed
yield* db.update(asyncWordJobsTable).set({
  status: patch.status,
  ...(running  ? { startedAt: new Date(), attempts: sql`${asyncWordJobsTable.attempts} + 1` } : {}),
  ...(terminal ? { finishedAt: new Date() } : {}),
  ...(patch.result !== undefined ? { result: patch.result } : {}),
  ...(patch.error  !== undefined ? { error:  patch.error  } : {}),
}).where(eqStage(language, word, patch.stage))
```

"Clear `error` on `running`" is now a **one-line, one-place** change, and a caller *cannot* set a stray
timestamp — it can't pass one at all.

**Move 3 — collapse the read explosion into one `findStages(query)` (§4).** `getProgress` /
`getActiveStages` / `getNextPending` / `didStagePass` are one `SELECT` with different `WHERE`s. Make the
filter the argument (each field single-or-array):

```ts
type AsyncWordJobsQuery = {
  readonly language: Language
  readonly word:     string
  readonly stage?:   WordJobStage   | readonly WordJobStage[]
  readonly status?:  AsyncJobStatus | readonly AsyncJobStatus[]
}
// full progress    → findStages({ language, word })
// "is it active?"  → findStages({ language, word, status: [pending, running] })
// next pending     → findStages({ language, word, status: pending })   // sort by enum order, take first
// did final pass?  → findStages({ language, word, stage: final_review, status: succeeded })
```

Four getters → one query type. A new question is a new *filter*, not a new *method*.

**Move 4 — make creation idempotent and define the bad cases away (§6).** `createRun` becomes
`initializeStages`, an **upsert** on `UNIQUE(word, language, stage)`: first generation inserts the
`pending` rows; a regeneration **resets the same rows in place**. So "this word is already generating"
is not an error, and regen is not a special code path — it's the same call. Conversely, `patchStages` on
a stage that was never initialized returns a tagged `WordStageNotFoundError`: a forgotten
`initializeStages` is a real bug, so it's **surfaced**, not silently upserted into existence.

### GOOD — the resulting interface

```ts
export class AsyncWordJobsRepo extends Context.Service<AsyncWordJobsRepo, {
  readonly initializeStages: (language: Language, word: string, stages?: readonly WordJobStage[])
    => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>           // seed OR reset-in-place (regen)
  readonly findStages: (query: AsyncWordJobsQuery)
    => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>           // every read question, one shape
  readonly patchStages: (language: Language, word: string, patch: StagePatch | readonly StagePatch[])
    => Effect.Effect<AsyncWordJobRow | AsyncWordJobRow[], EffectDrizzleQueryError | WordStageNotFoundError>
}>()('@lexiai/repositories-async-word-jobs/AsyncWordJobsRepo') {}
```

Three deep methods. The worker's stage loop, after:

```ts
const stage = enumWordJobStage.enrich_tiers
yield* repo.patchStages(enumLanguage.en, 'lacuna', { stage, status: enumAsyncJobStatus.running })
const out = yield* generateTiers('lacuna')
yield* repo.patchStages(enumLanguage.en, 'lacuna', Either.match(out, {
  onLeft:  (error)  => ({ stage, status: enumAsyncJobStatus.failed,    error }),
  onRight: (result) => ({ stage, status: enumAsyncJobStatus.succeeded, result }),
}))
```

— and a batch is now free: pass an **array** of patches; they apply atomically in one transaction.

### The same cases, before → after

| Case | BAD | GOOD |
|---|---|---|
| start a stage | `startStage(l,w,s)` | `patchStages(l,w,{stage:s, status: running})` |
| succeed with result | `succeedStage(l,w,s,r)` | `patchStages(l,w,{stage:s, status: succeeded, result:r})` |
| fail with error | `failStage(l,w,s,e)` | `patchStages(l,w,{stage:s, status: failed, error:e})` |
| succeed 3 stages atomically | *no path — loop, non-atomic* | `patchStages(l,w,[p1,p2,p3])` |
| start generating / regen | `createRun` + bespoke reset | `initializeStages(l,w)` (idempotent) |
| full progress | `getProgress(l,w)` | `findStages({l,w})` |
| is it still active? | `getActiveStages(l,w)` | `findStages({l,w, status:[pending,running]})` |
| did `final_review` pass? | `didStagePass(l,w,final_review)` | `findStages({l,w, stage:final_review, status:succeeded})` |

### Scorecard

| | BAD | GOOD |
|---|---|---|
| methods on the interface | 9 | 3 |
| copies of the timestamp/attempts rule | 4 | 1 |
| read questions ↔ methods | 4 ↔ 4 | any ↔ 1 query type |
| atomic batch | impossible | built in |

Symptoms removed: **change amplification** (the lifecycle rule is centralised), **cognitive load** (one
write verb to learn, not five; one read shape, not four), **unknown-unknowns** (the caller can no longer
set a stray timestamp or an illegal status string).

**Where taste overrode the rule.** `patchStages(stage, status, result?, error?)` is *precisely* the
`mark(status, …)` shape `.claude/rules/deep-modules.md` flags as a **potential footgun** — a caller
juggling status + result + error. It was chosen anyway because Move 2 **contained** the footgun: the
dangerous coupling (status → timestamps/attempts) lives inside the method, so the caller passes only
`{stage, status, result?, error?}` and cannot get the bookkeeping wrong. *Remove more than you add* —
here, retiring five verbs and one duplicated rule for one optional-field object — so it wins. That
weighing is the gate at the top of `deep-modules.md`, not a free pass to grow parameter lists.

## See also

- The shipped code: `repositories/async-word-jobs/src/async-word-jobs-repo.ts` (+ its `CLAUDE.md` for the
  *why*) — the production version with overloads, transactions, and `Effect.fnUntraced`. `WordsRepo`
  (`repositories/words/src/words-repo.ts`) applies the identical idioms to the catalog (`find`/`findOne`
  + the `create` upsert).
- The same lesson one altitude up, at the **data model**: the rejected generic `async_jobs` engine
  (`payload {lang, word, stages}` + a `kind` discriminant + a second repo) → the flat `async_word_jobs`
  table — a general-purpose mechanism that bought nothing and cost a jsonb-index footgun and payload
  type-gymnastics. Recorded in `async-word-jobs/CLAUDE.md`.
- `.claude/rules/deep-modules.md` — §3 (information leakage), §4 (general vs special-purpose), §6
  (define errors out of existence), and the taste gate.
