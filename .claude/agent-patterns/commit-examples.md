# Commit message examples (on-demand)

Worked examples for `.claude/rules/commits.md`, which keeps the **format spec + gitmoji table + the
`feat` example** always-loaded. Read this when a non-trivial commit needs a model — the **format source
of truth is the rule**, not these examples.

## fix (with Decision)

```
:bug: fix(core-jobs): Prevent duplicate job enqueue on retry

EnqueueGenerateWord could enqueue twice when the SQS send succeeded but
the response timed out. Guard with an idempotency key derived from the
word id.

Decision: Chose a deterministic idempotency key over a dedup table —
SQS native dedup covers the 5-minute window we care about, avoiding an
extra DB round-trip on the hot path. Revisit if the window proves too
short.

Refs: https://www.notion.so/<sub-task-url>
```

## refactor (no Decision needed)

```
:recycle: refactor(repositories-words): Extract row-to-domain mapper

Pull the Drizzle-row → Word mapping into a single private helper reused
by findById and list, removing the duplicated field mapping.

Refs: https://www.notion.so/<sub-task-url>
```

## chore (with Decision)

```
:wrench: chore(F-PLAT-001/T01): Bootstrap Bun monorepo + minimal .claude/

Add the workspace root: package.json with workspaces, catalogs (six
groups per spec §2.6), root scripts, .gitignore, .env.example, readme
stub, and a minimal .claude/ (root CLAUDE.md, settings.json, this rule).

Decision: Effect catalog entries use the `beta` dist-tag rather than a
pinned exact version — v4 is still iterating fast; bun.lock pins the
resolved version and we bump deliberately. Decision: permission policy
pre-approves git add/commit/push + bun + docker compose (the SDD loop
runs unattended) but keeps history-rewriting git (rebase/reset/branch/
checkout) and ad-hoc WebFetch/WebSearch on the `ask` list as the
human-in-the-loop safety belt. Chicken-and-egg: this very commit is
commit #1 AND introduces this rule, so its message was written by hand.

Refs: https://www.notion.so/36dfb28bd5f1815abd83f2c28d01a145
```
