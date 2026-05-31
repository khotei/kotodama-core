# Effect Schema (v4) — project pattern notes

Project-local cheat sheet. **The source of truth is the vendored code**, not this file:
read it before writing Schema code.

- Source: `repos/effect-smol/packages/effect/src/Schema.ts`, `SchemaAST.ts`,
  `SchemaTransformation.ts`, `SchemaGetter.ts`, `SchemaIssue.ts`.
- Tests/examples: `repos/effect-smol/packages/effect/test/schema/Schema.test.ts`,
  `toCodec.test.ts`, `toArbitrary.test.ts`.
- Use `effect/Schema` — **never Zod**. Shared schemas live in `@lexiai/schemas`.

## Common constructors

`Schema.String`, `Schema.Number`, `Schema.Boolean`, `Schema.Struct({...})`,
`Schema.Array`, `Schema.Union`, `Schema.Literal`, `Schema.optional`, `Schema.NonEmptyString`.

```ts
import { Schema } from 'effect'

export const Word = Schema.Struct({
  id: Schema.String,
  text: Schema.NonEmptyString,
  definitions: Schema.Array(Schema.String),
})
export type Word = typeof Word.Type
```

## Encode / decode

Decoders/encoders return Effects (see `Schema.ts` `decodeUnknownEffect`, `decodeEffect`,
`encodeEffect`):

```ts
const decode = Schema.decodeUnknownEffect(Word) // (u: unknown) => Effect<Word, SchemaError>
const encode = Schema.encodeEffect(Word)
```

`Schema.asserts(schema)` builds a type-guard assertion. Sync/Option/Either variants also
exist — check `Schema.ts` exports rather than guessing.

## Class API

`Schema.Class` defines a tagged class-backed schema (constructor + schema in one). See
`Schema.test.ts` for `Class` usage and `asClass`/branding patterns.

## Transformations

Compose with `SchemaTransformation.ts` helpers (e.g. string ↔ Date). Prefer reusing existing
transformations in the vendored source over hand-rolling parsers.

## Avoid

- Zod, `io-ts`, or ad-hoc validators — one schema lib (`effect/Schema`) only.
- Backend-only types in `@lexiai/schemas` — it is isomorphic (FE + BE).
- Guessing v4 method names from v3 memory; the Schema API was consolidated during the beta —
  grep `Schema.ts` exports.
