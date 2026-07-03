import { Data } from 'effect'

// The body is opaque to this layer — the message schema is owned by the enqueuer.
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

export class QueueError extends Data.TaggedError('QueueError')<{ cause: unknown }> {}
