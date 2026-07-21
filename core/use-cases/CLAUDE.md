# use-cases — `@kotodama/core/use-cases`

The top application tier below `apps/*`: user-flow composers that aggregate core decisions + repo
functions into one end-to-end flow any entrypoint can bind. A use case owns **no primitive
decision of its own** — and no wiring: each composer is a bare `Effect.fnUntraced` function whose
boundary requirements ride `R`; `apps/*/main.ts` provides them (see "Service vs plain function" in
`.claude/rules/effect-conventions.md`). Why a tier, not a `core/` folder: a user flow aggregates
*across* core domains + repos, so core stays single-decision building blocks and apps stay thin
transport adapters.

## Flow invariants (the constraints the code can't show)

- **`requestWordBuild`:** the seed (`words` row `pending` + every stage `pending`) runs **in one
  `db.transaction`** — the seeded `pending` row IS the list entry, so it must land atomically with
  its stages; a failed stage write rolls the seed back. The enqueue runs strictly **after** the
  commit (a queue send can't roll back). The repos join the tx via the shared `DB` connection —
  `tx` is never threaded into their signatures; transactionality is this tier's concern. Admission
  is solely `ensureWordBuildable`; the gibberish gate is `verifyWordInput` (never the bare
  normalizer), so no job is seeded for a non-plausible input. **No resume:** a retry reseeds all
  stages from scratch.
- **`buildWord`:** manages the job journal around `createWord` and flips the `words` row's
  lifecycle status. **The entry guard is the poison-message protection**: it `select`s the row
  once and `die`s on absence *before any write*, so a queue message naming a never-seeded word
  fabricates no row — every later write can then safely be a plain upsert. Ownership line: `core`
  *promotes* `words` (the content write); this flow owns the `running`/`failed` status flips and
  the inline `words.stages` progress. **No live per-stage tracking:** the row + whole pipeline flip
  `running` in one write before generation, and the outcome lands in one write at the end
  (generation failure ⇒ row `failed`, never-ran passes reset to `pending`; generation timeout ⇒
  every stage `timed_out` — content stays NULL, no promote ran). The generation budget is a
  decorator layer at the worker entrypoint — this flow only *reacts* to its `TimeoutError`, so a
  committed word is never journalled `timed_out`. A transient journal-write error on the success
  path is swallowed (the word is ready — no redrive); a commit-path error propagates.

**May import:** `core/*`, `repositories/*`, `@kotodama/core/database`, `@kotodama/*` packages, `effect`.
**MUST NOT import:** `apps/*`; nothing below may import upward into this package (Biome-enforced).
