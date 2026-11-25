/** The diagrams a site's pages ask for. Each fence becomes a diagram that can be drawn from any
 *  published location, since its links are relative to where it lands: inline in its page, or on
 *  its own page under the assets folder.
 *
 *  | Fence | Draws |
 *  |---|---|
 *  | ```` ```mermaid ```` (a flowchart) | the flow, its `click` lines linking nodes to pages |
 *  | ```` ```sitemap ```` | the site as a treemap; options `root`, `width`, `height`, `mode` |
 *  | ```` ```cards ```` | its page as a deck of cards, one per heading; options `height`, `mode` |
 *
 *  Other Mermaid diagrams are left as they are written, for the site to render. */

import { readFileSync } from "node:fs";
import { load as yaml } from "js-yaml";
import type { Config, Mode } from "./config.js";
import { fences, type Fence } from "./fences.js";
import { deck as read_deck } from "./cards.js";
import { draw as draw_flow } from "./flow.js";
import { href, published, resolve, type Link } from "./links.js";
import { flow as read_flow, kind } from "./mermaid.js";
import { poster, type Deck } from "./render/blocks.js";
import { treemap, type MapData } from "./render/treemap.js";
import { mapped, type Page, type Site } from "./site.js";


/** A drawing and its size; a map also carries the hrefs its page script needs. */
export type Drawing = { svg: string; width: number; height: number; hrefs?: Record<string, string> };

/** One diagram: where it was asked for, how it is placed, what it links to, and how to draw it. */
export type Diagram = {
  id: string; kind: "flow" | "map" | "deck"; title: string; page: Page; fence: Fence; mode: Mode;
  links: { node: string; link: Link }[];
  map?: { data: MapData; root: string };
  deck?: { height: number; read: (from: string) => Deck };
  draw: (from: string) => Drawing;
};

/** A fence left as written, and why. */
export type Skipped = { page: Page; fence: Fence; reason: string };


/** Every diagram fence in the site, read and ready to draw. */
export async function diagrams(site: Site, config: Config): Promise<{ found: Diagram[]; skipped: Skipped[] }> {
  const found: Diagram[] = [];
  const skipped: Skipped[] = [];
  for (const page of site.pages) {
    const text = readFileSync(page.file, "utf8");
    const stem = page.path.replace(/\.mdx?$/i, "").replace(/[^\w]+/g, "-").toLowerCase();
    let n = 0;
    for (const fence of fences(text)) {
      // Only flowcharts are drawn here; other Mermaid diagrams stay for the site to render
      const type = fence.lang === "mermaid" ? await kind(fence.body) : fence.lang;
      if (type !== "sitemap" && type !== "cards" && type !== "flowchart-v2" && type !== "flowchart") {
        skipped.push({ page, fence, reason: type ? `${type} is drawn by the site` : "does not parse" });
        continue;
      }
      const mode = (["static", "interactive"] as const).find((m) => fence.options.includes(m)) ?? config.mode;
      const asked = { id: `${stem}-${++n}`, page, fence, mode, title: heading(text, fence.line) ?? page.title };
      found.push(type === "sitemap" ? map(site, config, asked) : type === "cards" ? cards(site, config, text, asked)
        : await flow(site, config, asked));
    }
  }
  return { found, skipped };
}


/** What every diagram is told about where it was asked for. */
type Asked = { id: string; page: Page; fence: Fence; mode: Mode; title: string };

/** The folder colour a linked page wears: its top-level folder's place, or 0 at the top. */
function hues(site: Site): (link: Link) => number {
  const tops = [...new Set(site.pages.map((p) => p.dir.split("/")[1]).filter((s) => s))];
  return (link) => (link.kind === "page" ? tops.indexOf(link.page.dir.split("/")[1] ?? "") + 1 : 0);
}

/** The nearest heading above a line, outside code fences, as a diagram's title. */
function heading(text: string, line: number): string | undefined {
  let fenced = false;
  let found: string | undefined;
  for (const l of text.split("\n").slice(0, line - 1)) {
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced;
    const head = !fenced && /^#{1,6}\s+(.+?)\s*#*$/.exec(l)?.[1];
    if (head) found = head.replace(/[`*_]/g, "");
  }
  return found;
}

/** A flowchart fence as a diagram: its nodes' links resolved wherever it is drawn. */
async function flow(site: Site, config: Config, asked: Asked): Promise<Diagram> {
  const graph = await read_flow(asked.fence.body);
  const hue = hues(site);
  const linked = (from: string) => new Map(graph.nodes.filter((n) => n.ref)
    .map((n) => [n.id, resolve(site, n.ref!, from, config.urls)] as const));
  const here = linked(published(asked.page.url, config.urls));
  return {
    ...asked, kind: "flow", title: graph.title || asked.title,
    links: [...here].map(([node, link]) => ({ node, link })),
    draw: (from) => draw_flow(graph, linked(from), hue, asked.id),
  };
}

/** A sitemap fence as a diagram: the site from `root`, at the size the fence or config asks. */
function map(site: Site, config: Config, asked: Asked): Diagram {
  const options = (asked.fence.body.trim() ? yaml(asked.fence.body) ?? {} : {}) as { root?: string; width?: number; height?: number; mode?: Mode };
  const root = `/${String(options.root ?? "/").replace(/^\/|\/$/g, "")}`;
  const width = Number(options.width ?? config.map.width);
  const height = Number(options.height ?? config.map.height);
  const data = mapped(site);
  const hrefs = (from: string) => Object.fromEntries(site.pages
    .map((p) => [p.url, href(from, published(p.url, config.urls), config.urls)]));
  return {
    ...asked, mode: options.mode ?? asked.mode, kind: "map", links: [], map: { data, root },
    draw: (from) => {
      const to = hrefs(from);
      const svg = treemap(data, {
        root, w: width, h: height, current: asked.page.url,
        href: (url, hash) => `${to[url] ?? url}${hash ? `#${hash}` : ""}`,
      });
      return { svg, width, height, hrefs: to };
    },
  };
}

/** A cards fence as a diagram: its page as a deck, framed by default since a deck is read by
 *  moving through it; drawn still, it is a poster whose blocks open the deck at that card. */
function cards(site: Site, config: Config, text: string, asked: Asked): Diagram {
  const options = (asked.fence.body.trim() ? yaml(asked.fence.body) ?? {} : {}) as { height?: number; mode?: Mode };
  const at = `/${config.assets}/${asked.id}.html`;
  const read = (from: string) => read_deck(site, asked.page, text, config, from,
    href(from, published(asked.page.url, config.urls), config.urls));
  const said = (["static", "interactive"] as const).find((m) => asked.fence.options.includes(m));
  return {
    ...asked, kind: "deck", mode: options.mode ?? said ?? "interactive",
    title: read(at).deck.title, links: read(published(asked.page.url, config.urls)).links,
    deck: { height: Number(options.height ?? 640), read: (from) => read(from).deck },
    draw: (from) => {
      const d = read(from);
      const svg = poster(d.deck, (id) => `${href(from, at, config.urls)}#${id}`);
      const [, , w = "0", h = "0"] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ");
      return { svg, width: Number(w), height: Number(h) };
    },
  };
}
