# core/content — `@lexiai/core-content`

The word-generation seam. `ContentEngine` is the `Context.Service` port called once per stage
(`produce(stage, …)` → the stage's typed slice); `MockContentEngine` and the real OpenAI engine are
layers behind the same interface. It speaks backend domain types (`database/` content schemas),
which is why it lives in `core`, not `packages/ai` (a `packages/*` leaf may not import `database`).

- **Two abstraction levels, two errors:** the port fails per-stage (`ContentEngineError`); the
  recipe (`generateWordContent` — the private body of `WordGenerationServiceLive`, not exported)
  drives the whole build and fails with `WordGenerationError` carrying **both** the failed and the
  succeeded passes, so a caller records the full per-stage picture. Sequential gates fail fast
  (`fetch_source` grounds, `final_review` closes); the enrich fan-out runs under
  `Effect.partition` so one bad enrich doesn't interrupt siblings.
- **`STAGE_SLICES` (`stage-slices.ts`) is the single source of stage → output shape** — each slice
  `pick`ed off `WordContent` (the entity-minus-envelope selection, authored here because it's a
  derived domain shape; fields keep one author in `database/`), `satisfies Record<WordJobStage,
  Schema.Top>` for compiler exhaustiveness. Both the type and the engine's `generateObject`
  runtime schema come from here, so a stage's promise and its generation can't drift.
- **`WordGenerationService` exists so the build budget can be a layer** — `…Timed(budget)` is a
  single-tag decorator over `…Live`; the error union (`WordGenerationError | TimeoutError`) is
  fixed at the tag. The one justified service promotion of a recipe: an I/O unit decorated at
  wiring.
- **Provenance rides the engine, not a stage result** — `ContentEngine.sourceVersions` (model map +
  prompt hash) is bundled with `generate`'s result and stamped by `createWord`; each engine
  reports its own. Rejected: smuggling provenance as reserved keys on a stage result — one design
  decision split across two packages.
- **`generation-defaults.ts` is the one OpenAI-tuning surface** — models, reasoning effort, image
  options, `NO_TEXT_DIRECTIVE`, and the resilience preset *values* (`TEXT_RESILIENCE` /
  `IMAGE_RESILIENCE`). Deliberately not split: one retune touches one file. The resilience
  *mechanism* lives in `@lexiai/ai`; the engine makes **bare** `ai.*` calls — the presets are
  applied by the `AiServiceResilient` decorator at the worker entrypoint, never inline here.
- The real engine's media stages share `renderToStorage` (generate → `storage.put` → key), which is
  **key-scheme-agnostic** — the caller builds keys so the path scheme stays solely in
  `@lexiai/storage`. `mediaFailure` keeps error `cause`s JSON-serializable: a `StorageError`'s
  cause is a live S3 rejection, so it's dropped for a `{ tag, key }` snapshot.
- `MockContentEngine` is deterministic by construction (same `(word, stage)` → same content, no
  faker/clock); its failure paths are an injectable `ContentPolicy`.

**May import:** `@lexiai/database`, `@lexiai/*` packages, `effect`. **MUST NOT import:** `apps/*`;
`@lexiai/database/factories` belongs in tests, never `src/**`.
