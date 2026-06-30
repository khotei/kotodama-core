import { Data } from 'effect'

/**
 * The single failure of `@lexiai/storage`: an object write to S3 did not complete. The underlying
 * `Bun.S3Client` rejection (network, credentials, bucket policy) is wrapped in `cause` for
 * diagnostics; callers handle one tag. Reused by the {@link StorageClient} base, the
 * {@link ImagesStore} wrapper, and every caller.
 */
export class StorageError extends Data.TaggedError('StorageError')<{
  readonly key: string
  readonly cause: unknown
}> {}

/**
 * Write options for the storage port's `put` ({@link StorageError}'s package). Today only the object's
 * `contentType` (MIME, e.g. `image/png`); it is the single place future S3 write knobs (cache-control,
 * metadata) get added, so a new option touches this type — not the base + wrapper `put` signatures.
 */
export interface StoragePutOptions {
  readonly contentType?: string
}

/**
 * One image's object key. `kind` is the role of the visual for a word (`hero`, `scene`, …); the
 * optional `index` disambiguates a set of the same kind.
 */
export interface ImageKeyInput {
  readonly language: string
  readonly word: string
  readonly kind: string
  readonly index?: number
}

/** One author portrait's object key — the `index`th portrait generated for a word. */
export interface AuthorKeyInput {
  readonly language: string
  readonly word: string
  readonly index: number
}

/**
 * The deterministic visuals key: `visuals/{language}/{word}/{kind}.png`, or
 * `visuals/{language}/{word}/{kind}-{index}.png` when `index` is given. The `.png` suffix is fixed —
 * `@lexiai/ai`'s `generateImage` always emits PNG bytes.
 *
 * @example imageKey({ language: 'en', word: 'lacuna', kind: 'hero' }) // 'visuals/en/lacuna/hero.png'
 */
export const imageKey = ({ language, word, kind, index }: ImageKeyInput): string => {
  const leaf = index === undefined ? kind : `${kind}-${index}`
  return `visuals/${language}/${word}/${leaf}.png`
}

/**
 * The deterministic authors key: `authors/{language}/{word}/{index}.png`.
 *
 * @example authorKey({ language: 'fr', word: 'flaneur', index: 2 }) // 'authors/fr/flaneur/2.png'
 */
export const authorKey = ({ language, word, index }: AuthorKeyInput): string =>
  `authors/${language}/${word}/${index}.png`
