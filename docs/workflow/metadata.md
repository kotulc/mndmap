---
title: Metadata
categories:
  - workflow
tags:
  - frontmatter
  - description
  - reading-time
related:
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
  - title: Emit contract
    url: /specifications/emit-contract
---

# Metadata

mndmap enriches frontmatter at export time using **fill-only** rules. Author-supplied values are never overwritten.

## What mndmap fills

| Field | When missing | Rule |
|-------|--------------|------|
| `description` | empty or absent | First non-heading prose paragraph, normalized and length-capped; falls back to `title` |
| `reading_time` | empty or absent | Plain-text word count ÷ 200, rounded up, minimum 1 minute |

## What mndmap preserves

These pass through unchanged when present in source frontmatter:

- `title`, `date`, `desc` / `description`
- `tags`, `categories`
- `related`
- Any other author-defined keys

mndmap does **not** generate tags, categories, related links, or publish dates. Taggly enrichment is deferred; the export seam is ready for a future adapter.

## Downstream display

mdsite ingest strips frontmatter from output MDX and writes `public/site-meta.json` for the theme. Fields mndmap filled appear there like any other frontmatter:

- `description` / `desc` → PageInfo summary
- `reading_time` → "N min read" in PageHeader
- `tags`, `categories` → chip pills
- `related` → Related sidebar entries
- Outbound markdown links → Related sidebar (parsed at ingest)

mdsite does not run embedding models or synthesize metadata locally. If a field should appear on the published site, ensure it is in frontmatter before or after mndmap export.

## Authoring tips

```yaml
---
title: My Page
date: 2026-01-15
desc: Optional summary — shown in Page intelligence when set manually
tags: [guide, yaml]
categories: [tutorial]
reading_time: 5
related:
  - title: Configuration
    url: /configuration
---
```

When `desc` and `reading_time` are omitted, mndmap derives them from body text. When you set them explicitly, mndmap leaves them alone.

## No sidecar files

The handoff to mdsite is **frontmatter-only**. mndmap does not emit a parallel metadata database or required JSON sidecar alongside the destination. The SQLite working store never ships to production.
