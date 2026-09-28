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
| **definitions** | blocks reused across the document — column types now; keywords, tags and concepts later — filed in folders like any package's |
| **projections** | diagrams drawn from the one explorer tree: the **document** (the page) and the **library** (packages and definitions). Each is its own view, and all follow the same navigation |
| **shell** | explorer, canvas, tray, workspace display — all from `@mnd/kit`. mndmap adds the projections, the `markdown` tab and reorganizing |

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
| `src/read.ts` | one markdown document → blocks: nesting, tables with their schemas and column types, its definitions filed by section; and the document projection — the page, an opened table |
| `src/library.ts` | the library projection: a row of packages or definitions as nested boxes, a folder's own definitions with how they relate, one definition in context |
| `src/packages/markdown.ts` | the markdown package: what each element is, as definitions |
| `src/scan.ts` | a folder or file on disk → a graph of blocks |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/series.ts` | the page's rows, and the document written back as markdown |
| `src/ui/App.tsx` | the shell, assembled from the kit: navbar, explorer, canvas, tray; which projection is drawn; Enter, Backspace and Escape |
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

## Projections

A **projection** draws part of the explorer's tree as a diagram. There are two, each its own view
over the same tree and the same rules: the **document** projection (the page, above) and the
**library** projection (packages and definitions). `usages` shows the document; any row of
`packages` or `definitions` shows the library.

| Rule | |
|---|---|
| **one tree** | a projection draws what the explorer files, in the explorer's order, so walking the tree walks the drawing |
| **same laws everywhere** | every section organises the same way — groups, folders, definitions. A package is only frozen: filed when it is made, never refiled |
| **drilling narrows** | a row draws everything under it; each branch a box, boxes inside boxes, definitions as cards, `READ` across |
| **a folder is a context** | a row holding definitions of its own draws them with how they relate — what each *extends*, and from the document which *holds* which and which columns *allocate* which tables. What they relate to outside the row is drawn dashed |
| **one definition in context** | Enter or double-click on a definition shows its use: the tables allocating it (or the blocks it types) under their headings, it under them, the columns it shares below |

The markdown package files its definitions as `structure`, `prose`, `data` and `media`, and the
base package it builds on reads inside it as a folder of its own. The reader files the
document's column types by the section their tables sit in, `shared` first for those in more
than one.

## Reading it

The arrows walk the explorer's tree; the canvas follows.

| Key | Does |
|---|---|
| ↓ / ↑ | next / previous row at the same level. Past the last, out to the next branch — or into this one where there is none; past the first, up to its holder |
| → | the next row in reading order: into a branch, else on to the next block |
| ← | out to the row's holder; at the top, the section before |
| Enter / double-click | open: a focus block on the page, a definition in context, a block from context onto the page |
| Backspace | leave: a focus block for its card, a context for its projection, a projection for the page |
| Escape | clear the pick; with nothing picked, leave |

**Folding.** The arrows open each branch they step into. By default the tree stays open only
along the way to the picked row: a branch the arrows leave folds behind them. The fold toggle at
the right of the explorer's bar (a chevron pair, barred while held) makes folds sticky: what is
open stays open as the arrows move on. A section's own fold shuts or opens every branch in it but
leaves the section listed; its mark hides it.

**Camera.** A pick is centred `READ` (3) cards wide, set in `src/ui/App.tsx`. With nothing
picked, a projection is fitted to its full width and read from its top.
