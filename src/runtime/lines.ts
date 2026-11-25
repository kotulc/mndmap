/** The deck's relationships as lines between the cards drawn. Each end rises to the nearest card
 *  drawn (a link from inside a closed card starts at that card, as mndflow lines rise to the
 *  nearest drawn block), and links landing on the same pair merge into one line. Shown are the
 *  lines touching the card in focus (lit, labelled) and those between the cards it frames. Lines
 *  run under the cards and their labels over them; they draw themselves in, one after another. */

import type { Box, Deck } from "../render/blocks.js";
import { esc, measure } from "../render/text.js";


/** A line between two drawn cards, and what it says. */
type Line = { from: string; to: string; label: string; lit: boolean };


/** The lines in view with `focus` in focus, `frame` the card framed and `drawn` every card's box. */
export function lines(deck: Deck, focus: string, frame: string, drawn: Map<string, Box>): Line[] {
  const holds = (a: string, b: string) => {
    for (let at: string | null = b; at; at = deck.cards[at]!.parent) if (at === a) return true;
    return false;
  };
  const rise = (id: string) => {
    let at: string | null = id;
    while (at && !drawn.has(at)) at = deck.cards[at]!.parent;
    return at;
  };
  const framed = new Set(deck.cards[frame]!.kids);

  const pairs = new Map<string, Line & { n: number }>();
  for (const c of Object.values(deck.cards)) {
    for (const t of c.to) {
      const from = rise(c.id);
      const to = rise(t.id);
      if (!from || !to || holds(from, to) || holds(to, from)) continue;
      const lit = from === focus || to === focus;
      if (!lit && !(framed.has(from) && framed.has(to))) continue;
      // A label that only repeats where the line goes says nothing
      const label = t.label.toLowerCase() === deck.cards[t.id]!.title.toLowerCase() ? "" : t.label;
      const key = `${from}>${to}`;
      const had = pairs.get(key);
      if (had) { had.n++; had.lit ||= lit; had.label ||= label; } else pairs.set(key, { from, to, label, lit, n: 1 });
    }
  }
  return [...pairs.values()].map(({ n, ...line }) =>
    ({ ...line, label: n > 1 ? `${line.label || "links"} +${n - 1}` : line.label }));
}

/** The lines as SVG paths, each from the side of one box facing the other, and the lit ones'
 *  labels midway. `k` is the text's counter-scale, so labels read at the same size at any zoom. */
export function draw(found: Line[], boxes: Map<string, Box>, k: number, focus: string): { paths: string; labels: string } {
  const drawn = found.map((l) => {
    const [p, q, c1, c2] = ends(boxes.get(l.from)!, boxes.get(l.to)!);
    // A lit line is labelled near the card in focus, so the label stays in view as the line leaves it
    const mid = bezier(p, c1, c2, q, l.from === focus ? .28 : l.to === focus ? .72 : .5);
    const size = 11 * k;
    const lw = measure(l.label, size) + 10 * k;
    const label = l.lit && l.label ? `<g class="mm-line-label${l.lit ? " mm-lit" : ""}"><rect x="${mid.x - lw / 2}" y="${mid.y - size}"`
      + ` width="${lw}" height="${size * 2}" rx="${3 * k}"/><text x="${mid.x}" y="${mid.y + size * .35}"`
      + ` style="font-size:${size}px">${esc(l.label)}</text></g>` : "";
    const path = `<path class="mm-line${l.lit ? " mm-lit" : ""}" pathLength="1"`
      + ` d="M${p.x},${p.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}"/>`;
    return { path, label };
  });
  return { paths: drawn.map((d) => d.path).join(""), labels: drawn.map((d) => d.label).join("") };
}

/** Draw the lines in: each stroke traced from its start, one by one, the labels fading in after. */
export function trace(paths: SVGElement, labels: SVGElement, delay: number, reduce: boolean) {
  if (reduce) return;
  const all = [...paths.querySelectorAll<SVGPathElement>(".mm-line")];
  all.forEach((path, i) => path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 650, delay: delay + i * 110, easing: "cubic-bezier(.3,0,.2,1)", fill: "backwards" }));
  labels.querySelectorAll(".mm-line-label").forEach((g) => g.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: 260, delay: delay + all.length * 110 + 300, fill: "backwards" }));
}


type Point = { x: number; y: number };

/** Start, end and control points: out of the sides that face each other, across or down. */
function ends(a: Box, b: Box): [Point, Point, Point, Point] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (a.h + b.h)) {
    const p = { x: dx > 0 ? a.x + a.w : a.x, y: a.y + a.h / 2 };
    const q = { x: dx > 0 ? b.x : b.x + b.w, y: b.y + b.h / 2 };
    const bend = Math.max(36, Math.abs(q.x - p.x) / 2) * Math.sign(dx || 1);
    return [p, q, { x: p.x + bend, y: p.y }, { x: q.x - bend, y: q.y }];
  }
  const p = { x: a.x + a.w / 2, y: dy > 0 ? a.y + a.h : a.y };
  const q = { x: b.x + b.w / 2, y: dy > 0 ? b.y : b.y + b.h };
  const bend = Math.max(36, Math.abs(q.y - p.y) / 2) * Math.sign(dy || 1);
  return [p, q, { x: p.x, y: p.y + bend }, { x: q.x, y: q.y - bend }];
}

/** A point along a cubic curve. */
function bezier(p: Point, c1: Point, c2: Point, q: Point, t: number): Point {
  const u = 1 - t;
  const at = (a: number, b: number, c: number, d: number) => u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t ** 3 * d;
  return { x: at(p.x, c1.x, c2.x, q.x), y: at(p.y, c1.y, c2.y, q.y) };
}
