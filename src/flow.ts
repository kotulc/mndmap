/** A flowchart drawn in mndflow's look: nodes are cards, edges are routes, subgraphs are boxes.
 *  dagre lays it out; the drawing is one SVG string. A node that links to a page wears that page's
 *  folder colour on its border and a page icon; one whose link names no page is drawn in warn. */

import dagre, { type EdgeLabel, type NodeLabel } from "@dagrejs/dagre";
import { curveBasis, line } from "d3-shape";
import type { Link } from "./links.js";
import type { Flow, FlowNode } from "./mermaid.js";
import { esc, measure, SMALL } from "./render/text.js";


/** A drawn flow and its size. */
export type Drawn = { svg: string; width: number; height: number };

/** Padding inside a card, a line of text, and room for the icon top-right. */
const PAD = 12;
const LINE = 18;
const ICON = 16;


/** The flow as SVG. `links` holds each linked node's resolved link, `hue` a page's folder colour,
 *  and `id` keeps the drawing's marker ids unique on a page. */
export function draw(flow: Flow, links: Map<string, Link>, hue: (link: Link) => number, id: string): Drawn {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: flow.dir, nodesep: 22, ranksep: 36, edgesep: 14, marginx: 14, marginy: 14 });
  g.setDefaultEdgeLabel(() => ({}));

  // Cards sized from their text and shape, boxes round their members, labels on their edges
  for (const n of flow.nodes) g.setNode(n.id, size(n, links.has(n.id)));
  for (const c of flow.clusters) {
    g.setNode(c.id, { cluster: true, paddingTop: 26 });
    for (const m of c.members) g.setParent(m, c.id);
  }
  flow.edges.forEach((e, i) => g.setEdge(e.from, e.to, e.label
    ? { width: measure(e.label, SMALL) + 8, height: 16, labelpos: "c" } : {}, `e${i}`));
  dagre.layout(g);

  const boxes = flow.clusters.map((c) => cluster(g.node(c.id), c.title));
  const routes = flow.edges.map((e, i) => route(g.edge(e.from, e.to, `e${i}`), e, id));
  const cards = flow.nodes.map((n) => card(n, g.node(n.id), links.get(n.id), hue));
  const { width = 0, height = 0 } = g.graph();
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  const label = flow.title || flow.nodes.map((n) => n.lines.join(" ")).join(", ");
  return {
    width: w, height: h,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" class="mm mm-flow" viewBox="0 0 ${w} ${h}" width="${w}"`
      + ` role="img" aria-label="${esc(label)}"><defs>${marker(`${id}-head`)}</defs>`
      + `<rect class="mm-ground" width="${w}" height="${h}" rx="6"/>`
      + boxes.join("") + routes.join("") + cards.join("") + "</svg>",
  };
}


/** How large a card is: its widest line plus padding (and icon room when linked), grown to hold
 *  the text inside a diamond, circle or hexagon. */
function size(n: FlowNode, linked: boolean): { width: number; height: number } {
  const w = Math.max(56, ...n.lines.map((l) => measure(l))) + PAD * 2 + (linked ? ICON : 0);
  const h = n.lines.length * LINE + 16;
  if (n.shape === "diamond") return { width: w + h * 1.2, height: h + w * 0.35 };
  if (n.shape === "circle" || n.shape === "doublecircle") return { width: Math.max(w, h) + 8, height: Math.max(w, h) + 8 };
  if (n.shape === "hexagon") return { width: w + 20, height: h };
  if (n.shape === "cylinder") return { width: w, height: h + 12 };
  return { width: w, height: h };
}

/** The card's outline in its shape, centred on `x`, `y`. */
function outline(shape: string, x: number, y: number, w: number, h: number): string {
  const l = x - w / 2;
  const t = y - h / 2;
  const poly = (pts: number[][]) => `<polygon class="mm-card" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
  const rect = (r: number) => `<rect class="mm-card" x="${l}" y="${t}" width="${w}" height="${h}" rx="${r}"/>`;
  switch (shape) {
    case "round": return rect(8);
    case "stadium": return rect(h / 2);
    case "diamond": return poly([[x, t], [l + w, y], [x, t + h], [l, y]]);
    case "hexagon": return poly([[l + 12, t], [l + w - 12, t], [l + w, y], [l + w - 12, t + h], [l + 12, t + h], [l, y]]);
    case "lean_right": return poly([[l + 10, t], [l + w, t], [l + w - 10, t + h], [l, t + h]]);
    case "lean_left": return poly([[l, t], [l + w - 10, t], [l + w, t + h], [l + 10, t + h]]);
    case "trapezoid": return poly([[l + 10, t], [l + w - 10, t], [l + w, t + h], [l, t + h]]);
    case "circle": case "doublecircle":
      return `<ellipse class="mm-card" cx="${x}" cy="${y}" rx="${w / 2}" ry="${h / 2}"/>`;
    case "cylinder":
      return `<path class="mm-card" d="M${l},${t + 6}a${w / 2},6 0 0,0 ${w},0a${w / 2},6 0 0,0 ${-w},0`
        + `v${h - 12}a${w / 2},6 0 0,0 ${w},0v${-(h - 12)}"/>`;
    case "subroutine":
      return rect(2) + `<path class="mm-box" d="M${l + 6},${t}v${h}M${l + w - 6},${t}v${h}"/>`;
    default: return rect(3);
  }
}

