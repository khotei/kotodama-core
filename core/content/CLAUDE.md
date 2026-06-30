# core/content — `@lexiai/core-content`

The word-generation seam. `ContentEngine` is the `Context.Service` port the build pipeline calls
once per `wordJobStage` pass — `produce<S>(stage, language, word, grounding?) → StageSlice<S>`, the
stage's **typed** output slice (not an opaque record), with `fetch_source`'s `WordGrounding` threaded
into later stages. The interface speaks **backend domain types** (the `database/` content schemas +
`WordJobStage` from `@lexiai/database`), which is exactly why it lives in `core` and not `packages/ai`
(a `packages/*` leaf may not import `database`). `MockContentEngine` is the test/demo layer; the real
OpenAI engine is another layer behind this same interface — the "swap changes nothing" boundary, so a
slice mirrors the per-stage write the worker persists to `async_word_jobs.result`.

**Two abstraction levels, two errors:** the **port** (`ContentEngine.produce`) produces one stage and
fails with `ContentEngineError` (that stage failed); the **recipe** (`generateWordContent`) drives the
whole build and fails with `WordGenerationError` (carrying every failed *and* succeeded pass) — but the
recipe is no longer a public function: it is the private body of `WordGenerationService` (the
generation-as-a-service seam). **The `index.ts` barrel exports** the port + its error, the
**`WordGenerationService`** (tag + `…Live`/`…Timed` layers) + `WordGenerationError`, the two engine
layers, `StageSlice`, and the two resilience presets (`TEXT_RESILIENCE`/`IMAGE_RESILIENCE` — the worker
wiring applies them, not the engine). `prompts`, `STAGE_SLICES`, the rest of `generation-defaults`, the
mock content data, and `generateWordContent` itself are implementation, imported within the package,
never re-exported.

- **`stage-slices.ts` is the single source of stage → output shape.** `STAGE_SLICES` is one slice per
  stage, each **`pick`ed off `WordContentSchema`** (`@lexiai/database`) — so a field's schema has one
  author in `database/` and this map holds only the *partition* (which keys per stage), not re-declared
  field types. `satisfies Record<WordJobStage, Schema.Top>` keeps it compiler-exhaustive; both the
  **type** (`StageSlice<S>`) and the real engine's `generateObject` **runtime schema** come from here, so
  a stage's promise and its generation can't drift, and the mock is bound to the same `StageSlice` type.
  `produce` dispatches via a per-stage **handler record** (no `switch`), so the generic per-stage type
  survives. `WordGrounding` is a curated subset of the `fetch_source` slice (the stability seam fed into
  the enrich/final prompts) — distinct from `fetchSourcePrompt`'s `WikiFacts` (best-effort Wikipedia
  facts; named so the two "grounding" ideas don't blur).
- **`word-generator.ts` is the content *recipe* — the single statement of how a word's content is
  generated** (now the **private body** of `WordGenerationServiceLive`, not a barrel export).
  `generateWordContent(language, word)` owns the **topology once** (ground →
  4 concurrent enrich → `final_review` last), returns the merged `WordContent` (`@lexiai/database`), and
  **fails with `WordGenerationError`** the moment a pass fails — it persists nothing, so every caller
  decides what success/failure mean. The error carries **two lists** — `failures` (every failed stage +
  typed `JobError`) and `succeeded` (the passes that completed before the build was abandoned) — so a
  caller records the full per-stage picture; passes that never ran stay untouched. **Sequential gates
  fail-fast** (`fetch_source` grounds the rest; `final_review` closes), the **enrich fan-out runs under
  `Effect.partition`** (every pass runs, the effect never fails, failures-first tuple), so one bad enrich
  doesn't interrupt its siblings — every reason *and* every success is collected. `runStage` surfaces an
  engine error verbatim as a plain `{ stage, error: JobError }` failure (the gates `Effect.catch` it);
  `JobError.message`/`cause` come straight from the `ContentEngineError` (whose `message` is `AiError`'s
  drilled reason and `cause` its serializable snapshot) — no string concat, no local `describeCause`. No wall-clock budget
  here: the recipe runs to completion or fails, and the **whole-build** timeout is the
  `WordGenerationServiceTimed(budget)` decorator over this recipe-as-service (`word-generation.service.ts`),
  applied at the worker entrypoint. A plain `Effect.fnUntraced` (no options bag,
  no callbacks, no resume, no generics); the per-stage runner inside is higher-ranked over `S` but
  **private**.
