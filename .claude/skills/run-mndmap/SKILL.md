---
name: run-mndmap
description: Build, launch, and drive the mndmap dashboard in a real browser — run or start the app, click the explorer, read the content panel, check the diagram layout, screenshot the UI, or confirm a change works outside the test suite. Use whenever a change touches src/ui, src/graph, src/working-store, src/export, or the REST surface in src/rest.ts.
---

# Running mndmap

`mndmap ui` serves a React dashboard over a local REST API. **Typecheck and
the unit suite cannot see what breaks here** — a render loop, a stale bundle,
a click wired to a payload `@mnd/kit` never sends, a diagram laid out in the
wrong direction. All four have shipped past green tests. Drive the app.

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

The server serves the **built** bundle from `dist/ui`, never source. Build
before launching or you will drive the previous version of your own change:

```bash
npm run build
```

The workspace schema is still moving, so start from a clean store:

```bash
rm -rf .mndmap
npx tsx src/cli.ts ui --root . > /tmp/mndmap-ui.log 2>&1 &
sleep 10
curl -s http://127.0.0.1:7341/api/health    # {"ok":true}
```

## Drive it (agent path)

One shot — loads, opens two pages, expands a segment, checks the diagram
shape, screenshots both panels, and reports the render-loop counter:

```bash
node .claude/skills/run-mndmap/driver.mjs smoke
```

```
loaded http://127.0.0.1:7341/
rows: 19, pages: 14
page "Deployment": ["Deployment","GitHub Actions example","BASE_PATH", ...]
page "mdsite handoff": ["mdsite handoff","Destination layout", ...]
C:\Users\clayt\AppData\Local\Temp\mndmap-shots\content.png
panel: Diagram
diagram: 4 boxes · 1 x · 2 y · COLUMN
imports: 1 (ok)
```

Interactive — commands on stdin, one per line. It lands on the app before
taking the first command:

```bash
printf 'click Metadata\nsegments\nexpand 1\nimports\nss check\nquit\n' \
  | node .claude/skills/run-mndmap/driver.mjs
```

| Command | What it answers |
|---|---|
| `rows` | every explorer row: `mark` (folder/leaf/container), label, picked, open |
| `click <text>` | click that explorer row |
| `segments` | the content panel's blocks, in order |
| `expand [n]` | open block *n* and print its body |
| `panel content\|diagram` | switch the main panel |
| `boxes` | diagram layout: `COLUMN`, `ROW (wrong)`, or `scattered` |
| `imports` | `POST /api/import` count since load — **must be 1** |
| `errors` | console and page errors |
| `ss <name>` | screenshot to `%TEMP%/mndmap-shots/<name>.png` |
| `eval <js>` | run JS in the page |

**Look at the screenshot.** `Read` the PNG. The layout bugs in this app are
invisible in the DOM dump and obvious in the image.

### The two checks worth running every time

- **`imports` must be 1.** Anything higher means the app re-imports on every
  render. This happened for real: `App({ api = createEditorApi() })` built a
  new client each render, which every hook treated as a changed dependency.
  Every panel looked stale and every click looked ignored, and no test saw it.
- **`boxes` must say `COLUMN`.** `ROW (wrong)` means a layer laid its blocks
  out across the screen. Layout ranks by *edges*, and mndmap emits none, so a
  regression here reads as "arrangement is being ignored."

## Without the browser

The REST surface answers most data questions directly, and is much faster:

```bash
curl -s -X POST http://127.0.0.1:7341/api/import -d '{}' -H 'content-type: application/json'
curl -s http://127.0.0.1:7341/api/organization | head -c 400
curl -s "http://127.0.0.1:7341/api/pages/<orgNodeId>/segments" | head -c 400
```

For export planning with no server at all, open an in-memory workspace:

```bash
cat > dbg.mts <<'TS'
import { Mndmap } from "./src/service.js";
const s = await Mndmap.open(".", { memory: true });
await s.import();
const preview = await s.exportPreview() as any;
console.log(preview.diagnostics, preview.files.map((f: any) => f.path));
s.close();
TS
npx tsx dbg.mts; rm dbg.mts
```

`.mts` matters — `tsx` compiles `.ts` as CJS here and rejects top-level await.

## Stopping it

`pkill -f "cli.ts ui"` does **not** match; the process is `node`, not `tsx`:

```bash
PID=$(netstat -ano | grep ":7341" | grep LISTENING | awk '{print $5}' | head -1)
taskkill //PID "$PID" //F
```

## Gotchas

- **`rm -rf .mndmap` fails with `Device or resource busy`** if a process still
  has a file open under it. Stop the server first, with the `taskkill`
  above.
- **`waitUntil: "networkidle"` never settles** against this server and times
  out after 30s. The driver uses `domcontentloaded` plus a wait for
  `.explorer li`. Do the same in any ad-hoc script.
- **A 404 in `errors` is the favicon**, which the static server does not
  serve. Harmless. Anything else is not.
- **The npm playwright package pins one Chromium build number** and refuses
  any other — 1.62.1 wants build 1234, 1.55.0 wants 1187, and this machine
  has 1228. The driver ignores the pin and points `executablePath` at
  whatever build is installed. Running `npx playwright install` to "fix" the
  mismatch downloads a second browser for no reason.
- **The explorer shows no sections**, by design — the tree is folders, groups
  and pages. Sections are the content panel's, and the diagram's.
- **A page's own H1 is a segment** that contains every other section, so
  `segments` returns a flat list whose first entry is the page title.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Cannot read properties of undefined (reading 'launch')` | Playwright is CJS; an absolute-path `import()` puts it under `default`. The driver unwraps both — an ad-hoc script must too. |
| `Executable doesn't exist at .../chromium_headless_shell-1234` | The version pin. Pass `executablePath`, or set `MNDMAP_CHROME`. |
| `page.goto: Timeout 30000ms exceeded` | `networkidle`. Use `domcontentloaded`. |
| `rows` returns `[]` | Server up but bundle stale or absent — run `npm run build`, restart. |
| Driver clicks the right row, panel shows the wrong page | The `reveal` payload. `@mnd/kit`'s Explorer sends `onAct("reveal", { id })` — not `layer`/`picked`, and `rename` sends `label`, not `title`. |
| Changes not visible | `npm run build` and restart. The server reads `dist/ui`, not source. |

## Environment overrides

`MNDMAP_URL` (default `http://127.0.0.1:7341`), `MNDMAP_SHOTS` (default
`%TEMP%/mndmap-shots`), `MNDMAP_PW` (harness root), `MNDMAP_CHROME` (browser
binary).
