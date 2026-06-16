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
→ `WordsRepo.save(content)` is one call hiding insert-vs-replace, the `UNIQUE(word, language)`
conflict target, and the atomic batch path — `repositories/words/src/words.repo.ts`.

**A pile of special-purpose methods vs one general read (§4).**

```ts
findById · findByWord · findByLanguage · searchByPrefix · findByIdAndLanguage … // BAD: N shallow methods, combinatorial — a new filter is a new method
find(query)                                                                      // GOOD: every read is one shape of a single query type
```

Removes cognitive load + change amplification. The gold standard is Clojure's **seq**: one interface
(`first`/`rest`/`cons`; `(seq coll)`) under which `map`/`filter`/`reduce` work over *every* collection,
with `get`/`assoc`/`conj` uniform across map, vector, set — depth is in the *generality*. **Opposite
trap, still real:** a `find(opts)` so configurable it warps its own return type is shallow again —
general ≠ infinitely parameterised.
→ `WordsRepo.find`, `AsyncWordJobsRepo.findStages` — one flexible query type, no slice-explosion.

**Special cases the caller must handle vs errors defined away (§6).**

```ts
"abc".substring(2, 99)       // BAD (Java): throws — every caller bounds-checks  → GOOD: clamp to length
delete(absentKey)            // BAD: "no such key"  → GOOD: no-op (the deletion already holds)
findById(id): Word           // BAD: throws NotFound → find(q): Word[]          (absence is an empty array)
save(c):   "already exists"  // BAD                  → save(c): upsert           (re-create / regen idempotent)
```

The strongest form pushes the special case *out of the type*: the **`words` table is pristine — a row
exists ⇔ the word is ready**, so there is no `status` column, no half-word, and therefore no "is it
ready yet?" branch anywhere downstream. Canonical kin: Clojure **nil-punning** — `(seq coll)` is `nil`
for empty, so `(when (seq coll) …)` needs no empty-check. *Taste note:* Hickey himself calls this
*complecting* (nil conflates absent/false/empty) — defining-away is powerful, but each conflation it
introduces is a cost to weigh (the taste gate).
→ absence-as-value reads, the `save`/`saveStages` upserts, `wordsTable` — `database/schema/words/words.table.ts`.

**Structure by execution-order vs by knowledge (§3).** Splitting an HTTP handler into `Reader → Parser
→ Writer` classes that *each* know the message format means a format change edits all three (leakage +
temporal decomposition). Keep the format in one module; let order be internal.
→ The `wordJobStage` pgEnum is the **single source** of pipeline + display order (reorder it ⇒ the UX
stepper reorders; no second list to sync) — `database/schema/async-word-jobs/async-word-jobs.enums.ts`;
and the `stagePatch.{running,succeeded,failed}` constructors author the status ⇄
`startedAt`/`finishedAt` pairing in **one** place (`stage-patch.ts`).

**Pass-through layer vs abstraction-changing layer (§5).**

```ts
class WordsService { save = (c) => this.repo.save(c) }     // BAD: same signature, pure interface tax
```

A real layer *changes vocabulary*: `DBLive` turns a `PgClient` + relations into the `DB` service repos
consume; `WordsRepo` turns the whole Drizzle query builder into two domain methods.
→ `database/src/db.ts`.

**The taste gate, embodied.** `AsyncWordJobsRepo.saveStages(language, word, stagePatch)` is exactly
the `mark(status, …)` shape the rule flags as a footgun (a caller juggling status + result + error +
timestamps). Chosen anyway — because the footgun is *contained*: the status ⇄ timestamps
pairing is authored once, in the blessed `stagePatch.{running,succeeded,failed}` constructors the
caller is required to use, and it retired a `start`/`succeed`/`fail` slice-explosion. Removes more
than it adds ⇒ it wins; that weighing, not the default, is the rule.
→ `repositories/async-word-jobs/src/{async-word-jobs.repo,stage-patch}.ts`.

---

## A worked refactoring — status verbs → one general method

The same lesson end to end: the naive "a-method-per-transition" repo a first draft reaches for → the
deep `findStages` / `saveStages` shape `AsyncWordJobsRepo` actually ships. The
canonical parallel is Ousterhout's text-editor refactor (special-purpose `backspace` / `delete` /
`insertChar` → general `insert(pos, text)` / `delete(range)`).

