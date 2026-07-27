# Tech stack

Authoritative: [Tech spec §2](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e). Non-obvious
picks only (versions live in `package.json` catalogs; tooling in `tooling.md`):

| Area | Choice | Non-obvious note |
|---|---|---|
| Effect | **v4, pinned EXACT `4.0.0-beta.78`** | NOT the floating `beta` tag — a new effect edge re-resolved it to a fresh beta, skewing versions monorepo-wide and breaking `tsc`. |
| Server | `@effect/platform-bun` | Deployed to AWS Lambda via the **Lambda Web Adapter**. |
| Storage | AWS S3 (LocalStack locally) | Uses **`Bun.S3Client`** (a Bun global), not `@aws-sdk/client-s3`. |
| Queue | AWS SQS (`@aws-sdk/client-sqs`) | — |
| AI | `@effect/ai-openai` | text + image generation. |
| Observability | `@effect/opentelemetry` | See `observability.md`. |
| Type utils | **type-fest** | Prefer over a hand-rolled mapped/conditional type (types-only, never reaches a bundle). |
