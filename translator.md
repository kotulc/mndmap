# mndmap as a mndflow translator

## What mndmap is

**A live editor for how a documentation site is organized.** It scans one `docs/` directory recursively, parses every `.md` and `.mdx` into a working form, presents that as a configurable tree the user reorganizes, draws the resulting structure as a mndflow diagram while they work, and writes a new document collection to `dist/` — diagrams embedded, and usable for navigation.

```
docs/**/*.{md,mdx} ──parse──▶ working store ──▶ tree + diagram (live)
                                    │                    ▲
                              user reorganizes ──────────┘
                              taggly suggests
                                    │
                                    └──emit──▶ dist/ — documents with diagrams embedded
```

**One target in, a different target out.** mndmap never writes into the directory it reads, so there is no loop and no managed-region discipline to maintain. The source stays exactly as the author left it.

**The goal state:** the user is configuring what the published mdsite looks like, in a live environment, and can change working documents and structure to suit.


## How much of mndflow to use

**Only rendering, for now.** Organizing a collection of documents is a different problem from modelling a system, and mndmap already knows how to do it — its parser, its identity ladder and its working store are the parts that carry the weight. mndflow enters at the end, to draw the structure mndmap arrived at and to embed that drawing.

| mndmap owns | mndflow owns |
|---|---|
| parsing, source locations, record identity | the block model and the file format |
| the working store, and every organizing decision in it | layout, projection, and every renderer |
| the tree UI and the reorganizing gestures | the vocabulary's own checks, at emit |
| the emitted document collection | — |

**The consequence, and it is the simplification:** the graph is **derived and ephemeral**. It is built from the working store on demand, drawn, and thrown away. Nothing about it is stored, nothing about it is hand-edited, and mndmap needs no identity ledger of its own for it — **block ids are minted from the record ids the working store already keeps.** An earlier draft of this plan proposed a committed map file to hold that identity; with the graph derived from a store that already has stable ids, it is redundant and it is dropped.

**What that gives up, stated plainly:** no hand placement, no dragging a box. Steering a diagram is reorganizing the tree, which is the thing mndmap is for.


### Can the graph be built and rendered on the fly?

**Yes, and that is the intended shape.** The whole path is synchronous, in-memory and pure — no IO, no async, nothing to invalidate:

```
store ──build──▶ Graph ──project──▶ Scene ──▶ draw_svg  (a string)
                                          └──▶ Viewer   (React, interactive)
```

- `block.project(graph, layer, config)` is a pure function of the graph. `layout` runs inside it, so nothing is placed separately and nothing is cached.
- **Rebuild the whole graph on every edit.** It is cheaper than reasoning about which part changed, and it cannot drift.
- **Only the open layer is projected**, never the whole tree — a layer is a block and its direct children, so cost tracks the widest layer rather than the size of `docs/`.
- If a very wide layer ever bites, the answer is the abstraction pass grouping it, which is a thing the user wanted anyway.

**For the live preview, prefer `Viewer` over `draw_svg`.** It is the interactive, non-editing component in `@mnd/kit/react` — click highlights, double-click walks into a layer — so the preview gets navigation for free and mndmap writes no drawing code. `draw_svg` is for what gets emitted.


## The tree

The user reorganizes files and sections in a tree, and mndflow ships one: `@mnd/explorer`.

`Explorer` is a pure function of a graph plus three pieces of display state, and it **emits intents rather than mutations**:

```
<Explorer graph open picked folded onAct onFold onPick />

type Act = (name: string, args?: Args) => void
```

It never writes. `onAct("move", { id, parent })` is a *name and arguments* — mndmap is free to interpret that against its own store instead of against a mndflow log. Drag-to-reorganize, fold, select and the container marks all come for free, and the tree it draws is the graph mndmap is already building.

**Settled, and already done on the mndflow side.** `explorer` has joined `kit`: `@mnd/kit/react` exports `Explorer` and `ExplorerProps` beside `Viewer`, `Act` and `Args` come with them, and `@mnd/kit/react.css` carries both stylesheets as one file.

