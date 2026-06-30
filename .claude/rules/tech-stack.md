# Tech stack

The authoritative source is the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e) §2. This file is the quick reference.

| Area | Choice | Notes |
|---|---|---|
| Runtime | **Bun 1.3** | Pinned via `packageManager`. Runs `.ts` directly as ESM — no build step in MVP. |
| Language | **TypeScript strict** | `tsconfig.base.json`: strict, `moduleResolution: bundler`, `verbatimModuleSyntax`, composite project refs. |
| Effect | **Effect v4 (beta)** | Catalog pins the whole effect group to an **exact `4.0.0-beta.78`** (not the floating `beta` tag — adding a new effect-consuming edge re-resolved the tag to a freshly-published beta, skewing versions across the monorepo and breaking `tsc`). Use `Context.Service`/`Context.Tag` (v4 renamed back from `ServiceMap`). In-beta APIs live under `effect/unstable/*`. |
| Server | `@effect/platform-bun` | `BunRuntime.runMain` entrypoints; deployed to AWS Lambda via the Lambda Web Adapter. |
| SQL | `@effect/sql-pg` + **Drizzle** | Drizzle owns schema/migrations; the `DB` layer is a `Context.Service`, repositories are bare functions over it. |
| AI | `@effect/ai-openai` | text + image generation. |
| Observability | `@effect/opentelemetry` | `TracingLive` layer factory in `@lexiai/observability`; OTLP→Jaeger locally (`infra`), any OTLP backend in prod. See `.claude/rules/observability.md`. |
| Frontend | **React 19** + **Vite 6** | React Compiler on (babel plugin), TanStack Router (file-based, deferred), Tailwind v4, `@effect/atom-react`. |
| AWS | SQS + S3 (LocalStack locally) | `@aws-sdk/client-sqs`; storage uses `Bun.S3Client` (a Bun global). |
| Lint/format | **Biome** | single tool; encodes the layer rule (see dependency-hierarchy). |
| Git hook | **Husky** | pre-commit: `biome check --staged` + `bun run tsc` (per-workspace `tsc --noEmit` via Bun filter). |
| Type utilities | **type-fest** (catalog `types`) | Types-only, zero runtime. **Before authoring any mapped/conditional/utility type by hand, consult `.claude/agent-patterns/type-fest.md`** (blessed list + gotchas) and the package readme — hand-roll only what it lacks. |
| Tests | **`@effect/vitest`** | `.test.ts` files; one smoke test per workspace. |
| Editor (opt) | `@effect/language-service` | TS LSP plugin (`tsconfig.base.json` `plugins`). Editor-only — not run by `tsc`/CI. JetBrains: set TypeScript = workspace `node_modules/typescript`. |

Versions are pinned centrally via Bun **catalogs** in root `package.json`; workspaces reference them with `catalog:<group>`.
