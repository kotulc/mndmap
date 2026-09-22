/** Drive: docs → page → Tables grid, then Lists group. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

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

function chrome_path() {
  if (process.env.MNDMAP_CHROME) return process.env.MNDMAP_CHROME;
  const home = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ms-playwright")
    : join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(home)) return undefined;
  const builds = readdirSync(home)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const build of builds) {
    for (const relative of ["chrome-win64/chrome.exe", "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const full = join(home, build, relative);
      if (existsSync(full)) return full;
    }
  }
  return undefined;
}

async function nodes(page) {
  return page.$$eval(".react-flow__node", (list) =>
    list.map((el) => ({
      id: el.getAttribute("data-id"),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
      y: Math.round(el.getBoundingClientRect().y),
      cls: el.className.toString().slice(0, 60),
    })).sort((a, b) => a.y - b.y));
}

async function enter(page, id) {
  const card = page.locator(`.react-flow__node[data-id="${id}"]`);
  await card.waitFor({ state: "visible", timeout: 5000 });
  const box = await card.boundingBox();
  if (!box) throw new Error("no box for " + id);
  await page.mouse.dblclick(box.x + Math.min(20, box.width / 2), box.y + Math.min(20, box.height / 2));
  await page.waitForTimeout(800);
}

const loaded = await load_playwright();
const chromium = loaded.chromium ?? loaded.default?.chromium;
const executablePath = chrome_path();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const shots = join(tmpdir(), "mndmap-shots");
mkdirSync(shots, { recursive: true });
const report = { steps: [] };

async function shot(name) {
  const crumb = await page.locator(".crumbs").textContent().catch(() => null);
  const n = await nodes(page);
  const tray = await page.locator(".tray").innerText().catch(() => "");
  const step = { name, crumb, count: n.length, nodes: n, tray: tray.slice(0, 400) };
  report.steps.push(step);
  await page.screenshot({ path: join(shots, name + ".png"), fullPage: false });
  console.log(JSON.stringify({ name, crumb, count: n.length, nodes: n.map(x => ({ id: x.id, text: x.text, y: x.y })) }, null, 2));
}

await page.goto("http://localhost:7342/?file=workspace.json", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".explorer li", { timeout: 20000 });
await page.waitForTimeout(600);

await page.locator(".explorer li", { hasText: "Map fixture" }).first().click();
await page.waitForTimeout(300);
await enter(page, "page:index.md");
await shot("page-sections");

await enter(page, "sec:index.md#map-fixture/tables");
await shot("tables-layer");

await page.locator(".crumbs button", { hasText: "Map fixture" }).click();
await page.waitForTimeout(600);
await enter(page, "sec:index.md#map-fixture/lists");
await shot("lists-layer");

await page.locator(".crumbs button", { hasText: "Map fixture" }).click();
await page.waitForTimeout(600);
await enter(page, "sec:index.md#map-fixture/tasks");
await shot("tasks-layer");

await page.locator(".crumbs button", { hasText: "Map fixture" }).click();
await page.waitForTimeout(600);
await enter(page, "sec:index.md#map-fixture/fences");
await shot("fences-layer");

writeFileSync(join(shots, "content-drive.json"), JSON.stringify(report, null, 2));
console.log("shots in", shots);
await browser.close();