```tsx
import { Explorer, Viewer } from "@mnd/kit/react";
import "@mnd/kit/react.css";

<Explorer graph={graph} open={at} picked={picked} folded={folded}
          menu={false}
          onAct={(name, args) => apply_to_store(name, args)}
          onFold={...} onPick={...} />
```

**`menu={false}` is the important half.** The right-click list is mndflow's action registry — *create block*, *delete* — which means nothing here. Turning it off keeps the rows, the drag, the fold and the container marks, and leaves mndmap free to offer its own: *rename file*, *move section*, *group these*. mndflow gained the prop for exactly this.


## The working store

**SQLite stays, and it is the working store**: parsed records, their source locations, their identity, and every organizing decision the user makes.

| Holds | Derived from | Survives a rescan |
|---|---|---|
| documents, sections, tables, items | `docs/` | rebuilt |
| record identity | the existing ladder — configured key, explicit id, unique value, source locator | yes, by that ladder |
| **the organization** — tree shape, grouping, order, what becomes a diagram, arrangement | **nobody. This is the user's work** | yes, keyed by record identity |

**The organization is the only irreplaceable state, and it stays on the machine.** Everything else rebuilds from `docs/` in seconds; the organization rebuilds from nothing. **Settled: local only.** mndmap is a personal live tool, a fresh clone re-organizes from scratch, and CI is not expected to reproduce a layout. Nothing is exported, nothing is committed, and the store is free to be a working store.

**Revisit only if** a second person or a CI job ever needs the same site out of the same inputs. The answer then is to write the non-derivable slice out as JSON — not to commit the database, which is mostly cache and diffs as binary.

**What retires either way:** claims, leases, fencing tokens, scratch fields, staged changes, the record write-back path in `exporter.ts`, and the REST/MCP claim surface. `parser.ts` is the keeper.


## The vocabulary

`Definition[]`, filed on the tier root mndmap creates, so an emitted file carries its own vocabulary.

| Definition | Group | Extends | Carries |
|---|---|---|---|
| `doc.set` | block | `folder` | a directory |
| `doc.page` | block | `structure` | `path`, `title`, frontmatter as fields |
| `doc.section` | block | `structure` | `heading`, `depth` |
| `doc.table` | block | `structure` | `headers`; offers the **table** view first |
| `doc.row` | block | `structure` | one field per column |
| `doc.item` | block | `structure` | `text`, `checked` as a flag |
| `doc.term` | block | `note` | `body` |
| `doc.link` | relation | `directed` | `kind`, `text` |

- **Every block carries a `source` field of form `link`** — the published page URL and heading anchor. mndflow's view modules read that one field name into `Box.link`, so `draw_svg` wraps the box in an anchor and `Viewer` follows it. **That is how a diagram becomes navigation**, and nothing in mndflow had to know about markdown.
- **`doc.table` naming the table view first** makes a markdown table open as a table rather than as boxes.
- **Gate:** `validate(graph)` for the schema and `review(graph)` for what the vocabulary asked for. Both ship in `@mnd/kit`; `review` is the one that turns a note into a refusal at emit.


## Stages

| | Stage | Ends with |
|---|---|---|
| **S0** | **install the seam** — `npm pack -w @mnd/kit`, install the tarball, pin the mndflow SHA beside it | `tsc --noEmit` green against the real types |
| **S1** | **strip the ledger** — claims, scratch, staged changes, record write-back, REST/MCP claim surface | the store holds documents and organization, and nothing else |
| **S2** | **the vocabulary** — `src/vocab/docs.ts`, data only | `mndmap vocab --check` clean through `validate` and `review` |
| **S3** | **the builder** — `store → Graph`, pure and synchronous | `mndmap graph > out.json`, and **mndflow's own CLI opens it untouched** |
| **S4** | **the live surface** — the tree beside `Viewer`, rebuilding the graph on every edit | reorganize a section, the diagram redraws |
| **S5** | **organizing gestures** — move, group, order, set what becomes a diagram | the decisions persist across a rescan |
| **S6** | **taggly, in session** — tag, rank and extract behind a narrow optional interface, proposing groupings the user accepts or ignores | a suggested grouping appears, is accepted, and becomes ordinary organization |
| **S7** | **emit** — `dist/`, or the configured destination: the document collection with `draw_svg` output embedded and anchored | mdsite builds it; clicking a box in a published page navigates |

