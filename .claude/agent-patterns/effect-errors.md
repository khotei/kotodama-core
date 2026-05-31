# Effect error model (v4) — project pattern notes

Read the vendored source before designing errors.

- Source: `repos/effect-smol/packages/effect/src/Data.ts` (`TaggedError`, `TaggedClass`,
  `$is`, `$match`), `Cause.ts`, `Effect.ts` (`catchTag`, `catchTags`, `catchCause`),
  `Schema.ts` (schema-backed tagged errors).
- Tests/examples: `repos/effect-smol/packages/effect/test/Cause.test.ts`.

## Defining a tagged error

```ts
import { Data } from 'effect'

export class WordNotFoundError extends Data.TaggedError('WordNotFoundError')<{
  readonly id: string
}> {}
```

`Data.TaggedError(tag)<fields>` gives a constructor + a `_tag` discriminant. Use
`Data.TaggedClass` for non-error tagged data.

## Handling

```ts
program.pipe(
  Effect.catchTag('WordNotFoundError', (e) => Effect.succeed(fallbackFor(e.id))),
)
// or multiple:
Effect.catchTags({ WordNotFoundError: handleA, ValidationError: handleB })
```

- `Effect.catchTag(tag, handler)` — one tag.
- `Effect.catchTags({ ... })` — map several tags.
- `Effect.catchCause` — when you need the full `Cause` (defects, interrupts).

## Pattern-matching tagged values

`Data.$is(tag)` is a type-guard refinement and `Data.$match` matches by tag (see the May 2026
recap clarification on `$is`/`$match`). Prefer these over manual `_tag` string comparisons.

## Schema-backed errors

For errors that cross the wire (HttpApi responses), define them as schema-backed tagged
errors so they encode/decode — see `Schema.ts` tagged-error helpers and
`unstable/httpapi/HttpApiError.ts`.

## Avoid

- Throwing plain `Error`s inside Effects — model failures in the error channel with tagged
  errors so callers can `catchTag` exhaustively.
- Comparing `_tag` strings by hand when `Data.$is` / `Effect.catchTag` exist.
