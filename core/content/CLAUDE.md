# core/content — `@kotodama/core/content`

The word-generation seam. `ContentEngine` is the per-stage port; `MockContentEngine` and the real
OpenAI engine are layers behind it. It speaks `database` content schemas — **which is why it lives in
`core`, not `platform/ai`** (a `platform/*` leaf may not import `@kotodama/database`).

- **Two levels, two errors:** the port fails per-stage (`ContentEngineError`); the recipe
  (`WordGenerationServiceLive`'s body) fails with `WordGenerationError` carrying **both** failed and
  succeeded passes, so the caller records the full picture. Sequential gates fail fast; the enrich
  fan-out runs under `Effect.partition` so one bad enrich doesn't interrupt siblings.
- **`STAGE_SLICES` is the single source of stage → output shape** — each slice `pick`ed off
  `WordContent`, `satisfies Record<WordJobStage, Schema.Top>` for exhaustiveness. Both the type AND
  the engine's `generateObject` runtime schema come from here, so promise and generation can't drift.
- **`WordGenerationService` exists so the build budget can be a layer** — `…Timed(budget)` is a
  single-tag decorator over `…Live`, error union fixed at the tag. The one justified service promotion
  of a recipe.
- **Provenance rides the engine, not a stage result** — `ContentEngine.provenance` is bundled with
  `generate`'s result and stamped by `createWord`. Rejected: smuggling it as reserved keys on a stage
  result (one decision split across two packages).
- **`generation-defaults.ts` is the one OpenAI-tuning surface** — models, effort, image options,
  `NO_TEXT_DIRECTIVE`, the resilience preset *values*. The resilience *mechanism* is in
  `@kotodama/platform/ai`; the engine makes **bare** `ai.*` calls — presets are applied by the
  `AiServiceResilient` decorator at the worker entrypoint, never inline.
- Media stages share `renderToStorage`, **key-scheme-agnostic** — the caller builds keys so the path
  scheme stays solely in `@kotodama/platform/storage`. `mediaFailure` drops a `StorageError`'s live
  S3 cause for a JSON-serializable `{ tag, key }` snapshot.
- `MockContentEngine` is deterministic (no faker/clock); its failure paths are an injectable
  `ContentPolicy`.

MUST NOT import `apps/*` or `@kotodama/core/use-cases` (Biome-enforced); `database/factories` → tests
only.
