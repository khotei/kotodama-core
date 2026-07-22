import { Data } from 'effect'

/** The single failure of `@kotodama/platform/storage` — callers handle one tag. */
export class StorageError extends Data.TaggedError('StorageError')<{
  readonly key: string
  readonly cause: unknown
}> {}

/** The single extension point for future S3 write knobs — a new option touches this type, not the `put` signatures. */
export interface StoragePutOptions {
  readonly contentType?: string
}

export interface ImageKeyInput {
  readonly language: string
  readonly word: string
  readonly kind: string
  readonly index?: number
}

export interface AuthorKeyInput {
  readonly language: string
  readonly word: string
  readonly index: number
}

// The `.png` suffix is fixed — `@kotodama/platform/ai`'s `generateImage` always emits PNG bytes.
export const imageKey = ({ language, word, kind, index }: ImageKeyInput): string => {
  const leaf = index === undefined ? kind : `${kind}-${index}`
  return `visuals/${language}/${word}/${leaf}.png`
}

export const authorKey = ({ language, word, index }: AuthorKeyInput): string =>
  `authors/${language}/${word}/${index}.png`
