# Observability (tracing)

**Always-loaded rule.** How LexiAI emits and views traces. Tooling choice is in
`@.claude/rules/tech-stack.md` (`@effect/opentelemetry`); this file is the working
convention for *using* it.

## The pipeline

Backend apps emit OpenTelemetry spans over **OTLP/HTTP**. The layer lives in
`@lexiai/observability` as `TracingLive(serviceName)` and is provided at the app
entrypoint **before** the runtime starts:

```ts
import { TracingLive } from '@lexiai/observability'
program.pipe(Effect.provide(TracingLive('lexiai-api')), BunRuntime.runMain)
```

- **Local:** spans go to the **Jaeger** container in `infra/local/docker-compose.yml`.
  `bun run --filter '@lexiai/infra' local:up`, then browse **http://localhost:16686**.
- **Prod (Lambda):** same code. Export target is the OTel-standard
  `OTEL_EXPORTER_OTLP_ENDPOINT` env var (point it at an ADOT collector / SaaS OTLP
  endpoint). With it unset in production, `TracingLive` is **inert** (no exporter).
- **Vendor-neutral on purpose.** We chose OTel→Jaeger over Effect's DevTools panel
  because DevTools is VS Code/Cursor-only and local-dev-only — it has no cloud story.
  OTel renders in Jaeger locally and in X-Ray/Grafana/etc. in prod from one wiring.

## Conventions

- **Span the meaningful units of work**, not every function. Wrap use cases, repo
  calls, AI calls, queue ops with `Effect.withSpan('Domain.operation', { attributes })`.
  `@effect/sql-pg` and `HttpApi` add their own spans; don't duplicate them.
- **Span names:** `PascalCaseSubject.operation` (e.g. `WordsRepo.findById`,
  `GenerateWord.run`). Attributes are lowercase dotted keys (`word.id`, `gen_ai.model`).
- **Never put secrets in attributes.** Redacted config (DB URL, API keys) stays out of
  spans, same as it stays out of logs.
- **`TracingLive` reads `process.env` directly**, not `AppConfig` — `observability` is a
  leaf package (may not import `@lexiai/config`), and env-var config is OTel's own idiom.
- **One service name per app:** `lexiai-api`, `lexiai-worker`. Trace context propagates
  across SQS so a word's request→worker flow links into one view.

## DevTools (the thing this is NOT)

Effect v4 ships DevTools in core at `effect/unstable/devtools` (NOT the v3
`@effect/experimental`). It streams spans to a **VS Code/Cursor** panel over a local
WebSocket. It is optional, editor-bound, and has no production use. This repo's primary
IDE is JetBrains, so we don't wire it; use OTel→Jaeger above instead.

## See also

- `@.claude/rules/tech-stack.md` — tool choice and versions.
- `@.claude/rules/effect-conventions.md` — `Effect.withSpan`, layer composition.
- `packages/observability/` — the `TracingLive` layer.
