// The package's public surface: the swap port + its error, the generation *service* (recipe behind a
// tag + its concrete/timed layers + its error), the two engine layers, the StageSlice type a consumer
// needs to talk about a pass's output, and the engine's resilience presets (applied by the worker
// wiring, not the engine). The recipe `generateWordContent` is now the private body of
// WordGenerationServiceLive — NOT re-exported (one public entry to "generate a word"). Prompts,
// STAGE_SLICES, the mock content data, and the rest of generation-defaults are implementation.
export { ContentEngine, ContentEngineError } from './content-engine.service'
export { IMAGE_RESILIENCE, TEXT_RESILIENCE } from './generation-defaults'
export {
  type ContentPolicy,
  defaultContentPolicy,
  MockContentEngine,
  makeMockContentEngine,
} from './mock-content-engine.service'
export { RealContentEngineLive } from './real-content-engine.service'
export type { StageSlice } from './stage-slices'
export {
  DEFAULT_BUILD_TIMEOUT,
  WordGenerationService,
  WordGenerationServiceLive,
  WordGenerationServiceTimed,
} from './word-generation.service'
export { WordGenerationError } from './word-generator'
