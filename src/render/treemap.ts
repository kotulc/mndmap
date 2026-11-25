/** A site drawn as a treemap: folders are boxes, pages are chips as large as what they say.
 *
 *  Shared by the build (static SVG) and the page script (zoom). Chips follow mndflow's ladder and
 *  show whole levels only: the name, then counts, then section rows, as room allows. A folder too
 *  small to give each page a readable chip is drawn closed, as one chip listing its pages. */

import { hierarchy, treemap as layout, treemapSquarify } from "d3-hierarchy";
import { esc, fit, measure, SMALL } from "./text.js";


/** A page as the map needs it: where it sits and what it says. */
export type MapPage = {
  url: string; dir: string; title: string; desc: string; words: number;
  sections: { name: string; id: string }[];
};

/** A site's pages, and its folders' titles by path. */
export type MapData = { title: string; folders: Record<string, string>; pages: MapPage[] };

/** What is drawn: the folder at `root`, `w` × `h`, linking with `href`; `zoom` makes folder titles
 *  zoom in place (the page script) rather than link to the folder's own page. */
export type MapView = {
  root: string; w: number; h: number; current?: string; zoom?: boolean;
  href: (url: string, hash?: string) => string;
};

/** A folder or a page, and the top-level folder that colours it (0: none). */
type Branch = { path: string; title: string; hue: number; page?: MapPage; kids: Branch[] };

/** A branch placed, and whether it is drawn closed. */
type Cell = { b: Branch; x: number; y: number; w: number; h: number; closed: boolean };

/** Room for a box's title, the air between cells, padding inside a chip, and one row. */
const HEAD = 24;
const AIR = 4;
const PAD = 8;
const ROW = 17;

/** The least a page weighs in words, and the least room a chip gets before its folder closes. */
const FLOOR = 150;
const LEAST = 150 * 64;


/** The folder tree under `root`, pages in it, each top-level folder numbered for its hue. */
export function branches(data: MapData, root: string): Branch {
  const tops = [...new Set(data.pages.map((p) => p.dir.split("/")[1]).filter((s) => s))];
  const hue = (path: string) => tops.indexOf(path.split("/")[1] ?? "") + 1;
  const folders = new Map<string, Branch>();
  const folder = (path: string): Branch => {
    let at = folders.get(path);
    if (at) return at;
    at = { path, title: data.folders[path] ?? data.title, hue: hue(path), kids: [] };
    folders.set(path, at);
    if (path !== "/") folder(path.slice(0, path.lastIndexOf("/")) || "/").kids.push(at);
    return at;
  };
  for (const page of data.pages) {
    folder(page.dir).kids.push({ path: page.url, title: page.title, hue: hue(page.dir), page, kids: [] });
  }
  return folders.get(root) ?? folder("/");
}

/** How many pages a branch holds, all the way down. */
export function count(b: Branch): number {
  return b.page ? 1 : b.kids.reduce((n, k) => n + count(k), 0);
}

/** The folders from the top down to `path`, for a trail. */
export function trail(data: MapData, path: string): { path: string; title: string }[] {
  const parts = path.split("/").filter(Boolean);
  return [{ path: "/", title: data.title },
    ...parts.map((_, i) => {
      const at = `/${parts.slice(0, i + 1).join("/")}`;
      return { path: at, title: data.folders[at] ?? at };
    })];
}

/** The site under `view.root` as an SVG treemap. */
export function treemap(data: MapData, view: MapView): string {
  const cells = place(branches(data, view.root), view.w, view.h);
  const body = cells.map((c) => (c.b.page ? chip(c, view) : c.closed ? shut(c, view) : box(c, view)));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mm mm-map" viewBox="0 0 ${view.w} ${view.h}"`
    + ` width="${view.w}" role="img" aria-label="${esc(`Site map: ${data.title}`)}">`
    + `<rect class="mm-ground" width="${view.w}" height="${view.h}" rx="6"/>${body.join("")}</svg>`;
}


/** A page's weight: its words, at least the floor. */
function weight(b: Branch): number {
  return b.page ? Math.max(FLOOR, b.page.words) : b.kids.reduce((n, k) => n + weight(k), 0);
}

/** Every cell under `root` filling `w` × `h`: laid once open, then again with each folder that
 *  left its pages too little room drawn closed. */
function place(root: Branch, w: number, h: number): Cell[] {
  const open = tiles(root, w, h, new Set());
  const closed = new Set(open.filter((c) => !c.b.page && (c.w * c.h) / count(c.b) < LEAST)
    .map((c) => c.b.path));
  return closed.size ? tiles(root, w, h, closed) : open;
}