- **`word-generation.service.ts` lifts the recipe into a service so the budget can be a layer.**
  `WordGenerationService.generate(language, word)` runs `generateWordContent` and returns the content
  **bundled with the engine's `sourceVersions`** (provenance travels with the generation that produced
  it, so `createWord` reads one service and `ContentEngine` stays internal). `WordGenerationServiceLive`
  is the recipe over the `ContentEngine` swap boundary; `WordGenerationServiceTimed(budget)` is a
  single-tag decorator wrapping `generate` in `Effect.timeout`. The error union is
  `WordGenerationError | TimeoutError` on **every** layer (fixed at the tag — `Live` never times out;
  only `…Timed` does). This is the one justified service promotion of a recipe: criterion (c), an
  I/O unit decorated at wiring — see `.claude/rules/effect-conventions.md`.

- **May import:** `@lexiai/database` (content schemas + `WordJobStage`/`JobErrorType` enums),
  `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`. `@lexiai/database/factories` (the faker factory) belongs in tests,
  never this package's `src/**` — it is the *shape* model for the mock, not an import.
- **Build provenance lives on the engine, not in a stage result.** `ContentEngine.sourceVersions`
  (primary model + per-stage model map + prompt-template hash + pipeline id) is read once at promotion by `createWord` (`@lexiai/core-words`)
  and stamped onto `words.sourceVersions`. It is engine *identity*, not a content pass — each engine
  (real / mock) reports its own. Decision: this replaced an earlier coupling where the real engine
  smuggled provenance as reserved `__model`/`__promptHash` keys on the `final_review` `StageResult`,
  which `promote` had to read, fall back for, and strip — a single design decision split across two
  packages. Provenance-as-engine-property removes that leak (deep-modules §3).
- **`MockContentEngine` is deterministic by construction** — same `(word, stage)` → same content, no
  `faker`/clock/randomness — so tests and the local demo are reproducible.
- **Failure paths are an injectable `ContentPolicy`** — `not_found` / `failed` map to a typed
  `ContentEngineError`; a per-stage delay drives the worker's timeout (the timeout itself is the
  worker's concern, not this engine's). The default policy reserves a few demo words for the local loop.
- **`RealContentEngine` requires `AiService | WikiClient | ImagesStore`.** The two media stages
  render images: `renderToStorage(key, prompt, kind)` is the one image→storage seam they share —
  `ai.generateImage` → `storage.put(key, bytes, { contentType: 'image/png' })` → returns the key. It is
  **key-scheme-agnostic**: the *caller* builds the key (`imageKey(...)` for visuals, `authorKey(...)`
  for portraits) so the path scheme stays solely in `@lexiai/storage`, and names the image `kind`; every
  `AiError`/`StorageError` maps to `failed` via the module-level `mediaFailure` — it keeps `cause`
  JSON-serializable: an `AiError`'s `cause` is already a snapshot, but a `StorageError`'s `cause` is a
  **live** S3 rejection, so it is dropped for a `{ tag, key }` snapshot. Both media stages first `generateObject` a *plan* (every
  image key `null`), then render and fill the keys: `enrich_visuals` renders hero/infographic/each-meme;
  `enrich_authors` owns BOTH the author text AND one portrait per author — `authorImageUrl` lives in the `authorExamples` slice,
  so its image→S3 path runs in *this* stage to keep stage→slice keys disjoint (Clarify §16 G5).
- **`generation-defaults.ts` is the engine's one OpenAI-call tuning surface**, kept beside the engine so
  the pipeline file stays pure topology. It holds *which model, at what depth/quality* — `TEXT_GEN`
  (per-stage model + `reasoningEffort`), `imageOptionsFor(kind)` (hero → `gpt-image-2`, every secondary
  image → the lighter `gpt-image-1.5`; fixed `low`/`1024²`, returns `@lexiai/ai`'s `ImageOptions`),
  `NO_TEXT_DIRECTIVE` (images are text-free — captions/quotes are separate UI fields), `IMAGE_CONCURRENCY`,
  `PROVENANCE_MODEL` — **plus** the per-call resilience presets `TEXT_RESILIENCE` / `IMAGE_RESILIENCE`
  (the *values*: timeout + retry count). This is the surface to retune for generation-quality
  experiments — change it, nothing else moves. **Deliberately not split**: scattering these across files
  would make one retune touch several. The resilience *mechanism* is **not** here — `resilient(call,
  config)` lives in `@lexiai/ai` (it knows only `AiError`, so it's reusable by any AI consumer); this
  package owns only the policy *values*. **The engine no longer applies them** — it makes **bare**
  `ai.*` calls; the presets are exported from the barrel and applied by the `AiServiceResilient` decorator
  layer at the worker entrypoint (infra-as-layer), so retry is chosen at wiring, never an `AiService`
  property and never inline in the engine.
