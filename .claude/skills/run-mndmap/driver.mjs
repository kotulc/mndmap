/** Drive the running mndmap dashboard.
 *
 *  The dashboard is a React app over a local REST API, and most of what breaks
 *  in it is invisible to `tsc` and to the unit suite — a render loop, a stale
 *  bundle, a click wired to a payload the kit never sends. This opens it in a
 *  real browser and pokes it.
 *
 *  One-shot:  node .claude/skills/run-mndmap/driver.mjs smoke
 *  REPL:      node .claude/skills/run-mndmap/driver.mjs   (commands on stdin)
 *
 *  Commands: goto [path] | rows | click <text> | segments | expand [n] |
 *            panel content|diagram | boxes | imports | errors | ss <name> |
 *            eval <js> | smoke | quit
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.MNDMAP_URL ?? "http://127.0.0.1:7341";
const SHOTS = process.env.MNDMAP_SHOTS ?? join(tmpdir(), "mndmap-shots");

/** Playwright is harness tooling, not a project dependency — it is installed
 *  beside the repo so taking a screenshot never edits `package.json`. */
async function load_playwright() {
  const roots = [process.env.MNDMAP_PW, join(tmpdir(), "mndmap-run-harness")].filter(Boolean);
  for (const root of roots) {
    const entry = join(root, "node_modules", "playwright", "index.js");
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  return import("playwright");
}

/** The browser Playwright downloaded, whichever build this machine has. The
 *  npm package pins one build number and refuses any other, so the path is
 *  found rather than assumed — otherwise every playwright bump breaks this. */
function chrome_path() {
  if (process.env.MNDMAP_CHROME) return process.env.MNDMAP_CHROME;
  const home = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ms-playwright")
    : join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(home)) return undefined;
  const builds = readdirSync(home)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  const relatives = ["chrome-win64/chrome.exe", "chrome-linux/chrome",
                     "chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
  for (const build of builds) {
    for (const relative of relatives) {
      const full = join(home, build, relative);
      if (existsSync(full)) return full;
    }
  }
  return undefined;
}

/** Playwright is CommonJS, and importing one by absolute path hands back the
 *  namespace with everything under `default` — so both shapes are unwrapped. */
const loaded = await load_playwright();
const chromium = loaded.chromium ?? loaded.default?.chromium;
if (!chromium) throw new Error("playwright loaded but exposes no chromium");

const executablePath = chrome_path();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
let imports = 0;
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push("console: " + message.text());
});
page.on("request", (request) => {
  if (request.url().includes("/api/import")) imports += 1;
});

/** `networkidle` never settles against this server, so readiness is a row. */
async function goto(path) {
  imports = 0;
  errors.length = 0;
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".explorer li", { timeout: 20000 });
  await page.waitForTimeout(800);
  return "loaded " + BASE + path;
}

async function rows() {
  const found = await page.$$eval(".explorer li[data-mark]", (list) =>
    list.map((row) => ({
      mark: row.getAttribute("data-mark"),
      label: (row.querySelector(".label")?.textContent ?? "").trim(),
      picked: row.classList.contains("picked"),
      open: row.classList.contains("open"),
    })));
  return JSON.stringify(found, null, 1);
}

async function click(label) {
  const row = page.locator(".explorer li", { hasText: label }).first();
  if (!(await row.count())) return 'no row matching "' + label + '"';
  await row.click();
  await page.waitForTimeout(600);
  return "clicked " + label;
}

async function segments() {
  const titles = await page.$$eval(".segment-block", (blocks) =>
    blocks.map((block) => (block.querySelector(".segment-title")?.textContent ?? "").trim()));
  return JSON.stringify(titles);
}

async function expand(index) {
  const summary = page.locator(".segment-block summary").nth(Number(index));
  if (!(await summary.count())) return "no segment " + index;
  await summary.click();
  await page.waitForTimeout(300);
  const body = await page.locator(".segment-block .body").first().textContent();
  return (body ?? "(no body)").slice(0, 200);
}

async function panel(which) {
  const name = which === "diagram" ? "Diagram" : "Content";
  await page.getByRole("button", { name }).click();
  await page.waitForTimeout(700);
  return "panel: " + name;
}

/** Column or row? A layer drawing one `y` for every box is laid out across the
 *  screen — the shape this dashboard is never supposed to have. */
async function boxes() {
  const at = await page.$$eval(".scene .card rect", (rects) =>
    rects.map((rect) => ({ x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")) })));
  const xs = new Set(at.map((box) => box.x));
  const ys = new Set(at.map((box) => box.y));
  const shape = xs.size === 1 ? "COLUMN" : ys.size === 1 ? "ROW (wrong)" : "scattered";
  return at.length + " boxes · " + xs.size + " x · " + ys.size + " y · " + shape;
}

async function shot(name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = join(SHOTS, name + ".png");
  await page.screenshot({ path: file });
  return file;
}

/** One import per load. More means the app re-imports on every render — the
 *  failure that makes every panel look stale and every click look ignored. */
async function smoke() {
  const out = [await goto("/")];
  const pages = await page.$$eval(".explorer li[data-mark='leaf'] .label", (list) =>
    list.map((label) => (label.textContent ?? "").trim()));
  out.push("rows: " + (await page.$$(".explorer li[data-mark]")).length + ", pages: " + pages.length);
  if (pages.length >= 2) {
    await click(pages[0]);
    out.push('page "' + pages[0] + '": ' + await segments());
    await click(pages[1]);
    out.push('page "' + pages[1] + '": ' + await segments());
  }
  out.push(await expand(0));
  out.push(await shot("content"));
  out.push(await panel("diagram"));
  out.push("diagram: " + await boxes());
  out.push(await shot("diagram"));
  await page.waitForTimeout(2500);
  out.push("imports: " + imports + (imports > 1 ? "  <-- RENDER LOOP" : " (ok)"));
  out.push(errors.length ? "errors:\n  " + errors.join("\n  ") : "errors: none");
  return out.join("\n");
}

async function run(line) {
  const parts = line.trim().split(/\s+/);
  const command = parts[0];
  const argument = parts.slice(1).join(" ");
  if (command === "goto") return goto(argument || "/");
  if (command === "rows") return rows();
  if (command === "click") return click(argument);
  if (command === "segments") return segments();
  if (command === "expand") return expand(argument || 0);
  if (command === "panel") return panel(argument);
  if (command === "boxes") return boxes();
  if (command === "imports") return "imports since load: " + imports;
  if (command === "errors") return errors.length ? errors.join("\n") : "none";
  if (command === "ss") return shot(argument || "shot");
  if (command === "smoke") return smoke();
  if (command === "eval") return JSON.stringify(await page.evaluate(argument));
  if (!command) return "";
  return "unknown: " + command;
}

if (process.argv[2] === "smoke") {
  console.log(await smoke());
  await browser.close();
} else {
  /** Land on the app before taking commands. A REPL that opens on a blank tab
   *  answers every question with an empty list, which reads like a broken app
   *  rather than a driver waiting to be told where to go. */
  console.log(await goto("/"));
  console.log("ready · shots -> " + SHOTS);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (line.trim() === "quit") break;
    try {
      console.log(await run(line));
    } catch (error) {
      console.log("ERR " + error.message);
    }
    console.log("--");
  }
  await browser.close();
}
