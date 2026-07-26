# Commit message examples (on-demand)

Worked example for `.claude/rules/commits.md`, which owns the **format spec + gitmoji table + a
`feat` example** always-loaded. The **format source of truth is the rule** — read this only when a
non-trivial commit needs a model of the project-specific `Decision:` + `Refs:` trailer in use.

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

A purely mechanical refactor may omit `Decision:` (the rule marks it optional); a `chore` scopes as
`F-AREA-NNN/T0N`. Both shapes live in `commits.md`.
