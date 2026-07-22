---
paths:
  - "platform/observability/**"
  - "apps/**"
---

# Observability (tracing)

Backend apps emit OpenTelemetry spans over OTLP/HTTP via `TracingLive(serviceName)`
(`@kotodama/platform/observability`), provided at the app entrypoint before the runtime starts:

```ts
program.pipe(Effect.provide(TracingLive('kotodama-api')), BunRuntime.runMain)
```

- **Local:** spans land in the Jaeger container (`bun run --filter '@kotodama/infra' local:up`,
  browse http://localhost:16686). **Prod:** same code — set the OTel-standard
  `OTEL_EXPORTER_OTLP_ENDPOINT`; with it unset, `TracingLive` is inert.
- **Vendor-neutral on purpose** — OTel→Jaeger was chosen over Effect's DevTools panel
  (`effect/unstable/devtools`), which is VS Code-only and local-only with no cloud story; this
  repo's primary IDE is JetBrains. Don't wire DevTools.

## Conventions

- **Span the meaningful units of work, not every function** — use cases, repo calls, AI calls,
  queue ops via `Effect.withSpan('Domain.operation', { attributes })`. `@effect/sql-pg` and
  `HttpApi` add their own spans; don't duplicate them.
- Span names: `PascalCaseSubject.operation`; attributes are lowercase dotted keys.
- **Never put secrets in attributes** — redacted config stays out of spans, same as logs.
- **`TracingLive` reads `process.env` directly**, not `AppConfig` — `observability` is a platform
  leaf adapter (kept free of `@kotodama/platform/config`), and env-var config is OTel's own idiom.
- One service name per app: `kotodama-api`, `kotodama-worker`.
