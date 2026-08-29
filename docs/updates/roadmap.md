---
title: Roadmap
date: 2026-03-08
categories:
  - updates
tags:
  - roadmap
  - status
related:
  - title: Workflow overview
    url: /workflow/overview
  - title: Pipeline split
    url: /specifications/pipeline-split
---

# Roadmap

## Current status

The enrichment pipeline described in `plan.md` is **implemented** through delivery stage S7:

- Stateless `mndmap build` with source-root-relative paths and byte-identical output
- Interactive `mndmap ui` with persistent `.mndmap/workspace.json`
- Organization limited to **folders, generated groups, and pages**; sections use `segment_placement`
- `@mnd/kit` **0.2.0** (S0b gestures: Explorer `reveal`, Viewer `picked` / `onLook`)
- mndflow shell in the dashboard (`theme.css` + `base.css`, Content/Diagram toggle)
- Content panel with segment blocks (reorder and remove within a page)
- mndflow graph validation, depth-aware projection, and navigable diagram SVG
- Fill-only metadata (`description`, `reading_time`)
- Link and asset rewriting with `_assets/` handoff
- Exported `mdsite.yaml` with generated `nav_order`
- Cross-project mdsite fixture verification in CI

`archive.md` documents the retired multi-agent ledger product and is historical only.

## Deferred

| Item | Notes |
|------|-------|
| S5b field-level segment editors | Block list and export settled first; table/list/term field overrides next |
| Taggly metadata enrichment | Seam defined; fill-only rules today |
| Organization export for CI | Dashboard state is local; `build` uses defaults |
| YAML source-document adapter | Not in scope |
| Workflow engine / scheduler | Non-goal |

## Downstream (mdsite Phase 2+)

Intelligence features are co-developed with mndmap as signal producer and mdsite as renderer:

- Semantic search (pre-computed index from upstream)
- Semantic theming from content-style signals
- Reduced Nextra dependency footprint

mndmap will generate indexes and style signals; mdsite will consume static assets. Neither runs embedding models at site build time.

## Compatibility pins

See `mndflow-pin.json` for the pinned mndflow commit, `@mnd/kit` **0.2.0**, and mndsite Docker image tag. Upgrade mndmap and mdsite together when these pins change.
