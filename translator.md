# mndmap as mndflow's first translator

## Context

mndflow has a headless engine (`core` → `layout` → `views` → Scene) and two renderers: React ([Scene.tsx](packages/render/src/Scene.tsx)) and text ([text.ts](packages/views/src/text.ts)). Nothing has ever driven it from outside the repo, and the Scene seam has never been proven by a second consumer.

mndmap already parses `.md`/`.mdx` into collections, records and fields with exact source locations, and already publishes SVG + a React embed into mdsite. But it does all of that against a hand-rolled envelope ([adapter.ts](../mndmap/src/mndflow/adapter.ts)) and a hand-rolled grid layout ([layout.ts](../mndmap/src/publish/layout.ts)) — its own plan says so explicitly: *"keep the adapter narrow because mndflow currently has no supported package exports."*

The goal is to close that gap in both directions: mndflow ships one consumable seam and gains the one renderer a static site needs; mndmap throws away its bespoke graph and layout and becomes the first real translator — docs in, mndflow blocks out, projected and drawn by mndflow, embedded in published mdsite pages that link back to the doc each block came from.

Four decisions are settled: a single bundled `@mnd/kit` façade (mndflow stays unpublished); docs seed the graph while the DB keeps hand edits; the doc→block translation lives in mndmap; taggly runs in CI.

---

## The seam

```
docs/*.md ──mndmap translate──▶ mndflow Log ──fold──▶ Graph ──views.project──▶ Scene ──▶ SVG | React | text
                                     ▲                                                      │
                                SQLite storage port ◀── dashboard edits              dist/docs + mdsite
```

| Side | Owns |
|---|---|
| mndflow | the block model, the fold, the door, layout, projection, **and every renderer** |
| mndmap | markdown parsing, the docs vocabulary as a definition package, the mutation emitter, the SQLite log store, the dashboard shell, the publish pipeline |

mndmap never reimplements a layout, a shape or an edge route. If a diagram looks wrong, the fix is in mndflow.

---

## Stage 0 — `@mnd/kit`, the one exported surface *(mndflow)*

One new workspace package that re-exports the headless stack and builds to real output. Everything else in the monorepo stays `private`, `main: src/index.ts`, unchanged.

- `packages/kit/` — re-exports `@mnd/core`, `@mnd/layout`, `@mnd/views`, `@mnd/defs` from `index.ts`; `react.ts` re-exports `@mnd/render` and `@mnd/theme` behind a `./react` export condition, so a Node consumer never pulls React in.
- Built with `tsup` (or vite lib mode) to `dist/` — ESM + `.d.ts` + the CSS from [scene.css](packages/render/src/scene.css); `exports` map with `"."` and `"./react"`.
- `npm pack` produces the tarball mndmap installs. No registry, no publish — the README's "never published" stays true.

**Requires two edits that the law test forces**, and both are goal-state docs, so confirm before touching them: `ALLOWED` in [law.test.ts](test/law.test.ts) gains `kit: ["core", "defs", "layout", "views", "render", "theme"]`, and the package table in [docs/packages/README.md](docs/packages/README.md) gains a row. The law test asserts *"a rule for every package, and a package for every rule"* — it fails on day one otherwise.

**Ends with:** `npm pack -w @mnd/kit` in mndflow, `npm i ../mndflow/mnd-kit-0.0.0.tgz` in mndmap, and `npx tsc --noEmit` green in mndmap against the real types.

## Stage 1 — the SVG renderer, and links on boxes *(mndflow)*

The blueprint names `render-svg` as the third renderer; a published static page needs it, and so does ST.6's site.

- `packages/views/src/svg.ts` — `draw_svg(scene: Scene): string`, sibling to [text.ts](packages/views/src/text.ts), which is already a renderer living in `views`. Headless, no React, no new package, no law-test churn. Reads `Box.marks` and `def` for shape the same way the React renderer does; theme colours are emitted as CSS custom properties in one inline `<style>` so a page can restyle without re-rendering.
- `Box.link?: string` in [scene.ts](packages/views/src/scene.ts) — derived by the view modules from a block field of form `link` named `source`. `link` is already a `ValueForm` in [types.ts](packages/core/src/types.ts), so **no new model concept**: a translator that wants a clickable box sets a field, and every renderer honours it. `draw_svg` wraps such a box in `<a>`; `SceneView` does the same.
- `faults()` gains no rule — a link is optional presentation, not a Scene invariant.
- [apps/cli/src/main.ts](apps/cli/src/main.ts) gains `--svg` on `project`, so the renderer is provable from the harness that already exists.