> Code below is **simplified for the lesson** — Effect error channels are elided so the *design* is
> legible. The production version is `repositories/async-word-jobs/src/async-word-jobs.repo.ts` +
> `stage-patch.ts`. `eqStage(l, w, s)` is shorthand for `and(eq(word), eq(language), eq(stage))`.

### The task

`async_word_jobs` is flat — **one row per `(word, language, stage)`**. A word's six-stage generation
advances each row through a status lifecycle, `pending → running → (succeeded | failed)`, carrying
`startedAt` / `finishedAt` timestamps. The worker drives the transitions; the
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
    .set({ status: 'running', startedAt: new Date() })                    // ← status→timestamp rule, copy 1
    .where(eqStage(language, word, stage))

const retryStage = (language, word, stage) =>
  db.update(asyncWordJobsTable)
    .set({ status: 'running', startedAt: new Date(), error: null })        // ← copy 2: near-identical to startStage,
                                                                            //   the only difference is `error: null`
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

- **Information leakage → change amplification (§3).** The rule *"`running` ⇒ stamp `startedAt`;
  a terminal status ⇒ stamp `finishedAt`"* is **copied into four methods**. "Also clear
  `error` when a stage re-enters `running`" is a two-method edit (`startStage` *and* `retryStage`) — and
  easy to half-do. The lifecycle lives in 4 places instead of 1.
- **Special-purpose explosion (§4).** `startStage` and `retryStage` differ only by `error: null` — that's
  a *flag*, not a *method*. The write side is one operation ("set a stage's status") wearing five hats;
  the read side is one query ("select a word's stages, filtered") wearing four.
- **Unknown-unknowns → ordering leaked to callers.** Nothing stops `succeedStage` before `startStage`;
  the legal order lives in callers' heads. And the caller hand-writes status strings (`'running'`), so a
  typo compiles — LexiAI bans literal enum strings precisely for this (`.claude/rules/naming.md`).

### The refactor, in four moves

**Move 1 — collapse the transition verbs into one `saveStages(patch | patch[])`.** They differ only in
*(status, which extra fields)*. Make the variation the *argument* — one payload object naming the row
(`stage`) plus the columns to set. Five verbs become one method; `retry` vanishes — it's just `running`
again, and idempotency (Move 4) makes the re-run safe.

**Move 2 — give the lifecycle bookkeeping exactly one author (kill the leak, §3).** The
status→timestamps pairing is **persistence vocabulary, not business logic**, so it moves into
blessed pure constructors beside the repo — the only documented way to build a `StagePatch`:

```ts
// stage-patch.ts — the saving rules of the lifecycle, authored once
export const stagePatch = {
  running:   (stage)         => ({ stage, status: running,   startedAt: new Date() }),
  succeeded: (stage, result) => ({ stage, status: succeeded, finishedAt: new Date(), result }),
  failed:    (stage, error)  => ({ stage, status: failed,    finishedAt: new Date(), error }),
}
```

The repo write is then **verbatim** — `saveStages` upserts each patch as a row (single or array, one
multi-row `INSERT … ON CONFLICT DO UPDATE`), deriving nothing; the conflict set merges
(`COALESCE(excluded.col, col)`), so an absent patch field keeps the stored value. "Clear `error` on `running`" is a one-line, one-place change; core decides
*when* to transition, the repo package owns *what columns* that writes. (The first cut derived the
pairing *inside* the method from `patch.status`; pulling it out to constructors kept the single author
while making each batch payload self-contained — which is what let the per-patch transaction die.)

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

