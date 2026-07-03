# core/words — `@lexiai/core-words`

Word creation + input gates + build-admission policy + the domain `Word` union. There is **no
per-row word "model"** — backend code speaks the `database/` shapes directly (`WordRow` through
reads, `WordEntity` at contracts); a projection earns its way back only if a read ever truly
transforms storage (e.g. presigned URLs).

- **`word.schema.ts` — the domain union `Word = ReadyWord | UnreadyWord` + `decodeWord`.** It
  enforces "ready ⇒ complete content" **at decode**, mirroring the DB CHECK: a `succeeded` row
  with null content fails the `ReadyWord` leaf (whose fields derive from `WordEntity`, so they
  can't drift); a building row's NULL content drops as excess. It lives here, not `database/` — a
  shape *derived* from the entity is core's; `database/` stays entity-level storage vocabulary.
  `StaleWord` is reserved for the parked regen feature — do not add a third leaf.
- **`findWord` (`word-read.ts`) is THE decoded read boundary** — `selectWord` + `decodeWord` in one
  step, returning `Option<Word>`, so no edge repeats the decode. Reads that want the domain word
  (the API's `getWord`, the build snapshot behind `getWordState`) call `findWord`; reads that only
  need the raw lifecycle `status` (`ensureWordBuildable`, existence checks) call the repo's
  `selectWord` directly — decoding a building row is wasted work. `decodeWord` stays exported for a
  list read (`search` decodes rows with `Effect.forEach`).
- **`createWord`** owns one piece of knowledge: the **ready-invariant** — generate
  (`WordGenerationService`), then commit uninterruptibly: decode through `WordEntityInsert` with
  `status: 'succeeded'` stated together with full content (a malformed assembly dies before the
  write), stamp provenance, `upsertWord`. **No retry or timeout here** — both are decorator layers
  at the worker entrypoint (`WordGenerationServiceTimed`), so the commit runs strictly after the
  timeout race resolves and a committed word can never be journalled `timed_out`; the
  `uninterruptible` defends only against ambient interrupts (worker shutdown).
- **`verify-word-input.ts`** — the create-path gibberish gate: normalize (composes
  `parseWordInput`, `word-input.ts` — the pure normalizer carries no length policy) →
  deterministic pre-filter (fail-closed floor) → OpenAI mini judge. **The judge fails open but not
  silently**: a provider error/timeout ADMITS the pre-filtered word (a non-critical quality gate
  must not block creation on its own failure) after a logged warning. `VERIFIER_MODEL` is authored
  in `core/content`'s `generation-defaults.ts` (the one OpenAI-tuning surface).
- **`word-build-policy.ts`** — `ensureWordBuildable`, the one-build-per-`(word, language)` gate: a
  pure switch over one `Option<WordRow>`'s `status` (absent or `failed` ⇒ buildable; `succeeded` ⇒
  `WordAlreadyReadyError`; `pending`/`running` ⇒ `WordBuildInProgressError`; both 409s are
  payload-less — identity is in the request URL).
- **`word-ready-policy.ts`** — `ensureReadyWord`, pure over an already-decoded `Word` ("caller
  fetches, gate decides"): **decodes the `ReadyWord` leaf** (`decodeReadyWord`) rather than
  checking `status` alone — it proves full content instead of trusting the union's discriminant, so
  a `succeeded` shell is a `WordNotReadyError` (409), not a broken cast. A corrupt `succeeded` row
  never reaches it — that dies at `findWord`'s decode. Absence never reaches it either — the handler
  answers 200 `null` first.
- Re-exports `Language` so the API speaks the vocabulary through core.

**May import:** `core/content`, `@lexiai/ai`, `repositories/*`, `@lexiai/database`, `@lexiai/*`
packages, `effect`. **MUST NOT import:** `apps/*`, `use-cases/*`; no HTTP code.
`@lexiai/database/factories` (pulls faker) belongs in tests, not `src/**`.
