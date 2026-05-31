/**
 * OpenTelemetry tracing layer for backend apps (`apps/api`, `apps/worker`).
 *
 * Exports Effect spans over OTLP/HTTP. Locally this targets the Jaeger container
 * from `infra/local/docker-compose.yml` (UI at http://localhost:16686). The
 * export target follows the OpenTelemetry-standard `OTEL_EXPORTER_OTLP_ENDPOINT`
 * env var — read here directly rather than via `@lexiai/config`'s `AppConfig`,
 * because `observability` is a leaf package (it may not import `config`) and
 * env-var-driven configuration is OTel's own convention.
 *
 * Provide this BEFORE any other tracing layer so the tracer is installed first.
 */
// Import NodeSdk via its subpath, not the package barrel: the barrel re-exports
// WebSdk, which pulls the browser-only `@opentelemetry/sdk-trace-web`. This is a
// backend (Bun/Lambda) layer, so we want the Node SDK only.
import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318'

/**
 * Build the tracing layer for `serviceName` (e.g. `lexiai-api`).
 *
 * In production with no `OTEL_EXPORTER_OTLP_ENDPOINT` set, tracing is inert
 * (empty resource, no exporter): Lambda has no local collector yet, and a
 * backgrounded exporter retrying against nothing is pure waste. Set the env var
 * (e.g. to an ADOT collector or a SaaS OTLP endpoint) to light it up — no code
 * change. Locally the var is unset and it defaults to the Jaeger container.
 */
export const TracingLive = (serviceName: string) => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (endpoint === undefined && process.env.NODE_ENV === 'production') {
    return NodeSdk.layerEmpty
  }
  const url = `${endpoint ?? DEFAULT_OTLP_ENDPOINT}/v1/traces`
  return NodeSdk.layer(() => ({
    resource: { serviceName },
    spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url })),
  }))
}
