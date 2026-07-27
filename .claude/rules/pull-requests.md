# Pull requests

**Always-loaded rule.** PRs are **squash-merged** with GitHub set to *"Pull request title and
description"*, so each PR collapses to **one commit on `main`**: subject = PR title, body = PR
description **verbatim, except HTML comments (`<!-- … -->`) are stripped**. The PR description
therefore *is* the permanent git history read via `git log -p`.

**Format source of truth is `.claude/rules/commits.md`** — this file only adapts it to the PR
surface and does NOT restate the gitmoji table or type list.

- **PR title** = a `commits.md` subject line (the squash subject comes from the *title*, never the
  first body line — only the title can set it).
- **PR body** = the template's surviving `commits.md`-shaped sections: **Summary** (what+why) ·
  **What changed** · **How it works** (mechanism; optional Mermaid in `<details>` so raw `git log`
  stays bounded and agents still get the diagram) · **Decisions** (one `Decision:` per choice) ·
  **Refs** (Notion URL + `Closes #<issue>`).
- **Reviewer-only content lives in ONE `<!-- … -->` block** (title-rule header, self-check, *How to
  test*, screenshots) — stripped at merge. Comments do **not** nest: never nest `<!-- -->`, and avoid
  a literal `-->` inside one (it closes early and leaks review chrome).
- `.github/PULL_REQUEST_TEMPLATE.md` encodes this and auto-fills the description ⇒ zero hand-edit at
  merge. **Repo setting that makes it work:** *Settings → Pull Requests* → Allow squash merging,
  Default commit message = "Pull request title and description".

Fully-filled worked PR + the exact squashed commit it produces: `.github/PULL_REQUEST_example.md`.
