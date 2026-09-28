# mndmap

A markdown translator built on the mndflow shell.

One markdown document becomes a graph of blocks. What a heading, a table, a
list or a fence *is* comes from a **markdown package** — a vocabulary of block
definitions — rather than from the parser's own opinion. The parser stays
general and small; the package carries the meaning.

Nothing is uploaded and nothing is kept between runs. The page is the whole of it.

## Where this is going

| Layer | What it holds |
|---|---|
| **parser** | markdown → blocks. General, minimal, one document at a time. |
| **nesting** | content sits under its heading in the graph; the canvas draws it as one flat page |
| **markdown package** | what a heading, table, list, fence or link *is*, as definitions |
| **tables** | a table carries its own schema; each distinct column name is a column block type its header allocates; rows are values |
| **definitions** | blocks reused across the document — column types now; keywords, tags and concepts later — charted beside what uses or allocates them |
| **shell** | explorer, canvas, tray, workspace display — all from `@mnd/kit`. mndmap adds the page, the charts, the `markdown` tab and reorganizing |

The parser and the package both live here. mndmap is the markdown-specific
translator; mndflow is the general shell it draws with.

Current focus: **`samples/sample.md` only.** Folder loading works and
`samples/docs/` is kept for later, but the single-document case is the one
being designed against.

## Running it

```
npm install
npm run dev
```

That is the whole of it. `npm run build` writes the static page to `dist/ui`.

## Working on mndflow at the same time

`npm run dev` also **watches `../mndflow` and rebuilds the kit as you edit it.**
Save a file there and the page updates in about two seconds — no pack, no copy,
no `npm install`, no restart.

| | |
|---|---|
| mndflow checked out at `../mndflow` | used automatically |
| no mndflow beside this repo | falls back to `vendor/mnd-kit-*.tgz` |
| `MNDMAP_KIT=pin npm run dev` | ignore mndflow, use the tarball |

`package.json` always names the vendored tarball, so a clone, a build and CI
are unaffected by any of this. Only the dev server looks sideways.

**One dev server at a time.** Each kit build cleans the kit's `dist` first, so a
second watcher (or `npm run kit:types`) can catch a running page mid-clean; its
vite then keeps failing to resolve `@mnd/kit`. Restart `npm run dev` to recover.

**Types lag on purpose.** The watch rebuilds only what the browser reads, which
is the fast half. If you change a kit *signature* and `tsc` disagrees with the
page, regenerate them:

```
npm run kit:types
```

Then re-pin with a real release when the kit change is settled: run
`npm run release:kit` in mndflow, copy the tarball into `vendor/`, and point
`package.json` at it.

## Layout

| Path | What |
|---|---|
| `src/read.ts` | one markdown document → blocks: nesting, tables with their schemas and column types; and what the canvas draws — the page, an opened table, a chart |
| `src/packages/markdown.ts` | the markdown package: what each element is, as definitions |
| `src/scan.ts` | a folder or file on disk → a graph of blocks |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/series.ts` | the page's rows, and the document written back as markdown |
| `src/ui/App.tsx` | the shell, assembled from the kit: navbar, explorer, canvas, tray; the reader's keys |
| `src/ui/Preview.tsx` | the tray's `preview` tab — the picked block's markdown, rendered |
| `docs/fields-plan.md` | the fields work: vision, steps and decisions |
| `scripts/dev.mjs` | runs the kit watcher, then the app once the kit's first build is written |
| `samples/sample.md` | the document being designed against |
| `samples/docs/` | a folder corpus, for later |
| `vendor/` | the pinned `@mnd/kit` release |

## How a document is shaped

1. Each heading holds what follows it, until a heading of the same level or higher. The graph is
   the document's outline, and the explorer shows it.
2. The canvas draws one document as **one flat page**. A heading does not open; it anchors the row
   of content under it. Only the drawing is flattened — the held graph keeps its sections.
3. Each heading steps right one card column per level. Its content starts in the column next to
   it, so the page reads as a staircase. A flow line runs to each heading from its parent or the
   sibling before it.
4. **Focus blocks** are the only blocks that open: a table, or a fence or list of 12+ lines. On
   the page each is a preview card; opening it shows the block alone, fitted to the canvas.
5. Rows stack down the page by each card's measured height, a unit of air apart, each card
   centred on its row's tallest.
6. A block's body is its element as written: `## Title`, a fence with its language, `- [x] item`.
7. A table carries its own **schema**: a field per column, with the form its cells read as — a
   column of numbers, yes/no or links reads as that form. The first column is the **key** that
   names each row; its header and its schema wear a key icon.
8. Each distinct column name is a workspace definition — a **column block type**. A table's
   header *allocates* those types; an allocation is not a usage and adds no block to the tree.
9. An **opened table** is a cutout of its section: the table in the middle, its section's
   heading above, the blocks read before and after it at either side, and below it each
   column's definition under its column (a dashed *allocates* line), then its schema card.
10. Picking a library section — `definitions`, `packages` or a package — **charts** its block
    definitions in the page's place, in labelled groups: a column type by the section its tables
    sit in (`shared` first, for those in more than one), anything else by its kind (structure,
    prose, data, media).
11. Picking one definition, or Enter on its card, shows it **in context**: the cards of the
    tables allocating it (or the blocks it types), each under its section's heading, the
    definition under them, and below it the other columns those tables allocate.

## Reading it

| Key | Does |
|---|---|
| ↓ / ↑ | next / previous row as deep or shallower: a sibling section, or out to the next row after the last sibling |
| → | along the row; past its end, the next row in reading order — the way into a section's subheadings |
| ← | back along the row; from a heading, up to the heading it sits under |
| Enter | open a focus block; on a chart, a definition in context; in context, a block on the page |
| Backspace | leave a focus block, back to its card on the page; from context back to the chart; leave a chart |
| Escape | clear the pick; with nothing picked, leave |

The camera centres the picked card, two cards wide (`READ`), and never takes in more than six
(`WIDEST`) — both set in `src/ui/App.tsx`. With nothing picked, the page is read from its top.
