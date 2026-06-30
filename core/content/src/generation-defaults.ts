import type { ImageOptions, ImageSize, ResilienceConfig } from '@lexiai/ai'
import { enumVisualKind, enumWordJobStage, type VisualKind } from '@lexiai/database'
import { Duration } from 'effect'

/**
 * The real engine's **generation defaults** — the single home for *which model, at what depth/quality,*
 * each pass runs, the text-free render rule, and the per-call resilience tuning. Pulled out of the
 * engine so the pipeline file stays pure topology and this stays the one surface to retune for the
 * planned generation-quality experiments.
 */

/**
 * Resilience tuning for a **text** call (`generateObject`), passed to {@link import('@lexiai/ai').resilient}.
 * Text calls finish fast (measured ≤28s even on the heaviest `gpt-5.5` stage), so a 60s cap cuts a
 * *stall* (observed: a text call hung 110s+ then never returned while a sibling finished in <28s) off
 * early and re-tries it cheaply; 2 retries (3 attempts ≈ 180s) target the flaky author/text stage and
 * stay under the whole-build budget (`DEFAULT_BUILD_TIMEOUT` / `WordGenerationServiceTimed`). The worker
 * entrypoint applies this preset via the `AiServiceResilient` decorator (no longer the engine itself).
 */
export const TEXT_RESILIENCE: ResilienceConfig = {
  method: 'generateObject',
  timeout: Duration.seconds(60),
  retries: 2,
}

/**
 * Resilience tuning for an **image** call (`generateImage`). A `gpt-image-2` render legitimately runs
 * up to ~84s, so the 110s cap clears that; 4 retries absorb both a transient stall AND the `gpt-image`
 * rate-limit 429 (paced by {@link IMAGE_CONCURRENCY}) — a render that slips past the throttle waits out
 * the per-minute window across the backoffs rather than failing the stage. Still under the whole-build
 * budget (a maximally-stalling image stage ≈ 220s).
 */
export const IMAGE_RESILIENCE: ResilienceConfig = {
  method: 'generateImage',
  timeout: Duration.seconds(110),
  retries: 4,
}

/** A text pass's model + reasoning depth. The literal `reasoningEffort` flows straight to `AiService`. */
export type TextGenConfig = (typeof TEXT_GEN)[keyof typeof TEXT_GEN]

/**
 * Per-stage text config — model + `reasoningEffort` (`reasoning.effort`, the speed/depth dial for the
 * gpt-5.x reasoning models; the text analog of the image `quality` lever). The deep-reasoning content
 * stages (`enrich_etymology`, `enrich_tiers`) keep `medium` to protect quality; the structurally-shallow
 * stages — the `fetch_source` extraction, the visuals/authors **plans** (a list of concepts / known
 * quotes, not deep reasoning), and the frequency review — drop to `low`, which is faster and less exposed
 * to the `/v1/responses` stall that keeps failing the heavier calls.
 */
export const TEXT_GEN = {
  fetchSource: { model: 'gpt-5.4-mini', reasoningEffort: 'low' },
  etymology: { model: 'gpt-5.4', reasoningEffort: 'medium' },
  tiers: { model: 'gpt-5.5', reasoningEffort: 'medium' },
  visuals: { model: 'gpt-5.4', reasoningEffort: 'low' },
  authors: { model: 'gpt-5.5', reasoningEffort: 'low' },
  finalReview: { model: 'gpt-5.4', reasoningEffort: 'low' },
} as const

/**
 * The provenance model stamped into `sourceVersions.model` at promotion — the primary/highest-tier text
 * model the pipeline runs (Feature §16 G4), not a per-stage choice.
 */
export const PROVENANCE_MODEL = 'gpt-5.5'

/**
 * Image models, split by role. Our images are **pure illustrations** — the visible text (the word,
 * definitions, captions, author quotes) lives in separate content fields the UI overlays — so the heavy
 * text-capable model is wasted on most of them. The `hero` (the showcase lead image) keeps the top-tier
 * `gpt-image-2`; every secondary image (infographic, memes, author portraits) renders on the lighter
 * `gpt-image-1.5` — benchmarked ~10s vs ~24s text-free at near-identical fidelity.
 */
const HERO_IMAGE_MODEL = 'gpt-image-2'
const SECONDARY_IMAGE_MODEL = 'gpt-image-1.5'

/**
 * Every model the pipeline runs, keyed by text stage and image role — stamped into
 * `sourceVersions.stageModels` (`@lexiai/database`) so swapping any per-stage text model or either image
 * model shifts provenance. `PROVENANCE_MODEL` stays the primary-tier label; this is the full picture.
 */
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

/** `low` is already strong for text-free art and keeps each render well under the per-attempt timeout. */
const IMAGE_QUALITY = 'low'

/**
 * **Must be set explicitly.** With no `size`, `gpt-image-1.5` returns its own native dimensions
 * (observed `1402x1122`), which the `@effect/ai-openai` response schema — it only accepts the enum
 * sizes — then **rejects on decode**, failing the whole stage. Pinning a valid square makes the model
 * return exactly it. (`gpt-image-2` happened to default to a valid size, which is why this only surfaced
 * after the model swap.)
 */
const IMAGE_SIZE: ImageSize = '1024x1024'

/**
 * The render request for one image, **by role** — only `hero` earns the premium model; every other role
 * (`infographic`, `meme`, an author portrait) takes the lighter one. Size and quality are fixed. The
 * one place the image-model decision lives, so the engine never re-branches on kind. Returns the
 * authored {@link ImageOptions} ({@link import('@lexiai/ai')}) — the exact `generateImage` argument.
 */
/**
 * The roles an image render can take: the {@link VisualKind}s (`hero` / `infographic` / `meme`) plus
 * the author **portrait** — which is not a visual kind (it rides the `authorExamples` slice, not
 * `visuals`). The closed input to {@link imageOptionsFor}, so the model-by-role branch can't be reached
 * with a typo or an out-of-set string.
 */
export type ImageRole = VisualKind | 'author'

/** Every image role the pipeline renders, in a fixed order — the basis for the provenance image digest. */
export const IMAGE_ROLES: readonly ImageRole[] = [
  enumVisualKind.hero,
  enumVisualKind.infographic,
  enumVisualKind.meme,
  'author',
]

export const imageOptionsFor = (kind: ImageRole): ImageOptions => ({
  model: kind === enumVisualKind.hero ? HERO_IMAGE_MODEL : SECONDARY_IMAGE_MODEL,
  size: IMAGE_SIZE,
  quality: IMAGE_QUALITY,
})

/**
 * Cap on **concurrent image renders** across the whole build. A word renders ~11 images (visuals + one
 * portrait per author); fired all at once they blow the org's `gpt-image` rate limit (5 images/min, a
 * 429). A small cap paces the renders so few hit the limit, and the image retries ({@link IMAGE_RESILIENCE})
 * mop up any that still 429. The rate limit is the real floor (~11 images / 5-per-min ≈ ~2 min) — this
 * only trades burst-churn for steadiness.
 */
export const IMAGE_CONCURRENCY = 2

/**
 * Appended to every image prompt: the render must carry NO text. The word, its definition, captions and
 * quotes are structured fields the UI lays over/around the image — baked-in text would duplicate them,
 * render unreliably, and slow generation. The plan prompts ask for text-free concepts too; this is the
 * hard guarantee at the render boundary, regardless of what a plan produced.
 */
export const NO_TEXT_DIRECTIVE =
  ' The image must be a pure illustration: absolutely no text, letters, words, captions, numbers, or signage anywhere in it.'
