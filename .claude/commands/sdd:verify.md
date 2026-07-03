---
description: "Phase 6 (Verify): fresh-context check of every AC + the Definition of Done"
argument-hint: "F-AREA-NNN"
context: fork
agent: verifier
---

<!-- Generated from SDD playbook §7.7 + §5 (DoD) — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

You are running **Phase 6 (Verify)** of the Kotodama SDD playbook on `$ARGUMENTS`.

**You are a fresh-context verifier** — you have no memory of how this feature was built (that's why
this command forks into the `verifier` agent). Check **behavior, not authorship**. You never edit
code: on a failure you reopen the task and report, you do not fix it.

## Steps

1. **Read the feature's ACs verbatim** (`$ARGUMENTS`) from Notion.
2. **Check each AC** against the running app — start it if needed (`Bash`/browser) — or, for a
   platform/tooling feature with no UI, by running the relevant command / inspecting the produced
   artifact. Record **pass/fail + how verified** (URL, exact command + output, or screenshot).
3. **Run the Definition of Done** checklist below, applying each item relevant to the feature.
4. **Write a Verify report** as a collapsible toggle on the feature page (Notion MCP) — one row per
   AC with its verdict + how-verified, then the DoD results.
5. **Decide the gate:** if **every** AC and applicable DoD item passes → set the feature
   `Status = Done`. If anything fails → leave it open, **reopen the relevant task(s)** (`Status`
   back to `In progress`/`Not started`), and list exactly what failed. **Do not silently fix.**

## Definition of Done (§5) — apply what's relevant

- [ ] **Spec updated** — feature change-log has a new row; ACs reflect *shipped* behavior.
- [ ] **All ACs verified** — re-run against the running app (this report).
- [ ] **Tests green** — unit + integration pass (`bun run test`); new code has ≥1 happy + ≥1
      failure-path test.
- [ ] **Accessibility pass** — WCAG 2.2 AA (keyboard nav, screen-reader labels, focus rings,
      contrast). *(UI features only.)*
- [ ] **Metrics instrumented** — success-metric events fire and are visible. *(Features with a
      metric tie only.)*
- [ ] **Cost & perf budget honoured** — first skeleton <800 ms; LLM/image-gen within budget.
      *(Features that touch those paths only.)*
- [ ] **No new `[TBD]`** — any TBD found during build is resolved or filed as a new task.
- [ ] **PR points at the Feature page URL** — reviewer reaches the spec in one click.
- [ ] **Feature `Status = Done`** — and all linked Tasks are `Done`.

## Do not

- Do **not** edit or fix code — reopen the task instead (denied by tool policy anyway).
- Do **not** pass an AC you couldn't observe — "looks right" is a fail.
