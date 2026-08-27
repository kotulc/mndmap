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

`mndmap ui` is the live editor for site shape. It keeps organization and destination-only content overrides in a local SQLite database while you drag pages, regroup sections, and preview diagrams.

## Start the dashboard

```bash
# from the mndmap repo (workspace root = ., source = docs/)
npm run ui

# from any project
mndmap ui --root /path/to/project
# optional:
mndmap ui --root /path/to/project --port 7341 --host 127.0.0.1
```

On startup, mndmap:

1. Loads configuration
2. Opens or creates `.mndmap/state.sqlite`
3. Parses source documents
4. Serves the REST API and React dashboard

Source is **not** watched automatically. After editing files in `docs/`, run **Rescan** in the UI or:

```bash
mndmap rescan --root /path/to/project
```

## What persists locally

| Stored in `.mndmap/` | Rebuilt from source? |
|----------------------|----------------------|
| Parsed documents, sections, tables, items | yes — on rescan |
| **Organization** — tree shape, grouping, order, diagram roots | **no — this is your work** |
| Segment content overrides (destination-only) | no |
| Generated groups and diagram settings | no |

**Do not commit `.mndmap/`.** It is machine-local working state. CI uses `build`, not dashboard history.

## Preview vs emit

The dashboard previews output without mutating the destination. Nothing under `site/` changes until you explicitly emit:

```bash
mndmap emit --root /path/to/project
```

`emit` uses the same planning and validation pipeline as `build`, but organization comes from the saved store instead of deterministic defaults.

## REST API

The UI talks to a local REST server started by `mndmap ui`. Headless tools can use the same API for automation, but the primary workflow is the dashboard.

## When to use which workflow

| Situation | Use |
|-----------|-----|
| CI publishes docs on every push | `build` |
| First-time layout matches source folders | `build` |
| Restructuring navigation or merging sections across pages | `ui` → `emit` |
| Experimenting with diagram depth per section | `ui` → `emit` |
| Tweaking destination-only prose without touching source | `ui` → `emit` |

After settling on a layout in the dashboard, you can still run `build` in CI — but only if the default organization matches what you want. For custom layouts, either commit the emitted `site/` or add a future export of organization rules (not yet available; dashboard state is local only).
