/**
 * One stage's output, written to `async_word_jobs.result` when the stage succeeds. Opaque here:
 * heterogeneous by stage and naturally partial. The worker decodes it through a real `effect/Schema`
 * before assembling the full `words` row on `final_review` success.
 */
export type StageResult = Record<string, unknown>

/** `async_word_jobs.error` — the failure shape for a failed stage. The stage itself is a column, so it's not repeated here. */
export type JobError = { message: string; cause?: unknown }