**Ends with:** `node apps/cli/src/main.ts project <fixture> --svg > out.svg` opening in a browser with anchors that navigate.

## Stage 2 — the docs vocabulary, as a definition package *(mndmap)*

The docs vocabulary ships from mndmap as **data**, not code — which is exactly what mndflow means by a package, and proves the mechanism ST.5 depends on.

`src/translate/docs.defs.ts` exports `Definition[]`, every one `extends` a base definition from [base.ts](packages/defs/src/base.ts):

| Definition | Extends | Carries |
|---|---|---|
| `doc.document` | `folder` | `path`, `title`, `source` (link) |
| `doc.section` | `structure` | `heading`, `depth`, `source` |
| `doc.table` | `group` | `headers` |
| `doc.row` | `structure` | one field per column, forms inferred |
| `doc.item` | `structure` | `text`, `checked` (flag) |
| `doc.term` | `note` | `body` |
| `doc.link` (relation) | — | `kind`, `text` |

Validated by mndflow's own door — `check`/`inspect` from [door.ts](packages/core/src/door.ts) — in a mndmap test. A definition that does not pass is a build failure.

**Ends with:** `mndmap defs --check` clean, and the same file loadable by mndflow's CLI.

## Stage 3 — the translator *(mndmap)*

`src/translate/blocks.ts`: `ParsedDocument[] → Mutation[]`. Pure, no DB, no IO — testable as a function.

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

**Stable ids** reuse mndmap's existing identity ladder — configured key → explicit id → unique value → source locator — hashed to `doc:<path>#<heading path>#<ordinal>`. Stability is what makes stage 4's replay work, so it is a test in its own right: re-parse an edited document, assert untouched records keep their ids.

Emitted as a single `checkpoint` step, the same shape [file.ts](packages/core/src/file.ts)'s `read()` produces — one format, one reader.

**Ends with:** `mndmap graph docs/` printing mndflow's block tree, folded by `@mnd/kit`, and `mndmap project docs/ <layer>` printing the text projection.

## Stage 4 — the log store *(mndmap)*

The elegant part: **mndmap binds mndflow's `Storage` port to SQLite.** Nothing else has to change.

- New table `diagram_logs(diagram_id TEXT PRIMARY KEY, log_json TEXT)`, alongside the tables in [state.ts](../mndmap/src/state.ts).
- `src/translate/store.ts` implements `Storage` from [ports.ts](packages/core/src/ports.ts) over that table; `session({ storage, defs })` from [session.ts](packages/core/src/session.ts) gives the whole action set, undo-by-refold and file IO for free.
- **Re-import** replaces step 0 (the checkpoint) and refolds. Later steps — placement, grouping, hand-drawn relations — replay against the new graph and survive, because ids are stable. Steps naming a vanished id become an import diagnostic rather than a crash.
- Diagram edits **never** enter mndmap's export set. Markdown stays truth for content; the log is truth for arrangement.

**Risk to settle here first, before building on it:** confirm `fold` tolerates a mutation naming an id the new checkpoint does not contain. If it does not, the fallback is a filter pass keyed on stable ids before refolding, and the door reports what it dropped.

**Ends with:** translate, drag a block in the dashboard, re-translate after editing the doc — the drag survives, the renamed heading updates.

## Stage 5 — the dashboard *(mndmap)*

Retire the bespoke half of mndmap and mount mndflow's.

| Deleted | Replaced by |
|---|---|
| [adapter.ts](../mndmap/src/mndflow/adapter.ts) — the `Graph`/`Element`/`Edge` envelope | mndflow's real `Graph` |
| [layout.ts](../mndmap/src/publish/layout.ts) — grid layout + SVG | `@mnd/layout` + `draw_svg` |
| `@xyflow/react` in [App.tsx](../mndmap/src/ui/App.tsx) | `SceneView` from `@mnd/kit/react` |
| the SVG in [Embed.tsx](../mndmap/src/publish/Embed.tsx) | the same `SceneView` |

