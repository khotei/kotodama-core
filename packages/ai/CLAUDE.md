# packages/ai — `@lexiai/ai`

`AiService` — a **deep** wrapper over `@effect/ai-openai`: two methods (`generateObject`,
`generateImage`), OpenAI hidden entirely, one `AiError` (`Data.TaggedError`) as the whole failure
surface. **Backend-only.** `ImageOptions` (the `generateImage` argument) is exported so a caller composes
it instead of re-declaring `{model, size, quality}`.

- **`resilient(call, config)` (`resilient.ts`) — the consumer-side retry wrapper.** Caps one OpenAI call
  per `ResilienceConfig` ({`method`, `timeout`, `retries`}) and retries while the failure is transient
  (`AiError.isRetryable` or its own timeout), keeping the channel `AiError`. It knows **only** `AiError`,
  so it's reusable by any consumer and lives here, not in a caller. Retry is **opt-in at wiring**, never
  an `AiService` property (the rule: the service classifies its error via `isRetryable`; the *policy* is
  the caller's). The tuning *values* are the consumer's — `core/content`'s `generation-defaults.ts` owns
  `TEXT_RESILIENCE` / `IMAGE_RESILIENCE`.
- **`AiServiceResilient(text, image)` (`ai-resilient.service.ts`) — the decorator layer that *applies*
  `resilient`.** A **single-tag** decorator: it `yield*`s `AiService` (the base, supplied via
  `Layer.provide(AiServiceLive)`) and re-provides the same tag with every `generateObject`/`generateImage`
  wrapped in `resilient(_, preset)`. Verified safe — providing the same tag a layer outputs is acyclic
  (`Layer.provide` subtracts the requirement; the base builds once). Interposed at the worker entrypoint,
  so consumers (the content engine) make **bare** `ai.*` calls and the retry policy is a wiring choice,
  not inlined at the call site. Replaces the old per-call-site `resilient(…, PRESET)` inside the engine.
- **May import:** `effect`, `@effect/ai-openai`.
- **MUST NOT** be imported by `apps/web` (covered by the `apps/web` catch-all `@lexiai/*` ban in
  `biome.json` — no per-package entry needed).

## Load-bearing wiring

- **One boundary layer, `AiServiceLive`** (no `make` indirection, no `*Default`). It captures both
  OpenAI clients in context and is the seam faked in tests / wired with the production clients **at the
  worker entrypoint** — `AiServiceLive` itself owns no config/HTTP, so the OpenAI-key + `BunHttpClient`
  wiring lives with the entrypoint, not here.
- **Two OpenAI services, captured at layer build.** `generateObject` runs through the *handwritten*
  `OpenAiClient` (what `OpenAiLanguageModel.model(id)` requires); `generateImage` calls
  `createImage` on the *generated* `OpenAiClientGenerated` (the only place that method lives — the
  handwritten `OpenAiClient.Service` exposes no image method). Both are captured and re-provided
  inside the methods so each method's requirement channel is `never`.
- **`generateObject`** provides `OpenAiLanguageModel.model(opts.model, { reasoning: { effort } })`
  (a `Layer`, not an effect) then `provideService`s the captured client; returns `response.value`
  (already decoded). The schema is a `Schema.Codec<A, I>` (v4's `Schema.Schema` is single-arg) that
  **must encode to an object**. `reasoningEffort` is required (callers default it via
  `core/content`'s `generation-defaults.ts`).
- **`generateImage`** forces `output_format: 'png'`; GPT image models always return base64
  (`data[0].b64_json`, never a URL), decoded via `Encoding.decodeBase64`. A response without
  `b64_json` is a contract violation → `AiError`, not a recoverable value. `size`/`quality` are
  required.

## `AiError` — serializable cause + derived message

`AiError` is built once from the freshly caught provider error via `AiError.fromCause(method, raw)`,
which derives three persistable fields **before the live object is discarded**:
- **`message`** — a human-readable single line drilled from the wrapped chain (our `AiError` → the
  provider error), distinct messages joined newest-first, whitespace collapsed, capped ~300 chars.
  Downstream `core/content` copies this straight into `ContentEngineError.message` (it replaced that
  package's own `describeCause` helper).
- **`cause`** — a compact `CauseSnapshot` (`{ tag?, message?, cause? }`, recursed a few levels), **not
  the live `Error`/provider object**: it is persisted into the `async_word_jobs.error` jsonb column, so
  it must round-trip through `JSON.stringify` (a live object carries non-enumerable getters / circular
  refs). This is the invariant — never store the live object as a field.
- **`isRetryable`** — classified eagerly from the raw error (provider-retryable `AiError` or a
  retryable HTTP status/rate-limit), since the raw object isn't kept.

## Testing — `@lexiai/ai/testing`

`AiServiceTest(fixtures)` is a `Layer.succeed` fake returning canned `object`/`image` (omit a field
to make that method fail with `AiError`) — for downstream suites, no network/key. The package's own
tests drive the **real** service over fake `OpenAiClient` + `OpenAiClientGenerated` layers
(`AiServiceLive`), so `generateImage`'s decode + error-mapping (and the serializable-cause/message
derivation) run without OpenAI.
