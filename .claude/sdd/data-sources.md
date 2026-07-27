<!-- Notion IDs for the /sdd:* commands. Model owner: the Kotodama hub pages; the agent loop follows working-with-agents.md. Re-sync on change. -->

# Notion data-source IDs (for the `/sdd:*` commands)

The `sdd:*` commands write rows/pages into these databases via the Notion MCP. Creating a
page needs the **`collection://` data-source ID** (the page URL is not enough). These IDs are
stable, so they are **embedded** here and `@`-referenced by the commands — never fetched at run
time (the embed-vs-link rule). Only the *content* (docs to cite, current rows, the item body) is
fetched live.

The hub is **four databases** (Knowledge · Work · Runs · Agents). A Feature and its Tasks are
**one Work row + sub-items**, not two databases — see `@.claude/sdd/property-contract.md`.

| Database | What `/sdd:*` does with it | Page URL | Data-source ID |
|---|---|---|---|
| **Knowledge** | read to **cite** the product "why" / research / personas; a durable finding is **promoted** here by hand — the loop never auto-writes it | https://app.notion.com/p/4e67e142a0684e06b03f44113d6cbe92 | `collection://2424ef5d-6c97-4f86-8012-7fcd82a2202b` |
| **Work** | `/sdd:specify` creates the Feature row **+ a research Spike sub-item**; `/sdd:tasks` adds Task **sub-items**; plan/verify update it | https://app.notion.com/p/3fc3612fbd014451997db03b70da94fe | `collection://25a23da3-1d76-497b-8340-9e9567cc23b7` |
| **Runs** | `/sdd:implement` + `/sdd:verify` create the audit Run (one row per delegation attempt) | https://app.notion.com/p/c1127ce4f88d4aa0bdb037dfd7dcbbd9 | `collection://01493611-32dd-4237-b6ac-367436db4731` |
| **Agents** | the fleet registry — role, autonomy, earned accept-rate (read for trust, not written by the loop) | https://app.notion.com/p/a2a1e515797140e780e7280b3befc73d | `collection://c9501f79-8bb1-4a7e-9788-76361f98a872` |

## Anchor pages

- **Project hub — Kotodama:** https://app.notion.com/p/3a8fb28bd5f1813ea577e8544fbb0c47
- **How we run the project (the canonical overview):** the project-overview page — https://app.notion.com/p/3a8fb28bd5f181d3b952e821047b7b8d
- **Hub mechanics + the field glossary:** the "Notion PM Setup" playbook — https://app.notion.com/p/3a8fb28bd5f1817f98f1d67d82bb6f84
- **The agent-loop guide (the "how"):** https://github.com/khotei/terminal-stack/blob/main/docs/working-with-agents.md

## Notes

- To scope a `notion-search` to one database, pass its `collection://` ID as the search scope —
  avoids cross-database noise when looking up a current row.
- These IDs only change if a database is recreated. If a write fails with "unknown data source",
  re-confirm the ID from the Kotodama hub before editing here.
