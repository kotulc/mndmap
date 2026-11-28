# mndmap

**Cards and diagrams for static documentation, drawn from the markdown it is published from.** mndmap is the test bed for micro-documentation: a page read as a deck of bite-sized cards that open to show their parts and relationships, with mndflow's look and motion, portable to any static site. Flowcharts and a site map are drawn the same way. The output is markdown again, for any static site builder (mndsite, or another) to publish unchanged.

[VISION.md](VISION.md) says where this is going; [PLAN.md](PLAN.md) says what comes next.

```
markdown → mndmap build → markdown with diagrams + diagram pages → site builder → site
```

| Fence | Draws |
|---|---|
| ```` ```cards ```` | its page as a deck: one card per heading, opening to show its parts, read one at a time |
| ```` ```mermaid ```` (a flowchart) | the flow; `click Node "page/path"` links a node to a page |
| ```` ```sitemap ```` | the whole site as a treemap: folders, pages, sections, all links |

Each is placed **static** (inline SVG, no script) or **interactive** (a frame on its own page; decks are framed by default), and every one also gets a self-contained page of its own plus a gallery, for inspecting them one by one. The full guide is in [`docs/`](docs/index.md), itself drawn by mndmap.


## Running it

```
npm install
npm run build
node dist/cli.js build <content> --out build
node dist/cli.js check <content>          # broken links, for CI
```

`npm run demo` builds `docs/` into `dist/demo`; open `dist/demo/_assets/mndmap/index.html` for the gallery.

`npm run try` builds mndsite's own docs (read from `../mndsite/docs`, never written) with `samples/mndsite/` laid over them into `dist/try/build`, the site deck included.

`npm run dev` does the same on every edit in `src/`, `samples/` or those docs, and serves the result: http://localhost:7342/build/_assets/mndmap/site.html is the site deck, `.../index.html` the gallery.

`--cards` also writes the whole site as one deck, `<assets>/site.html`.


## Layout

| Path | What |
|---|---|
| `src/cli.ts` | `mndmap build` / `check`: flags, report, exit codes |
| `src/config.ts` | settings: defaults, `mndmap.yaml`, flags |
| `src/build.ts` | copies content to `out`, swaps fences for drawings, writes diagram pages |
| `src/site.ts` | the content folder as a site: pages, urls, titles, words, sections |
| `src/fences.ts` | finding diagram fences in a page and swapping them out |
| `src/diagrams.ts` | each fence as a diagram, drawable from wherever it lands |
| `src/cards.ts` | a page as a deck: headings and lists as cards and parts, links and mentions as relationships |
| `src/site-deck.ts` | the whole site as one deck: folders, pages, and each page's cards |
| `src/mermaid.ts` | flowcharts read with Mermaid's own parser (in a jsdom window) |
| `src/links.ts` | references to pages: lookup, checking, relative hrefs |
| `src/flow.ts` | a flow laid out by dagre, drawn as SVG |
| `src/pages.ts`, `src/deck-style.ts` | each diagram's own page (a deck's stage and panel), and the gallery |
| `src/render/` | shared by build and page script: deck layout, the treemap, the theme, text fitting, icons |
| `src/runtime/` | the script inside each diagram page: the deck (camera, lines, panel), theme, map, flow |
| `samples/mndsite/` | pages laid over mndsite's docs by `npm run try`: About as written (the target) and rewritten, and the site map |
| `scripts/try.mjs`, `scripts/dev.mjs` | build mndsite's docs with the samples; and that, served and rebuilt on edit |
| `docs/` | the guide, and the demo content |


## Relationships

| Project | Role |
|---|---|
| **mndflow** | the look: colour ramp, monospace type, chips, cards and boxes follow its design language |
| **mndsite** | a shell: publishes mndmap's output as any other content; mndmap never edits it |
