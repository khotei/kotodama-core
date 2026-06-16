# core/words — `@lexiai/core-words`

Word read use cases. **There is no per-row word "model"** — backend code speaks the `database/`
shapes directly: `WordRow` (`$inferSelect`) flows through services, and the wire contract composes
`WordEntity` (the runtime schema). **`WordFinder`** is the pure content read: `find` returns the
`WordRow` when a `words` row exists, else `Option.none` — absence is a value, never an error (so it
is `find`, not `get`); it never writes. `core/async-word-jobs`' `WordBuildState` stands on
`WordsRepo` directly for its `succeeded` variant — no use-case-to-use-case edge. The package
re-exports `Language` (authored in `database/`) so the API speaks the vocabulary through core.

> **Decision — `WordModel`/`toWord` deleted (2026-06-12, user-driven "rows flow, schemas guard the
> boundaries").** The model was the entity minus `sourceVersions` plus a per-call runtime projection.
> The field is no longer hidden (provenance may ride to the client), and even when a field *is*
> boundary-hidden, Schema encoding at the contract already strips non-schema keys by default — a
> per-call runtime strip duplicates that. `.model.ts` is now reserved for **computed read models**
> (`WordStateModel`) — shapes with no backing row. If a read ever has to truly transform storage
> (presign `StorageKey`s), that's when a projection earns its way back.

- **May import:** `repositories/*`, `@lexiai/database`, `@lexiai/*` packages, `effect`.
- **MUST NOT import:** `apps/*`. No HTTP code — that lives in `apps/api`. `@lexiai/database/factories`
  (pulls faker, a devDependency) belongs in tests, not `src/**`.
