# platform/ai — `@kotodama/platform/ai`

`AiService` — a deep wrapper over `@effect/ai-openai`: two methods (`generateObject`,
`generateImage`), OpenAI hidden entirely, one `AiError` as the whole failure surface.
**Backend-only.**

- **Retry is opt-in at wiring, never an `AiService` property** — the service classifies its error
  (`AiError.isRetryable`); the *policy* is the caller's. `resilient(call, config)` knows only
  `AiError` (so it lives here, reusable); the tuning *values* live with the consumer
  (`core/content`'s `generation-defaults.ts`). `AiServiceResilient(text, image)` is the
  single-tag decorator layer that applies them — re-providing the same tag a layer consumes is
  acyclic (`Layer.provide` subtracts the requirement; the base builds once).
- **`AiServiceLive` owns no config/HTTP** — the OpenAI-key + `BunHttpClient` wiring lives with the
  app entrypoint; the layer is the seam faked in tests.
- **Two OpenAI clients, deliberately:** `generateObject` needs the handwritten `OpenAiClient`
  (what `OpenAiLanguageModel.model(id)` requires); `generateImage` needs the *generated*
  `OpenAiClientGenerated` — the only place `createImage` exists (the handwritten client exposes no
  image method).
- `generateObject`'s schema must **encode to an object**; `reasoningEffort` is required (callers
  default it via `generation-defaults.ts`). `generateImage` forces `output_format: 'png'` — GPT
  image models always return base64 (`b64_json`, never a URL); a response without it is a
  contract violation → `AiError`.

## `AiError` — serializable cause (the invariant)

`AiError.fromCause(method, raw)` derives `message` (drilled single line), `cause` (a compact
`CauseSnapshot`, recursed a few levels), and `isRetryable` **before the live provider object is
discarded** — the error is persisted into a `words.stages[].error` jsonb field, so it must
round-trip `JSON.stringify`. **Never store the live `Error`/provider object as a field** (live
objects carry non-enumerable getters / circular refs).

## Testing — `@kotodama/platform/ai/testing`

`AiServiceTest(fixtures)` returns canned object/image (omit a field ⇒ that method fails) — for
downstream suites, no network/key. The package's own tests drive the real service over fake OpenAI
client layers, so decode + error-mapping run without OpenAI.

**May import:** `effect`, `@effect/ai-openai`.
