# core/async-word-jobs — `@lexiai/core-async-word-jobs`

The job-side building blocks of the word-build flows (the flows themselves live in
`@lexiai/use-cases` and compose these). Owns exactly: the snapshot read
(`readWordBuildSnapshot` — pairs `core/words`' `findWord` (decoded `Option<Word>`) +
`selectWordJobStages` into `{ word, stages }` for the API's `getWordState` view; a plain function,
deps on `R`), the build-dispatch message
(`WordBuildMessage` + its JSON codec — authored here because `@lexiai/queue` stays
message-agnostic), and the terminal-failure policy (`isTerminallyFailed` — a domain rule over the
status vocabulary, not storage vocabulary, hence not in `database/`).

Not here, on purpose: the build-admission gate lives in `core/words` (a word-creation decision);
the view collapse lives at the API edge (presentation); seed + enqueue + which stages a build
comprises live in `requestWordBuild` (`use-cases`).

- **Convergence rests on a cross-file coupling:** the idempotent `stagePatch.pending` seed
  (upsert on `UNIQUE(word, language, stage)` — no duplicate rows under a concurrent race) **plus**
  the admission gate (`ensureWordBuildable`, which admits no second build once a word is running).
- **The async boundary is load-bearing:** `requestWordBuild` (api-side) and `buildWord`
  (worker-side) are deliberately separate flows — do not merge them, and do not pull them down
  into this package.

**May import:** `core/*`, `repositories/*`, `@lexiai/database`, `@lexiai/*` packages, `effect`.
**MUST NOT import:** `apps/*`, `@lexiai/use-cases` (the tier above).
