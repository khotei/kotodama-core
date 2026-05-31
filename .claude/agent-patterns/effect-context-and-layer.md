# Effect Context & Layer (v4) — project pattern notes

Read the vendored source before writing DI/wiring code.

- Source: `repos/effect-smol/packages/effect/src/Context.ts` (`Service`, `Reference`),
  `Layer.ts` (`effect`, `scoped`-style constructors, `provide`, `provideMerge`, `succeed`,
  `sync`, `empty`), `LayerMap.ts`.
- Tests/examples: `repos/effect-smol/packages/effect/test/Layer.test.ts`,
  `LayerMap.test.ts`, and `Context.Service` usage in `test/HttpClient.test.ts`,
  `test/ManagedRuntime.test.ts`.

> v4 renamed `ServiceMap` **back to `Context`** during the beta. Use `Context.*`.

## Defining a service

```ts
import { Context, Effect, Layer } from 'effect'

export class WordsRepo extends Context.Tag('@lexiai/repositories-words/WordsRepo')<
  WordsRepo,
  { readonly findById: (id: string) => Effect.Effect<Word | null> }
>() {}
```

(Check `Context.ts` for the exact current `Service`/`Tag`/`Reference` shapes — the API moved
during the beta; the vendored source is authoritative.)

## Providing a Layer

```ts
export const WordsRepoLive = Layer.effect(
  WordsRepo,
  Effect.gen(function* () {
    // acquire deps (DB client, etc.) here
    return WordsRepo.of({ findById: (id) => Effect.succeed(null) })
  }),
)
```

- `Layer.effect(Tag, effect)` — build a service from an Effect.
- `Layer.scoped(...)` — when the service owns resources needing release.
- Compose with `Layer.provide` / `Layer.provideMerge`; merge siblings as needed.

## Wiring

Compose Layers at the **app entrypoint** (`apps/api/src/main.ts`, `apps/worker/src/main.ts`)
and run with `BunRuntime.runMain`. Never construct dependencies inside use cases — yield the
service tag and let the Layer supply it.

## Fixtures in tests

Use `@effect/vitest`'s `it.effect` / `it.scoped` with a test Layer providing fakes. See
`Layer.test.ts` for idiomatic layer-composition test patterns.

## Avoid

- Global singletons / manual DI containers — use Layers.
- `ServiceMap` (old name). It's `Context` now.
