---
paths:
  - "platform/observability/**"
  - "apps/**"
---

# Observability (tracing)

Backend apps emit OpenTelemetry spans over OTLP/HTTP via `TracingLive(serviceName)`
(`@kotodama/platform/observability`), provided at the app entrypoint before the runtime:

```ts
program.pipe(Effect.provide(TracingLive('kotodama-api')), BunRuntime.runMain)
```

- **Local:** spans land in Jaeger (`bun run --filter '@kotodama/infra' local:up`, http://localhost:16686).
  **Prod:** set `OTEL_EXPORTER_OTLP_ENDPOINT`; unset ⇒ `TracingLive` is inert.
- **OTel→Jaeger, not Effect DevTools** (VS Code-only, no cloud story; this repo's IDE is JetBrains) — **don't wire DevTools.**
- **`TracingLive` reads `process.env` directly**, not `AppConfig` — it's a platform leaf adapter kept free of `@kotodama/platform/config`; env-var config is OTel's own idiom.
- One service name per app: `kotodama-api`, `kotodama-worker`.
- Span the meaningful units (use cases, repo/AI/queue ops) via `Effect.withSpan('Subject.operation', { attributes })` — `@effect/sql-pg` + `HttpApi` add their own, **don't duplicate**. Names `PascalCaseSubject.operation`; attribute keys lowercase-dotted.
