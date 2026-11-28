/** A deck of cards laid out as nested blocks: a card with parts is a box holding them in a grid,
 *  a card without is a block of fixed size. Laid out once, so the camera moves over one drawing.
 *  Shared by the build (the poster, a static picture of the deck) and the deck's page script. */

import { esc, fit } from "./text.js";


/** One card: what it is called, its one-line meaning and its detail (both HTML), what its block
 *  says closed (escaped text), where it sits, its parts, and the cards it links to. A `part` was
 *  read from a list, not a heading, so has no anchor of its own in the page. */
export type Card = {
  id: string; title: string; summary: string; body: string; face: string; depth: number;
  parent: string | null; kids: string[]; to: { id: string; label: string }[];
  hue: number; part?: boolean;
};

/** A deck: its cards by id, the root, and reading order. A site deck also carries each page's
 *  href by url, its cards' ids being the pages' urls and anchors. */
export type Deck = {
  title: string; root: string; cards: Record<string, Card>; order: string[]; source: string;
  hrefs?: Record<string, string>;
};

/** A card placed: its box in world units. */
export type Box = { x: number; y: number; w: number; h: number };

/** A block without parts, a box's padding and title room, and the gap between parts. */
export const LEAF = { w: 248, h: 128 };
const PAD = 18;
const HEAD = 84;
const GAP = 40;


/** The box of every card drawn, the root's at the origin. A card is drawn open (a box round its
 *  parts) when `open` says so, else closed (a block, its parts not drawn); by default all are open.
 *  `shape` is the width over height the layout should suit: a wide view gets more columns. */
export function lay(deck: Deck, open: (id: string) => boolean = () => true, shape = 1.6): Map<string, Box> {
  const sizes = new Map<string, { w: number; h: number }>();
  const grid = new Map<string, { cols: number[]; rows: number[]; n: number }>();

  // Sizes from the leaves up: an open box is its parts' grid plus padding and title room
  const size = (id: string): { w: number; h: number } => {
    const card = deck.cards[id]!;
    if (!card.kids.length || !open(id)) { sizes.set(id, LEAF); return LEAF; }
    const kids = card.kids.map(size);
    // Columns to suit the view: a short row of up to three when wide, else about √(parts × shape)
    const fits = Math.max(1, Math.round(Math.sqrt(kids.length * shape * (LEAF.h / LEAF.w) * 1.6)));
    const n = Math.min(kids.length, shape >= 1.2 && kids.length <= 3 ? kids.length : fits);
    const cols = Array.from({ length: n }, (_, c) => Math.max(...kids.filter((_, i) => i % n === c).map((k) => k.w)));
    const rows = Array.from({ length: Math.ceil(kids.length / n) }, (_, r) =>
      Math.max(...kids.slice(r * n, r * n + n).map((k) => k.h)));
    grid.set(id, { cols, rows, n });
    const w = Math.max(LEAF.w, PAD * 2 + cols.reduce((a, b) => a + b, 0) + GAP * (cols.length - 1));
    const h = HEAD + PAD + rows.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
    const out = { w, h };
    sizes.set(id, out);
    return out;
  };
  size(deck.root);

  // Places from the root down: each part at its grid cell, top-left aligned
  const boxes = new Map<string, Box>();
  const place = (id: string, x: number, y: number) => {
    const { w, h } = sizes.get(id)!;
    boxes.set(id, { x, y, w, h });
    const g = grid.get(id);
    if (!g) return;
    deck.cards[id]!.kids.forEach((kid, i) => {
      const c = i % g.n;
      const r = Math.floor(i / g.n);
      const kx = x + PAD + g.cols.slice(0, c).reduce((a, b) => a + b + GAP, 0);
      const ky = y + HEAD + g.rows.slice(0, r).reduce((a, b) => a + b + GAP, 0);
      place(kid, kx, ky);
    });
  };
  place(deck.root, 0, 0);
  return boxes;
}

/** The deck as a still picture: every card's box and title, each a link (by `href`). */
export function poster(deck: Deck, href: (id: string) => string): string {
  const boxes = lay(deck);
  const root = boxes.get(deck.root)!;
  const cells = deck.order.map((id) => {
    const card = deck.cards[id]!;
    const b = boxes.get(id)!;
    const box = card.kids.length;
    const hue = card.hue <= 4 ? card.hue : 0;
    const shape = box
      ? `<rect class="mm-box" x="${b.x + .5}" y="${b.y + .5}" width="${b.w - 1}" height="${b.h - 1}" rx="5"/>`
      : `<rect class="mm-chip" x="${b.x + .5}" y="${b.y + .5}" width="${b.w - 1}" height="${b.h - 1}" rx="4"/>`
        + `<rect class="mm-edge" x="${b.x}" y="${b.y}" width="3" height="${b.h}" rx="1.5"/>`;
    const title = `<text class="mm-title" x="${b.x + 14}" y="${b.y + 24}">${esc(fit(card.title, b.w - 28))}</text>`;
    const parts = box ? `<text class="mm-small mm-quiet" x="${b.x + 14}" y="${b.y + 42}">${card.kids.length} parts</text>` : "";
    return `<g class="mm-h${hue}"><a href="${href(id)}"><title>${esc(card.title)}</title>${shape}${title}</a>${parts}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mm mm-poster" viewBox="-12 -12 ${root.w + 24} ${root.h + 24}"`
    + ` width="${root.w + 24}" role="img" aria-label="${esc(deck.title)}">`
    + `<rect class="mm-ground" x="-12" y="-12" width="${root.w + 24}" height="${root.h + 24}" rx="6"/>`
    + cells.join("") + "</svg>";
}
