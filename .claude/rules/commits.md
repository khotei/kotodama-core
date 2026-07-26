# Commit message convention

**Always-loaded rule.** Every commit MUST follow this format so a future session can `git log -p`
and reconstruct context without re-reading Notion (gitmoji + Conventional Commits + a mandatory
`Decision:` paragraph — the AI-readable "Lore" pattern).

## Format

```
<gitmoji> <type>(<scope>): <subject>

<body — what + why, wrapped at 72 chars>

Decision: <non-obvious choice: trade-off, alternative rejected, or downstream implication>

Refs: <Notion sub-task URL>
```

- **Subject:** imperative, Capitalised, no trailing period, **≤50 chars** (the
  `<gitmoji> <type>(<scope>):` prefix is not counted, but keep the line legible).
- **Scope:** tracked task `F-PLAT-001/T0N`, else the area name (`schemas`, `tooling`, `infra`, `ci`…).
- **Decision:** mandatory whenever the choice is non-obvious (trade-off / alternative rejected /
  downstream implication); trivial commits may omit it, but prefer including it.
- **Refs:** Notion sub-task URL, last line.

## Vocabulary

- **Gitmoji → type:** ✨ `feat` · 🐛 `fix` · ♻️ `refactor` · 🔨 tooling · 📝 `docs` · 🔧 `config` ·
  ✅ `test` · 💄 UI · 🔒 security · 🚧 WIP · 🎉 bootstrap only.
- **Types:** `feat` · `fix` · `refactor` · `chore` · `docs` · `test` · `build` · `ci`.

Worked examples (`feat`/`fix`/`refactor`/bootstrap `chore`) — `.claude/agent-patterns/commit-examples.md`
(on-demand; read when a non-trivial commit needs a model).
