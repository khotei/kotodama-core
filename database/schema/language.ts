import { pgEnum } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { toEnum } from './to-enum'

/**
 * The single language vocabulary — ISO 639-1 codes, used for **both** a word's own language and its
 * translation targets. A word is generated/requestable iff its code is here, and a translation is
 * `{ language, term }` keyed on the same set, so **every translation is navigable** (its code is always
 * a real word language → the card links it to that word, `/words/<code>/<term>`). One source of truth:
 * adding a code makes that language requestable AND a translation target at once. (A second, broader
 * "translation-only" set was dropped — it only bought translations in languages we don't generate, i.e.
 * non-navigable dead ends; not worth a separate list once this set covers the major languages.)
 *
 * The `as const` tuple is the one authored definition; the `language` `pgEnum`, the `Language` literal
 * schema, and the `enumLanguage` named map all derive from it. New codes are **appended** (the pgEnum
 * grows by `ALTER TYPE ADD VALUE`, which appends), so widening coverage is one edit here **plus a
 * generated migration** (`bun run --filter @lexiai/database db:generate`) — order is not load-bearing.
 * Names are not stored: derive them at the edge (the frontend) from the code.
 */
export const LANGUAGES = ['ru', 'en', 'es', 'fr', 'de', 'zh', 'ja', 'hi', 'ar', 'uk'] as const

export const languageEnum = pgEnum('language', LANGUAGES)

export const Language = Schema.Literals(LANGUAGES)
export type Language = typeof Language.Type

export const enumLanguage = toEnum(LANGUAGES)
