// Reads `OTEL_EXPORTER_OTLP_ENDPOINT` directly, not via `@lexiai/config`: leaf
// package, may not import `config`. See @.claude/rules/observability.md.

// NodeSdk subpath, not the package barrel — the barrel re-exports WebSdk, which
// pulls the browser-only `@opentelemetry/sdk-trace-web`; this is a backend layer.
import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318'

/**
 * Inert in production with no endpoint set: a backgrounded exporter retrying
 * against nothing is pure waste. Set the env var to light it up — no code change.
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
