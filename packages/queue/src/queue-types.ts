import { Data } from 'effect'

/**
 * A message pulled off the queue: its raw `body` plus the `handle` used to ack it via the queue's
 * `delete`. The body is opaque to this layer — the build-message schema is owned by the enqueuer.
 */
export interface QueueMessage {
  readonly body: string
  readonly handle: string
}

/** Tuning for a single `receive` poll; both fields map to SQS knobs. */
export interface ReceiveOptions {
  /** Max messages to return in one poll (SQS caps at 10). Default 1. */
  readonly max?: number
  /** Long-poll wait, seconds (SQS caps at 20). Default 0 (short poll). */
  readonly waitSeconds?: number
}

/** The underlying queue transport rejected (e.g. the SQS API errored or is unreachable). */
export class QueueError extends Data.TaggedError('QueueError')<{ cause: unknown }> {}
