import { enumVisualKind, enumWordJobStage, type VisualKind } from '@kotodama/core/database'
import type { ImageOptions, ImageSize, ResilienceConfig } from '@kotodama/platform/ai'
import { Duration } from 'effect'

// The one surface to retune — kept out of the engine so the pipeline file stays pure topology.

export type TextGenConfig = (typeof TEXT_GEN)[keyof typeof TEXT_GEN]

/** The {@link VisualKind}s plus the author portrait — which is NOT a visual kind (it rides the `authorExamples` slice). */
export type ImageRole = VisualKind | 'author'

/**
 * Text calls finish fast (measured ≤28s even on the heaviest stage), so 60s cuts an observed
 * 110s+ hang off early; 3 attempts stay under the whole-build budget.
 */
export const TEXT_RESILIENCE: ResilienceConfig = {
  method: 'generateObject',
  timeout: Duration.seconds(60),
  retries: 2,
}

/**
 * A `gpt-image-2` render legitimately runs to ~84s (hence 110s); 4 retries absorb both stalls and
 * the `gpt-image` rate-limit 429s that slip past {@link IMAGE_CONCURRENCY}.
 */
export const IMAGE_RESILIENCE: ResilienceConfig = {
  method: 'generateImage',
  timeout: Duration.seconds(110),
  retries: 4,
}

/**
 * Deep-reasoning content stages keep `medium`; the structurally-shallow ones (extraction, the
 * visual/author *plans*, the review) drop to `low` — faster and less exposed to the
 * `/v1/responses` stall that keeps failing the heavier calls.
 */
export const TEXT_GEN = {
  fetchSource: { model: 'gpt-5.4-mini', reasoningEffort: 'low' },
  etymology: { model: 'gpt-5.4', reasoningEffort: 'medium' },
  tiers: { model: 'gpt-5.5', reasoningEffort: 'medium' },
  visuals: { model: 'gpt-5.4', reasoningEffort: 'low' },
  authors: { model: 'gpt-5.5', reasoningEffort: 'low' },
  finalReview: { model: 'gpt-5.4', reasoningEffort: 'low' },
} as const

export const PROVENANCE_MODEL = 'gpt-5.5'

/**
 * The create-path input verifier's model — cheapest tier at `reasoningEffort: 'minimal'`, because
 * latency dominates a binary judge and a judge failure fails open (the pre-filter is the floor).
 */
export const VERIFIER_MODEL = 'gpt-5.4-nano'

// Images are pure illustrations (all visible text is separate content fields the UI overlays), so
// only the hero earns the premium model; secondaries render ~10s vs ~24s at near-identical fidelity.
const HERO_IMAGE_MODEL = 'gpt-image-2'
const SECONDARY_IMAGE_MODEL = 'gpt-image-1.5'

// Stamped into provenance, so swapping any model shifts it.
export const PROVENANCE_STAGE_MODELS: Record<string, string> = {
  [enumWordJobStage.fetch_source]: TEXT_GEN.fetchSource.model,
  [enumWordJobStage.enrich_etymology]: TEXT_GEN.etymology.model,
  [enumWordJobStage.enrich_tiers]: TEXT_GEN.tiers.model,
  [enumWordJobStage.enrich_authors]: TEXT_GEN.authors.model,
  [enumWordJobStage.enrich_visuals]: TEXT_GEN.visuals.model,
  [enumWordJobStage.final_review]: TEXT_GEN.finalReview.model,
  hero_image: HERO_IMAGE_MODEL,
  secondary_image: SECONDARY_IMAGE_MODEL,
}

const IMAGE_QUALITY = 'low'

/**
 * **Must be set explicitly.** With no `size`, `gpt-image-1.5` returns its native dimensions
 * (observed `1402x1122`), which `@effect/ai-openai`'s response schema — enum sizes only —
 * rejects on decode, failing the whole stage.
 */
const IMAGE_SIZE: ImageSize = '1024x1024'

// Fixed order — the basis for the provenance image digest.
export const IMAGE_ROLES: readonly ImageRole[] = [
  enumVisualKind.hero,
  enumVisualKind.infographic,
  enumVisualKind.meme,
  'author',
]

/**
 * A word renders ~11 images; fired at once they blow the org's `gpt-image` limit (5/min → 429).
 * The cap paces them; {@link IMAGE_RESILIENCE} retries mop up any that still 429.
 */
export const IMAGE_CONCURRENCY = 2

/**
 * Appended to every image prompt — the hard no-text guarantee at the render boundary, regardless
 * of what a plan produced (visible text lives in structured fields the UI overlays).
 */
export const NO_TEXT_DIRECTIVE =
  ' The image must be a pure illustration: absolutely no text, letters, words, captions, numbers, or signage anywhere in it.'

export const imageOptionsFor = (kind: ImageRole): ImageOptions => ({
  model: kind === enumVisualKind.hero ? HERO_IMAGE_MODEL : SECONDARY_IMAGE_MODEL,
  size: IMAGE_SIZE,
  quality: IMAGE_QUALITY,
})
