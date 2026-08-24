# mndmap as mndflow's first translator

## Context

mndflow has a headless engine (`core` → `layout` → `views` → Scene) and two renderers: React ([Scene.tsx](packages/render/src/Scene.tsx)) and text ([text.ts](packages/views/src/text.ts)). Nothing has ever driven it from outside the repo, and the Scene seam has never been proven by a second consumer.

mndmap already parses `.md`/`.mdx` into collections, records and fields with exact source locations, and already publishes SVG + a React embed into mdsite. But it does that against a hand-rolled envelope ([adapter.ts](../mndmap/src/mndflow/adapter.ts)) and a hand-rolled grid layout ([layout.ts](../mndmap/src/publish/layout.ts)) — its own plan says why: *"keep the adapter narrow because mndflow currently has no supported package exports."*

The goal is to close that gap. mndflow ships one consumable seam and gains the one renderer a static site needs. mndmap stays a standalone tool that happens to speak mndflow's file format, throws away its bespoke graph and layout, and publishes real mndflow diagrams into its docs.

**mndmap has exactly two surfaces: raw markdown in, a mndflow graph export out.** It imports mndflow's layout and renderers to draw that graph, and nothing else. No log, no mutations, no session, no ports. Its dashboard is its own markdown editing interface; the deliverable is SVGs and embedded assets in the published docs.

---

## The seam

```
docs/*.md ──mndmap translate──▶ Graph ──write()──▶ graph.json ──▶ mndflow opens it
                                  │
                                  └──views.project──▶ Scene ──draw_svg──▶ diagram.svg ──▶ dist/docs ──▶ mdsite
```

| Side | Owns |
|---|---|
| mndflow | the block model, the file format, the door, layout, projection, and every renderer |
| mndmap | markdown parsing, the docs vocabulary, the graph builder, the markdown dashboard, the publish pipeline |

`Graph` is plain data — `{ root, blocks, edges, defs }` in [types.ts](packages/core/src/types.ts). mndmap constructs one directly. It never builds a `Mutation`, never folds a log, never opens a session. mndflow's `read()` turns the exported file into a checkpoint log on **its** side of the line, which is where that concept belongs.

**The consequence, stated plainly:** with no log there are no persisted hand edits. Every diagram is derived fresh from markdown on every build, and layout is whatever `@mnd/layout` computes. Steering a diagram means editing the doc or `mndmap.yaml` — not dragging a box. That is coherent with a markdown-editing dashboard, and it is what keeps mndmap standalone; it is also a real capability given up, so it is written down rather than discovered later.

---

## Stage 0 — `@mnd/kit`, the one exported surface *(mndflow)*

One new workspace package that re-exports the headless stack and builds to real output. Everything else in the monorepo stays `private`, `main: src/index.ts`, unchanged.

- `packages/kit/` — `index.ts` re-exports `@mnd/core`, `@mnd/layout`, `@mnd/views`, `@mnd/defs`. `react.ts` re-exports `@mnd/render` and `@mnd/theme` behind a `./react` export condition, so a Node consumer never pulls React in.
- Built with `tsup` (or vite lib mode) to `dist/` — ESM + `.d.ts` + the CSS from [scene.css](packages/render/src/scene.css); `exports` map with `"."` and `"./react"`.
- `npm pack` produces the tarball mndmap installs. No registry, no publish — the README's "never published" stays true.

What mndmap actually consumes from it is small and worth keeping small: the `Graph`/`Block`/`Relation`/`Definition` types, `write()` and `inspect()` from [file.ts](packages/core/src/file.ts) and [door.ts](packages/core/src/door.ts), `BASE` from [base.ts](packages/defs/src/base.ts), and `views.project` + the renderers. **Not** `session`, `actions`, `fold`, `ports` or `Mutation`.

**Requires two edits the law test forces**, and both are goal-state docs, so confirm before touching them: `ALLOWED` in [law.test.ts](test/law.test.ts) gains `kit: ["core", "defs", "layout", "views", "render", "theme"]`, and the package table in [docs/packages/README.md](docs/packages/README.md) gains a row. The law test asserts *"a rule for every package, and a package for every rule"* — it fails on day one otherwise.

**Ends with:** `npm pack -w @mnd/kit` in mndflow, `npm i ../mndflow/mnd-kit-0.0.0.tgz` in mndmap, `npx tsc --noEmit` green in mndmap against the real types.

## Stage 1 — the SVG renderer, and links on boxes *(mndflow)*

The blueprint names `render-svg` as the third renderer; a published static page needs it, and so does ST.6's site.

