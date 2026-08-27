---
title: Workflow overview
categories:
  - workflow
tags:
  - pipeline
  - parse
  - emit
related:
  - title: Stateless build
    url: /workflow/stateless-build
  - title: Interactive workspace
    url: /workflow/interactive-workspace
  - title: Pipeline split
    url: /specifications/pipeline-split
---

# Workflow overview

mndmap sits between your source markdown and the mdsite renderer. It turns a flat or messy collection into a publication-ready destination with consistent structure, metadata, links, assets, and diagrams.

```text
configured source
  → parse
  → working store
  → organization (defaults or dashboard)
  → graph validation (mndflow / @mnd/kit)
  → emit planning
  → destination/ + mdsite.yaml
  → mdsite build
  → dist/
```

## What mndmap owns

| Concern | Where it happens |
|---------|------------------|
| Source parsing and structural identity | `parse` → source nodes in working store |
| File, folder, group, and section organization | organization tree |
| Destination layout and sibling order | emit → paths + `nav_order` |
| Internal link and MDX reference rewriting | emit planning |
| Local asset collection into `_assets/` | emit |
| Inline mndflow diagram SVG with navigation links | emit on landing pages |
| Fill-only `description` and `reading_time` | `metadata.ts` during emit |
| `mdsite.yaml` with `content: .` and generated `nav_order` | `emit/mdsite-config.ts` |

## What mdsite owns (downstream)

| Concern | Where it happens |
|---------|------------------|
| `.md` → `.mdx` framework adaptation | mdsite ingest |
| Mirroring the route tree exactly as supplied | mdsite ingest |
| Copying `_assets/` to `public/_assets/` | mdsite ingest |
| Legacy `images/` subtree copy and path rewrite | mdsite ingest |
| Renderer metadata extraction → `site-meta.json` | mdsite ingest |
| Navigation `_meta.json` from structure + `nav_order` | mdsite ingest |
| Theme, layout, static export | mdsite build |

mdsite does **not** reorganize folders, flatten directories, run embeddings, score related pages, or rewrite links semantically. If structure is wrong, fix it in mndmap and rebuild.

## Authority and immutability

- **Source markdown is authoritative** for original content. mndmap never writes to `source.root`.
- **Dashboard content edits** are destination-only segment overrides.
- **`.mndmap/`** is authoritative only for the interactive workspace.
- **A stateless `build`** starts from source and configuration every time.
- **The destination** is wholly owned by mndmap and replaced atomically.
- **mdsite** consumes the destination without semantic enrichment.

## Two workflows, one emit contract

| | `mndmap build` | `mndmap ui` + `emit` |
|---|---|---|
| Working store | ephemeral (in-memory or temp SQLite) | persistent `.mndmap/state.sqlite` |
| Organization | deterministic defaults mirroring source | user-edited tree |
| Reads `.mndmap/` | no | yes |
| Output | same destination contract | same destination contract |
| Use case | CI, reproducible pipelines | exploratory restructuring |

Both paths produce byte-identical output when organization matches.

## The graph is derived

mndmap builds a mndflow graph from the working store on demand — for the dashboard preview, validation before emit, and inline SVG generation. The graph is **not stored** and **not hand-placed**. Steering a diagram means reorganizing the tree, not dragging boxes.

mndmap is a *translator*: it uses `@mnd/kit` (`Explorer`, `Viewer`, `draw_svg`) but never opens a mndflow workspace or writes a log.

## Diagnostics block emit

These are hard errors — emit and build abort rather than guess:

- Unresolved source identity
- Graph `validate` / `review` faults
- Duplicate output paths or heading anchors
- Missing referenced local assets
- Selector ambiguity (zero or multiple matches)
- Dynamic or unresolved MDX import targets

All blocking diagnostics are reported together before any destination mutation.
