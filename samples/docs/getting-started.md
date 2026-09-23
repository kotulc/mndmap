---
title: Getting Started
categories:
  - guide
tags:
  - setup
  - build
  - mdsite
related:
  - title: Configuration
    url: /configuration
  - title: Workflow overview
    url: /workflow/overview
  - title: mdsite handoff
    url: /publishing/mdsite-handoff
---

# Getting Started

## Prerequisites

- Node.js 20 or newer
- npm
- Docker — only if you want to build the mdsite output locally without installing mdsite

## Install mndmap

```bash
git clone https://github.com/kotulc/mndmap.git
cd mndmap
npm install
npm run build
```

The CLI is available as `node dist/src/cli.js` after build, or via `npm link` if you install globally from the repo.

## Project layout

A typical documentation project keeps source and destination separate:

```text
my-project/
├── docs/              # source — you edit here
├── mndmap.yaml        # optional configuration
├── mdsite.yaml        # site identity template (theme, repo URL, output)
└── site/              # destination — mndmap writes here; mdsite reads from here
```

mndmap never modifies `docs/`. Everything under `site/` is regenerated on each build or export.

## Stateless build (recommended for CI)

```bash
mndmap build --root /path/to/project
# or with an explicit config file:
mndmap build --config mndmap.yaml
```

This:

1. Parses every matching file under the configured source root
2. Seeds organization from source folders and pages (or applies `mndmap.yaml` selectors)
3. Fills missing `description` and `reading_time` frontmatter
4. Rewrites internal links and copies local assets to `_assets/`
5. Embeds navigable mndflow diagram SVG on landing pages
6. Writes `mdsite.yaml` at the destination root with `content: .` and generated `nav_order`
7. Atomically replaces the previous destination

Then build the static site:

```bash
# from a checkout of mdsite, or via Docker:
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/kotulc/mndsite:main \
  build --config /workspace/site/mdsite.yaml
```

The published site appears at the `output` path in `mdsite.yaml` (default `./dist` relative to that file).

## Interactive workspace

For exploratory reorganization before committing to a layout:

```bash
# from this repo — reads docs/ via mndmap.yaml
npm run ui

# from any project
mndmap ui --root /path/to/project
```

The dashboard opens in your browser. Drag pages and sections in the tree; the diagram redraws live. Organization is saved in `.mndmap/workspace.json` — local only, not committed.

When the layout looks right:

```bash
mndmap export --root /path/to/project
```

`export` writes the same destination contract as `build`, but from your saved organization and segment placements instead of deterministic defaults.

## Headless commands

```bash
mndmap import          # scan and parse into the working store
mndmap rescan          # reconcile source changes after editing docs/
mndmap graph           # print the block tree JSON (diagnostic)
mndmap graph --out plan.mndflow.json
mndmap vocab --check   # validate the documentation vocabulary mndmap ships
```

## Minimal configuration

Ordinary markdown needs no config. Defaults: source `docs/`, destination `site/`, diagrams three levels deep.

```yaml
version: 1

source:
  root: docs
  include:
    - "**/*.{md,mdx}"
  exclude: []

destination: site

diagrams:
  enabled: true
  depth: 3
```

See [Configuration](configuration.md) for selectors, mdsite template paths, and per-node diagram overrides.

## What gets committed

| Path | Commit? | Notes |
|------|---------|-------|
| `docs/` | yes | Your authoritative source |
| `mndmap.yaml`, `mdsite.yaml` | yes | Project configuration |
| `site/` | optional | Some teams commit the emitted tree; others regenerate in CI |
| `.mndmap/` | no | Interactive workspace state only |
| `dist/` | no | mdsite build output |

For reproducible CI, run `mndmap build` in the pipeline and let mdsite consume the fresh destination.
