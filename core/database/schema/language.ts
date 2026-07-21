import { pgEnum } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { toEnum } from './to-enum'

/**
 * The single language vocabulary (ISO 639-1) for **both** a word's own language and its translation
 * targets — deliberately one set, so every translation's code is a real word language and the card
 * can always link it (a broader translation-only set was rejected as non-navigable dead ends).
 * Widening coverage = append a code here **plus a generated migration** (`ALTER TYPE ADD VALUE`);
 * order is not load-bearing. Names are never stored — the FE derives them from the code.
 */
export const LANGUAGES = ['ru', 'en', 'es', 'fr', 'de', 'zh', 'ja', 'hi', 'ar', 'uk'] as const

export const languageEnum = pgEnum('language', LANGUAGES)

export const Language = Schema.Literals(LANGUAGES)
export type Language = typeof Language.Type

export const enumLanguage = toEnum(LANGUAGES)
