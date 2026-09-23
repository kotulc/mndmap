---
title: Pipeline split
categories:
  - specifications
tags:
  - mndmap
  - mdsite
  - responsibilities
related:
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
  - title: Workflow overview
    url: /workflow/overview
---

# Pipeline split

mndmap and mdsite are separate projects with a clear handoff. This split replaced an earlier design where mdsite performed organization, semantic tagging, and directory flattening locally.

```text
source Markdown/MDX
  → mndmap
      • parse and organize folders/groups/sections
      • rewrite internal links and local assets
      • fill description, reading_time (when missing)
      • embed navigable diagram SVG
      • emit destination/ + mdsite.yaml (content, nav_order)
  → mdsite ingest
      • mirror routes without regrouping
      • copy _assets/ and images/
      • derive site-meta.json from frontmatter
      • generate _meta.json navigation
  → mdsite build (Next.js static export)
  → dist/
```

## mndmap owns

| Concern |
|---------|
| Source parsing and structural identity |
| File, folder, group, and section organization |
| Destination layout and sibling order (`nav_order`) |
| Internal link and MDX reference rewriting |
| Local asset collection into `_assets/` |
| Inline mndflow diagram SVG |
| Fill-only metadata (`description`, `reading_time`) |
| Future Taggly metadata enrichment (planned) |

## mdsite owns

| Concern |
|---------|
| `.md` → `.mdx` framework adaptation (no semantic content changes) |
| Mirroring the route tree exactly as supplied |
| Copying `_assets/` to `public/_assets/` with path rewriting |
| Legacy `images/` subtree copy and path rewrite |
| Renderer metadata extraction (frontmatter + link parsing) |
| Navigation `_meta.json` from directory structure + `nav_order` |
| Theme, layout, PageInfo/MetaSidebar components |
| Static build, Docker packaging, deployment workflows |

## mdsite does not

- Extract keywords or run embedding models
- Synthesize tags, categories, or related links
- Flatten directories or apply a second organization policy
- Rewrite links semantically
- Generate `nav_order` (consumes mndmap output or manual YAML)

## Removed from mdsite

| Feature | New owner |
|---------|-----------|
| `meta` config (tagging, related scoring) | mndmap / frontmatter |
| `flatten` config (directory feeds) | mndmap organization |
| Local reading-time computation | mndmap fill-only rules |
| `DirFeed` component wiring | dormant; feeds are organizational |

## Cross-project testing

- **mndmap** CI: emit publish fixture → mdsite build (`.github/workflows/docs.yml`)
- **mdsite** CI: `tests/fixtures/mndmap-destination/` contract tests

Both repos pin compatible versions via branch tags and `mndflow-pin.json`.

## Optional upstream

mdsite accepts any publication-ready markdown tree. mndmap is the recommended upstream when structure, links, assets, or metadata need preparation — but not a runtime dependency.
