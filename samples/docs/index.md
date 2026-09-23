---
title: mndmap
description: Organize documentation collections and emit publication-ready sites
---

# mndmap

**A live editor for how a documentation site is organized.**

Point mndmap at a directory of markdown. It parses every document into a working store, shows you the collection as a tree you can reorganize, draws the resulting structure as a diagram while you work, and writes out a new collection — diagrams embedded, links rewritten, and wired for navigation.

The markdown you point it at is never modified. What comes out is a second collection, ready for **[mdsite](https://github.com/kotulc/mdsite)** to build into a static site.

## The full pipeline

```text
docs/**/*.{md,mdx}
        │
     parse ──▶ working store ──┬──▶ tree        reorganize files and sections
        │                      └──▶ diagram     redrawn as you go
        │                                │
        └────────────────── export ────────┴──▶  site/
                                               documents + _assets/ + mdsite.yaml
                                                        │
                                                     mdsite ──▶ dist/
```

| Stage | Tool | Responsibility |
|-------|------|----------------|
| Write | you | Source markdown in `docs/` (or any configured root) |
| Organize | **mndmap** | Parse, reshape, enrich metadata, rewrite links, embed diagrams |
| Render | **mdsite** | Mirror routes, adapt MDX, apply theme, static export |
| Publish | you | Deploy `dist/` to Pages, Vercel, S3, or any static host |

**One target in, a different target out.** mndmap never writes into the directory it reads, so there is no feedback loop and nothing to keep in sync.

## Two ways to work

1. **`mndmap build`** — stateless CI pipeline. Parses source, applies configuration and deterministic defaults, atomically replaces the destination. No `.mndmap/` directory required.
2. **`mndmap ui`** — interactive workspace. Keeps organization and segment overrides in `.mndmap/workspace.json`. Reorganize in the dashboard, then **`mndmap export`** when ready.

`build` does not read dashboard state. Dashboard decisions affect explicit workspace exports only.

## Where to go next

- [Getting Started](getting-started.md) — install, first build, chain to mdsite
- [Configuration](configuration.md) — `mndmap.yaml`, selectors, diagram depth
- [Workflow overview](workflow/overview.md) — parse → store → graph → export
- [mdsite handoff](publishing/mdsite-handoff.md) — destination contract and `nav_order`
- [Deployment](publishing/deployment.md) — CI/CD with mndmap and mdsite