/** A node as a card: outline, text lines (the first stronger), the link's icon, its tooltip. */
function card(n: FlowNode, at: NodeLabel, link: Link | undefined, hue: (link: Link) => number): string {
  const { x, y, width: w, height: h } = at;
  const icon = link ? ICON : 0;
  const top = y - ((n.lines.length - 1) * LINE) / 2 + 4.5;
  const text = n.lines.map((l, i) => `<text x="${x - icon / 2}" y="${top + i * LINE}"`
    + ` class="mm-mid${i ? "" : " mm-title"}">${esc(l)}</text>`).join("");
  const tip = link?.kind === "page" ? [link.page.title, n.tip ?? link.page.desc].filter(Boolean).join(" — ")
    : link?.kind === "broken" ? `Broken link: ${link.reason}` : n.tip ?? link?.ref ?? "";
  const kind = !link ? "" : link.kind === "page" ? ` mm-linked mm-h${hue(link) <= 4 ? hue(link) : 0}`
    : link.kind === "external" ? " mm-linked" : " mm-broken";
  const body = `<g class="mm-node${kind}" data-id="${esc(n.id)}">${tip ? `<title>${esc(tip)}</title>` : ""}`
    + outline(n.shape, x, y, w, h) + text + (link ? glyph(link.kind, x + w / 2 - PAD - 2, y - h / 2 + 8) : "")
    + "</g>";
  return link && link.kind !== "broken" ? `<a href="${esc(link.href)}">${body}</a>` : body;
}

/** The icon top-right: a page, an outside arrow, or a warning mark. */
function glyph(kind: Link["kind"], x: number, y: number): string {
  const d = kind === "page" ? `M${x},${y}h6l3,3v8h-9zM${x + 6},${y}v3h3`
    : kind === "external" ? `M${x + 1},${y + 9}l7,-7M${x + 3},${y + 2}h5v5`
      : `M${x + 4.5},${y + 1}v6M${x + 4.5},${y + 9.5}v.5`;
  return `<path class="mm-icon" d="${d}"/>`;
}

/** A subgraph: an outline with its title top-left, as a folder is drawn on the map. */
function cluster(at: NodeLabel, title: string): string {
  const { x, y, width: w, height: h } = at;
  return `<rect class="mm-box" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="4"/>`
    + `<text class="mm-title" x="${x - w / 2 + 10}" y="${y - h / 2 + 17}">${esc(title)}</text>`;
}

/** An edge as a smooth route, its arrowheads, and its label on a ground patch. */
function route(at: EdgeLabel, e: Flow["edges"][number], id: string): string {
  if (e.stroke === "invisible") return "";
  const d = line<{ x: number; y: number }>().x((p) => p.x).y((p) => p.y).curve(curveBasis)(at.points) ?? "";
  const style = e.stroke === "normal" ? "" : ` mm-${e.stroke}`;
  const ends = (e.head ? ` marker-end="url(#${id}-head)"` : "") + (e.tail ? ` marker-start="url(#${id}-head)"` : "");
  const path = `<path class="mm-route${style}" d="${d}"${ends} data-from="${esc(e.from)}" data-to="${esc(e.to)}"/>`;
  if (!e.label || at.x === undefined || at.y === undefined) return path;
  const lw = measure(e.label, SMALL) + 8;
  return path + `<rect class="mm-label-ground" x="${at.x - lw / 2}" y="${at.y - 8}" width="${lw}" height="16" rx="3"/>`
    + `<text x="${at.x}" y="${at.y + 4}" class="mm-label mm-mid">${esc(e.label)}</text>`;
}

/** The arrowhead every route of one drawing shares. */
function marker(id: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse"`
    + ` markerWidth="9" markerHeight="9"`
    + ` orient="auto-start-reverse"><path class="mm-head" d="M0,1L10,5L0,9z"/></marker>`;
}
