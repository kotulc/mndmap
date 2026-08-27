---
title: mdsite handoff
categories:
  - publishing
tags:
  - mdsite
  - destination
  - nav_order
  - assets
related:
  - title: Deployment
    url: /publishing/deployment
  - title: Emit contract
    url: /specifications/emit-contract
  - title: Pipeline split
    url: /specifications/pipeline-split
---

# mdsite handoff

The emitted **destination** is the portable contract between mndmap and mdsite. mndmap replaces it atomically on each build or emit; mdsite mirrors it without reorganizing.

## Destination layout

```text
site/                          # or your configured destination name
├── mdsite.yaml                # content: .  +  generated nav_order
├── docs/                      # example — mirrors your organization tree
│   ├── index.md
│   ├── getting-started.md
│   └── workflow/
│       └── overview.md
└── _assets/                   # collected local assets, paths preserved
    └── docs/
        └── diagram.svg
```

Every path under the destination is publication-ready. Internal links already resolve to emitted routes. MDX imports are rewritten when targets move.

## mdsite.yaml in the destination

mndmap writes `mdsite.yaml` at the destination root:

```yaml
title: My Documentation          # from your workspace template
repo_url: https://github.com/...
content: .                       # always '.' — config lives at destination root
output: ./dist
nav_order:                       # generated from organization sibling order
  "":
    - getting-started
    - configuration
  workflow:
    - overview
    - stateless-build
theme:
  color: blue
  typeset: sans
```

### Field ownership

| Field | Owner |
|-------|-------|
| `content` | mndmap (always `.` in emitted copy) |
| `nav_order` | mndmap (from organization tree) |
| `title`, `description`, `repo_url`, `theme`, `output`, … | you (via workspace template) |

Template precedence: `mndmap.yaml` → `mdsite.config` path → workspace-root `mdsite.yaml` → built-in defaults.

## What mdsite does with the destination

1. **Mirrors routes** — no flattening, regrouping, or renaming
2. **Copies `_assets/`** to `public/_assets/` with path rewriting
3. **Copies legacy `images/`** subtrees when present (standalone content)
4. **Derives `site-meta.json`** from frontmatter and link parsing only
5. **Generates `_meta.json`** navigation using `nav_order` + index page titles
6. **Builds static export** to the configured `output` directory

mndmap destination fixtures are tested cross-project in the mdsite repository (`tests/fixtures/mndmap-destination/`).

## Links and anchors

mndmap rewrites internal markdown links to emitted paths. A source link like `guide.md#intro` becomes `/docs/guide#intro` in the emitted copy (site-relative URL with mdsite-compatible anchor slug).

Anchor slugification matches mdsite (Nextra/GitHub style) so diagram box links and markdown cross-references land on the same headings.

## Assets

Referenced local files are copied under `_assets/` preserving paths relative to `source.root`:

```text
source:  docs/guide.md  references  ./images/photo.png
emit:    site/_assets/docs/images/photo.png
mdsite:  public/_assets/docs/images/photo.png
```

Missing assets block emit with a diagnostic — mndmap does not emit broken references.

## Removed mdsite responsibilities

These no longer belong in `mdsite.yaml`:

| Removed key | Move to |
|-------------|---------|
| `meta` (tagging, related-link scoring) | mndmap or frontmatter |
| `flatten` (inline directory feeds) | mndmap organization |

Config files containing these keys fail at mdsite load time with migration guidance.

## Building the site

Point mdsite at the emitted config:

```bash
node scripts/cli.js build --config site/mdsite.yaml
```

Or with Docker (pinned image matching `mndflow-pin.json`):

```bash
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/kotulc/mndsite:main \
  build --config /workspace/site/mdsite.yaml
```

The static site appears at `site/dist/` by default (relative to `mdsite.yaml`).

## Standalone markdown

mdsite also accepts publication-ready trees that never passed through mndmap. The same ingest and build commands apply — mndmap is optional upstream, not a runtime dependency of mdsite.
