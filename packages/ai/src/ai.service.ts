import * as OpenAiClient from '@effect/ai-openai/OpenAiClient'
import * as OpenAiClientGenerated from '@effect/ai-openai/OpenAiClientGenerated'
import * as OpenAiLanguageModel from '@effect/ai-openai/OpenAiLanguageModel'
import { Context, Data, Effect, Encoding, Layer, Predicate, Result, type Schema } from 'effect'
import { LanguageModel, AiError as ProviderAiError } from 'effect/unstable/ai'

/**
 * HTTP statuses worth retrying when a failure arrives as a raw `HttpClientError` rather than the
 * provider's typed `AiError`: a rate limit (429), a request timeout (408), and the transient 5xx. The
 * **image** path goes through the generated OpenAI client, whose errors are these HTTP errors — so a
 * `gpt-image` rate-limit 429 is invisible to {@link ProviderAiError.isAiError} and must be classified here.
 */
const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504])

/** True if a wrapped cause is a retryable HTTP failure — by response status, else by a rate-limit message. */
const isRetryableHttp = (cause: unknown): boolean => {
  if (Predicate.hasProperty(cause, 'response')) {
    const response = (cause as { readonly response?: unknown }).response
    if (Predicate.hasProperty(response, 'status') && typeof response.status === 'number') {
      return RETRYABLE_HTTP_STATUS.has(response.status)
    }
  }
  return Predicate.hasProperty(cause, 'message') && typeof cause.message === 'string'
    ? /rate limit|\b(?:429|408|50[0234])\b/i.test(cause.message)
    : false
}

/**
 * A compact, **JSON-serializable** snapshot of one error in the wrapped provider chain — `tag` +
 * `message` + (optionally) a recursed `cause`. {@link AiError.cause} holds this, never the live
 * provider/`Error` object, because it is persisted into a jsonb column downstream
 * (`async_word_jobs.error`); a live object there would carry non-enumerable getters/circular refs
 * and break `JSON.stringify`.
 */
export interface CauseSnapshot {
  readonly tag?: string
  readonly message?: string
  readonly cause?: CauseSnapshot
}

const MAX_CAUSE_DEPTH = 3

/**
 * Recurse the wrapped chain into a plain serializable {@link CauseSnapshot} — never the live object.
 * Absent fields are **omitted** (not set to `undefined`) so the snapshot survives a
 * `JSON.stringify`/`parse` round-trip unchanged (the persisted-jsonb invariant).
 */
const snapshotCause = (raw: unknown, depth = 0): CauseSnapshot => {
  const snapshot: { tag?: string; message?: string; cause?: CauseSnapshot } = {}
  if (Predicate.hasProperty(raw, '_tag') && typeof raw._tag === 'string') snapshot.tag = raw._tag
  if (Predicate.hasProperty(raw, 'message') && typeof raw.message === 'string')
    snapshot.message = raw.message
  const next: unknown = Predicate.hasProperty(raw, 'cause') ? raw.cause : undefined
  if (depth < MAX_CAUSE_DEPTH && next != null && next !== raw)
    snapshot.cause = snapshotCause(next, depth + 1)
  return snapshot
}

const MAX_MESSAGE_LENGTH = 300

/**
 * One readable line naming **why** the call failed — drilled from the wrapped chain (our `AiError` →
 * the OpenAI provider error: `TransportError` / `HttpClientError` / `TimeoutError` / base64-decode).
 * Walks `.cause` a few levels, joins distinct messages newest-first, collapses whitespace, caps length.
 * This becomes the user-facing reason downstream (`ContentEngineError.message` → the DB row + `/state`).
 */