**Move 4 — make creation idempotent and define the bad cases away (§6).** `createRun` disappears
entirely: seeding is just saving `stagePatch.pending` patches through the same **upsert** on
`UNIQUE(word, language, stage)` — first generation inserts the `pending` rows; a regeneration
**resets the same rows in place** (the pending patch's explicit nulls clear the prior outcome). So
"this word is already generating" is not an error, and regen is not a special code path — it's the
same call. A never-initialized stage is created by its first save — "does this row exist yet?" is
defined out of existence repo-wide.

### GOOD — the resulting interface

```ts
export class AsyncWordJobsRepo extends Context.Service<AsyncWordJobsRepo, {
  readonly findStages: (query: AsyncWordJobsQuery)
    => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>           // every read question, one shape
  readonly saveStages: (language: Language, word: string, patch: StagePatch | readonly StagePatch[])
    => Effect.Effect<AsyncWordJobRow | readonly AsyncWordJobRow[], EffectDrizzleQueryError>
}>()('@lexiai/repositories-async-word-jobs/AsyncWordJobsRepo') {}
```

Two deep methods. The worker's stage loop, after:

```ts
const stage = enumWordJobStage.enrich_tiers
yield* repo.saveStages(enumLanguage.en, 'lacuna', stagePatch.running(stage))
const out = yield* generateTiers('lacuna')
yield* repo.saveStages(enumLanguage.en, 'lacuna', Either.match(out, {
  onLeft:  (error)  => stagePatch.failed(stage, error),
  onRight: (result) => stagePatch.succeeded(stage, result),
}))
```

### The same cases, before → after

| Case | BAD | GOOD |
|---|---|---|
| start a stage | `startStage(l,w,s)` | `saveStages(l,w, stagePatch.running(s))` |
| succeed with result | `succeedStage(l,w,s,r)` | `saveStages(l,w, stagePatch.succeeded(s,r))` |
| fail with error | `failStage(l,w,s,e)` | `saveStages(l,w, stagePatch.failed(s,e))` |
| start generating / regen | `createRun` + bespoke reset | `saveStages(l,w, STAGES.map(stagePatch.pending))` (idempotent) |
| full progress | `getProgress(l,w)` | `findStages({l,w})` |
| is it still active? | `getActiveStages(l,w)` | `findStages({l,w, status:[pending,running]})` |
| did `final_review` pass? | `didStagePass(l,w,final_review)` | `findStages({l,w, stage:final_review, status:succeeded})` |

### Scorecard

| | BAD | GOOD |
|---|---|---|
| methods on the interface | 9 | 3 |
| copies of the timestamp rule | 4 | 1 (`stage-patch.ts`) |
| read questions ↔ methods | 4 ↔ 4 | any ↔ 1 query type |

Symptoms removed: **change amplification** (the lifecycle rule is centralised), **cognitive load** (one
write verb to learn, not five; one read shape, not four), **unknown-unknowns** (the caller can no longer
set a stray timestamp or an illegal status string).

**Where taste overrode the rule.** `saveStages` + `StagePatch` is *precisely* the
`mark(status, …)` shape `.claude/rules/deep-modules.md` flags as a **potential footgun** — a caller
juggling status + result + error. It was chosen anyway because Move 2 **contained** the footgun: the
dangerous coupling (status → timestamps) is authored once in `stagePatch`, so a caller builds
payloads through the constructors and cannot get the bookkeeping wrong. *Remove more than you add* —
here, retiring five verbs and one duplicated rule for one payload object — so it wins. That
weighing is the gate at the top of `deep-modules.md`, not a free pass to grow parameter lists.
A batch form (`patch[]` + `db.transaction`) existed briefly and was deleted: no production caller —
speculative generality losing to the taste gate.

## See also

- The shipped code: `repositories/async-word-jobs/src/async-word-jobs.repo.ts` + `stage-patch.ts` (+ the
  package `CLAUDE.md` for the *why*) — the production version with `Effect.fnUntraced` and no
  transactions. `WordsRepo` (`repositories/words/src/words.repo.ts`) applies the identical idioms to the
  catalog (`find` + the single-or-array `save` upsert, one multi-row statement).
- The same lesson one altitude up, at the **data model**: the rejected generic `async_jobs` engine
  (`payload {lang, word, stages}` + a `kind` discriminant + a second repo) → the flat `async_word_jobs`
  table — a general-purpose mechanism that bought nothing and cost a jsonb-index footgun and payload
  type-gymnastics. Recorded in `async-word-jobs/CLAUDE.md`.
- `.claude/rules/deep-modules.md` — §3 (information leakage), §4 (general vs special-purpose), §6
  (define errors out of existence), and the taste gate.
