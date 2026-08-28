---
title: Organization and structure
categories:
  - workflow
tags:
  - tree
  - folders
  - groups
  - nav
related:
  - title: Diagrams
    url: /workflow/diagrams
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
---

# Organization and structure

mndmap's core job is making **site shape** editable. The organization tree controls where pages land and what order siblings appear in navigation. **Sections** are managed separately through segment placements on each page.

## Organization nodes

| Kind | Meaning |
|------|---------|
| `folder` | Source folder mirrored in the emitted destination |
| `page` | A markdown or MDX file |
| `group` | Generated folder with an `index.md` landing page |

Sections, tables, lists, and items are **not** organization nodes. They appear on pages via `segment_placement`.

Dragging folders, groups, and pages in the Explorer updates parent, position, and optional output slug.

## Segment placements

Each page owns an ordered list of section placements:

- reorder sections within the page (content panel or REST)
- remove a section from the page without deleting source
- destination-only overrides (whole segment or per-field in S5b)

A section appears on at most one emitted page.

## Emitted paths

- **Moving a page** changes its path under the destination root
- **Reordering segments** changes section order in the emitted page
- **Creating a group** adds a folder with a generated `index.md` linking to children
- Paths are relative to `source.root` — the configured root is never duplicated in routes
- Duplicate output paths, routes, or anchors are blocking errors — no silent suffixes

Folder and group landing pages are ordinary markdown with:

- Title from the organization node
- Child links to emitted routes
- Deterministic metadata (`description`, `reading_time`)
- An optional inline diagram of immediate children

## Navigation order

Sibling order in the organization tree becomes `nav_order` in the exported `mdsite.yaml`:

```yaml
nav_order:
  "": [getting-started, configuration, workflow]
  workflow: [overview, stateless-build, interactive-workspace]
```

Keys are route prefixes (`""` for the content root). Values are slug arrays in sibling position order. mdsite pins listed slugs first; unlisted siblings sort alphabetically after.

mdsite does not apply a second organization policy — what mndmap exports is what gets mirrored.

## Selectors vs organization

**Selectors** identify structured records inside a document (tables, typed lists). They do not move content between pages.

**Organization** moves pages, folders, and groups. **Segment placements** control section order within pages. Use the dashboard for structural edits; use selectors in `mndmap.yaml` when tables need stable row identity for graphing or future enrichment.

## Rescan and reconciliation

When source files change, `rescan` reconciles parsed content against stored nodes:

- Matching identity (explicit key, locator + fingerprints) updates content in place
- Ambiguous matches surface as diagnostics for confirmation
- Missing source nodes block export until resolved

Organization and segment overrides survive rescans when identity still matches.
