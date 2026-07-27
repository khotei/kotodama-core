# use-cases — `@kotodama/core/use-cases`

The top application tier below `apps/*`: user-flow composers aggregating core decisions + repos into
one end-to-end flow. A use case owns **no primitive decision and no wiring** — each is a bare
`Effect.fnUntraced` whose boundary requirements ride `R`, provided at `apps/*/main.ts`.

## Flow invariants

- **`requestWordBuild`:** the seed (`words` row `pending` + every stage `pending`) runs in **one
  `db.transaction`** — the seeded row IS the list entry, so it must land atomically with its stages;
  the repos join the tx via the shared `DB` connection (`tx` is never threaded into signatures). The
  enqueue runs strictly **after** commit (a queue send can't roll back). Admission is
  `ensureWordBuildable`; the gibberish gate is `verifyWordInput` (never the bare normalizer). **No
  resume** — a retry reseeds all stages.
- **`buildWord`:** journals around `createWord` and flips the row's lifecycle status. **The entry
  guard is poison-message protection** — it `select`s once and `die`s on absence *before any write*,
  so every later write is safely a plain upsert. **No live per-stage tracking:** the row + pipeline
  flip `running` in one write before generation; the outcome lands in one write at the end (failure ⇒
  `failed`, never-ran passes reset `pending`; timeout ⇒ every stage `timed_out`, content stays NULL).
  The budget is a decorator at the worker entrypoint — this flow only *reacts* to `TimeoutError`, so a
  committed word is never journalled `timed_out`. A journal-write error on the success path is
  swallowed (word is ready — no redrive); a commit-path error propagates.

MUST NOT import `apps/*`; nothing below may import upward (Biome-enforced).
