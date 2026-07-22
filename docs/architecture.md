# Architecture — a map, not a manual

*Diátaxis: explanation (link-hub).* One screen to orient you, then links to the authoritative source
for every detail. The rules themselves are **not restated here** — restating them is how a doc drifts
([`.claude/rules/human-docs.md`](../.claude/rules/human-docs.md)). The full why/what is the
[Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e).

## The one flow

A word is built once, asynchronously, and a row exists **iff** every stage succeeded:

```
apps/api ──requestWordBuild──► seed + enqueue ──► SQS
                                                   │
                                          apps/worker ──buildWord──► OpenAI (text+image) ─┐
                                                                          store images ───┤
                                                                                          ▼
                                                                                    words row
```

The read (`GET …/state`) reports `running → succeeded | failed`; the content (`GET …/words/:lang/:word`)
returns the row once Ready. The composer functions that assemble this — `requestWordBuild`, `buildWord`
— live in [`core/use-cases/`](../core/use-cases/CLAUDE.md).

## The layers

Direction (top calls down; `platform/*` are leaves): `apps → use-cases → core → repositories →
database`, and everything → `platform`. The middle four are layer folders of the single
`@kotodama/core` package; `platform/*` are the adapter folders of the single leaf `@kotodama/platform`.
The **rule and its enforcement** are owned by
[`.claude/rules/dependency-hierarchy.md`](../.claude/rules/dependency-hierarchy.md); the README has the
[layer responsibility table](../readme.md#repository-layers). Each layer's detail is its own
`CLAUDE.md`:

| Concern | Read |
|---|---|
| Dependency rule + enforcement | [`.claude/rules/dependency-hierarchy.md`](../.claude/rules/dependency-hierarchy.md) |
| App entrypoints (api · worker) | [`apps/api`](../apps/api/CLAUDE.md) · [`apps/worker`](../apps/worker/CLAUDE.md) |
| Flow composers | [`core/use-cases/CLAUDE.md`](../core/use-cases/CLAUDE.md) |
| Domain logic + the `ContentEngine` swap seam | [`core/`](../core/content/CLAUDE.md) |
| Persistence functions | [`core/repositories/`](../core/repositories/words/CLAUDE.md) |
| Schema · word vocabulary · `WordEntity` | [`core/database/CLAUDE.md`](../core/database/CLAUDE.md) |
| Boundary adapters (ai · queue · storage · config · …) | [`platform/*/CLAUDE.md`](../platform/) |
| Tech stack + decisions | [`.claude/rules/tech-stack.md`](../.claude/rules/tech-stack.md) |

## Cross-cutting

| Topic | Read |
|---|---|
| HTTP contract (`WordsApi`) | [`apps/api/src/words/words.api.ts`](../apps/api/src/words/words.api.ts) |
| AWS boundary (base + bound wrapper) | [`platform/queue/CLAUDE.md`](../platform/queue/CLAUDE.md) · [`platform/storage/CLAUDE.md`](../platform/storage/CLAUDE.md) |
| Config (one source, three environments) | [`docs/running.md`](running.md) · [`.claude/rules/config.md`](../.claude/rules/config.md) |
| Tracing | [`.claude/rules/observability.md`](../.claude/rules/observability.md) |
| Effect v4 idioms | [`.claude/rules/effect-conventions.md`](../.claude/rules/effect-conventions.md) |
