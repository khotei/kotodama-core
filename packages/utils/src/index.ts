/**
 * Typed `Array.isArray`: the built-in guard widens to `any[]` and won't split a `T | readonly T[]`
 * union, so wrap it — the false branch then narrows to the single `T`, the true branch to the array.
 */
export const isReadonlyArray = <T>(value: T | readonly T[]): value is readonly T[] =>
  Array.isArray(value)

/**
 * Normalize a single-or-array value to an array — `undefined` ⇒ `[]` (so an optional filter is skipped),
 * a single value ⇒ `[value]`, an array ⇒ a fresh mutable copy.
 */
export const toArray = <T>(value: T | readonly T[] | undefined): T[] =>
  value === undefined ? [] : isReadonlyArray(value) ? [...value] : [value]
