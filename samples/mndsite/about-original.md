---
title: About (original)
description: What mndsite is, how it fits the mndmap pipeline, and what it does not do
categories:
  - reference
tags:
  - overview
  - pipeline
related:
  - title: Getting Started
    url: /getting-started
  - title: Content Pipeline
    url: /features/content-pipeline
version: 0.2
status: stable
---

# About mndsite

A portable static site renderer for publication-ready Markdown and MDX — drop it into any CI/CD pipeline as a build step.

```cards
```

![Content pipeline](images/pipeline.svg)


## Purpose

`mndsite` is a Next.js + Nextra-based static site renderer designed to work at the end of a markdown publishing pipeline. In the typical workflow, **mndmap** organizes source markdown, enriches frontmatter, rewrites links and assets, and emits a destination directory; `mndsite` mirrors that tree, builds navigation, and produces a `dist/` folder. Publishing is left to the caller.

Raw markdown directories also work when content is already publication-ready — the same YAML config and CLI apply.

The engine is packaged as a Docker image: mount your content and config, get a static site.


## Publishing with Trendly

Open the content repository in Trendly to preview its posts and choose which drafts to publish. Editors and agents can edit the same Markdown files. mndsite reads the saved files and publication settings during the next build. [Feed](/updates) shows the published cards. Use **Subscribe via RSS** to open the RSS feed or copy its address into Trendly's external subscriptions.

## Pipeline split

```text
source Markdown/MDX
  → mndmap (optional — organization, metadata, assets, nav_order)
  → destination directory + mndsite.yaml
  → mndsite ingest + build
  → dist/
```

| Concern | Owner |
|---------|--------|
| Folder/group organization, destination layout | **mndmap** |
| Internal link and asset rewriting | **mndmap** |
| Description, reading time, tags, related links (when generated) | **mndmap** / frontmatter |
| Emitted `nav_order` and `content` paths | **mndmap** |
| `.md` → `.mdx` adaptation, Nextra integration | **mndsite** |
| Navigation UI, theme, metadata presentation | **mndsite** |
| Static export, Docker packaging, deployment docs | **mndsite** |

mndsite does not run embedding models, synthesize tags, score related pages, flatten directories, or apply a second organization policy.


## How It Works

1. Prepare a content directory (from mndmap or your own markdown tree)
2. Provide an `mndsite.yaml` config pointing at that content
3. Run the CLI or Docker container to ingest and build
4. A fully-built static site appears in your output directory

See [Getting Started](/getting-started) to have a site running in minutes,
or browse the [Features](/features) section for the full capability overview.


## Features

- **Markdown → MDX** — automatic conversion; mirrors any folder structure without regrouping
- **MDX and inline SVG** — publication-ready MDX and diagrams preserved from upstream
- **`_assets/` handoff** — static assets copied to `public/_assets/` with path rewriting
- **Images** — legacy `images/` subtrees copied and path-rewritten; corrupt EXIF stripped
- **Reading time** — displayed when supplied in frontmatter
- **Facets** — any declared frontmatter dimension rendered as colored chips and (future) sidebar filters
- **Breadcrumbs and sidebar contents** — configurable via `display.crumbs` and `display.toc`
- **Related links** — outbound links and frontmatter `related` entries in the ToC sidebar
- **Nav ordering** — sibling order via `nav_order` from mndmap or YAML
- **Custom components** — optional consumer React components synced each build
- **Theme toggle** — light / dark / system toggle in the navbar
- **GitHub header icon** — circular GitHub repo link, auto-shown from `repo_url`
- **YAML config** — single file drives rendering and deployment
- **Docker** — packaged as a container for use in any CI/CD pipeline


## Roadmap

**Phase 1 — Core renderer** *(complete)*
- Next.js + Nextra docs theme
- YAML config + CLI wrapper
- Docker image, GHCR publishing
- GitHub Pages deployment
- Configurable `display`, `fields`, and `facets` in `mndsite.yaml`
- mndmap destination fixture contract
- Nav ordering via `nav_order`

**Phase 2 — Custom components** *(planned)*
- Semantic search integration (signals from upstream pipeline)
- Semantic theming pipeline
- Reduced external dependencies

**Phase 3 — Deploy adapters** *(planned)*
- `mndsite deploy --provider vercel|cloudflare|s3`
- Credentials via environment variables; project ID via YAML
