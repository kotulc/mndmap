/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block, its body the element as written. A heading
 *  holds what follows it, so the graph is the document's outline; how it reads
 *  as rows is drawn, not stored (see `laid`). What is content rather than a part is no block: a list's items stay in its body, and
 *  a table is one grid of values, headed by its schema. */

import { marked, type Token, type Tokens } from "marked";
import { UNITS, base_graph, new_id, set_card, set_full, size_of, type Block, type Field,
         type Graph, type Id } from "@mnd/kit";
import {
  CODE, FLOW, FRONT, HEADING, IMAGE, KEY, LIST, MEMBER, QUOTE, ROW, TABLE,
  TEXT, with_markdown,
} from "./packages/markdown.js";
import { breaks, is_spine } from "./series.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** The fewest headings a page reads as; with fewer, their subheadings come up beside them. */
const ROWS = 3;

/** A table's cells, in units: room for a short phrase over two lines. */
const CELL = { w: 6, h: 2 };

/** What a whole cell must be to read as a number, a flag or a link. */
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const FLAG = /^(yes|no|true|false|y|n|x|✓)$/i;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$/;
const URL_ONLY = /^https?:\/\/\S+$/;


/** A document as a graph: the file as the root, one block per element, each under its heading. */
export function read(name: string, text: string): Graph {
  const graph = with_markdown(base_graph());
  const root = graph.root;
  graph.blocks[root] = { ...graph.blocks[root]!, name, source: name };

  /** The headings still open, outermost first. A heading holds what follows
   *  it until one of the same level or higher closes it. */
  const open: { id: Id; depth: number }[] = [];
  const under = (): Id => open[open.length - 1]?.id ?? root;

  const seen = new Map<string, number>();
  const mint = (kind: string): Id => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return `${kind}:${n}`;
  };

  let order = 0;
  const put = (block: Omit<Block, "order">): Block => {
    const held = { ...block, order: ++order } as Block;
    graph.blocks[held.id] = held;
    return held;
  };

  /** Each unique header row is one workspace definition: a row schema, a field per column.
   *  Tables sharing a header and its forms share it, so their rows are usages of one thing. It is
   *  named for the section its first table sits in, or for its key column outside of one — and
   *  numbered where that is taken, since two workspace definitions may not share a name. */
  const schemas = new Map<string, Id>();
  const named = new Set<string>();
  const schema_for = (headers: string[], forms: Field["form"][], name: string): Id => {
    const sign = headers.map((name, n) => `${name}:${forms[n]}`).join("\u0000");
    const known = schemas.get(sign);
    if (known) return known;
    let unique = clip(name);
    for (let n = 2; named.has(unique); n++) unique = `${clip(name)} ${n}`;
    named.add(unique);
    const id = new_id("def");
    graph.defs[id] = {
      id, group: "block", extends: ROW, name: unique,
      fields: headers.map((name, n) => ({ name, form: forms[n] ?? "text" })),
    };
    schemas.set(sign, id);
    return id;
  };

  const { front, body } = split_front(text);
  if (front) {
    put({ id: mint("front"), parent: root, type: FRONT, name: "front matter", body: front });
  }

  for (const token of marked.lexer(body)) walk(token);
  return graph;

  /** One token, filed under whichever heading is open. */
  function walk(token: Token): void {
    const parent = under();
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        while (open.length && open[open.length - 1]!.depth >= heading.depth) open.pop();
        const held = put({
          id: mint("heading"), parent: under(), type: HEADING, name: heading.text,
          body: heading.raw.trim(),
        });
        open.push({ id: held.id, depth: heading.depth });
        return;
      }
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        const lone = only_image(paragraph);
        if (lone) {
          put({
            id: mint("image"), parent, type: IMAGE, name: lone.text || "image",
            source: lone.href, body: paragraph.raw.trim(),
          });
          return;
        }
        put({
          id: mint("text"), parent, type: TEXT, name: clip(paragraph.text),
          body: paragraph.text,
        });
        return;
      }
      case "code": {
        const code = token as Tokens.Code;
        put({
          id: mint("code"), parent, type: CODE, name: code.lang || "code",
          body: code.raw.trim(),
        });
        return;
      }
      case "blockquote": {
        const quote = token as Tokens.Blockquote;
        put({
          id: mint("quote"), parent, type: QUOTE, name: clip(quote.text),
          body: quote.raw.trim(),
        });
        return;
      }
      case "list": {
        const list = token as Tokens.List;
        // Its items are content, not parts: they live in its body, as written.
        put({
          id: mint("list"), parent, type: LIST,
          name: list.ordered ? "ordered list" : tasks(list) ? "tasks" : "list",
          body: list.raw.trim(),
        });
        return;
      }
      case "table": {
        const table = token as Tokens.Table;
        const headers = table.header.map((cell, n) => cell.text || `col ${n + 1}`);
        const key = headers[0] ?? "";
        const name = clip(open.length ? graph.blocks[parent]!.name! : key || "table");
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        // Named for what it is: its section already says what it is about. Its rows are values,
        // not parts: it is one grid, headed by the schema.
        put({
          id: mint("table"), parent, type: TABLE, name: "table", fields: [field(KEY, "text", key)],
          grid: {
            rows: table.rows.length + 1, cols: headers.length, size: CELL,
            schema: schema_for(headers, forms, name),
            values: [[], ...table.rows.map((row) => row.map((cell) => cell.text.trim()))],
          },
        });
        return;
      }
      default:
        // space, def, html, a rule and anything else carry no block of their own.
        return;
    }
  }
}