/** One treemap pass, heaviest first so no chip is a sliver; boxes keep their title's room. */
function tiles(root: Branch, w: number, h: number, closed: Set<string>): Cell[] {
  const shut = (b: Branch) => closed.has(b.path);
  const tree = hierarchy(root, (b) => (shut(b) || b.page ? undefined : b.kids))
    .sum((b) => (b.page || shut(b) ? weight(b) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const boxed = (n: { depth: number; children?: unknown }) => n.depth > 0 && !!n.children;
  const laid = layout<Branch>().tile(treemapSquarify.ratio(1.3)).size([w, h]).round(true)
    .paddingInner(AIR).paddingOuter((n) => (boxed(n) ? AIR : AIR * 2))
    .paddingTop((n) => (boxed(n) ? HEAD : AIR * 2))(tree);
  return laid.descendants().slice(1).map((n) => ({
    b: n.data, x: n.x0, y: n.y0, w: n.x1 - n.x0, h: n.y1 - n.y0, closed: shut(n.data),
  }));
}

/** An open folder: an outline, its title top-left (zooming, or linking to its own page). */
function box({ b, x, y, w, h }: Cell, view: MapView): string {
  const name = fit(b.title, w - PAD * 2 - measure(` ${count(b)}`));
  const title = `<text class="mm-title" x="${x + PAD}" y="${y + 16}">${esc(name)}`
    + `<tspan class="mm-quiet"> ${count(b)}</tspan></text>`;
  const index = b.kids.find((k) => k.page?.url === b.path);
  return `<rect class="mm-box" x="${x + .5}" y="${y + .5}" width="${w - 1}" height="${h - 1}" rx="4"/>`
    + (view.zoom ? `<a data-zoom="${b.path}" tabindex="0">${title}</a>`
      : index ? `<a href="${view.href(b.path)}">${title}</a>` : title);
}

/** A page's chip: its colour edge, name, counts, then its sections as rows. */
function chip({ b, x, y, w, h }: Cell, view: MapView): string {
  const page = b.page!;
  const current = page.url === view.current ? " mm-current" : "";
  const facts = [`${page.words} words`, page.sections.length ? `${page.sections.length} sections` : ""];
  const rows = page.sections.map((s) => ({ text: s.name, href: view.href(page.url, s.id) }));
  // A static map says what a page is in a native tooltip; the page script shows a card instead
  const says = esc(page.title + (page.desc ? ` — ${page.desc}` : ""));
  const named = view.zoom ? `<a href="${view.href(page.url)}" aria-label="${says}">`
    : `<a href="${view.href(page.url)}"><title>${says}</title>`;
  return `<g class="mm-h${b.hue <= 4 ? b.hue : 0}${current}" data-url="${page.url}">`
    + named + frame(x, y, w, h) + head(page.title, "", x, y, w, h) + "</a>"
    + strip(facts.filter(Boolean), x, y, w, h) + list(rows, x, y, w, h) + "</g>";
}

/** A closed folder's chip: name and page count, then its pages as rows. */
function shut({ b, x, y, w, h }: Cell, view: MapView): string {
  const pages: MapPage[] = [];
  const walk = (at: Branch) => (at.page ? pages.push(at.page) : at.kids.forEach(walk));
  walk(b);
  const rows = pages.map((p) => ({ text: p.title, href: view.href(p.url) }));
  const name = head(b.title, "folder", x, y, w, h);
  return `<g class="mm-h${b.hue <= 4 ? b.hue : 0}" data-urls="${pages.map((p) => p.url).join(" ")}">`
    + frame(x, y, w, h)
    + (view.zoom ? `<a data-zoom="${b.path}" tabindex="0">${name}</a>` : name)
    + strip([`${pages.length} pages`], x, y, w, h) + list(rows, x, y, w, h) + "</g>";
}

/** A chip's ground and its colour edge on the left. */
function frame(x: number, y: number, w: number, h: number): string {
  return `<rect class="mm-chip" x="${x + .5}" y="${y + .5}" width="${w - 1}" height="${h - 1}" rx="3"/>`
    + `<rect class="mm-edge" x="${x}" y="${y}" width="3" height="${h}" rx="1.5"/>`;
}

/** Level 1: the name, then the kind, quieter, where both fit one line. */
function head(name: string, kind: string, x: number, y: number, w: number, h: number): string {
  if (h < 24 || w < 36) return "";
  const room = w - PAD * 2 - 3;
  const shown = fit(name, room);
  const kinds = kind && measure(`${shown} ${kind}`) <= room ? `<tspan class="mm-quiet"> ${kind}</tspan>` : "";
  return `<text class="mm-title" x="${x + PAD + 3}" y="${y + 17}">${esc(shown)}${kinds}</text>`;
}

/** Level 2: counts in quiet boxes, as many as fit whole. */
function strip(facts: string[], x: number, y: number, w: number, h: number): string {
  if (h < 50) return "";
  let at = x + PAD + 3;
  const out: string[] = [];
  for (const fact of facts) {
    const fw = measure(fact, SMALL) + 10;
    if (at + fw > x + w - PAD) break;
    out.push(`<rect class="mm-count" x="${at + .5}" y="${y + 27.5}" width="${fw}" height="16" rx="2"/>`
      + `<text class="mm-small mm-quiet" x="${at + 5}" y="${y + 39}">${esc(fact)}</text>`);
    at += fw + 4;
  }
  return out.join("");
}

/** Level 3: rows below the counts, whole rows only, the last saying how many more there are. */
function list(rows: { text: string; href: string }[], x: number, y: number, w: number, h: number): string {
  const top = y + 52;
  const room = Math.floor((y + h - PAD - top) / ROW);
  if (room < 1 || w < 90 || !rows.length) return "";
  const shown = rows.length > room ? rows.slice(0, room - 1) : rows;
  if (!shown.length) return "";
  const line = (i: number) => top + i * ROW + 12;
  return shown.map((r, i) => `<a href="${r.href}"><text class="mm-row mm-small" x="${x + PAD + 3}"`
    + ` y="${line(i)}">${esc(fit(r.text, w - PAD * 2 - 3, SMALL))}</text></a>`).join("")
    + (shown.length < rows.length ? `<text class="mm-small mm-quiet" x="${x + PAD + 3}"`
      + ` y="${line(shown.length)}">+${rows.length - shown.length} more</text>` : "");
}
