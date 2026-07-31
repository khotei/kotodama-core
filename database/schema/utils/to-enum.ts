/**
 * Named map from a value list (`enumLanguage.en === 'en'`) — the value-first idiom every enum-like
 * list in the schema uses. Built eagerly at module load to capture the values as plain strings,
 * sidestepping the quirk where drizzle's `pgEnum.enumValues` mutates strings to objects
 * (drizzle-orm #2753) — which is why consumers derive maps from the `as const` list, never from a
 * `pgEnum` object.
 */
export function toEnum<const T extends readonly string[]>(
  values: T,
): { readonly [K in T[number]]: K } {
  return Object.fromEntries(values.map((value) => [value, value])) as {
    readonly [K in T[number]]: K
  }
}
