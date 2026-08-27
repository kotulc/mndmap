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

mndmap's core job is making **site shape** editable. The organization tree controls where pages land, how sections group, and what order siblings appear in navigation.

## Organization nodes

| Kind | Meaning |
|------|---------|
| `folder` | Directory in the emitted destination |
| `page` | A markdown or MDX file |
| `group` | Generated folder with an `index.md` landing page |
| `section` | A heading subtree moved within or across pages |

Dragging in the dashboard updates parent, position, and optional output slug. The tree is the source of truth for emitted paths.

## Emitted paths

- **Moving a page** changes its path under the destination root
- **Moving a section** changes which page contains its emitted content
- **Creating a group** adds a folder with a generated `index.md` linking to children
- Duplicate output paths, routes, or anchors are blocking errors — no silent suffixes

Folder and group landing pages are ordinary markdown with:

- Title from the organization node
- Child links to emitted routes
- Deterministic metadata (`description`, `reading_time`)
- An optional inline diagram of immediate children

## Navigation order

Sibling order in the organization tree becomes `nav_order` in the emitted `mdsite.yaml`:

```yaml
nav_order:
  "": [getting-started, configuration, workflow]
  workflow: [overview, stateless-build, interactive-workspace]
```

Keys are route prefixes (`""` for the content root). Values are slug arrays in sibling position order. mdsite pins listed slugs first; unlisted siblings sort alphabetically after.

mdsite does not apply a second organization policy — what mndmap emits is what gets mirrored.

## Directory feeds and flattening

Older mdsite configs used a `flatten` field to render a folder as a single scrolling feed. That responsibility moved upstream to mndmap's organization model. If you need feed-like layouts, structure them in the dashboard before emit.

## Selectors vs organization

**Selectors** identify structured records inside a document (tables, typed lists). They do not move content between pages.

**Organization** moves pages, sections, and folders. Use the dashboard for structural edits; use selectors in `mndmap.yaml` when tables need stable row identity for graphing or future enrichment.

## Rescan and reconciliation

When source files change, `rescan` reconciles parsed content against stored organization:

- Matching identity (path + locator + fingerprints) updates content in place
- New sections appear as unresolved nodes for you to place
- Removed source regions become orphans in the store

Organization decisions survive rescans when fingerprints still match.