/** The graph laid out as the page reads: a backbone down, each heading's content beside it.
 *
 *  The outline is drawn as rows first (see {@link inline}). Backbone blocks are stacked down the
 *  page, a unit of air under the taller card of the row above, joined by a directed flow line;
 *  each one's content sits to its right, chained to it by an undirected member line, the two
 *  sharing one centre line. A layer with no backbone — a container, a folder — stacks down the
 *  page. A table is a grid, too wide for a row: it stands in a row of its own at the backbone's
 *  left, and what follows it starts another. Cards are measured at `card`, the
 *  workspace's card size, and `full` lets one that fits its body grow past it. Drawn, never
 *  stored: the held graph keeps no positions, lines or previews to fall out of step. */
export function laid(graph: Graph, card: { w: number; h: number }, full = false): Graph {
  set_card(card.w, card.h);
  set_full(full);
  const drawn = inline(graph);
  const blocks = { ...drawn.blocks };
  const edges = { ...drawn.edges };
  const air = UNITS.unit;

  // A table's preview keeps the one card size and cuts its columns there, rather than growing to
  // list them or drawing the grid.
  for (const block of Object.values(drawn.blocks)) {
    if (drawn.blocks[block.of ?? ""]?.type !== TABLE) continue;
    blocks[block.id] = { ...block, w: UNITS.block.w * air, h: UNITS.block.h * air };
  }
  const measured = { ...drawn, blocks: { ...blocks } };
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${to}`;
    edges[id] = { id, from, to, type, ...(type === FLOW ? { dir: "forward" as const } : {}) };
  };

  const seat = (layer: Id) => {
    const held = kids(measured, layer);
    const spined = held.some(is_spine);
    const sized = held.map((block) => ({ block, size: size_of(measured, block.id) }));
    const across = pitch(measured, layer);

    // Rows first: a backbone block or a grid starts one, and content joins it.
    const rows: (typeof sized)[] = [];
    let anchor: Id | null = null;
    let last: Id | null = null;
    for (const [n, each] of sized.entries()) {
      if (!spined || !rows.length || breaks(each.block, sized[n - 1]?.block)) {
        rows.push([each]);
        if (spined && anchor) line(anchor, each.block.id, FLOW);
        if (spined) anchor = each.block.id;
        last = anchor;
      } else {
        rows[rows.length - 1]!.push(each);
        if (last) line(last, each.block.id, MEMBER);
        last = each.block.id;
      }
    }

    // Then down the page, each card centred on its row's tallest.
    let y = 0;
    for (const row of rows) {
      const tall = Math.max(...row.map(({ size }) => size.h));
      row.forEach(({ block, size }, col) => {
        blocks[block.id] = { ...block, x: col * across, y: y + (tall - size.h) / 2 };
        seat(block.id);
      });
      y += tall + air;
    }
  };

  seat(drawn.root);
  return { ...drawn, blocks, edges };
}

/** How far apart a laid layer's columns are: its widest card, and a unit of air either side. A
 *  grid stands in a row of its own, so it sets no column. */
export function pitch(graph: Graph, layer: Id): number {
  const widths = kids(graph, layer).filter((block) => !block.grid)
    .map((block) => size_of(graph, block.id).w);
  return Math.max(0, ...widths) + UNITS.unit * 2;
}


/** The outline drawn as rows: each heading previews its content beside it.
 *
 *  A heading holds its content, and opening it reads that content in full; the row beside it
 *  carries a reference to each block it holds, subheadings too, drawn as a preview. A layer with fewer than `ROWS` headings
 *  brings up their subheadings, a level at a time, so the page is never a lone row. Content ahead
 *  of any heading hangs off a reference to the layer's own block — the document, or the heading
 *  opened — seated just ahead of it. Only the drawing moves: the held graph stays the outline. */
function inline(graph: Graph): Graph {
  const blocks = { ...graph.blocks };
  const drawn = { ...graph, blocks };
  const headings = (layer: Id) => kids(drawn, layer).filter((block) => block.type === HEADING);

  const lay = (layer: Id) => {
    // Too few rows to read as a page: bring up the next level of headings.
    for (;;) {
      const held = headings(layer);
      const nested = held.flatMap((heading) => headings(heading.id));
      if (held.length >= ROWS || !nested.length) break;
      for (const block of nested) blocks[block.id] = { ...block, parent: layer };
    }

    // Each heading previews what it holds in its row, its subheadings included.
    const held = kids(drawn, layer);
    for (const heading of held.filter((block) => block.type === HEADING)) {
      for (const block of kids(drawn, heading.id)) {
        const id = `see:${block.id}`;
        blocks[id] = { id, parent: layer, of: block.id, order: block.order! };
      }
    }

    // Opening content hangs off the layer's own block, where there is a backbone to hang it on.
    const first = held.find((block) => block.type !== FRONT);
    if (first && !is_spine(first) && held.some(is_spine)) {
      const id = `self:${layer}`;
      blocks[id] = { id, parent: layer, of: layer, order: first.order! - 0.5 };
    }
    for (const block of held) lay(block.id);
  };

  lay(graph.root);
  return drawn;
}

/** A layer's blocks, in the order they were written. */
function kids(graph: Graph, parent: Id): Block[] {
  return Object.values(graph.blocks)
    .filter((block) => block.parent === parent)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

/** The front matter, and the document without it. */
function split_front(text: string): { front: string; body: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!match) return { front: "", body: text };
  return { front: match[1]!.trim(), body: text.slice(match[0].length) };
}

/** A column's form, from its filled cells: numbers, links or yes/no where every one agrees,
 *  and text otherwise. */
function form_of(cells: string[]): Field["form"] {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  if (!filled.length) return "text";
  if (filled.every((cell) => NUMBER.test(cell))) return "number";
  if (filled.every((cell) => FLAG.test(cell))) return "flag";
  if (filled.every((cell) => LINK.test(cell) || URL_ONLY.test(cell))) return "link";
  return "text";
}

/** A paragraph that is one image and nothing else. */
function only_image(paragraph: Tokens.Paragraph): Tokens.Image | null {
  const held = (paragraph.tokens ?? []).filter((token) => token.type !== "space");
  const first = held[0];
  return held.length === 1 && first?.type === "image" ? first as Tokens.Image : null;
}

function tasks(list: Tokens.List): boolean {
  return list.items.some((item) => item.task);
}

function field(name: string, form: Field["form"], value: string): Field {
  return { name, form, value };
}

/** One line of a block's text, short enough to read on a card.
 *
 *  Inline markup is dropped: a card shows what the text says, and `**this**`
 *  is how it was written rather than part of it. The body keeps the original. */
function clip(text: string, most = LABEL): string {
  const line = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // links and images, keeping the text
    .replace(/[`*_~]+/g, "")                      // emphasis, code spans, strikethrough
    .replace(/^\s*>+\s*/gm, "")                   // quote markers
    .replace(/\s+/g, " ")
    .trim();
  return line.length > most ? `${line.slice(0, most - 1)}…` : line;
}
