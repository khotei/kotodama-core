# Pull requests

**Always-loaded rule.** PRs here are **squash-merged**, and GitHub is set to
*"Pull request title and description"*, so each PR collapses to **one commit on `main`**
whose **subject = PR title** and **body = PR description** — verbatim, except that
**HTML comments (`<!-- … -->`) are stripped**. The PR description therefore *is* the
permanent git history a future developer or Claude Code session reads via `git log -p`.

**Format source of truth is `@.claude/rules/commits.md`.** This file only adapts it to the
PR surface — it does **not** restate the gitmoji table or type list. If the two drift, the
squashed history stops matching per-commit history.

## The rule

- **PR title = a `commits.md` subject line:** `<gitmoji> <type>(<scope>): <subject>` —
  imperative, Capitalised, ≤50 chars, no trailing period. (The squash *subject* comes from
  the title, never the first body line, so only the title can set it.)
- **PR body = the template's surviving sections**, which together form a `commits.md`-shaped
  body: **Summary** (WHAT+WHY, ~72-char wrap) · **What changed** (bullets) · **How it works**
  (mechanism; optional Mermaid diagram inside `<details>`) · **Decisions** (one `Decision:`
  paragraph per non-obvious choice) · **Refs** (`Refs:` Notion URL + `Closes #<issue>`).
- **Reviewer-only content lives in one `<!-- … -->` block:** the title-rule header, author
  self-check, *How to test*, and screenshots. Stripped at merge, so it never pollutes
  history. HTML comments do **not** nest — never put `<!-- -->` inside another, and avoid a
  literal `-->` inside a comment (it would close it early and leak review chrome).
- **Diagrams go in the surviving body, not in a comment** — so AI agents reading history get
  them — wrapped in `<details>` to keep raw `git log` bounded. GitHub renders Mermaid on both
  the PR and the commit page.
- `.github/PULL_REQUEST_TEMPLATE.md` encodes exactly this shape and auto-fills the PR
  description box; filling it in and squash-merging yields a compliant commit with **zero
  hand-editing at merge time**.

## Repo setting that makes this work

*Settings → General → Pull Requests* → **Allow squash merging** with **Default commit message
= "Pull request title and description"** (API: `squash_merge_commit_title=PR_TITLE`,
`squash_merge_commit_message=PR_BODY`). Documented in `readme.md`. Without it, squash falls
back to concatenating branch commits and the template has no effect.

## Worked example

A fully filled PR (real T05 task) with a Mermaid dependency graph **and the exact squashed
commit it produces** lives in `.github/PULL_REQUEST_example.md`. In short:

- **Title** → subject: `:sparkles: feat(F-PLAT-001/T05): Scaffold shared packages`
- **Body** → Summary + What changed + How it works (folded diagram) + `Decision:` + `Refs:`.
- After comment-stripping, that body is exactly the commit body — checklist and test plan
  (which sat in the HTML comment) leave no trace.
