# repositories/async-word-jobs — `@lexiai/repositories-async-word-jobs`

The persistence surface over the **`async_word_jobs`** table (the schema lives in `database/`) — two
**bare persistence functions**, `selectWordJobStages` + `upsertWordJobStages`. The function surface and
types are the contract — read `src/async-word-jobs.repo.ts` + `src/stage-patch.ts`. This file is only the
*why* and the cross-file constraints those files can't state.

There is **no `AsyncWordJobsRepo` object or `Context.Service`** — the repo is the thin DB layer, so its
ops are plain exported functions whose **DB-verb prefix marks the layer** (`select`/`upsert`). Each is an
`Effect.fnUntraced` that `yield*`s `DB` inside, so callers write `selectWordJobStages(q)` /
`upsertWordJobStages(…)` and the `DB` requirement rides their `R` — provided at the app entrypoint. Not a
service: it owns no resource and is never test-swapped (the swap point is `DB`). See "Service vs plain
function" in `.claude/rules/effect-conventions.md`.

## The model (why it's one repo, two functions)

`async_word_jobs` is **flat: one row per `(word, language, stage)`** — `StageState` flattened out of
jsonb into columns (status, result, error, started/finished). A word's generation is its set of stage
rows; there is no separate run row, no `payload`, no `kind`, no `attempts` (dropped 2026-06-12 —
unused; re-add to the table if retry accounting ever lands). Two **purely functional** ops —
no domain checks, no domain errors; absence is a value:

- **`selectWordJobStages(query)`** — the single flexible read. Always scoped to `(language, word)`,
  optionally narrowed by `stage` and/or `status` (**each a single value or an array**). Rows come back
  **unordered** (no `ORDER BY`); a caller needing stepper order sorts by the `wordJobStage` declaration
  order. Every API/core question is one shape of it.
- **`upsertWordJobStages(language, word, stagePatch | stagePatch[])`** — the only write: each `StagePatch`
  names its row (`stage`) and carries its own payload, upserted on `UNIQUE(word, language, stage)`
  with **merge-patch semantics** (`patchOnConflict`): a carried field lands verbatim — an explicit
  `null` **clears** the column — an absent field leaves it untouched (so a `succeeded` patch can't
  erase `running`'s `startedAt`: it doesn't carry the key). Seeding/reset is not a separate method: a
  run starts (and a regen restarts) by saving **`stagePatch.pending`** patches, whose explicit nulls
  reset the same rows in place. An array runs **one `INSERT … ON CONFLICT DO UPDATE` per patch** (a
  plain per-patch loop — a single statement's one shared SET can't carry differently-shaped patches);
  **no transaction**, so a batch is not atomic across patches. A never-initialized stage is
  **created** by the save (upsert semantics — no existence checks, no `Option`).

> **Decision (this branch — supersedes the generic-engine model):** the previous `async_jobs` +
> `payload {lang, word, stages}` runner and its generic `AsyncJobsRepo` were dropped. There is one job
> domain (word generation); the generality bought nothing and cost a jsonb-index footgun, a `kind`
> discriminant, payload-narrowing type gymnastics, and a second repo. Flattening trades those for a
> plain table + `UNIQUE` constraint.

> **Decision — reset-in-place, no history.** `UNIQUE(word, language, stage)` means structurally one row
> per stage, so the old "one active run per word" partial-unique dedup disappears. Rejected: a
> `runId`/`generation` column to retain past runs — out of scope. The repo just upserts whatever patches
> the caller sends; **which** rows a regen resets is the caller's call — `requestWordBuild` reseeds
> **every** stage `pending` (**no resume**): a regen re-runs the whole pipeline from scratch, and
> `buildWord` stores `{}` for each succeeded stage (the real content lives in the `words` row, not a
> reused per-stage `result`).

> **Decision — saving rules live in `stage-patch.ts`; checks live nowhere in this repo (2026-06-12,
> user-driven).** The status ⇄ `startedAt`/`finishedAt` pairing is **persistence vocabulary, not
> business logic**: it is authored once in the blessed pure constructors
> **`stagePatch.{pending,running,succeeded,failed}(stage, …)`** (same package — reusable by core,
> worker, and tests); the repo writes the payload verbatim. Conversely, *checks* ("must this stage
> exist?") are **not** the repo's job — `WordStageNotFoundError`, then an `Option` return, were both
> retired when `upsertWordJobStages` became a true upsert: a missing row is *created*, the case is defined out
> of existence (a guard service remains the plan if real check logic ever appears). `upsertWordJobStages`
> loops a plain `INSERT … ON CONFLICT` per patch — no `db.transaction` (a batch is not atomic across
> patches; accepted, since the only multi-patch caller is the homogeneous `pending` reset).

> **Decision — `initializeStages` folded into `upsertWordJobStages` (2026-06-12, user-driven).** The COALESCE
> merge could not express "clear", so seeding/reset needed its own method with its own conflict set.
> `patchOnConflict` (merge-patch: the conflict set derives from the keys the values actually carry,
> `null` included) made the reset expressible as ordinary patches — `stagePatch.pending` is a patch
> of explicit nulls — so the separate method (and the repo's knowledge of the default pipeline) was
> deleted: *when* and *which* stages to seed is the requester's call (`requestWordBuild` maps
> `WORD_JOB_STAGES`); *what a reset writes* stays here in `stagePatch.pending`.

## Constraints & gotchas (not visible from this repo's own code)

- **Pipeline/display order = `wordJobStage` pgEnum declaration order** — the single source of stepper
  order. The repo does **no** sorting (DB or JS): every method returns rows unordered; a consumer that
  needs stepper order sorts by this declared order. Never reorder the enum without intending to
  reorder the UX stepper.
- **One saving rule — merge-patch — decided per key in JS, not in SQL.** SQL can't distinguish
  "absent" from "explicit NULL" inside `excluded`, so `patchOnConflict(table, row)` derives the
  conflict set from the keys the row carries (in JS, where `undefined` ≠ `null`). The producer must mean its
  `null`s: `undefined`/absent = keep, `null` = clear. A single SET can't carry differently-shaped
  rows, so an array saves one statement **per patch** (not one multi-row statement) — no cross-patch
  atomicity, traded for a flat per-patch loop instead of shape-grouping. (`upsertWords` does the same —
  a per-content loop, no transaction — for the same reason: a batch's rows can carry different optional
  columns, so they can't share one SET either.)
- **`upsertWordJobStages` with the same stage twice in one batch is last-write-wins**, not an error — each
  patch is its own statement, so the second simply updates the row the first wrote. Returned rows are
  in input order, one per patch.
- **Return `AsyncWordJobRow` (`$inferSelect`), not the derived `*Schema`** — `effect-schema` erases the
  jsonb `$type` to opaque `Json` (Feature §11 spike); the Row preserves it. Same call as the words repo.
- **Error channel is `EffectDrizzleQueryError` only.** No method opens a transaction or fails with a
  domain error.

## Boundaries

- May import `@lexiai/database` + other `@lexiai/*`, `effect`, `@effect/sql-pg`, and `drizzle-orm`
  query helpers only — never a bare `drizzle()`/driver (the DB comes from the `DB` layer). Never
  `core/*` or `apps/*`.
- Patterns: `.claude/agent-patterns/effect-context-and-layer.md`, `drizzle-effect.md`.
- Tests are DB-backed (Testcontainers — needs a Docker daemon): `bun run --filter '@lexiai/repositories-async-word-jobs' test`.
