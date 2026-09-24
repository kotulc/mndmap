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
| **nesting** | content sits under its heading; thin layers dissolve back into the one above |
| **markdown package** | what a heading, table, list, fence or link *is*, as definitions |
| **definitions** | vocabulary over the content — keywords, tags, concepts |
| **shell** | explorer, canvas, tray, navbar — all from `@mnd/kit` |

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
| `src/scan.ts` | a folder or file on disk → a graph of blocks |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/ui/App.tsx` | the shell: navbar, explorer, canvas, tray |
| `src/ui/Tray.tsx` | the Content tab — the picked file, rendered |
| `scripts/dev.mjs` | runs the app and the kit watcher together |
| `samples/sample.md` | the document being designed against |
| `samples/docs/` | a folder corpus, for later |
| `vendor/` | the pinned `@mnd/kit` release |

## How a document is shaped

1. Each heading holds what follows it, until a heading of the same level or higher.
2. A layer holding fewer than **5** blocks gives its heading containers up: their
   content comes up beside them, and the layer is measured again.
3. Blocks are stacked down the page, not rowed across it.

Rule 2 is why `# Title` sits *with* its sections instead of being a box you
must open to see anything. The threshold is `read(name, text, least)`.
