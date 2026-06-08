# Code comments

**Always-loaded rule.** The default is **no comment**. Code is read far more than written, it is the
source of truth, and every comment is read-cost the reader pays whether or not it pays off — and an
agent acts on a stale comment with full confidence, so a bad comment is worse than none. Earn each
one. Comment the **WHY**; let the code state the WHAT. (Same family as `@.claude/rules/claude-md.md`:
code says *what*, prose says *why*.)

This rule has two gates: **(A)** should this comment exist at all (be strict — most shouldn't); and
**(B)** if it survives, write it as real documentation, not a scattered note.

## Gate A — should it exist? (the litmus)

1. **"Could a competent reader of this stack get this from the code itself?"** (types, signatures,
   control flow, a test name, a `CLAUDE.md`/rule). If yes → delete it.
2. **"Would they get it wrong, or trip on a hidden coupling, without it?"** If yes → it may survive.

When reviewing existing code, **delete on sight** anything that fails (1). The only four reasons to
keep a comment:

- **A non-obvious DECISION + the rejected alternative** — "barrel entry, not the dir glob — globbing
  double-counts re-exported tables." Stops an agent "fixing" it back.
- **A GOTCHA or non-local coupling**, surprising from a distance — dotenv last-key-wins;
  `snakeCase.table` ⇒ do NOT also set `transformQueryNames`; the test Postgres must wait on the
  healthcheck, not `forListeningPorts` (its exec hangs on Docker Desktop).
- **An INVARIANT the type can't express** — "`pending` rows legitimately have null content."
- **A usage CONSTRAINT on an exported symbol** — "provide `ConfigProviderLive` first."

If it isn't one of these four, delete it. Common offenders to cut: restating the code/a symbol name
(`/** Postgres connection string */` over `DatabaseUrl`); step narration (`// then fetch it`);
anything a rule/`CLAUDE.md`/test-name already says (link instead); a provenance tag
(`(Feature §14 #5)` / `(T0N)` — traceability lives in the commit `Refs:` footer, not each line;
keep a `§`-ref *only* when the reader must open it to act).

## Gate B — write the survivor as documentation

A comment that earns its place is **documentation**, so give it a documented form. Default to a
**multiline `/** … */` TSDoc block on the symbol it describes** — this is the *interface comment*
(the deep-modules idea): written so a caller can use the symbol **without reading its body**. If you
can't write that one sentence, the interface is too complex — fix it before documenting. Reserve a
single-line `//` for a pinpoint gotcha *inside* a body, at the exact line it warns about.

**Shape** (modelled on Drizzle's pragmatic style, not Effect's docgen-heavy one):

```ts
/**
 * One declarative sentence: what it is / why it exists / the contract it upholds. Lead with this;
 * a reader who stops here can still use it correctly.
 *
 * Optional second paragraph only for a real gotcha, invariant, or the rejected alternative — the
 * reason this comment passed Gate A. Reference symbols as {@link OtherThing} and values in
 * `backticks`.
 *
 * @example
 * ```ts
 * const stages = yield* AsyncWordJobsRepo.initializeStages(enumLanguage.en, 'lacuna')
 * ```
 * @see `@.claude/rules/drizzle-effect.md`
 */
```

**Tag discipline:**
- `{@link Symbol}` for internal cross-refs (gives IDE hover-nav); `@see` for a rule/file/spec pointer.
- `@example` (fenced ```ts) only when usage is genuinely non-obvious — not for the trivial call.
- `@param` / `@returns` only when the **name and type don't already say it**. Never restate a type.
- **Never `@since` / `@category` / `@deprecated`-for-docgen** — those generate published-library API
  docs; LexiAI isn't published. Use `@internal` to mark a non-public helper if it aids a reader.

**Still tight.** Documentation form does not license padding: the Gate-A bar is unchanged. One strong
sentence beats a paragraph; expand to multiple lines only when a `@param`, `@example`, or a real
gotcha genuinely needs the room. Comment intent (stable) and rationale (untestable), never mechanics.

## Not comments — never strip these

Directive/functional lines are code, not prose: `biome-ignore`, `@ts-expect-error`, `@ts-ignore`,
`eslint-disable`, shebangs, and build-tool pragmas. They stay regardless of the rules above.
