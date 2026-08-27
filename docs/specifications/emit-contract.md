---
title: Emit contract
categories:
  - specifications
tags:
  - contract
  - validation
related:
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
  - title: Pipeline split
    url: /specifications/pipeline-split
---

# Emit contract

This document summarizes what `mndmap build` and `mndmap emit` guarantee. `plan.md` is authoritative for implementation details.

## Documents and frontmatter

- Ordinary pages remain ordinary Markdown or MDX
- Existing frontmatter is preserved; mndmap does not overwrite author metadata
- Missing `description` and `reading_time` are filled (see [Metadata](../workflow/metadata.md))
- Tags, categories, dates, and `related` are preserved when present but not generated
- Generated landing pages are ordinary `index.md` / `index.mdx` with title, child links, metadata, and optional diagram
- No `compose:` protocol

## Structure

- Emitted directories match the organization tree
- Moving a page changes its emitted path
- Moving a section changes the containing page
- Segment ordering and destination-only overrides apply during planning
- Duplicate output paths, routes, or anchors are blocking diagnostics
- Silent path suffixes are forbidden

## Links, assets, and MDX

- Internal links rewrite to emitted page and heading targets
- Referenced local assets copy to `_assets/` preserving `source.root`-relative paths
- Markdown and MDX references rewrite relative to emitted locations
- Static relative MDX imports/exports rewrite when targets move
- Dynamic or unresolved local references block emit
- References escaping `source.root` block emit

## Diagrams

- Landing pages include inline SVG by default
- `diagrams.enabled: false` disables diagrams globally
- Ordinary pages include SVG only when marked as diagram roots
- SVG appears after title/intro, before child links or sections
- Global depth defaults to 3; per-node overrides apply in the dashboard
- Every box links to emitted page + anchor
- Graph JSON is diagnostic only — not shipped in the destination

## mdsite configuration

- `mdsite.yaml` written at destination root
- Template copied from configured path or workspace root, else defaults
- User theme/identity/output fields preserved
- `content` set to `.`; `nav_order` replaced from organization

## Atomic replacement

1. Plan and validate completely
2. Write staging directory (`.mndmap/emit-<uuid>/` or temp)
3. Rename staging → destination
4. On failure, previous destination remains; staging may be recorded for recovery

Successful `build` with `ephemeral: true` removes temp staging. Interactive `emit` may leave abandoned staging paths in the store for inspection.

## Determinism

Same source + configuration + kit version → byte-identical destination.

## Blocking diagnostics (non-exhaustive)

| Code | Cause |
|------|-------|
| `missing-asset` | Referenced file not on disk |
| `unresolved-identity` | Source node not resolved |
| `graph-validate` | mndflow validate fault |
| `graph-review` | mndflow review note treated as error |
| `path-collision` | Two outputs share a path |
| `anchor-collision` | Duplicate heading slug in one page |
| selector errors | Zero or multiple selector matches |

All errors are collected before any destination mutation.
