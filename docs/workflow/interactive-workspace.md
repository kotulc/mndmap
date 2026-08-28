---
title: Interactive workspace
categories:
  - workflow
tags:
  - ui
  - dashboard
  - sqlite
related:
  - title: Organization and structure
    url: /workflow/organization-and-structure
  - title: Stateless build
    url: /workflow/stateless-build
---

# Interactive workspace

`mndmap ui` is the live editor for site shape. It keeps organization and destination-only segment overrides in a local SQLite database while you drag pages, reorder sections within a page, and preview diagrams.

## Start the dashboard

```bash
# from the mndmap repo (workspace root = ., source = docs/)
npm run ui

# from any project
mndmap ui --root /path/to/project
# optional:
mndmap ui --root /path/to/project --port 7341 --host 127.0.0.1
```

The dashboard uses mndflow's shell layout and `@mnd/kit` **0.2.0** components (`Explorer`, `Viewer`). Header controls: **Content / Diagram**, **Rescan**, **Preview**, **Export**, **Diagnostics**, and theme.

On startup, mndmap:

1. Loads configuration
2. Opens or creates `.mndmap/state.sqlite`
3. Parses source documents
4. Serves the REST API and React dashboard

Source is **not** watched automatically. After editing files under `source.root`, run **Rescan** in the UI or:

```bash
mndmap rescan --root /path/to/project
```

## What persists locally

| Stored in `.mndmap/` | Rebuilt from source? |
|----------------------|----------------------|
| Parsed documents, sections, tables, items | yes — on rescan |
| **Organization** — folders, groups, pages, order, diagram roots | **no — this is your work** |
| **Segment placements** — which sections appear on which page | no |
| Segment content overrides (destination-only) | no |
| Generated groups and diagram settings | no |

**Do not commit `.mndmap/`.** It is machine-local working state. CI uses `build`, not dashboard history.

## Preview vs export

The dashboard previews output without mutating the destination. Nothing under `site/` changes until you explicitly export:

```bash
mndmap export --root /path/to/project
```

`export` uses the same planning and validation pipeline as `build`, but organization and segment placements come from the saved store instead of deterministic defaults.

## REST API

The UI talks to a local REST server started by `mndmap ui`. Key routes:

```text
POST /import
POST /rescan
GET  /organization
POST /organization/move|group|rename|diagram
GET  /pages/:id/segments
POST /segments/move|remove|override
POST /reconciliation/resolve
GET  /graph
GET  /graph/:layer
POST /export/preview
POST /export
GET  /diagnostics
```

## When to use which workflow

| Situation | Use |
|-----------|-----|
| CI publishes docs on every push | `build` |
| First-time layout matches source folders | `build` |
| Restructuring navigation or reordering sections within pages | `ui` → `export` |
| Experimenting with diagram depth per node | `ui` → `export` |
| Tweaking destination-only prose without touching source | `ui` → `export` (field overrides in S5b) |

After settling on a layout in the dashboard, you can still run `build` in CI — but only if the default organization matches what you want. For custom layouts, export from the workspace or regenerate with matching rules.
