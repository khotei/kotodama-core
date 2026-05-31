// app-web runs its tests under the shared node project, NOT its vite.config.ts.
// Vitest prefers vitest.config.ts over vite.config.ts, so the React-compiler
// babel plugin (a browser build concern) is not loaded for unit tests — they
// run in the same plain node environment as every other workspace. UI tests
// that genuinely need the Vite/React pipeline can add their own browser/jsdom
// project later; the smoke test does not.
export { default } from '../../vitest.base'
