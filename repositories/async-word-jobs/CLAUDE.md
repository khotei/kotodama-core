# repositories/async-word-jobs — `@lexiai/repositories-async-word-jobs`

`AsyncWordJobsRepo` — one `Context.Service` over the `DB` layer that owns the **`async_word_jobs`** table
(the schema lives in `database/`). The method surface and types are the contract — read
`src/async-word-jobs-repo.ts`. This file is only the *why* and the cross-file constraints those files can't
state.

## The model (why it's one repo, three methods)

`async_word_jobs` is **flat: one row per `(word, language, stage)`** — `StageState` flattened out of
jsonb into columns. A word's generation is its set of stage rows; there is no separate run row, no
`payload`, no `kind`. Three deep methods cover the whole lifecycle:

- **`initializeStages(language, word, stages?)`** — seed one `pending` row per planned stage (the first
  step of a run), defaulting to the full pipeline. Idempotent **and** the regen path: an existing word's
  rows are **reset in place** to `pending` via the `UNIQUE(word, language, stage)` upsert.
- **`findStages(query)`** — the single flexible read. Always scoped to `(language, word)`, optionally
  narrowed by `stage` and/or `status` (**each a single value or an array**). Rows come back
  **unordered** (no `ORDER BY`); a caller needing stepper order sorts by the `wordJobStage` declaration
  order. Every API/core question is one shape of it: full progress, "is it active?"
  (`status: [pending, running]`), "next stage" (`status: pending`), "did `final_review` pass?"
  (`stage` + `status`).
- **`patchStages(language, word, patch | patch[])`** — advance one stage or a batch. The `stage` rides
  inside each `StagePatch`; the lifecycle columns are derived from `patch.status` *inside* the method
  (`running` ⇒ `startedAt` + `attempts`; terminal ⇒ `finishedAt`), so the caller supplies only the
  outcome. **Return is input-inferred** (overloaded): a single patch → one row; an array → a row per
  patch, applied **atomically** in a `db.transaction` (a mid-batch failure rolls all back — hence the
  array overload also carries `SqlError`).

> **Decision (this branch — supersedes the generic-engine model):** the previous `async_jobs` +
> `payload {lang, word, stages}` runner and its generic `AsyncJobsRepo` were dropped. There is one job
> domain (word generation); the generality bought nothing and cost a jsonb-index footgun, a `kind`
> discriminant, payload-narrowing type gymnastics, and a second repo. Flattening trades those for a
> plain table + `UNIQUE` constraint.

> **Decision — reset-in-place, no history.** `UNIQUE(word, language, stage)` means structurally one row
> per stage, so the old "one active run per word" partial-unique dedup disappears. Rejected: a
> `runId`/`generation` column to retain past runs — out of scope; regen re-runs `initializeStages` on the same rows.

> **Decision — one flexible `patchStages`, not `start`/`succeed`/`fail` verbs.** This is the
> `mark(status,…)` shape `@.claude/rules/deep-modules.md` lists as *rejected*; chosen deliberately for
> fewer/flexible methods. The footgun it warns about (caller pairing status + result + error +
> timestamps) is contained by keeping the timestamp/attempt mechanics inside the method — the caller
> passes only `{stage, status, result?, error?}`. It takes one patch or an array (input-inferred return);
> the array form is atomic via `db.transaction`.

## Constraints & gotchas (not visible from this repo's own code)

- **Pipeline/display order = `wordJobStage` pgEnum declaration order** — the single source of stepper
  order. The repo does **no** sorting (DB or JS): `findStages` and `initializeStages` return rows
  unordered; a consumer that needs stepper order sorts by this declared order. Never reorder the enum
  without intending to reorder the UX stepper.
- **`patchStages` on an un-initialized stage ⇒ `WordStageNotFoundError`** (tagged) — `initializeStages`
  is the sole owner of "which stages exist"; a missing row is a real bug (a forgotten
  `initializeStages`), surfaced
  rather than silently upserted.
- **Return `AsyncWordJobRow` (`$inferSelect`), not the derived `*Schema`** — `effect-schema` erases the
  jsonb `$type` to opaque `Json` (Feature §11 spike); the Row preserves it. Same call as `WordsRepo`.
- **Error channel is `EffectDrizzleQueryError`** on every query (the rc `effect-postgres` integration);
  `patchStages` adds `WordStageNotFoundError`, and its **array** overload also `SqlError` (it wraps the
  batch in `db.transaction`). The single-patch overload has no `SqlError` — one statement, no transaction.

## Boundaries

- May import `@lexiai/database` + other `@lexiai/*`, `effect`, `@effect/sql-pg`, and `drizzle-orm`
  query helpers only — never a bare `drizzle()`/driver (the DB comes from the `DB` layer). Never
  `core/*` or `apps/*`.
- Patterns: `.claude/agent-patterns/effect-context-and-layer.md`, `drizzle-effect.md`.
- Tests are DB-backed (Testcontainers — needs a Docker daemon): `bun run --filter '@lexiai/repositories-async-word-jobs' test`.