const describeCause = (raw: unknown): string => {
  const seen: string[] = []
  let cursor: unknown = raw
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && cursor != null; depth++) {
    const message =
      Predicate.hasProperty(cursor, 'message') && typeof cursor.message === 'string'
        ? cursor.message.trim()
        : undefined
    if (message && !seen.includes(message)) seen.push(message)
    const next: unknown = Predicate.hasProperty(cursor, 'cause') ? cursor.cause : undefined
    if (next == null || next === cursor) break
    cursor = next
  }
  const text = seen.length > 0 ? seen.join(' ‹ ') : String(raw ?? 'unknown error')
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > MAX_MESSAGE_LENGTH ? `${line.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : line
}

/**
 * The single failure of `@lexiai/ai`. Every underlying error — transport, OpenAI schema decoding,
 * a missing image in the response, base64 decode — is collapsed here so callers handle one tag.
 *
 * `message` is a human-readable reason derived once from the provider chain; `cause` is a compact
 * **serializable** {@link CauseSnapshot} — *never* the live provider/`Error` object, which is
 * persisted into a jsonb column downstream and so must round-trip through `JSON.stringify`. Build it
 * via {@link AiError.fromCause}; only the synthetic "no image bytes" case constructs directly.
 */
export class AiError extends Data.TaggedError('AiError')<{
  readonly method: 'generateObject' | 'generateImage'
  /** Human-readable reason, derived from the wrapped chain. Copied into the persisted job error. */
  readonly message: string
  readonly cause: CauseSnapshot
  /**
   * Whether the failure is worth retrying — a `TransportError` (a stalled/dropped socket, the dominant
   * flake here), a 5xx `InternalProviderError`, or a rate limit. Classified **once at construction**
   * from the raw provider error (the live object is then discarded). **Classification only:** the
   * service labels its own error; the *retry policy* is the caller's.
   */
  readonly isRetryable: boolean
}> {
  /**
   * Build an {@link AiError} from a freshly caught provider error: derive the human `message`, the
   * serializable `cause` snapshot, and retryability **before** the live object is discarded.
   */
  static fromCause(method: AiError['method'], raw: unknown): AiError {
    return new AiError({
      method,
      message: describeCause(raw),
      cause: snapshotCause(raw),
      isRetryable: (ProviderAiError.isAiError(raw) && raw.isRetryable) || isRetryableHttp(raw),
    })
  }
}

/**
 * The image dimensions `@effect/ai-openai`'s `createImage` accepts — a closed set. An out-of-enum value
 * is rejected on **decode**, failing the whole render, so the type forbids it up front rather than at
 * runtime. Mirrors the provider's `CreateImageRequest.size` literal union.
 */
export type ImageSize =
  | 'auto'
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '256x256'
  | '512x512'
  | '1792x1024'
  | '1024x1792'

/**
 * The request shape for one image render — model, size, quality. The second argument of
 * {@link AiService.generateImage}; exported so a caller (the content engine's `imageOptionsFor`) builds
 * it against this one authored shape instead of re-declaring it.
 */
export interface ImageOptions {
  readonly model: string
  readonly size: ImageSize
  readonly quality: 'low' | 'medium' | 'high' | 'auto'
}

/**
 * Deep wrapper over `@effect/ai-openai`: two methods, OpenAI hidden entirely. `generateObject`
 * returns the value already decoded against `schema`; `generateImage` returns raw image bytes.
 * Both fail only with {@link AiError}.
 *
 * @example
 * ```ts
 * const ai = yield* AiService
 * const person = yield* ai.generateObject(Person, 'invent a person', {
 *   model: 'gpt-5',
 *   reasoningEffort: 'low',
 * })
 * const png = yield* ai.generateImage('a watercolor fox', {
 *   model: 'gpt-image-1.5',
 *   size: '1024x1024',
 *   quality: 'low',
 * })
 * ```
 */
export class AiService extends Context.Service<
  AiService,
  {
    readonly generateObject: <A, I extends Record<string, unknown>>(
      schema: Schema.Codec<A, I>,
      prompt: string,
      opts: {
        readonly model: string
        /** Responses-API reasoning depth — the speed/quality dial for gpt-5.x reasoning models. */
        readonly reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      },
    ) => Effect.Effect<A, AiError>
    readonly generateImage: (
      prompt: string,
      opts: ImageOptions,
    ) => Effect.Effect<Uint8Array, AiError>
  }
>()('@lexiai/ai/AiService') {}

/**
 * The single boundary layer for {@link AiService}, over whatever {@link OpenAiClient.OpenAiClient} +
 * {@link OpenAiClientGenerated} are in context — faked over in tests, wired with the production OpenAI
 * clients (handwritten + generated) at the worker entrypoint. Both clients are captured here at layer
 * build and re-provided inside the methods so each method's requirement channel is `never`.
 */
export const AiServiceLive: Layer.Layer<
  AiService,
  never,
  OpenAiClient.OpenAiClient | OpenAiClientGenerated.OpenAiClientGenerated
> = Layer.effect(
  AiService,
  Effect.gen(function* () {
    const client = yield* OpenAiClient.OpenAiClient
    const generated = yield* OpenAiClientGenerated.OpenAiClientGenerated

    const generateObject = <A, I extends Record<string, unknown>>(
      schema: Schema.Codec<A, I>,
      prompt: string,
      opts: {
        readonly model: string
        readonly reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      },
    ) =>
      LanguageModel.generateObject({ schema, prompt }).pipe(
        Effect.map((response) => response.value as A),
        // `model(id, config)` provides `LanguageModel` but re-introduces `OpenAiClient`; the captured
        // client satisfies it so this method's R is `never`. The config scopes the Responses-API
        // reasoning effort for this one call.
        Effect.provide(
          OpenAiLanguageModel.model(opts.model, { reasoning: { effort: opts.reasoningEffort } }),
        ),
        Effect.provideService(OpenAiClient.OpenAiClient, client),
        Effect.mapError((cause) => AiError.fromCause('generateObject', cause)),
      )

    const generateImage = Effect.fnUntraced(function* (prompt: string, opts: ImageOptions) {
      const response = yield* generated
        .createImage({
          payload: {
            model: opts.model,
            prompt,
            size: opts.size,
            quality: opts.quality,
            output_format: 'png',
          },
        })
        .pipe(Effect.mapError((cause) => AiError.fromCause('generateImage', cause)))
      // GPT image models always return base64 (never a URL); a response without it is a contract
      // violation, not a value we can recover.
      const b64 = response.data?.[0]?.b64_json
      if (b64 === undefined) {
        return yield* Effect.fail(
          new AiError({
            method: 'generateImage',
            message: 'OpenAI image response carried no b64_json',
            cause: { message: 'OpenAI image response carried no b64_json' },
            isRetryable: false,
          }),
        )
      }
      return yield* Result.match(Encoding.decodeBase64(b64), {
        onSuccess: (bytes) => Effect.succeed(bytes),
        onFailure: (cause) => Effect.fail(AiError.fromCause('generateImage', cause)),
      })
    })

    return AiService.of({ generateObject, generateImage })
  }),
)
