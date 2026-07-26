# platform/ai — `@kotodama/platform/ai`

`AiService` — deep wrapper over `@effect/ai-openai` (`generateObject`, `generateImage`); OpenAI
hidden entirely, one `AiError` the whole failure surface. **Backend-only.**

- **Retry is opt-in at wiring, never an `AiService` property** — the service only classifies
  (`AiError.isRetryable`); the policy is the caller's. `resilient(call, config)` knows only `AiError`
  (reusable, lives here); the tuning **values** live with the consumer (`core/content`'s
  `generation-defaults.ts`). `AiServiceResilient` is the single-tag decorator layer applying them.
- **`AiServiceLive` owns no config/HTTP** — the OpenAI key + `BunHttpClient` wiring lives at the app
  entrypoint; the layer is the seam faked in tests.
- **Two OpenAI clients, deliberately** — `generateObject` needs the handwritten `OpenAiClient`;
  `generateImage` needs the *generated* `OpenAiClientGenerated`, the only place `createImage` exists.
- `generateImage` forces `output_format:'png'` — GPT image models always return base64 (`b64_json`,
  never a URL); a response without it is a contract violation → `AiError`.

## `AiError` — serializable cause (the invariant)

`AiError.fromCause` derives `message`/`cause`/`isRetryable` **before the live provider object is
discarded** — the error is persisted into a `words.stages[].error` jsonb field and must round-trip
`JSON.stringify`. **Never store the live `Error`/provider object** (non-enumerable getters, circular
refs).

## Testing — `@kotodama/platform/ai/testing`

`AiServiceTest(fixtures)` returns canned object/image (omit a field ⇒ that method fails) for
downstream suites — no network/key.