- `packages/views/src/svg.ts` — `draw_svg(scene: Scene): string`, sibling to [text.ts](packages/views/src/text.ts), which is already a renderer living in `views`. Headless, no React, no new package, no law-test churn. Reads `Box.marks` and `def` for shape the same way the React renderer does; theme colours emitted as CSS custom properties in one inline `<style>`, so a page can restyle without re-rendering.
- `Box.link?: string` in [scene.ts](packages/views/src/scene.ts) — derived by the view modules from a block field of form `link` named `source`. `link` is already a `ValueForm`, so **no new model concept**: a translator that wants a clickable box sets a field, and every renderer honours it. `draw_svg` wraps such a box in `<a>`; `SceneView` does the same.
- `faults()` gains no rule — a link is optional presentation, not a Scene invariant.
- [apps/cli/src/main.ts](apps/cli/src/main.ts) gains `--svg` on `project`, so the renderer is provable from the harness that already exists.

**Ends with:** `node apps/cli/src/main.ts project <fixture> --svg > out.svg` opening in a browser with anchors that navigate.

## Stage 2 — the docs vocabulary *(mndmap)*

The docs vocabulary is **data mndmap owns** — `Definition[]` written into `graph.defs` of every export, each one extending a base definition from [base.ts](packages/defs/src/base.ts):

| Definition | Extends | Carries |
|---|---|---|
| `doc.document` | `folder` | `path`, `title`, `source` (link) |
| `doc.section` | `structure` | `heading`, `depth`, `source` |
| `doc.table` | `group` | `headers` |
| `doc.row` | `structure` | one field per column, forms inferred |
| `doc.item` | `structure` | `text`, `checked` (flag) |
| `doc.term` | `note` | `body` |
| `doc.link` (relation) | — | `kind`, `text` |

Validated by mndflow's own door — `inspect(graph)` — in a mndmap test. A definition that does not pass is a build failure. This is what proves mndflow's *"a new sort of thing is a definition, not an op"* rule from outside the repo.

**Ends with:** `mndmap defs --check` clean.

## Stage 3 — the translator *(mndmap)*

`src/translate/graph.ts`: `ParsedDocument[] → Graph`. Pure, no DB, no IO — testable as a function, and the whole of mndmap's coupling to mndflow.

| Source | Becomes |
|---|---|
| directory | `folder` block |
| document | `doc.document` block, frontmatter → fields |
| heading section | `doc.section` block, nested by heading depth |
| table | `doc.table` block; each row a `doc.row` child; each column a field, form inferred (`flag` for `$checked`, `link` for a cell that is a link, else `text`) |
| list / task list | `doc.item` children; `$checked` → a `flag` field |
| labeled list | `doc.item` with one field per label |
| markdown link between docs | `doc.link` relation, section → target document or section |
| every block | a `source` field of form `link`: published page URL + heading anchor |

**Stable ids** reuse mndmap's existing identity ladder — configured key → explicit id → unique value → source locator — hashed to `doc:<path>#<heading path>#<ordinal>`. They matter here for byte-stable exports and diffable SVGs: an unchanged doc must re-export identically, which is exactly what mndflow's canonical layout in `write()` is for.

**Arrangement** per diagram comes from `mndmap.yaml` and is written to the layer block's existing `arrangement` field (`free`/`grid`/`right`/`left`/`down`/`up`). No new mechanism, and it is the whole of the steering that replaces dragging.

`mndmap export` writes `write(graph)` — a `schema 2.0` file. **The acceptance test is mndflow's own CLI**: `mnd fold mndmap-export.json` prints the tree and `mnd project` draws it. If mndflow can read it, the seam is real.

**Ends with:** `mndmap graph docs/` printing the block tree, and mndflow's CLI opening the export unmodified.

## Stage 4 — render and publish *(mndmap)*

`mndmap publish` writes `dist/docs/`:

```
dist/docs/
  assets/<diagram>.json     the mndflow export — byte-identical when the docs have not changed
  assets/<diagram>.svg      draw_svg, anchors pointing at published doc pages
  <generated pages>.md      embedding the SVG
```

Two mdsite constraints drive the shape, both verified in [ingest.js](../mdsite/scripts/ingest.js): `sync_assets` mirrors a directory into `public/assets/` for runtime fetch, and `sync_components` copies only **flat** `.jsx?/.tsx?` files. The SVG path needs neither — it is an image. mndmap's own `mdsite.yaml` points `assets:` at `dist/docs/assets`, which makes mndmap's published docs the first proof.

This retires the bespoke half of mndmap:

| Deleted | Replaced by |
|---|---|
| [adapter.ts](../mndmap/src/mndflow/adapter.ts) — the `Graph`/`Element`/`Edge` envelope | mndflow's real `Graph` |
| [layout.ts](../mndmap/src/publish/layout.ts) — grid layout + hand-written SVG | `@mnd/layout` + `draw_svg` |
| the SVG in [Embed.tsx](../mndmap/src/publish/Embed.tsx) | the same |

