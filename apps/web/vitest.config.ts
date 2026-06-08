/**
 * Present so Vitest picks this over vite.config.ts — unit tests run in the shared
 * node env, not the React-compiler/Vite pipeline.
 *
 * @see @.claude/rules/testing.md
 */
export { default } from '../../vitest.base'
