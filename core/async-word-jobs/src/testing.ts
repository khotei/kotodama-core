import type { WordStateModel, WordStatus } from './word-state.model'

/**
 * Assert a {@link WordStateModel} is the `status` variant, narrowing it for the rest of the test —
 * replaces the per-test `if (state.status !== 'X') throw …`. Throws on a mismatch or on
 * `null`/`undefined` (the absent state), so the body can read the variant's fields without a guard.
 */
export function assertStatus<S extends WordStatus>(
  state: WordStateModel | null | undefined,
  status: S,
): asserts state is Extract<WordStateModel, { status: S }> {
  if (state?.status !== status) {
    throw new Error(`expected status "${status}", got "${state?.status ?? 'null'}"`)
  }
}
