// `generateWordContent` is deliberately NOT re-exported — the one public entry to "generate a
// word" is WordGenerationService; prompts, STAGE_SLICES, mock data and the rest of
// generation-defaults are implementation.
export { ContentEngine, ContentEngineError } from './content-engine.service'
export { IMAGE_RESILIENCE, TEXT_RESILIENCE, VERIFIER_MODEL } from './generation-defaults'
export {
  type ContentPolicy,
  defaultContentPolicy,
  MockContentEngine,
  makeMockContentEngine,
} from './mock-content-engine.service'
export { RealContentEngineLive } from './real-content-engine.service'
export type { StageSlice } from './stage-slices'
export { WordContent } from './word-content.schema'
export {
  DEFAULT_BUILD_TIMEOUT,
  WordGenerationService,
  WordGenerationServiceLive,
  WordGenerationServiceTimed,
} from './word-generation.service'
export { WordGenerationError } from './word-generator'
