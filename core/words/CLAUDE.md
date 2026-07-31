# core/words — `@kotodama/core/words`

Word creation + input gates + build-admission policy + the domain `Word` union. There is **no
per-row word "model"** — backend code speaks the `database` shapes directly (`WordRow`, `WordEntity`);
a projection earns its way back only if a read truly *transforms* storage (e.g. presigned URLs).

- **`word.schema.ts` — the union `Word = ReadyWord | UnreadyWord` + `decodeWord`,** enforcing "ready ⇒
  complete content" **at decode**, mirroring the DB CHECK (a `succeeded` row with null content fails
  the `ReadyWord` leaf; a building row's NULLs drop as excess). It lives here, not `database` (a shape
  derived from the entity is core's). **`StaleWord` is reserved for the parked regen feature — do not
  add a third leaf.**
- **`findWord` is THE decoded read boundary** (`selectWord` + `decodeWord` → `Option<Word>`). Reads
  wanting the domain word call it; reads needing only the raw lifecycle `status`
  (`ensureWordBuildable`, existence checks) call the repo's `selectWord` — decoding a building row is
  wasted work. `decodeWord` stays exported for `search`'s list decode.
- **`createWord` owns the ready-invariant** — generate, then commit **uninterruptibly**: decode
  through `WordEntityInsert` with `status: 'succeeded'` stated together with full content (malformed
  assembly dies before the write), stamp provenance, `upsertWord`. **No retry/timeout here** — both
  are decorator layers at the worker entrypoint, so a committed word can never be journalled
  `timed_out`; `uninterruptible` defends only against ambient interrupts (worker shutdown).
- **`verify-word-input.ts` — the gibberish gate:** normalize → deterministic pre-filter (fail-closed
  floor) → OpenAI mini judge. **The judge fails open but not silently** — a provider error/timeout
  ADMITS the pre-filtered word after a logged warning (a quality gate must not block creation on its
  own failure). `VERIFIER_MODEL` is authored in `core/content`'s `generation-defaults.ts`.
- **`ensureWordBuildable`** — one build per `(word, language)`: absent/`failed` ⇒ buildable;
  `succeeded` ⇒ `WordAlreadyReadyError`; `pending`/`running` ⇒ `WordBuildInProgressError` (both 409s
  payload-less — identity is in the URL).
- **`ensureReadyWord`** decodes the `ReadyWord` leaf rather than checking `status` alone — it proves
  full content instead of trusting the discriminant, so a `succeeded` shell is a `WordNotReadyError`
  (409), not a broken cast.
- Re-exports `Language` so the API speaks the vocabulary through core.
