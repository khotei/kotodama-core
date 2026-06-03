# packages/observability — `@lexiai/observability`

OpenTelemetry Layer factory.

- **May import:** `effect`, `@effect/opentelemetry`, `@opentelemetry/*`. Importable by any
  backend layer. **Leaf package** — imports nothing internal (so `TracingLive` reads
  `process.env`, not `@lexiai/config`).
- **Exports `TracingLive(serviceName)`** (`src/tracing.ts`): OTLP/HTTP span export. Local →
  Jaeger (`http://localhost:4318`, UI `:16686`); prod via `OTEL_EXPORTER_OTLP_ENDPOINT`
  (inert if unset). Provide it at the app entrypoint before `BunRuntime.runMain`.
- Conventions + rationale: `@.claude/rules/observability.md`.
