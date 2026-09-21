# Plan

**mndmap, rebuilt on the kit as it is now.** A browser dashboard for translated content, markdown first. This plan supersedes the enrichment pipeline plan; README.md, translator.md and archive.md describe the retired product until they are rewritten, and where they disagree with this file, this file is authoritative.


## What mndmap is

**A translator with a dashboard.** It reads a collection of markdown into a mndflow graph, shows that graph as three panels somebody can re-organize and tag, and emits a new collection — optionally published through mndsite. mndflow is the diagram editor and the foundation; mndmap is a simpler surface over the same graph, for looking at translated content and rearranging it. **It is not an editor.** Bodies are read, not written; relations are drawn, not made.

```
docs/*.md, folders ──translate──▶ workspace.json ──▶ explorer | viewer | content tray ──emit──▶ zip: collection + mdsite.yaml
                                  suggestions.json        re-organize, tag, pick                          │ optional
                                                                                                       mndsite ──▶ site
```

| | |
|---|---|
| **stateless** | one run: a folder in, a zip out. Nothing is kept between runs, and there is no store. What the dashboard changes lives in the graph it holds, for as long as the tab is open |
| **the browser is the product** | translate, dashboard and emit all run there, from a folder dropped on the page. A minimal CLI wraps translate and emit for CI, and nothing else |
| **the kit is used as it is** | `Explorer` and `Viewer` from `@mnd/kit/react`, the theme, `open`, `validate` and `write`. What the kit does not have, mndmap builds in the same style. **Nothing in mndflow is for mndmap**; a change mndmap needs there is a general one or it is mndmap's own job |
| **the graph is edited as data** | a move sets `parent` and `order`; a tag sets `tags`; a group sets a holder. mndmap writes the fields, asks `validate`, and keeps a stack of graphs for undo. No session, no log, no actions |
| **the file is the seam** | the same `workspace.json` opens in mndflow, with the look the `doc` package gives it |
| **markdown first** | then requirements traceability, then a codebase. Each is a vocabulary package and a `map`, never a change to the dashboard |


## The translator

**Two pure functions, and the CLI wraps both.** `read(files, config)` returns a mndflow file and a sidecar of suggestions; `emit(graph, config)` returns the collection as files. Both run in the browser; `mndmap translate` and `mndmap emit` run them under node for CI.

**What survives from today**: the remark parser, the link and asset rewriting, the mdsite config merge and `nav_order`, and the fill-only metadata. **What goes**: the working store, segments, placements, overrides, reconciliation, the REST service, the React dashboard, and the `selectors` config.

### The `doc` vocabulary

**Shipped by mndflow as a package**, so a translated file opens there with its look. mndmap reads it through the kit rather than carrying a copy.

| Definition | Over | Carries |
|---|---|---|
| `doc.set` | `folder` | a directory |
| `doc.page` | `block` | a file. `source.uri` is its path; front matter is its fields; prose before the first heading is its body |
| `doc.section` | `block` | a heading. `source.at` is the heading path; the prose under it is its body |
| `doc.item` | `block` | a list item made into a block, with a `done` flag where it was a task |
| `doc.code` | `block` | a fence made into a block, with a `language` field and the code as its body |
| `doc.link` | `line` | a link from one document or heading to another |

**A table is a grid holder and a list is a group holder.** Neither is a block, so neither needs a definition: the holder's `of` names the section it sits in, header cells are header blocks, and members are blocks with a body.

### The map

**One `map` section says how markdown lands in the graph.** Each construct names its target from a closed set; the defaults give folders to folders, files to pages, headings to blocks to a depth, and everything else to prose. `overrides` applies a different map under a heading path.

```yaml
version: 2
source:      { root: docs, include: ["**/*.{md,mdx}"], exclude: [] }
destination: site
publish:     { mdsite: mdsite.yaml }          # optional; the template mdsite.yaml merged into the zip
suggest:     { taggly: null, count: 3 }       # null: no suggestions, and everything else still works

map:
  folder:      { as: doc.set }
  page:        { as: doc.page, name: [title, heading, filename] }
  section:     { as: doc.section, depth: 3, beyond: body }      # beyond: body | block
  prose:       body
  frontmatter: { as: fields, tags: tags, related: relation }
  link:        { as: relation, type: doc.link, external: body } # relation | body
  table:       { as: grid, header: row }                        # grid | body
  list:        { as: body }                                     # body | group
  task:        { as: body }                                     # body | block
  fence:       { as: body }                                     # body | block
  image:       body
overrides: []   # [{ under: ["Heading", "Path"], map: { table: { as: body } } }]
```

| Markdown | Reads in as | Emits as |
|---|---|---|
| directory | `doc.set` | a directory, with a landing page where the source has none |
| file | `doc.page`, front matter to fields, `source.uri` | a file at the block's path, front matter from fields |
| heading within `depth` | `doc.section` under the enclosing block, `order`, `source.at` | a heading at the depth of its nesting |
| prose, and headings beyond `depth` | the enclosing block's `body`, opaque markdown | written as is |
| front matter `tags` | block `tags` | front matter `tags` |
| link to a document or heading | `doc.link` from the enclosing block to the target | the body link unchanged, and a front matter `related` entry, which mndsite reads |
| table as `grid` | a grid holder with `of` the section; header row as header blocks; cells as blocks with a body | a table from cells and headers |
| list as `group` | a group holder with `doc.item` members | a list from the members in order |
| task as `block` | `doc.item` with a `done` flag | a checkbox item |
| fence as `block` | `doc.code` with `language`, the code as body | a fence |
| image | body; the asset copied at emit | body, asset under `_assets/` |

