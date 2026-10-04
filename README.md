# mndmap

A markdown reader built on the mndflow shell.

A folder of markdown becomes a **collection**: a folder per folder and a block per file, each
markdown file a **document** read from disk into blocks the first time it is reached. What a
heading, a table, a list or a fence *is* comes from a **markdown package** — a vocabulary of block
definitions and tags, defined as JSON — rather than from the parser's own opinion. The parser stays
general and small; the package carries the meaning.

Nothing is uploaded and nothing is kept between runs. The page is the whole of it.

| Layer | What it holds |
|---|---|
| **collection** | folders (holders) and documents (definitions), listed by path, nothing read (`scan.ts`). One markdown file on its own sits in a root named after it |
| **parser** | a document's file → content blocks under it, read when the document is first reached (`read.ts`) |
| **markdown package** | what a document, heading, table, list or fence *is*, as definitions in `markdown.json`; its tags `structure`, `prose`, `data`, `media` say what each kind of content is |
| **tables** | a table carries its own schema and its header as written; rows are values |
| **page** | a document drawn as it reads: the kit's `outline` layout, headings down the page |
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
| `src/scan.ts` | a folder or file on disk → a collection of folders and documents, each file keeping a reader |
| `src/read.ts` | one document's text → content blocks under it, and the page it lays out as |
| `src/packages/markdown.json` | the markdown package: what each element is, as definitions and tags |
| `src/packages/markdown.ts` | reads it, and names the ids the reader's code keys off |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/series.ts` | a document back in reading order: what a pick covers, and its markdown |
| `src/ui/App.tsx` | the shell, assembled from the kit: the sections, the canvas, the tray; Enter, Backspace and Escape |
| `src/ui/Preview.tsx` | the tray's `markdown` tab — a block's markdown, or a whole document, rendered |
| `docs/rules.md` | the agreed model rules for mndflow and mndmap, each decided, open, dropped or kept |
| `docs/simplification-plan.md` | the next step: one rule, one home — what has been consolidated, how to find more, and the leads |
| `docs/sections-plan.md` | the sections and blocks-all-the-way work that led here: history |
| `scripts/dev.mjs` | runs the kit watcher, then the app once the kit's first build is written |
| `samples/sample.md` | the document being designed against |
| `samples/docs/` | a folder collection; `npm run dev` then `?folder` opens it |
| `vendor/` | the pinned `@mnd/kit` release |

## Sections

The explorer is a **section chain**: each section holds one context, and the next lists what it
holds. It is mndflow's chain with the packages section left out. **The explorer browses; the
canvas draws what was opened.**

| Canvas | Draws |
|---|---|
| **overview** (nothing open) | the collection's one package, its folders flattened into boxes, documents at their own size, read down the page |
| **a document** | its page, as the kit's `outline` lays it |

| Section | Lists | Holds |
|---|---|---|
| **collection** | the folders and documents, nested | a folder or document (default the first document) |
| **document** | the document held, its outline under it | a block in it, or nothing — the whole |

| Rule | |
|---|---|
| **browse, then open** | choosing a row holds it and picks it, and the canvas stays; Enter, a double click or → opens it |
| **one navigation** | opening, leaving and revealing are the kit's (`open_at`, `leave_at`, `reveal_at`), and the sections follow by `held_at` |
| **three cues** | the accent's edge on the row the canvas shows, the pick a strong wash, each section's pick a faint one |
| **remembered** | a section remembers what it held for each context above |
| **read on arrival** | a document's file is read the first time a section or the canvas reaches it — the text on disk then; reading is not an edit |
| **headers are labels** | a header folds its section; there are no root rows |
| **headings fold** | a document's sections fold under their headings as it is read |
| **scrolled into view** | the page holds still across and stops at its content's ends; a pick out of view is scrolled just into it |

## How a document is shaped

1. Each heading is a **section group** holding what follows it, until a heading of the same level
   or higher, headed by its heading block. The explorer lists the outline, each section folded
   under its heading.
2. The page draws one document as one layer, sections held by `parent`: headings down the page,
   each section's content in rows beside its heading, its own sections boxed and stepped right. A
   flow line runs to each heading from its parent or the sibling before it.
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
| Enter / double-click / → | open: a document draws as its page; a folder is focused on the overview |
| crumbs | the collection, then the document drawn; picking one opens it |
| Backspace / ← | leave: from a document's page to the overview, it picked |
| Escape | clear the pick; with nothing picked, leave |

**Folding.** The arrows open each branch they step into, and a pick in a shut branch opens the way
to it. By default the tree stays open only along the way to the pick; the fold toggle at the right
of the explorer's bar makes folds sticky. A section's own fold shuts or opens every branch in it.