**S3 is the acceptance test.** If mndflow's CLI folds and projects mndmap's graph with no modification, the seam is real. **S4 is the one that proves the product** — the live loop is the whole point, and it is worth reaching before the gestures in S5 are complete.

**Taggly never runs in CI.** It is a session-time assistant proposing groupings a human accepts; accepted groupings are ordinary organization in the store. That removes the service container, the content-hash sidecar and the determinism problem the earlier draft had to solve.


## Verification

1. `npm i ../mndflow/mnd-kit-0.0.0.tgz && npx tsc --noEmit`
2. `mndmap vocab --check` — every definition passes mndflow's door and its own rules.
3. `mndmap graph` — the block tree, built from real docs.
4. **In mndflow, on the untouched output**: `mnd check out.json` says nothing, `mnd review out.json` says nothing, `mnd fold out.json` prints the tree, `mnd project out.json <layer> --svg` draws it. **The contract test**: mndmap proves its output satisfies the file's invariants, mndflow proves it handles anything that does, and neither imports the other.
5. `npm run ui` — reorganize a section and watch the diagram redraw without a reload.
6. Rescan after editing a source document — the organization survives, keyed by record identity.
7. `mndmap emit`, build mdsite over `dist/`, open a page, click a box, land on the section it came from.


## Settled

- **The organization stays local.** No export, no commit, no CI reproduction.
- **`explorer` is in `kit`.** Use `Explorer` with `menu={false}`; mndmap offers its own actions.
- **A diagram goes three levels deep by default** — `#`, `##`, `###`, and the folders that mirror them. A fourth level and beyond folds into the third as fields rather than becoming blocks, so a layer stays readable and the drawing stays the size of a page. Overridable per node, and configurable in `mndmap.yaml`.

## Open

- **Kit versioning.** A tarball has no version discipline. Pin the mndflow git SHA in a comment beside the dependency until the seam stops moving.


## The general pattern, for what comes next

mndmap is the first of a class. The shape it settles is worth keeping.

```
source ──read──▶ graph ──emit──▶ artifact
```

**Two one-way functions, and no translator is ever bidirectional.** A reader never writes the source; an emitter never writes the graph. A round trip — code to diagram to code, for parametrics or simulation — is those two composed and checked, never one function that goes both ways. That is mndflow's *one way out, and it never writes back* honoured on both sides of the line.

**Which side is authoritative decides where a human steers, and whether hand edits survive:**

| Shape | Authoritative | Steering | Hand edits persist |
|---|---|---|---|
| **publisher** — mndmap | the source | a working store beside it | no, and correctly so |
| **round-tripper** — code, parametrics | the graph, between reads | the graph itself, committed and opened in mndflow | yes, via the log |
| **exporter** — SysML | the graph | the graph | n/a |

**The round-tripper is the one that needs an identity map**, because a block edited in mndflow must be emitted back to the construct it came from. mndmap does not, because its graph is derived. **Do not build the map until the shape that needs it arrives.**

**Five rules that hold for all three:**

1. **Read and emit are separate.** Neither knows the other exists.
2. **The vocabulary is data** — `Definition[]` extending base definitions, filed on the tier root. If it cannot be said with definitions and fields, it is a feature request against mndflow, not a translation.
3. **Rules refuse at emit.** `validate` for the schema, `review` for the vocabulary. Advice while editing, a refusal at the boundary.
4. **The file is the only contract.** A translator holds `@mnd/kit` and a `.json`, never an internal. Two translators compose by handing each other files.
5. **Use as little of mndflow as the job needs.** mndmap uses rendering and nothing else, and is simpler for it.
