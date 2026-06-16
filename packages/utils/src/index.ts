/**
 * A single value or a readonly batch of them — the repo-wide "single-or-array" idiom (query filters,
 * save payloads). The readonly flavour of type-fest's `Arrayable` (theirs is mutable `T | T[]`,
 * pending microsoft/TypeScript#17002); narrow it with {@link isArray} / normalize with {@link toArray}.
 */
export type Arrayable<T> = T | readonly T[]

/**
 * Typed `Array.isArray`: the built-in guard widens to `any[]` and won't split an {@link Arrayable}
 * union, so wrap it — the false branch then narrows to the single `T`, the true branch to the array.
 */
export const isArray = <T>(value: Arrayable<T>): value is readonly T[] => Array.isArray(value)

/**
 * Normalize an {@link Arrayable} to an array — `undefined` ⇒ `[]` (so an optional filter is skipped),
 * a single value ⇒ `[value]`, an array ⇒ a fresh mutable copy.
 */
export const toArray = <T>(value: Arrayable<T> | undefined): T[] =>
  value === undefined ? [] : isArray(value) ? [...value] : [value]
