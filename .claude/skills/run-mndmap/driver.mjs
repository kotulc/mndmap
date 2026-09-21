/** Drive the running mndmap dashboard.
 *
 *  The dashboard is one static page: translate, edit and emit all happen in
 *  the browser, and there is no server to ask. Most of what breaks here is
 *  invisible to `tsc` and to the round trip — a panel that never renders, a
 *  gesture wired to an edit the kit never sends, a tree drowning in cells.
 *  This opens it in a real browser and pokes it.
 *
 *  One-shot:  node .claude/skills/run-mndmap/driver.mjs smoke
 *  REPL:      node .claude/skills/run-mndmap/driver.mjs   (commands on stdin)
 *
 *  Commands: goto [query] | rows | click <text> | tray | rename <text> |
 *            tag <text> | chips | pick [n] | undo | emit | boxes | errors |
 *            ss <name> | eval <js> | smoke | quit
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.MNDMAP_URL ?? "http://localhost:7342";
/** Nothing: the dev server opens on `samples/workspace.json` by itself.
 *  Set it to `?file=/samples/map.json` or `/samples/req.json` for a corpus
 *  that shows a different part of the map. */
const FILE = process.env.MNDMAP_FILE ?? "";
const SHOTS = process.env.MNDMAP_SHOTS ?? join(tmpdir(), "mndmap-shots");
const DOWNLOADS = join(tmpdir(), "mndmap-downloads");

/** Playwright is harness tooling, not a project dependency — it is installed
 *  beside the repo so taking a screenshot never edits `package.json`. */
async function load_playwright() {
  const roots = [process.env.MNDMAP_PW, join(tmpdir(), "mndmap-run-harness")].filter(Boolean);
  for (const root of roots) {
    for (const entry of ["index.mjs", "index.js"]) {
      const full = join(root, "node_modules", "playwright", entry);
      if (existsSync(full)) return import(pathToFileURL(full).href);
    }
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

const loaded = await load_playwright();
const chromium = loaded.chromium ?? loaded.default?.chromium;
if (!chromium) throw new Error("playwright loaded but exposes no chromium");

const executablePath = chrome_path();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });

const errors = [];
page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !/404/.test(message.text())) errors.push("console: " + message.text());
});


async function goto(query) {
  errors.length = 0;
  await page.goto(BASE + "/" + (query ?? FILE), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".side li", { timeout: 20000 });
  await page.waitForTimeout(600);
  return "loaded " + BASE + "/" + (query ?? FILE);
}

/** Every row the tree offers. A cell, an item or a fence showing up here is
 *  the bug this answers: the tree is sets, pages and sections and no more. */
async function rows() {
  const found = await page.$$eval(".side li[data-mark]", (list) =>
    list.map((row) => ({
      mark: row.getAttribute("data-mark"),
      label: (row.querySelector(".label")?.textContent ?? "").trim(),
      picked: row.classList.contains("picked"),
    })));
  return found.length + " rows\n" + JSON.stringify(found.slice(0, 40), null, 1);
}

async function click(label) {
  const row = page.locator(".side li", { hasText: label }).first();
  if (!(await row.count())) return 'no row matching "' + label + '"';
  await row.click();
  await page.waitForTimeout(400);
  return "clicked " + label + " -> " + (await page.locator(".tray h2").textContent().catch(() => "(nothing)"));
}

/** What the tray says about what is picked. */
async function tray() {
  const out = {
    name: await page.locator(".tray h2").textContent().catch(() => null),
    kind: await page.locator(".tray .kind").textContent().catch(() => null),
    tags: await page.locator(".tray .tag:not(.offered)").allTextContents(),
    fields: await page.locator(".tray .fields dt").allTextContents(),
    body: ((await page.locator(".tray .body").textContent().catch(() => "")) ?? "").slice(0, 160),
    holds: await page.locator(".tray .holds li").count(),
    relations: await page.locator(".tray .relations li").count(),
  };
  return JSON.stringify(out, null, 1);
}

async function rename(name) {
  await page.locator(".tray h2").dblclick();
  const box = page.locator(".tray > header input");
  await box.fill(name);
  await box.press("Enter");
  await page.waitForTimeout(300);
  return "named " + (await page.locator(".tray h2").textContent());
}