- **A page is named by its document and filed by its filename**, as before: renaming a heading never moves a page.
- **`source.at` is the heading path**, and it is how a section is found again after a move: the emitter writes what the graph says, and never looks at the source.
- **Bodies are opaque.** Whether a list, a table or a fence becomes structure is the map's call, per construct and per path; the body is never parsed a second time except to tell a read relation from a drawn one.
- **The round trip is the test.** A real README read in and emitted must diff clean under the default map. That is what says whether opaque bodies hold, and it runs before the dashboard is built on the answer.

### Suggestions

**A sidecar, never the graph.** Translation may produce `suggestions.json`, keyed by block or relation id, carrying up to `count` candidates each for a name, tags, a group and a relation type. Picking one writes the graph; the sidecar is read-only and is not emitted.

```
suggestions { [id]: { name?: string[]; tags?: string[]; group?: string[]; type?: Id[] } }
```

**Taggly makes them, and it is optional.** `suggest.taggly` names the endpoint; unset, the sidecar is absent and the dashboard shows no chips. Taggly never runs in CI and never decides anything: what somebody picked is ordinary graph data.


## The dashboard

**Three panels, no rail, no editing tools.** The explorer on the left, the canvas top right, the content tray bottom right. It wears mndflow's theme and reads as the same family.

| Panel | Is | Does |
|---|---|---|
| **explorer** | the kit's `Explorer`, `menu={false}` | the tree of sets, pages and sections. Drag re-parents and reorders; a click reveals; a double click renames |
| **canvas** | the kit's `Viewer` | the open layer, drawn. A click picks, a double click walks in or out. Nothing is dragged |
| **content tray** | mndmap's own, in the tray's style | the picked block: its name, tags, fields, its body rendered as markdown, its relations, and the suggestion chips for each |

**What a gesture may do, and nothing else**: move, reorder, group, rename, tag, and pick a suggestion. A body is read. A relation is retyped from a suggestion and never drawn or deleted. **Every gesture is a data edit on the held graph** followed by `validate`; a graph that would not validate is refused with the fault, and the stack holds the one before it.

**Loading**: a folder dropped on the page is translated there; a `workspace.json` dropped on the page is opened as is, with its sidecar if one sits beside it; `?file=` fetches one. **Emit** hands back a zip.


## Emit

**A collection, and the mdsite handoff, as one zip.** The rules carried over from the export contract stand: internal links rewrite to emitted paths and anchors, local assets copy under `_assets/`, static MDX imports rewrite, duplicate paths and anchors block, and `mdsite.yaml` at the root carries `content: .` and a generated `nav_order`.

- **A relation that the body already links is emitted nowhere else.** One the body does not link — retyped, or the target moved — goes to front matter `related`.
- **A moved section takes its body with it** and its links follow, because the rewrite reads the graph's paths.
- **Nothing is written to the source.** The zip is the second collection, and publishing it is mndsite's.


## Order of work

| | Step | Done when |
|---|---|---|
| **M0** | **Strip.** Keep `parser.ts`, the rewriting in `export/index.ts`, `mdsite-config.ts` and `metadata.ts`. Delete the working store, segments, service, REST, routes, the UI and `selectors`. Pin the kit at 0.4.0 | `tsc --noEmit` clean against the real types |
| **M1** | **The reader**, default map. `mndmap translate <root>` writes `workspace.json` and a report of what became what | mndflow's CLI checks, folds and projects the file untouched, and the web app opens it |
| **M2** | **The emitter.** `mndmap emit workspace.json` | translate then emit over mndflow's own `docs/` diffs clean |
| **M3** | **The dashboard.** Three panels over a loaded file; the six gestures as data edits; undo | reorganize a section, the canvas and tray follow, undo returns it |
| **M4** | **In the browser.** Folder drop in, zip out, `mdsite.yaml` inside | one run from a folder to a zip with no CLI |
| **M5** | **Suggestions.** The Taggly adapter, the sidecar, chips in the tray | pick one, it lands in the graph, it emits |
| **M6** | **The rest of the map.** `overrides`, table as grid, list as group, fence as block, task as block | each round-trips a fixture |
| **M7** | **Requirements.** A second map: a table under a chosen heading reads as `req.requirement` rows, and links as `satisfies` and `verifies` | the first traceability corpus reads in and emits |

**M2 before M3 on purpose.** The dashboard is the product, but the round trip proves the graph carries the content, and it is cheap to run headless.

**Depends on**: `remark` as today; `jszip` for the zip; the File System Access API for the drop; Taggly by fetch. In mndflow, the kit re-packed at HEAD and the `doc` package shipped.


## Open

| | |
|---|---|
| **a renamed heading** | `source.at` changes with it. Fine while the graph is authoritative for the run; it matters only if a run is ever resumed |
| **a section moved into a section it links** | the rewrite handles the path; whether the `related` entry should then be dropped is unanswered |
| **MDX** | expressions are opaque today and stay opaque. Whether a component instance is a block is a map question for later |
| **what `beyond: block` means for depth** | a heading past the depth as a block flattens under the last block in depth. Whether that is wanted, or the depth should simply be raised, is decided by use |
