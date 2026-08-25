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
        │                          taggly suggests groupings
        │                                │
        └────────────────── emit ────────┴──▶  dist/
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
| **Suggestions** | taggly proposes groupings and abstractions over what you have; accept or ignore |
| **A collection out** | documents and folders, mirroring into site page structure directly |
| **Navigable diagrams** | every box links to the page and heading it came from |

## Quick start

```sh
npm install
npm run ui -- --root /path/to/project
```

mndmap scans `docs/` recursively for `.md` and `.mdx`, builds the working store under `.mndmap/`, and opens the editor. Reorganize, then write the collection out:

```sh
npm run cli -- emit --root /path/to/project
```

Headless verbs, for a pipeline or a check:

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

sources:
  include: docs/**/*.{md,mdx}
  exclude: docs/generated/**

destination: dist

diagrams:
  depth: 3          # '#', '##', '###' — deeper headings fold in as fields
```

**A diagram goes three levels deep by default.** Folders, pages and sections at `#`, `##` and `###` become blocks; anything deeper folds into the third level as fields, so a layer stays readable and a drawing stays the size of a page. Overridable per node.

Selectors for ambiguous structure — which tables and lists are records, and what identifies a row — use document paths, heading paths and headers rather than line numbers. A selector matching zero or several regions reports an error instead of guessing.

## What is stored, and where

| | Lives in | Rebuilt from |
|---|---|---|
| parsed documents, sections, tables, items | `.mndmap/` | `docs/`, in seconds |
| **the organization** — tree shape, grouping, order, what becomes a diagram | `.mndmap/` | **nothing. This is your work** |
| the emitted collection | `dist/` | the two above |

**The working store is local and not committed.** mndmap is a personal tool: a fresh clone re-organizes from scratch, and CI is not expected to reproduce a layout. What gets committed is what you publish.

## How it fits with mndflow and mdsite

**[mndflow](https://github.com/kotulc/mndflow) — the diagram.** mndmap is a *translator*: an external project that builds a mndflow graph and renders it through `@mnd/kit`, mndflow's one supported surface. mndmap owns parsing, identity and organization; mndflow owns the block model, layout, projection and every renderer.

The graph is **derived and ephemeral** — built from the working store on demand, drawn, thrown away. Nothing about it is stored and nothing is hand-placed, which is why steering a diagram is reorganizing the tree rather than dragging a box. mndmap uses `Explorer` for the tree, `Viewer` for the live preview, and `draw_svg` for what ships.

**[mdsite](https://github.com/kotulc/mdsite) — the site.** mndmap emits a collection of documents and folders that mirrors directly into site page structure, as mdsite already works. It also writes `compose:` frontmatter, so a page's body can be assembled from page, topic and tag lists rather than being only its own markdown.

**One way out, and it never writes back.** mndmap reads markdown and emits artifacts. It never edits a mndflow model and never edits your source.

## Goals

- **Restructuring a documentation collection is a live gesture**, not a refactor.
- **The source is never touched.** Read one target, write another.
- **The translation is generic** — any collection of `.md` or `.mdx`, no vocabulary assumed.
- **Structure is inferred, meaning is not.** mndmap does not decide what `Status` or `Owns` mean.
- **Diagrams are navigation**, not decoration: every box links back to its heading.
- **Suggestions assist, never decide.** taggly proposes; a person accepts.
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
- taggly is optional; without it, grouping suggestions are simply absent

## Development

```sh
npm test
npm run typecheck
npm run build
```

Ignored: `.mndmap/`, `dist/`.

## Status

This README describes the end state. `translator.md` holds the staged plan to reach it, what each stage ends with, and what is being retired along the way.
