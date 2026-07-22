# Effect Context & Layer (v4) — project pattern notes

Read the vendored source before writing DI/wiring code.

- Source: `repos/effect-smol/packages/effect/src/Context.ts` (`Service`, `Reference`),
  `Layer.ts` (`effect`, `scoped`-style constructors, `provide`, `provideMerge`, `succeed`,
  `sync`, `empty`), `LayerMap.ts`.
- Tests/examples: `repos/effect-smol/packages/effect/test/Layer.test.ts`,
  `LayerMap.test.ts`, and `Context.Service` usage in `test/HttpClient.test.ts`,
  `test/ManagedRuntime.test.ts`.

> v4 renamed `ServiceMap` **back to `Context`** during the beta. Use `Context.*`.

> **Not everything is a service.** A `Context.Service` + `Layer` is for things that *own* a
> resource / are *swapped in tests* (`DB`, `ContentEngine`, the queue/AI/storage clients). Repos are
> **bare DB-verb functions** (`selectWords` / `upsertWord`) and use-cases are **plain functions** — both
> ride their deps on the `R` channel, no tag. See "Service vs plain function" in
> `.claude/rules/effect-conventions.md` before reaching for the pattern below.

## Defining a service

```ts
import { Context, Effect, Layer } from 'effect'

export class ContentEngine extends Context.Tag('@kotodama/core/content/ContentEngine')<
  ContentEngine,
  { readonly produce: (stage: WordJobStage, language: Language, word: string) => Effect.Effect<StageResultEntity> }
>() {}
```

(Check `Context.ts` for the exact current `Service`/`Tag`/`Reference` shapes — the API moved
during the beta; the vendored source is authoritative.)

## Providing a Layer

```ts
export const ContentEngineLive = Layer.effect(
  ContentEngine,
  Effect.gen(function* () {
    // acquire deps (the AI client, etc.) here
    return ContentEngine.of({ produce: (stage, language, word) => Effect.succeed(/* … */) })
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
