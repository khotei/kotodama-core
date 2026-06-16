# core/content — `@lexiai/core-content`

The word-generation seam. `ContentEngine` is the `Context.Service` port the build pipeline calls
once per `wordJobStage` pass — `produce(stage, language, word) → StageResult`. The interface speaks
**backend domain types** (`StageResult` / `WordJobStage` from `@lexiai/database`), which is exactly
why it lives in `core` and not `packages/ai` (a `packages/*` leaf may not import `database`).
`MockContentEngine` is the test/demo layer; the real OpenAI engine swaps in next milestone as another
layer behind this same interface — the "swap changes nothing" boundary, so `produce` mirrors the
per-stage write the worker does.

- **May import:** `@lexiai/database` (content schemas + `StageResult`/`WordJobStage`/`JobErrorType`
  enums + `WordEntityInsert`), `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`. `@lexiai/database/factories` (the faker factory) belongs in tests,
  never this package's `src/**` — it is the *shape* model for the mock, not an import.
- **`MockContentEngine` is deterministic by construction** — same `(word, stage)` → same content, no
  `faker`/clock/randomness — so tests and the local demo are reproducible.
- **Failure paths are an injectable `ContentPolicy`** — `not_found` / `failed` map to a typed
  `ContentEngineError`; a per-stage delay drives the worker's timeout (the timeout itself is the
  worker's concern, not this engine's). The default policy reserves a few demo words for the local loop.
