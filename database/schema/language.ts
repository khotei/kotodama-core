import { pgEnum } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { toEnum } from './to-enum'

/**
 * Single source for the content-language set. The `as const` tuple is the one authored definition;
 * the `language` `pgEnum`, the `Language` literal schema, and the `enumLanguage` named map all derive
 * from it — adding a language is exactly one edit here.
 */
export const LANGUAGES = ['ru', 'en'] as const

export const languageEnum = pgEnum('language', LANGUAGES)

export const Language = Schema.Literals(LANGUAGES)
export type Language = typeof Language.Type

export const enumLanguage = toEnum(LANGUAGES)