`@xyflow/react` comes out of `package.json` entirely. The dashboard keeps its own chrome — collection list, record detail, scratch editor, claim state — and gains a stage that projects the current diagram through `views.project`, with gestures dispatched into `session().go(...)`.

**Ends with:** `npm run ui`, a real mndflow diagram of mndmap's own `docs/`, editable, persisting to SQLite.

## Stage 6 — publish *(mndmap)*

`mndmap publish` writes `dist/docs/`:

```
dist/docs/
  assets/<diagram>.json     mndflow File, from core's write() — byte-identical when unchanged
  assets/<diagram>.svg      draw_svg, anchors pointing at published doc pages
  components/MndDiagram.jsx one flat bundled ESM file, react external
  <generated pages>.md      embedding one or the other
```

Two mdsite constraints drive the shape, both verified in [ingest.js](../mdsite/scripts/ingest.js): `sync_components` copies only **flat** `.jsx?/.tsx?` files from the configured directory, and `sync_assets` mirrors a directory into `public/assets/` for runtime `fetch`. So the interactive embed must be a single self-contained file — a vite lib build with `react`/`react-dom` external, inlining `@mnd/kit/react` and its CSS.

Generated pages use the SVG by default and `<MndDiagram src="/assets/x.json" />` where interactivity is wanted; the interactive embed is **read-only** — pan, zoom, select, follow a link. Editing lives in the dashboard.

mndmap's own `mdsite.yaml` points `components:` and `assets:` at `dist/docs/`, which makes mndmap's published docs the first proof.

**Ends with:** mdsite builds, the page renders the diagram, clicking a box lands on the published doc page and heading it came from.

## Stage 7 — taggly, in CI *(mndmap)*

Yes, this works as a build step, and cleanly. `ghcr.io/kotulc/taggly:latest` already publishes and `taggly start` serves one POST endpoint per command on `:8000`, so [docs.yml](../mndmap/.github/workflows/docs.yml) gains a **service container** and nothing has to be installed.

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

**Abstraction:** where a layer holds more siblings than reads well, propose a `group` block over the closest-scoring cluster. Proposals are written as ordinary steps in the log, so a person can undo one — never applied silently.

`src/translate/tags.ts` calls taggly behind a narrow optional interface and **caches to a committed `tags.json` sidecar** keyed by content hash. Absent taggly — every local build — the sidecar is read and the build is identical. That is what keeps a multi-GB model container out of the everyday loop.

---

## Verification

**mndflow**, per stage:
- `npx tsc --noEmit` and `npm test` at the root — the law test is the gate for stage 0.
- `node apps/cli/src/main.ts project <fixture> --svg` — the SVG opens, anchors navigate.
- `mnd project` text output unchanged for every fixture — the `Box.link` addition must be inert where nothing sets one.

**mndmap**, end to end, once stage 6 lands:
1. `npm i ../mndflow/mnd-kit-0.0.0.tgz && npm test && npx tsc --noEmit`
2. `npm run cli -- import docs/` — parses, translates, seeds the log.
3. `npm run cli -- graph` — mndflow's block tree, printed by `@mnd/kit`'s own `fold`.
4. `npm run ui` — drag two blocks, group them, reload; the arrangement is still there.
5. Edit a heading in `docs/`, re-run `import`; the label changes, the drag survives, a diagnostic names anything dropped.
6. `npm run publish` then build mdsite over `dist/docs/`; open the page, click a box, land on the doc.

**The story this closes:** ST.6 — *a model becomes something else, the site first, one way out, and it never writes back.* Diagram edits staying out of the export set is that rule honoured, not an omission.

---

## Open, and worth deciding before the stage that needs it

- **Where `draw_svg` lives.** Proposed: `views`, because `text.ts` set that precedent and it costs no package. The alternative — a `paper` package — is more honest about "views projects, renderers draw" and costs a law-test row. Decide at stage 1.
- **Replay tolerance in `fold`** (stage 4). The whole durability model rests on it; check it before writing the store.
- **How deep a docs diagram goes by default.** A repo's whole `docs/` tree is a lot of blocks. Proposed: one diagram per top-level directory, sections to depth 3, deeper headings as fields — configurable in `mndmap.yaml`.
- **Kit versioning.** A tarball has no version discipline. Proposed: mndmap pins the mndflow git SHA in a comment beside the dependency until the seam stops moving.
