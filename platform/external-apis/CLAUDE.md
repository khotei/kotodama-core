# packages/external-apis — `@kotodama/platform/external-apis`

`WikiClient` — best-effort Wikipedia/Wiktionary grounding for the word engine. **Backend-only.**

- **The load-bearing invariant:** absence is `Option.none` / `[]`, **never** `WikiError`. A 404, a
  missing page, or a `type: "disambiguation"` summary all resolve on the value channel; only a
  transport fault or a schema-decode break fails. This is what keeps grounding off the engine's error
  path (feature AC-5). Don't "fix" a 404 into an error.
- **Transport stays in `R`:** `WikiClientLive` requires `HttpClient.HttpClient` (from `effect/unstable/http`,
  v4 — *not* `@effect/platform`); the app provides `BunHttpClient.layer`, tests provide a fake-fetch
  one. So this leaf depends on no concrete platform client — only `effect`.
- **May import:** `effect`.
