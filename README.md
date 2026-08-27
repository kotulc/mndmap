# mndmap

**A live editor for how a documentation site is organized.**

Point mndmap at a directory of markdown. It parses every document into a working store, shows you the collection as a tree you can reorganize, draws the resulting structure as a diagram while you work, and writes out a new collection of documents — diagrams embedded, and wired for navigation.

The markdown you point it at is never modified. What comes out is a second collection, ready to publish.

## The loop

```
docs/**/*.{md,mdx}
        │
     parse ──▶ working store ──┬──▶ tree        reorganize files and sections
        │                      └──▶ diagram     redrawn as you go
        │                                │
        └────────────────── emit ────────┴──▶  site/
                                               documents + folders, diagrams embedded
                                                        │
                                                     mdsite ──▶ published site
```

**One target in, a different target out.** mndmap never writes into the directory it reads, so there is no feedback loop and nothing to keep in sync. Your source stays exactly as you left it.

## Why

Markdown is the right place to write documentation and the wrong place to decide how a site is *shaped*. Structure ends up encoded in folder names and heading depth, where changing it means moving files by hand and fixing every link that pointed at them. Nobody does that twice, so the shape a site gets on day one is the shape it keeps.

mndmap makes the shape a thing you edit directly, see immediately, and regenerate cheaply. Reorganizing is dragging a section; the diagram redraws, the links follow, and the published site reflects it on the next build.

**The goal state:** you are configuring what the published site looks like, live, and can restructure a collection to suit in the time it takes to think of the change.

## What you get

| | |
|---|---|
| **A tree** | every document and section in the collection, reorganizable by drag |
| **A diagram** | the structure as a mndflow block diagram, redrawn on every edit |
| **A collection out** | documents and folders, mirroring into site page structure directly |
| **Navigable diagrams** | every box links to the page and heading it came from |
| **mdsite handoff** | `mdsite.yaml` with `content: .`, generated `nav_order`, and fill-only metadata |

## Documentation

Full guides live in [`docs/`](docs/):

- [Getting started](docs/getting-started.md) — install, `build`, `ui`, and chaining to mdsite
- [Workflow overview](docs/workflow/overview.md) — parse → store → graph → emit
- [mdsite handoff](docs/publishing/mdsite-handoff.md) — destination contract and `nav_order`
- [Deployment](docs/publishing/deployment.md) — CI/CD with mndmap and mdsite

Build the doc site locally:

```sh
npm run build
mndmap build --root .
# then build site/ with mdsite — see docs/publishing/deployment.md
```

## Quick start

### Stateless build (CI and pipelines)

```sh
npm install
npm run build
mndmap build --root /path/to/project
```

`build` is stateless: it parses source, applies configuration and deterministic defaults, and atomically replaces the destination. No `.mndmap/` directory is required or left behind.

### Interactive workspace

```sh
npm run ui
```

From another project directory, use the CLI directly: `mndmap ui --root /path/to/project` (source defaults to `docs/` when configured that way in `mndmap.yaml`).

The dashboard keeps organization and content overrides in `.mndmap/state.sqlite`. Reorganize, then emit when ready:

```sh
mndmap emit --root /path/to/project
```

Headless verbs:

```sh
mndmap import          # scan and parse into the working store
mndmap graph           # print the block tree, or write the mndflow file
mndmap emit            # write the document collection to the destination
mndmap vocab --check   # validate the definitions mndmap ships
```

## Configuration

`mndmap.yaml` is optional. Ordinary markdown needs none.

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
  depth: 3          # '#', '##', '###' — deeper headings fold in as fields

mdsite:
  config: mdsite.yaml  # optional template; workspace-root mdsite.yaml also works
```

**A diagram goes three levels deep by default.** Folders, pages and sections at `#`, `##` and `###` become blocks; anything deeper folds into the third level as fields, so a layer stays readable and a drawing stays the size of a page. Overridable per node.

Selectors for ambiguous structure — which tables and lists are records, and what identifies a row — use document paths, heading paths and headers rather than line numbers. A selector matching zero or several regions reports an error instead of guessing.

## What is stored, and where

| | Lives in | Rebuilt from |
|---|---|---|
| parsed documents, sections, tables, items | `.mndmap/` (interactive only) | `docs/`, in seconds |
| **the organization** — tree shape, grouping, order, what becomes a diagram | `.mndmap/` (interactive only) | **nothing. This is your work** |
| the emitted collection | `site/` | source + config (stateless build) or store (emit) |
| `mdsite.yaml` at destination root | `site/mdsite.yaml` | template + generated `nav_order` |

**The working store is local and not committed.** For CI, use `mndmap build` — it does not read dashboard state. What gets committed is what you publish.

## How it fits with mndflow and mdsite

**[mndflow](https://github.com/kotulc/mndflow) — the diagram.** mndmap is a *translator*: an external project that builds a mndflow graph and renders it through `@mnd/kit`, mndflow's one supported surface. mndmap owns parsing, identity and organization; mndflow owns the block model, layout, projection and every renderer.

The graph is **derived and ephemeral** — built from the working store on demand, drawn, thrown away. Nothing about it is stored and nothing is hand-placed, which is why steering a diagram is reorganizing the tree rather than dragging a box. mndmap uses `Explorer` for the tree, `Viewer` for the live preview, and `draw_svg` for what ships.

**[mndsite](https://github.com/kotulc/mndsite) — the site.** mndmap emits a publication-ready destination that mndsite ingests and builds. mndmap writes `mdsite.yaml` at the destination root with `content: .` (the emitted tree) and generated `nav_order`. User identity fields — title, theme, repo URL, output path — come from your template; mndmap owns navigation and content paths in the emitted copy.

The complete pipeline:

```text
configured source → mndmap build → destination/ → mdsite build → dist/
```

See the [mndsite README](https://github.com/kotulc/mndsite/blob/main/README.md) for the downstream config schema, CLI, and Docker usage.

**One way out, and it never writes back.** mndmap reads markdown and emits artifacts. It never edits a mndflow model and never edits your source.

## Goals

- **Restructuring a documentation collection is a live gesture**, not a refactor.
- **The source is never touched.** Read one target, write another.
- **The translation is generic** — any collection of `.md` or `.mdx`, no vocabulary assumed.
- **Structure is inferred, meaning is not.** mndmap does not decide what `Status` or `Owns` mean.
- **Diagrams are navigation**, not decoration: every box links back to its heading.
- **Published docs carry the current structure**, regenerated on every build.

## Non-goals

- Not a workflow engine, a scheduler, or a replacement for git.
- **Not a multi-agent ledger.** Claims, leases, scratch fields and staged record edits were an earlier direction and are retired.
- Not a markdown editor — write your documents wherever you write them.
- Not a mndflow client. It builds graphs; it never opens a workspace or writes a log.

## Requirements

- Node.js 22.5 or newer — the working store uses Node's built-in SQLite
- npm
- Docker only for building the mdsite output locally

## Development

```sh
npm test
npm run typecheck
npm run build
```

Ignored: `.mndmap/`, `dist/`.

## Status

The enrichment pipeline described in `plan.md` is implemented. `archive.md` is historical ledger documentation only.
