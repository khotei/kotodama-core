# Effect Context & Layer (v4) — project pattern notes

Read the vendored source before writing DI/wiring code; it mirrors `LLMS.md` §Context.Service.

- Source: `repos/effect-smol/packages/effect/src/Context.ts` (`Service`, `Reference`),
  `Layer.ts` (`effect`, `scoped`-style constructors, `provide`, `provideMerge`, `succeed`,
  `sync`, `empty`), `LayerMap.ts`.
- Tests/examples: `repos/effect-smol/packages/effect/test/Layer.test.ts`,
  `LayerMap.test.ts`, and `Context.Service` usage in `test/HttpClient.test.ts`,
  `test/ManagedRuntime.test.ts`.

> v4 renamed `ServiceMap` **back to `Context`** during the beta. Use `Context.*` (`Context.Service`).

> **Not everything is a service.** A `Context.Service` + `Layer` is for things that *own* a
> resource / are *swapped in tests* (`DB`, `ContentEngine`, the queue/AI/storage clients). Repos are
> **bare DB-verb functions** (`selectWords` / `upsertWord`) and use-cases are **plain functions** — both
> ride their deps on the `R` channel, no tag. See "Service vs plain function" in
> `.claude/rules/effect-conventions.md` before reaching for a service.

Compose Layers at the **app entrypoint** and run with `BunRuntime.runMain`; never construct deps
inside use cases. Test fixtures use `@effect/vitest` `it.effect`/`it.scoped` with a test Layer.
