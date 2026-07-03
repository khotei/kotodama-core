// Re-export the `Language` vocabulary (authored in `database/`) as part of the word model surface,
// so the API contract and other core consumers speak it through core rather than reaching into the
// persistence package for a domain primitive.
export { Language } from '@lexiai/database'
export * from './verify-word-input'
export * from './word.schema'
export * from './word-build-policy'
export * from './word-creator'
export * from './word-input'
export * from './word-read'
export * from './word-ready-policy'
