# Effect error model (v4) — project pattern notes

Read the vendored source before designing errors; defining/handling tagged errors mirrors
`LLMS.md` §Error handling.

- Source: `repos/effect-smol/packages/effect/src/Data.ts` (`TaggedError`, `TaggedClass`,
  `$is`, `$match`), `Cause.ts`, `Effect.ts` (`catchTag`, `catchTags`, `catchCause`),
  `Schema.ts` (schema-backed tagged errors).
- Tests/examples: `repos/effect-smol/packages/effect/test/Cause.test.ts`.

## Rules

- Define tagged errors with `Data.TaggedError(tag)<fields>` (constructor + `_tag` discriminant);
  `Data.TaggedClass` for non-error tagged data.
- **Don't throw plain `Error`s inside Effects** — model failures in the error channel with tagged
  errors so callers can `catchTag` exhaustively.
- Prefer `Data.$is(tag)` (type-guard refinement) / `Data.$match` (match by tag) over manual `_tag`
  string comparisons.
- **Errors that cross the wire** (HttpApi responses) must be schema-backed so they encode/decode —
  see `Schema.ts` tagged-error helpers and `unstable/httpapi/HttpApiError.ts`.
