/** The whole site as one deck: folders hold their pages and pages hold the cards their headings
 *  make, so a reader zooms from the site to a folder, a page and its sections.
 *
 *  | Site | Card |
 *  |---|---|
 *  | the site (its home page) | the root |
 *  | a folder (its index page, if it has one) | a card holding its pages and folders |
 *  | a page | a card whose face is its `description`, holding its own deck's cards |
 *  | a link from one page to another | an unlabelled line |
 *
 *  Card ids are the addresses they stand for: a page's url (`/about`), and its url and anchor for
 *  a section (`/about#ingest`), so a host can map a card to its place in the page and back. */

import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { deck as page_deck, digest } from "./cards.js";
import type { Config } from "./config.js";
import { href, published } from "./links.js";
import type { Card, Deck } from "./render/blocks.js";
import { esc } from "./render/text.js";
import type { Site } from "./site.js";


/** The site's deck, its page links relative to `from`. */
export function site_deck(site: Site, config: Config, from: string): Deck {
  const cards: Record<string, Card> = {};
  const add = (id: string, title: string, parent: string | null): Card => {
    const card: Card = {
      id, title, summary: "", body: "", face: "", depth: 0, parent, kids: [], to: [], hue: 0,
    };
    cards[id] = card;
    if (parent) cards[parent]!.kids.push(id);
    return card;
  };

  // A folder's card, under the folder holding it
  const folder = (dir: string): string => {
    if (!cards[dir]) add(dir, site.folders[dir] ?? site.title, folder(posix.dirname(dir)));
    return dir;
  };
  add("/", site.title, null);

  // Each page's card, its own deck grafted in: the deck's root is the page, its cards go under it
  const hrefs: Record<string, string> = {};
  const reached: { node: string; url: string; hash?: string }[] = [];
  for (const page of site.pages) {
    hrefs[page.url] = href(from, published(page.url, config.urls), config.urls);
    const read = page_deck(site, page, readFileSync(page.file, "utf8"), config, from, hrefs[page.url]!);
    const own = page.url === page.dir ? cards[folder(page.dir)]! : add(page.url, page.title, folder(page.dir));

    // The page's ids made the site's: its root is the page's card, the rest the page's url and id;
    // its text's links to its own cards are renamed to match
    const named = (id: string) => (id === read.deck.root ? own.id : `${page.url}#${id}`);
    const renamed = (html: string) => html.replace(/(data-card="|href="#)([^"]+)"/g,
      (all, at: string, id: string) => (read.deck.cards[id] ? `${at}${named(id)}"` : all));
    const told = (c: Card) => ({ summary: renamed(c.summary), body: renamed(c.body) });
    const to = (c: Card) => c.to.map((t) => ({ id: named(t.id), label: t.label }));
    const top = read.deck.cards[read.deck.root]!;
    Object.assign(own, { ...told(top), face: esc(page.desc) || top.face });
    own.to.push(...to(top));

    // Its sections first, ahead of any pages already filed under a folder's index
    const sections: string[] = [];
    for (const id of read.deck.order.slice(1)) {
      const c = read.deck.cards[id]!;
      const parent = named(c.parent!);
      cards[named(id)] = { ...c, ...told(c), id: named(id), parent, kids: c.kids.map(named), to: to(c) };
      if (parent === own.id) sections.push(named(id));
    }
    own.kids = [...sections, ...own.kids];
    reached.push(...read.pages.map((p) => ({ ...p, node: named(p.node) })));
  }

  // Links between pages: to the section named when it is a card, else the page
  for (const { node, url, hash } of reached) {
    const to = hash && cards[`${url}#${hash}`] ? `${url}#${hash}` : url;
    const card = cards[node]!;
    if (cards[to] && to !== node && !card.to.some((t) => t.id === to)) card.to.push({ id: to, label: "" });
  }

  // Reading order, depth and colour from the root down; a folder without a page says what it holds
  const order: string[] = [];
  const walk = (id: string, depth: number, hue: number) => {
    const card = cards[id]!;
    Object.assign(card, { depth, hue });
    card.face ||= digest(card, [], cards);
    order.push(id);
    card.kids.forEach((k, i) => walk(k, depth + 1, depth === 0 ? i + 1 : hue));
  };
  walk("/", 0, 0);
  return { title: site.title, root: "/", cards, order, source: hrefs["/"] ?? "", hrefs };
}