async function tag(name) {
  const box = page.locator(".tray .tags input");
  await box.fill(name);
  await box.press("Enter");
  await page.waitForTimeout(300);
  return JSON.stringify(await page.locator(".tray .tag:not(.offered)").allTextContents());
}

/** What the sidecar offers here. Empty without `?suggestions=`. */
async function chips() {
  return JSON.stringify({
    names: await page.locator(".tray .chips .chip").allTextContents(),
    tags: await page.locator(".tray .tag.offered").allTextContents(),
  });
}

async function pick(index) {
  const chip = page.locator(".tray .chips .chip").nth(Number(index) || 0);
  if (!(await chip.count())) return "no chip " + index;
  await chip.click();
  await page.waitForTimeout(300);
  return "picked -> " + (await page.locator(".tray h2").textContent());
}

async function undo() {
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(300);
  return "undone -> " + (await page.locator(".tray h2").textContent().catch(() => "(nothing)"));
}

/** The whole point of the run: a folder in, a zip out. */
async function emit() {
  mkdirSync(DOWNLOADS, { recursive: true });
  const wait = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Emit" }).click();
  const download = await wait;
  const target = join(DOWNLOADS, download.suggestedFilename());
  await download.saveAs(target);
  return "zip: " + target + "  (" + (await page.locator(".status").first().textContent().catch(() => "")) + ")";
}

/** Where the cards actually landed on screen. React Flow places each node
 *  with a transform, so a node measured at zero size or outside the panel
 *  means the base stylesheet never loaded and everything is in document flow.
 *  That has shipped for real, and it reads as an empty canvas. */
async function boxes() {
  const found = await page.$$eval(".canvas .react-flow__node", (nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { frame: node.className.includes("frame"), x: Math.round(box.x), y: Math.round(box.y),
               w: Math.round(box.width), h: Math.round(box.height) };
    }));
  const panel = await page.$eval(".canvas", (el) => {
    const box = el.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  });
  const cards = found.filter((box) => !box.frame);
  const outside = cards.filter((box) =>
    box.y < panel.top - box.h || box.y > panel.bottom || box.x > panel.right || box.w === 0);
  const xs = new Set(cards.map((box) => box.x));
  const ys = new Set(cards.map((box) => box.y));
  const shape = cards.length < 2 ? "one" : xs.size === 1 ? "COLUMN" : ys.size === 1 ? "ROW" : "scattered";
  return cards.length + " cards · " + xs.size + " x · " + ys.size + " y · " + shape
    + (outside.length ? "  <-- " + outside.length + " OFF PANEL (react-flow css missing?)" : "  (all on panel)");
}

async function shot(name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = join(SHOTS, name + ".png");
  await page.screenshot({ path: file });
  return file;
}

async function smoke() {
  const out = [await goto()];
  out.push(await rows());
  const first = await page.$$eval(".side li[data-mark] .label", (list) =>
    list.map((label) => (label.textContent ?? "").trim()).filter(Boolean));
  if (first[1]) {
    out.push(await click(first[1]));
    out.push(await tray());
    out.push(await rename("Driven"));
    out.push(await tag("driven"));
    out.push(await undo());
    out.push(await undo());
  }
  out.push("canvas: " + await boxes());
  out.push(await shot("app"));
  out.push(await emit());
  out.push(errors.length ? "errors:\n  " + errors.join("\n  ") : "errors: none");
  return out.join("\n");
}

async function run(line) {
  const parts = line.trim().split(/\s+/);
  const command = parts[0];
  const argument = parts.slice(1).join(" ");
  if (command === "goto") return goto(argument);
  if (command === "rows") return rows();
  if (command === "click") return click(argument);
  if (command === "tray") return tray();
  if (command === "rename") return rename(argument);
  if (command === "tag") return tag(argument);
  if (command === "chips") return chips();
  if (command === "pick") return pick(argument);
  if (command === "undo") return undo();
  if (command === "emit") return emit();
  if (command === "boxes") return boxes();
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
  console.log(await goto());
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
