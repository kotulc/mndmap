# mndmap

A browser shell over a folder of markdown. One block per file and folder —
nothing is parsed beyond reading the text.

The page is the whole of it: a folder is picked or dropped, read where it sits,
and drawn as a graph. Nothing is uploaded and nothing is kept between runs.

## Running it

```
npm install
npm run dev      # opens on samples/docs
```

`npm run build` writes the static page to `dist/ui`.

## What is here

| Path | What |
|---|---|
| `src/scan.ts` | a folder on disk → a graph of file and folder blocks |
| `src/edits.ts` | move / order / rename / create / delete, and the undo stack |
| `src/ui/App.tsx` | the shell: navbar, explorer, canvas, tray |
| `src/ui/Tray.tsx` | the Content tab — the picked file's text |
| `samples/docs/` | a markdown corpus to open the dev server on |
| `vendor/` | the vendored `@mnd/kit`, which draws the shell |

The explorer, canvas, tray frame and navbar all come from `@mnd/kit`. Both the
explorer and the canvas take one `Graph` and lay it out themselves.
