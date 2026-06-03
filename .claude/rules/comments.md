# Code comments

**Always-loaded rule.** Comments serve human devs AND coding agents — an agent acts on a stale
comment with full confidence, so a wrong comment is worse than none. Comment the WHY; let the
code state the WHAT. Density tracks surprise, not line count.

## Comment when

- **A choice is non-obvious** — name the rejected alternative and why (e.g. "barrel entry, not the
  dir glob — globbing double-counts re-exported tables"). This stops an agent "fixing" it back.
- **There's a gotcha or non-local coupling** — surprising from a distance: dotenv last-key-wins;
  `snakeCase.table` ⇒ do NOT also set `transformQueryNames`; a v4 API differs from v3; a test
  Postgres container must wait on the healthcheck, not `forListeningPorts` (its in-container exec
  hangs on Docker Desktop).
- **An invariant the type can't express** — e.g. "`pending` rows legitimately have null content".
- **An exported symbol needs a usage constraint** — e.g. "provide `ConfigProviderLive` first".

## Don't comment

- **What the code already says** — types, signatures, obvious control flow.
- **A restated symbol name** — no `/** Postgres connection string */` over `DatabaseUrl`.
- **What the test name, a rule, or a `CLAUDE.md` already states** — link instead (`See @.claude/rules/…`).

## How

- One load-bearing line beats a paragraph. Module docblock: the one fact a reader needs, then a
  `See …` pointer — not a restated spec.
- Delete comments that will drift: comment intent (stable) and rationale (untestable), not mechanics.
