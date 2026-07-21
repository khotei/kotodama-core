import * as OpenAiClient from '@effect/ai-openai/OpenAiClient'
import * as OpenAiClientGenerated from '@effect/ai-openai/OpenAiClientGenerated'
import * as OpenAiLanguageModel from '@effect/ai-openai/OpenAiLanguageModel'
import { Context, Data, Effect, Encoding, Layer, Predicate, Result, type Schema } from 'effect'
import { LanguageModel, AiError as ProviderAiError } from 'effect/unstable/ai'

/**
 * A JSON-serializable snapshot of the wrapped provider chain — never the live `Error` object: it
 * is persisted into a jsonb column downstream, and a live object (non-enumerable getters,
 * circular refs) breaks `JSON.stringify`.
 */
export interface CauseSnapshot {
  readonly tag?: string
  readonly message?: string
  readonly cause?: CauseSnapshot
}

// Mirrors the provider's literal union — an out-of-enum size is rejected on response decode,
// failing the whole render, so the type forbids it up front.
export type ImageSize =
  | 'auto'
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '256x256'
  | '512x512'
  | '1792x1024'
  | '1024x1792'

export interface ImageOptions {
  readonly model: string
  readonly size: ImageSize
  readonly quality: 'low' | 'medium' | 'high' | 'auto'
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

// The image path goes through the generated client, whose errors are raw HTTP errors — a
// gpt-image 429 is invisible to the provider's isAiError and must be classified here.
const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504])

const MAX_CAUSE_DEPTH = 3

const MAX_MESSAGE_LENGTH = 300

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

// Absent fields are omitted (not set to `undefined`) so the snapshot survives a
// JSON.stringify/parse round-trip unchanged.
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

// Becomes the user-facing failure reason downstream (→ the DB row + /state).
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
 * The single failure of `@kotodama/ai` — every underlying error collapses here so callers handle one
 * tag. All three fields are derived at construction, before the live provider object is discarded
 * — build via {@link AiError.fromCause}; only the synthetic "no image bytes" case constructs
 * directly.
 */
export class AiError extends Data.TaggedError('AiError')<{
  readonly method: 'generateObject' | 'generateImage'
  readonly message: string
  readonly cause: CauseSnapshot
  /** Classification only — the service labels its own error; the retry *policy* is the caller's. */
  readonly isRetryable: boolean
}> {
  static fromCause(method: AiError['method'], raw: unknown): AiError {
    return new AiError({
      method,
      message: describeCause(raw),
      cause: snapshotCause(raw),
      isRetryable: (ProviderAiError.isAiError(raw) && raw.isRetryable) || isRetryableHttp(raw),
    })
  }
}

// `generateObject`'s schema must encode to an object (an OpenAI structured-output requirement).
export class AiService extends Context.Service<
  AiService,
  {
    readonly generateObject: <A, I extends Record<string, unknown>>(
      schema: Schema.Codec<A, I>,
      prompt: string,
      opts: {
        readonly model: string
        /** Responses-API reasoning depth — the speed/quality dial for gpt-5.x reasoning models. */
        readonly reasoningEffort: ReasoningEffort
      },
    ) => Effect.Effect<A, AiError>
    readonly generateImage: (
      prompt: string,
      opts: ImageOptions,
    ) => Effect.Effect<Uint8Array, AiError>
  }
>()('@kotodama/ai/AiService') {}

// Two clients, deliberately: `generateObject` needs the handwritten OpenAiClient (what
// OpenAiLanguageModel.model requires); `generateImage` needs the generated one — the only place
// `createImage` exists. Both captured at layer build so each method's R is `never`.
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
        readonly reasoningEffort: ReasoningEffort
      },
    ) =>
      LanguageModel.generateObject({ schema, prompt }).pipe(
        Effect.map((response) => response.value as A),
        // `model(id, config)` provides `LanguageModel` but re-introduces `OpenAiClient` — the
        // captured client satisfies it.
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
