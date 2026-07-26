# Modern TypeScript/ECMAScript — repo floor + local idioms

**On-demand reference** (pointer-loaded from `/sweep`; NOT auto-loaded). The ES2023–2025 / TS 5.x
feature catalog the model already emits reliably is omitted; this keeps only what is local to this repo.

- **Floor:** TS ^5.7, `target/lib: esnext`, Bun 1.3 (JavaScriptCore — has the ES2024 set + most of
  ES2025; **verify the newest ES2025 entries in Bun before relying on them**, e.g. `RegExp.escape`).
- **Effect stdlib wins first** — for array/option/record/predicate work reach for `effect`'s modules
  (`effect-stdlib.md`); plain-TS features are for the layer beneath (scripts, helpers, tests).
- **Enum / value-list idiom:** an `as const` tuple + `(typeof X)[number]` + a derived map — the repo's
  `.values.ts` pattern; the list, its union, and its map stay one author, never hand-synced.
- **Exhaustive dispatch:** a handler record `satisfies Record<Union, T>` (lookup, not a `switch` that
  can silently miss a new union member).
