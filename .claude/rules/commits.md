# Commit message convention

**Always-loaded rule.** Every commit in this repo MUST follow this format so any future
Claude Code session can `git log -p` on a branch and reconstruct full context without
re-reading Notion. This combines [gitmoji](https://gitmoji.dev/),
[Conventional Commits](https://www.conventionalcommits.org/),
[Chris Beams' 7 rules](https://cbea.ms/git-commit/), and a mandatory `Decision:` paragraph
(the "Contextual Commits / Lore" pattern for AI-readable history).

## Format

```
<gitmoji> <type>(<scope>): <subject>

<body — what + why, wrapped at 72 chars>

Decision: <non-obvious choice: trade-off, alternative rejected, or downstream implication>

Refs: <Notion sub-task URL>
```

### Subject line (Chris Beams' 7 rules)

1. Separate subject from body with a blank line.
2. Limit the subject line to **≤50 characters** (the `<gitmoji> <type>(<scope>):` prefix is
   not counted against the 50, but keep the whole line legible).
3. Capitalise the subject.
4. Do **not** end the subject with a period.
5. Use the **imperative mood** ("Add", not "Added"/"Adds").
6. Wrap the body at **72 characters**.
7. Use the body to explain **what** and **why**, not how.

### Scope

- Tracked tasks: `F-PLAT-001/T0N` (e.g. `F-PLAT-001/T01`).
- Otherwise the area name: `schemas`, `tooling`, `infra`, `ci`, etc.

### Decision paragraph

Mandatory whenever a choice is non-obvious — a trade-off made, an alternative rejected, or a
downstream implication. Trivial/mechanical commits may omit it, but prefer including it.

### Refs footer

`Refs:` with the Notion sub-task URL (and any related page). Last line of the message.

## Gitmoji table (covers ~90% of commits)

| Gitmoji | Code | Use for |
|---|---|---|
| ✨ | `:sparkles:` | `feat` — a new feature |
| 🐛 | `:bug:` | `fix` — a bug fix |
| ♻️ | `:recycle:` | `refactor` — restructure without behaviour change |
| 🔨 | `:hammer:` | tooling / dev scripts |
| 📝 | `:memo:` | `docs` — documentation |
| 🔧 | `:wrench:` | `config` — config files |
| ✅ | `:white_check_mark:` | `test` — add/update tests |
| 💄 | `:lipstick:` | UI / styling |
| 🔒 | `:lock:` | security |
| 🚧 | `:construction:` | WIP — work in progress |

(Repo bootstrap may also use 🎉 `:tada:` for the initial commit.)

## Conventional Commits types

`feat` · `fix` · `refactor` · `chore` · `docs` · `test` · `build` · `ci`

## Worked examples

### feat (with Decision)

```
:sparkles: feat(schemas): Add Word and WordEntry Effect schemas

Define the shared Effect Schema types for words and generated entries
so both the API contract and the frontend decode from one source.

Decision: Modelled WordEntry.images as a non-empty array rather than an
optional field — a generated entry without at least one image is invalid
domain state, so the schema enforces it instead of leaving it to runtime
checks downstream.

Refs: https://www.notion.so/<sub-task-url>
```

### fix (with Decision)

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

### refactor (no Decision needed)

```
:recycle: refactor(repositories-words): Extract row-to-domain mapper

Pull the Drizzle-row → Word mapping into a single private helper reused
by findById and list, removing the duplicated field mapping.

Refs: https://www.notion.so/<sub-task-url>
```

### chore (with Decision)

```
:wrench: chore(F-PLAT-001/T01): Bootstrap Bun monorepo + minimal .claude/

Add the workspace root: package.json with workspaces, catalogs (six
groups per spec §2.6), root scripts, .gitignore, .env.example, readme
stub, and a minimal .claude/ (root CLAUDE.md, settings.json, this rule).

Decision: Effect catalog entries use the `beta` dist-tag rather than a
pinned exact version — v4 is still iterating fast; bun.lock pins the
resolved version and we bump deliberately. Decision: permission policy
puts every git commit/push and all web access on the `ask` list as the
human-in-the-loop safety belt. Chicken-and-egg: this very commit is
commit #1 AND introduces this rule, so its message was written by hand.

Refs: https://www.notion.so/36dfb28bd5f1815abd83f2c28d01a145
```
