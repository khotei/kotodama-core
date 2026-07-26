# Effect Schema (v4) — project pattern notes

Project-local cheat sheet. **The source of truth is the vendored code**, not this file:
read it before writing Schema code (it mirrors `LLMS.md` §Schema).

- Source: `repos/effect-smol/packages/effect/src/Schema.ts`, `SchemaAST.ts`,
  `SchemaTransformation.ts`, `SchemaGetter.ts`, `SchemaIssue.ts`.
- Tests/examples: `repos/effect-smol/packages/effect/test/schema/Schema.test.ts`,
  `toCodec.test.ts`, `toArbitrary.test.ts`.

## Rules

- Use `effect/Schema` — **never Zod**, `io-ts`, or ad-hoc validators; one schema lib only.
- Word shapes are authored in `database/` (content schemas + `WordEntity`); consumers use them
  directly, and the consuming layers author only computed view/read models (`WordStateView`).
- The Schema API was **consolidated during the beta** — grep `Schema.ts` exports rather than
  guessing v3 method names from memory.
