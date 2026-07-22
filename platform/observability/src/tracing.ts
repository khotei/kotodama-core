// Reads `OTEL_EXPORTER_OTLP_ENDPOINT` directly, not via `@kotodama/platform/config`: leaf
// package, may not import `config`. See @.claude/rules/observability.md.

// NodeSdk subpath, not the package barrel — the barrel re-exports WebSdk, which
// pulls the browser-only `@opentelemetry/sdk-trace-web`; this is a backend layer.
import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318'

/**
 * Inert in production with no endpoint set: a backgrounded exporter retrying
 * against nothing is pure waste. Set the env var to light it up — no code change.
 *
 * Carries `deployment.environment` (+ `service.version` when `SERVICE_VERSION` is set) on the resource
 * so a backend can split local from prod and pin a regression to a release.
 */
export const TracingLive = (serviceName: string) => {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const isProduction = process.env.NODE_ENV === 'production'
  if (endpoint === undefined && isProduction) {
    return NodeSdk.layerEmpty
  }
  const url = `${endpoint ?? DEFAULT_OTLP_ENDPOINT}/v1/traces`
  const exporter = new OTLPTraceExporter({ url })
  // Local dev flushes each span the instant it closes, so a trace shows up in Jaeger immediately while
  // investigating; prod batches for throughput. SimpleSpanProcessor must never run under load — without
  // the batch buffer the BatchSpanProcessor adds (~5s), spans would otherwise appear with a lag and a
  // trace queried mid-flight looks fragmented (the symptom that made investigation harder).
  const spanProcessor = isProduction
    ? new BatchSpanProcessor(exporter)
    : new SimpleSpanProcessor(exporter)
  return NodeSdk.layer(() => ({
    resource: {
      serviceName,
      serviceVersion: process.env.SERVICE_VERSION,
      attributes: { 'deployment.environment': process.env.NODE_ENV ?? 'development' },
    },
    spanProcessor,
  }))
}
