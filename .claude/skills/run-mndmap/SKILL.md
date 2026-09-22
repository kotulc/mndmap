---
name: run-mndmap
description: Build, launch, and drive the mndmap dashboard in a real browser — run or start the app, click the explorer, read the content tray, check the drawing, screenshot the UI, emit a zip, or confirm a change works outside the round trip. Use whenever a change touches src/ui, src/read.ts, src/emit.ts, src/edits.ts or src/suggest.ts.
---

# Running mndmap

**The browser is the product.** There is no server: one static page translates
a dropped folder, holds the graph, and hands back a zip. **The typecheck and
the round trip cannot see what breaks here** — a panel that never renders, a
tree drowning in table cells, a gesture wired to an edit the kit never sends.
Drive the app.

`driver.mjs` in this directory is the harness. Paths below are relative to the
repo root. Verified on Windows 11 / Git Bash, Node 22.17.

## Prerequisites

Playwright is **not** a project dependency — it is installed beside the repo
so taking a screenshot never edits `package.json`. Once per machine:

```bash
HARNESS="$(node -e "console.log(require('os').tmpdir())")/mndmap-run-harness"
mkdir -p "$HARNESS" && (cd "$HARNESS" && npm init -y >/dev/null && npm install playwright@1.62.1 >/dev/null)
```

The driver finds it there on its own, and finds whatever Chromium build is
already under `ms-playwright/`. Nothing else to install — if a browser is
already present, **do not run `npx playwright install`** (see Gotchas).

## Build and launch

The preview server serves the **built** bundle from `dist/ui`, never source.
Build before launching or you will drive the previous version of your own
change. A headless drop is not possible, so the page is given a workspace the
same way a link would: `?file=`.

```bash
npm run build
npx tsx src/cli.ts translate .          # writes workspace.json
cp workspace.json dist/ui/workspace.json
(npm run preview > /tmp/preview.log 2>&1 &) ; sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7342/   # 200
```

Use `localhost`, not `127.0.0.1` — vite binds the name.

To drive the suggestion chips, put a sidecar beside it and name it too:

```bash
cp suggestions.json dist/ui/ 2>/dev/null
MNDMAP_FILE='?file=workspace.json&suggestions=suggestions.json' \
  node .claude/skills/run-mndmap/driver.mjs smoke
```

## Drive it (agent path)

One shot — loads, lists the tree, picks a page, reads the tray, renames,
tags, undoes twice, checks the drawing, screenshots, and emits a zip:

```bash
node .claude/skills/run-mndmap/driver.mjs smoke
```

Interactive — commands on stdin, one per line. It lands on the app before
taking the first command:

```bash
printf 'click Metadata\ntray\nchips\nemit\nss check\nquit\n' \
  | node .claude/skills/run-mndmap/driver.mjs
```

| Command | What it answers |
|---|---|
| `rows` | every explorer row: `mark` (folder/container/leaf), label, picked |
| `click <text>` | explorer row, or tray tab (Content / Metadata / Links) |
| `tray` | active tab: name, outline/tag/link counts |
| `rename <text>` | rename through the tray title |
| `tag <text>` | add a tag on Metadata, print tags after |
| `chips` | the sidecar's candidates here — empty without `?suggestions=` |
| `pick [n]` | take candidate *n* |
| `undo` | step the stack back one |
| `emit` | click Emit and save the zip; prints where it landed |
| `boxes` | where the cards landed, and whether any fell off the panel |
| `errors` | console and page errors |
| `ss <name>` | screenshot to `%TEMP%/mndmap-shots/<name>.png` |
| `eval <js>` | run JS in the page |

**Look at the screenshot.** `Read` the PNG. The layout bugs in this app are
invisible in the DOM dump and obvious in the image.

### The four checks worth running every time

- **`rows` lists sets, pages, and the content blocks under the open page.** A
  row for a section, body, item, or stand-in is expected once that page is
  expanded. Cells remain tray outline, not explorer rows for a folded root —
  but opening a page walks its lattice in the tree.
- **`boxes` must say all on panel.** See below.
- **`undo` must walk all the way back.** Every gesture pushes the graph it was
  applied to. A gesture that edits in place instead of returning a new graph
  leaves the stack holding the edited one, and undo silently does nothing.
- **`emit` must produce a zip with `mdsite.yaml` in it.** That is the whole
  run, end to end. Unzip it and check a page:
  ```bash
  node -e "require('jszip').loadAsync(require('fs').readFileSync(process.argv[1])).then(z=>console.log(Object.keys(z.files).join('\n')))" \
    "$TEMP/mndmap-downloads/workspace.zip"
  ```

`boxes` reporting cards **off panel** means React Flow laid them out in
document flow rather than by transform, which happens when its base stylesheet
is missing. The canvas then renders as an empty dotted field and nothing else
notices — no error, no warning at runtime. The kit's stylesheet `@import`s it
on its first line; a build warning about `@import` position means that line
moved and the sheet is being dropped again.

The shape itself (`ROW`, `COLUMN`, `scattered`) is the kit's business, not
mndmap's — the layout ranks by relations, so a linked page drops a rank.

## Without the browser

Most data questions are faster answered headless, because both halves of the
translator are pure functions:

```bash
npm run roundtrip                       # docs, and both fixtures
npx tsx src/cli.ts translate . && npx tsx src/cli.ts emit workspace.json --out /tmp/site
```

`roundtrip` also runs the kit's `review`, which is what the shipped
vocabularies asked for and did not get. It has caught three real modelling
bugs that every other check passed: a required field left unset, a block put
where its definition says it may not go, and a relation drawn the wrong way
round. **Treat a note as a failure**, not as advice.

For one question about the graph, read `workspace.json` directly — it is
ordinary JSON and the ids say what they are (`page:`, `sec:`, `grid:`, `row:`).

## Stopping it

```bash
PID=$(netstat -ano | grep ":7342" | grep LISTENING | awk '{print $5}' | head -1)
taskkill //PID "$PID" //F
```

## Gotchas

- **`npx playwright install` is almost never what you want.** The npm package
  pins one Chromium build number and refuses any other; the driver looks up
  whichever build is already under `ms-playwright/` and passes it as
  `executablePath`. Installing again downloads several hundred megabytes to
  fix a path the driver already found.
- **A half-installed harness has no `package.json`.** If the import fails with
  `ERR_MODULE_NOT_FOUND` on `playwright/index.mjs`, re-run the harness install
  above; `npm init -y` first.
- **`?file=` opens a workspace with no config beside it**, so `mdsite.yaml` in
  the zip is the default template and the Suggest button says no endpoint is
  configured. That is correct, not a bug — a real run drops a folder, which
  carries `mndmap.yaml` and the template with it.
- **The drop path cannot be driven headless.** `getAsFileSystemHandle` is not
  reachable from a synthesised drag event. Test the folder path by hand, or
  test `read()` directly with the round trip.
- **The shell's left column is the kit's `.explorer`.** It sizes and scrolls
  itself and puts a drag grip on its edge. Tray chrome is `.tray` from
  `@mnd/kit/shell.css`; mndmap content classes are `mm-*` only.
- **`@mnd/kit/react.css` plus `@mnd/kit/shell.css`** are the theme and chrome.
  Content meaning stays in `styles.css` under the `mm-` prefix.
