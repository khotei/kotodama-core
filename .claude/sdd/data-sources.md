<!-- Generated from SDD playbook §4 + Wiki CLAUDE.md §2 — https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7. Re-sync on change. -->

# Notion data-source IDs (for the `/sdd:*` commands)

The `sdd:*` commands write rows/pages into these databases via the Notion MCP. Creating a
page needs the **`collection://` data-source ID** (the page URL is not enough). These IDs are
stable, so they are **embedded** here and `@`-referenced by the commands — never fetched at run
time (the §5 embed-vs-link rule). Only the *content* (specs to cite, current max ID, the
feature/task body) is fetched live.

| Database | What `/sdd:*` does with it | Page URL | Data-source ID |
|---|---|---|---|
| **Features** | `/sdd:specify` creates the Feature row; `/sdd:plan` / `/sdd:verify` update it | https://www.notion.so/bbbbfa7d26014f5eb66c10d425318830 | `collection://3d4ebb14-8300-4522-8003-755fa49004e6` |
| **Tasks** | `/sdd:tasks` creates the task rows (the board view *is* the kanban) | https://www.notion.so/acb5c4ce7ebe4f34a3ea80dcd48c4de4 | `collection://9817c7fb-749d-4a2c-9861-8ee9a0346ebc` |
| **Specs** | `/sdd:research` creates a Research-findings page (Doc type = Research) | https://www.notion.so/8f524a61f58b44c0895c0e677edfc5bc | `collection://1904213b-d50c-4896-9bdf-c714f74a8d2e` |
| **Templates** | reference only — the playbook + scaffolds the commands are compiled from | https://www.notion.so/2c0a707e147d4152b80bc109647050e3 | `collection://fcc185f0-0967-4fcc-980b-996f63f29d27` |

## Anchor pages

- **Project hub — Kotodama:** https://www.notion.so/36dfb28bd5f1816d87dfe7af807a19d2
- **SDD playbook (the authored source these commands compile):** https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7

## Notes

- To scope a `notion-search` to one database, pass its `collection://` ID as the search scope —
  avoids cross-database noise when looking up the current max Feature/Task ID.
- These IDs only change if a database is recreated. If a write fails with "unknown data source",
  re-confirm the ID from the Kotodama hub before editing here.
