// Env comes through `@kotodama/platform/config` (effect/Config), not `process.env`: config is the one
// source of env access, and `ConfigProviderLive` wraps `TracingLive` in both entrypoints so the read
// resolves when this layer builds. (Reverses the older "a leaf may not import config; env is OTel's
// own idiom" stance — the single-source rule wins.)

// NodeSdk subpath, not the package barrel — the barrel re-exports WebSdk, which
// pulls the browser-only `@opentelemetry/sdk-trace-web`; this is a backend layer.
import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { DeployEnv, OtelExporterEndpoint, ServiceVersion } from '@kotodama/platform/config'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Effect, Layer, Option } from 'effect'

/**
 * Carries `deployment.environment` (+ `service.version` when `SERVICE_VERSION` is set) on the trace
 * resource so a backend can split local from prod and pin a regression to a release.
 */
export const TracingLive = (serviceName: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deployEnv = yield* DeployEnv
      const endpoint = yield* OtelExporterEndpoint
      const serviceVersion = yield* ServiceVersion

      const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
      // Dev flushes each span immediately for interactive Jaeger debugging; prod batches for
      // throughput — SimpleSpanProcessor must never run under load.
      const spanProcessor =
        deployEnv === 'production'
          ? new BatchSpanProcessor(exporter)
          : new SimpleSpanProcessor(exporter)

      return NodeSdk.layer(() => ({
        resource: {
          serviceName,
          ...(Option.isSome(serviceVersion) ? { serviceVersion: serviceVersion.value } : {}),
          attributes: { 'deployment.environment': deployEnv },
        },
        spanProcessor,
      }))
    }),
  )