**Ends with:** mdsite builds, the page renders the diagram, clicking a box lands on the published doc page and heading it came from.

## Stage 5 — the dashboard *(mndmap)*

mndmap's dashboard stays mndmap's: collections, records, fields, scratch editor, claim state, pending changes, export conflicts — the markdown editing interface its plan already describes. What changes is that it gains a **diagram preview** of the current collection: the same `views.project` → `draw_svg` call the publish step makes, rendered as an image beside the records.

Read-only, derived, no gestures, no editing on the diagram. `@xyflow/react` comes out of `package.json` — nothing needs it once layout and drawing come from mndflow.

**Ends with:** `npm run ui`, edit a record, the preview redraws.

## Stage 6 — taggly, in CI *(mndmap)*

Yes, this works as a build step, and cleanly. `ghcr.io/kotulc/taggly:latest` already publishes and `taggly start` serves one POST endpoint per command on `:8000`, so [docs.yml](../mndmap/.github/workflows/docs.yml) gains a **service container** and nothing has to be installed:

```yaml
services:
  taggly:
    image: ghcr.io/kotulc/taggly:latest
    ports: ['8000:8000']
```

| Command | Used for |
|---|---|
| `tag` / `key` | tags on each section and document block, written as a `tags` field |
| `score` / `rank` | sibling similarity, so proposed groupings are ranked rather than guessed |
| `ext` | typed concept extraction, feeding the abstraction pass |

**Abstraction:** where a layer holds more siblings than reads well, insert a `group` block over the closest-scoring cluster. Since the graph is derived, this is just another pass in the translator — deterministic given the same tags.

`src/translate/tags.ts` calls taggly behind a narrow optional interface and **caches to a committed `tags.json` sidecar** keyed by content hash. Absent taggly — every local build — the sidecar is read and the output is identical. That is what keeps a multi-GB model container out of the everyday loop.

## Stage 7 — the interactive embed *(optional)*

Only if the static SVG proves not enough. One flat `components/MndDiagram.jsx`, a vite lib build with `react`/`react-dom` external, inlining `@mnd/kit/react` and its CSS, fetching the same `assets/<diagram>.json` and projecting it in the browser. Read-only: pan, zoom, select, follow a link. mdsite's `components:` config mirrors it into `components/custom/` for MDX to import.

Deliberately last, and deliberately optional — it is the only thing in the plan that puts React on mndmap's publish path.

---

## Verification

**mndflow**, per stage:
- `npx tsc --noEmit` and `npm test` at the root — the law test is the gate for stage 0.
- `node apps/cli/src/main.ts project <fixture> --svg` — the SVG opens, anchors navigate.
- `mnd project` text output unchanged for every fixture — the `Box.link` addition must be inert where nothing sets one.

**mndmap**, end to end, once stage 4 lands:
1. `npm i ../mndflow/mnd-kit-0.0.0.tgz && npm test && npx tsc --noEmit`
2. `npm run cli -- import docs/` then `npm run cli -- graph` — the block tree, built from real docs.
3. `npm run cli -- export docs/ out.json`, then **in mndflow**: `node apps/cli/src/main.ts fold out.json` and `... project out.json <layer>`. Both must work on an untouched file — this is the seam's acceptance test.
4. Re-run the export with no doc changes; `git diff` is empty. Byte-stability is the contract `write()` offers and the thing that makes a diagram diffable.
5. `npm run publish`, build mdsite over `dist/docs/`, open the page, click a box, land on the doc.

**The story this closes:** ST.6 — *a model becomes something else, the site first, one way out, and it never writes back.* mndmap never writing back into a mndflow log is that rule honoured on both sides of the boundary.

---

## Open, and worth deciding before the stage that needs it

- **Where `draw_svg` lives.** Proposed: `views`, because `text.ts` set that precedent and it costs no package. The alternative — a `paper` package — is more honest about "views projects, renderers draw" and costs a law-test row. Decide at stage 1.
- **How deep a docs diagram goes by default.** A repo's whole `docs/` tree is a lot of blocks. Proposed: one diagram per top-level directory, sections to depth 3, deeper headings folded in as fields — configurable in `mndmap.yaml`.
- **Kit versioning.** A tarball has no version discipline. Proposed: mndmap pins the mndflow git SHA in a comment beside the dependency until the seam stops moving.
- **Whether mndmap keeps SQLite at all for diagrams.** It still needs it for claims, scratch and staged edits — the ledger. Diagrams touch none of that, so nothing about them is stored. Worth confirming that no cache is wanted; regenerating is cheap, and a cache would be the first step back toward a durable graph.
