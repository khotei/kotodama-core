---
description: "Phase 6 (Verify): fresh-context AC check that feeds the human Accept/Return gate"
argument-hint: "KO-N"
context: fork
agent: verifier
---

<!-- Compiled from the Kotodama Notion hub («О системе» + «Playbook — Notion PM Setup») + the agent-loop guide github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md. Re-sync on change. -->

You are running **Phase 6 (Verify)** of the Kotodama SDD loop on `$ARGUMENTS`.

**You are a fresh-context verifier** feeding the **human review gate** — you have no memory of how
this feature was built (that's why this command forks into the `verifier` agent). Check **behavior,
not authorship**. You never edit code, and you **never set `Done` yourself**: you record the verdict
on the Run and report; the human makes the Accept/Return gesture.

## Steps

1. **Read the ACs verbatim** (`$ARGUMENTS`) from the Work DB, and the latest **Run** row for the
   task(s) (Handoff + Evidence).
2. **Check each AC** — most kotodama-core features have **no browser UI**, so verify by starting the
   app / running the relevant command / inspecting the produced artifact (migration output, a query
   result, an API response); only start a browser when the AC genuinely renders one. Record
   **pass/fail + how verified** (exact command + output, URL, or screenshot).
3. **Run the Definition of Done** checklist below, applying each item relevant to the feature.
4. **Record the result on the Run** (Notion MCP) — set the Run `Verdict` and write the AC-by-AC
   findings + DoD results into its `Handoff` / `Evidence`. The report lives on the **Run row**, not a
   feature-page toggle.
5. **Report to the human — do NOT set `Done`.** If every AC and applicable DoD item passes, report
   the pass and recommend **Accept** (the human then sets Work `Status = Done`). If anything fails,
   set the Run `Verdict = Returned`, recommend **Return** (the human sets Work `Status = Returned`
   with a note; the sub-item reopens), and list exactly what failed. **Do not silently fix.**

## Definition of Done — apply what's relevant

- [ ] **Spec reflects shipped behavior** — ACs match what was built; decisions live in commit
      `Decision:` paragraphs, not a Notion change-log.
- [ ] **All ACs verified** — re-run against the running app / command (recorded on the Run).
- [ ] **Tests green** — unit + integration pass (`bun run test`, **not** `bun test`); new code has
      ≥1 happy + ≥1 failure-path test (`@effect/vitest`).
- [ ] **Migrations apply cleanly** — any Drizzle schema change ships its migration and applies
      forward on a fresh DB. *(Features that touch the schema only.)*
- [ ] **Accessibility pass** — WCAG 2.2 AA (keyboard nav, screen-reader labels, focus rings,
      contrast). *(UI features only — most core features have none; say so.)*
- [ ] **Metrics instrumented** — success-metric events fire and are visible. *(Features with a
      metric tie only.)*
- [ ] **Cost & perf budget honoured** — LLM/image-gen within budget; hot paths within their target.
      *(Features that touch those paths only.)*
- [ ] **No new `[TBD]`** — any TBD found during build is resolved or filed as a new Work sub-item.
- [ ] **PR points at the Feature page URL** — reviewer reaches the spec in one click.
- [ ] **Run recorded** — a Runs row carries the Verdict, Handoff, Evidence, Diff LOC, and Branch;
      on Accept the human sets Work `Status = Done` and every Task sub-item is `Done`.
- [ ] **Every diff was read, not skimmed** — staged hunk-by-hunk, under ~400 LOC, every line
      explainable. (If reviewing it took as long as reviewing a human's PR, it was rubber-stamped —
      the fix is a smaller slice, not a heavier end-review.)
- [ ] **Verification is evidence, not assertion** — each verdict shows the check's actual output
      (the failing-then-passing test, the command result), never a bare "it works."
- [ ] **Each commit explains WHY** — a `Decision:` paragraph records the non-obvious choice or the
      rejected alternative (`@.claude/rules/commits.md`).

## Do not

- Do **not** edit or fix code — recommend a Return instead (denied by tool policy anyway).
- Do **not** set `Status = Done` — that is the human's Accept gesture, never the agent's.
- Do **not** pass an AC you couldn't observe — "looks right" is a fail.
