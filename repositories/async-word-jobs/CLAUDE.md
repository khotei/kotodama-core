# repositories/async-word-jobs — `@lexiai/repositories-async-word-jobs`

Bare persistence functions over `async_word_jobs` — `selectWordJobStages` + `upsertWordJobStages`
(`src/async-word-jobs.repo.ts`, `src/stage-patch.ts`). No repo service (owns no resource; see
"Service vs plain function" in `.claude/rules/effect-conventions.md`). Read the source for the
surface — this file is only the constraints it can't show.

## The model

The table is **flat: one row per `(word, language, stage)`** — no run row, no `payload` jsonb, no
history (a regen resets rows in place; `requestWordBuild` reseeds every stage `pending`). The repo
is purely functional: no domain checks, no domain errors, absence is a value; a never-initialized
stage is **created** by the upsert (no existence checks).

The status ⇄ `startedAt`/`finishedAt` pairing is persistence vocabulary authored once in the
`stagePatch.{pending,running,succeeded,failed}` constructors — the repo writes payloads verbatim.

## Gotchas (not visible from this repo's own code)

- **Pipeline/display order = the `wordJobStage` pgEnum declaration order** — the single source of
  stepper order. The repo returns rows **unordered**; a consumer sorts by the declared order.
  Never reorder the enum without intending to reorder the UX stepper.
- **Merge-patch is decided per key in JS, not SQL** — SQL can't distinguish "absent" from
  "explicit NULL" inside `excluded`, so `patchOnConflict` derives the conflict set from the keys
  the row carries. The producer must mean its `null`s: absent = keep, `null` = clear (this is how
  `stagePatch.pending` resets rows — explicit nulls).
- **A patch array runs one statement per patch, no transaction** — differently-shaped patches
  can't share one SET, so a batch is not atomic across patches (accepted: the only multi-patch
  caller is the homogeneous `pending` reset). Same stage twice in one batch = last-write-wins.
- Return `AsyncWordJobRow` (`$inferSelect`), never a derived schema — `effect-schema` erases the
  jsonb `$type`. Error channel is `EffectDrizzleQueryError` only.

## Boundaries

- May import `@lexiai/database`, other `@lexiai/*`, `effect`, `drizzle-orm` query helpers — never
  a bare `drizzle()`/driver, never `core/*` or `apps/*`.
- Tests are DB-backed (Testcontainers — needs Docker):
  `bun run --filter '@lexiai/repositories-async-word-jobs' test`.
