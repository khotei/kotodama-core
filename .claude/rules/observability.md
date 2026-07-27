---
paths:
  - "platform/observability/**"
  - "apps/**"
---

# Observability (tracing)

Backend apps trace via `TracingLive(serviceName)` (`@kotodama/platform/observability`) — mechanics
and decisions are documented in its source. **Debugging a runtime issue? Traces are already
flowing:** `bun run --filter '@kotodama/infra' local:up` → Jaeger at http://localhost:16686
(prod: set `OTEL_EXPORTER_OTLP_ENDPOINT`).

- **OTel→Jaeger, not Effect DevTools** (VS Code-only, no cloud story; this repo's IDE is
  JetBrains) — don't wire DevTools.
- **Span only the meaningful units** (use cases, repo/AI/queue ops) via
  `Effect.withSpan('PascalCaseSubject.operation', { attributes })`, attribute keys
  lowercase-dotted — `@effect/sql-pg` + `HttpApi` auto-span their own layers, **don't duplicate
  them**.
