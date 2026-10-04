# mndmap

A markdown reader built on the mndflow shell.

A folder of markdown becomes a **collection**: a block per folder and file, each markdown file a
**document** read into blocks the first time it is opened. What a heading, a table, a list or a
fence *is* comes from a **markdown package** — a vocabulary of block definitions and tags — rather
than from the parser's own opinion. The parser stays general and small; the package carries the
meaning.

Nothing is uploaded and nothing is kept between runs. The page is the whole of it.

| Layer | What it holds |
|---|---|
| **collection** | folders and documents, one block each (`scan.ts`). One markdown file on its own sits in a root named after it |
| **parser** | a document → content blocks under it, read when first opened (`read.ts`) |
| **markdown package** | what a document, heading, table, list or fence *is*, as definitions; its tags `structure`, `prose`, `data`, `media` say what each kind of content is |
| **tables** | a table carries its own schema and its header as written; rows are values |
| **page** | a document drawn as it reads: the backbone of headings down the page (`backbone.ts`) |
| **shell** | explorer, canvas, tray, display — all from `@mnd/kit`. mndmap adds reading, the page, the `markdown` tab and reorganizing |

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
| `src/scan.ts` | a folder or file on disk → a collection of folders and documents |
| `src/read.ts` | one document → content blocks under it, and the page it lays out as |
| `src/backbone.ts` | a layer laid as a staircase: headings down the page, content beside them |
| `src/packages/markdown.ts` | the markdown package: what each element is, as definitions and tags |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/series.ts` | a document back in reading order: what a pick covers, and its markdown |
| `src/ui/App.tsx` | the shell, assembled from the kit: the sections, the canvas, the tray; Enter, Backspace and Escape |
| `src/ui/Preview.tsx` | the tray's `markdown` tab — a block's markdown, or a whole document, rendered |
| `docs/sections-plan.md` | the sections and tags work: vision, steps and decisions |
| `scripts/dev.mjs` | runs the kit watcher, then the app once the kit's first build is written |
| `samples/sample.md` | the document being designed against |
| `samples/docs/` | a folder collection; `npm run dev` then `?folder` opens it |
| `vendor/` | the pinned `@mnd/kit` release |

## Sections

The explorer is a **section chain**: each section holds one context, and the next lists what it
holds. The canvas draws the section in focus.

| Section | Lists | Holds | The canvas draws |
|---|---|---|---|
| **collection** | the root folder's folders and documents, a document ending its branch | a folder or document (default the first document) | the layer it sits on, it picked |
| **document** | what the collection holds: a document's outline, or a folder's contents | a block in it, or nothing — the whole | a document as its page; a folder as its cards |

| Rule | |
|---|---|
| **one selection** | a row chosen and a card picked are the same: either holds it in its section and puts that section in focus |
| **two cues** | the focus lit strongly, the other section's context by an accent edge |
| **remembered** | a section remembers what it held for each context above |
| **read on arrival** | a document is read the first time a section reaches it; reading is not an edit |
| **headers are labels** | a header folds its section; there are no root rows |
| **headings fold** | a document's sections fold under their headings as it is read; what a section holds is always in view |
| **the camera follows down** | the page holds still across; the camera follows the pick down it |

## How a document is shaped

1. Each heading is a **section group** holding what follows it, until a heading of the same level
   or higher, headed by its heading block. The explorer lists the outline, each section folded
   under its heading.
2. The page draws one document as one flat layer: headings down the page, each section's content
   in rows beside its heading, its own sections boxed and stepped right. A flow line runs to each
   heading from its parent or the sibling before it.
3. Consecutive paragraphs and quotes are one `text` block; a table, list, fence or image is its own.
   A block is a whole number of cards wide and at most three high, cut with `…` unless the display's
   `full content` is on.
4. A block's body is its element as written: `## Title`, a fence with its language, `- [x] item`.
   A table is named `<rows>x<columns> items`, a list `list (<n> items)`, a section box
   `section (<n> blocks)`.
5. A table carries its own **schema**: a field per column, with the form its cells read as. The
   first column is the **key** that names each row.
6. Every block carries its definition's tag: markdown's `structure`, `prose`, `data` or `media`.

## Reading it

| Key | Does |
|---|---|
| ↑ ← / ↓ → | the row before / after, through every section |
| Enter / double-click | open a folder or document: `document` holds it, drawn as its page or cards |
| crumbs | the folders down to the layer drawn; picking one opens it |
| Backspace | leave: from a document to the collection, it picked; in the collection, up a folder |
| Escape | clear the pick; with nothing picked, leave |

**Folding.** The arrows open each branch they step into, and a pick in a shut branch opens the way
to it. By default the tree stays open only along the way to the pick; the fold toggle at the right
of the explorer's bar makes folds sticky. A section's own fold shuts or opens every branch in it.
