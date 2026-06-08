import { pgEnum } from 'drizzle-orm/pg-core'

/** Single source for the content-language set: derive `Language` from it, never hand-type `'ru' | 'en'`. */
export const languageEnum = pgEnum('language', ['ru', 'en'])

export type Language = (typeof languageEnum.enumValues)[number]

/**
 * Named map from a value list (`enumLanguage.en === 'en'`). Built eagerly at module load to capture
 * the values as plain strings, sidestepping the quirk where `pgEnum.enumValues` mutates strings to
 * objects (drizzle #2753).
 */
export const toEnum = <const T extends readonly string[]>(
  values: T,
): { readonly [K in T[number]]: K } =>
  Object.fromEntries(values.map((value) => [value, value])) as {
    readonly [K in T[number]]: K
  }

export const enumLanguage = toEnum(languageEnum.enumValues)
