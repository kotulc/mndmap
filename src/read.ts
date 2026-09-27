/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block, its body the element as written. A heading
 *  holds what follows it, so the graph is the document's outline; how it reads
 *  as one page of rows is drawn, not stored (see `laid`). What is content rather than a part is
 *  no block: a list's items stay in its body, and a table is one grid of values, headed by its
 *  schema. */

import { marked, type Token, type Tokens } from "marked";
import { UNITS, base_graph, new_id, set_card, set_full, size_of, type Block, type Field,
         type Graph, type Id } from "@mnd/kit";
import {
  CODE, FLOW, FRONT, HEADING, IMAGE, KEY, LIST, MEMBER, QUOTE, TABLE,
  TEXT, with_markdown,
} from "./packages/markdown.js";
import { is_spine, rows } from "./series.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** How many lines make a fence or list too long for a card, so it is opened to be read. */
const LONG = 12;

/** What names a focus block's preview on the page. */
const SEE = "see:";

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
      id, group: "block", extends: "block", name: unique,
      fields: headers.map((name, n) => ({ name, form: forms[n] ?? "text" })),
    };
    schemas.set(sign, id);
    return id;
  };

  const { front, body } = split_front(text);
  if (front) {
    put({ id: mint("front"), parent: root, type: FRONT, name: "frontmatter", body: front });
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
 *  The document is drawn as one page (see {@link paged}). Backbone blocks are stacked down the
 *  page, a unit of air under the taller card of the row above, each heading stepped right a
 *  column for each level it is nested; a flow line runs to each from its parent or the sibling
 *  before it. Content starts the column right of its heading, chained to it by an undirected
 *  member line, the two sharing one centre line. A layer with no backbone — an opened focus, a folder —
 *  stacks down the page, a row a block. Cards are measured at `card`, the workspace's card size,
 *  and `full` lets one that fits its body grow past it. Drawn, never stored: the held graph keeps
 *  no positions, lines or previews to fall out of step. */
export function laid(graph: Graph, card: { w: number; h: number }, full = false): Graph {
  set_card(card.w, card.h);
  set_full(full);
  const drawn = paged(graph);
  const blocks = { ...drawn.blocks };
  const edges = { ...drawn.edges };
  const air = UNITS.unit;

  // A table's preview keeps the one card size and cuts its columns there.
  for (const block of Object.values(drawn.blocks)) {
    if (drawn.blocks[block.of ?? ""]?.type !== TABLE) continue;
    blocks[block.id] = { ...block, w: UNITS.block.w * air, h: UNITS.block.h * air };
  }
  const measured = { ...drawn, blocks: { ...blocks } };
  const size = (id: Id) => size_of(measured, id);
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${to}`;
    edges[id] = { id, from, to, type, ...(type === FLOW ? { dir: "forward" as const } : {}) };
  };

  const seat = (layer: Id) => {
    const held = rows(measured, layer);
    // Each level of heading steps right a backbone column, and its content starts the next one.
    const lane = Math.max(0, ...held.map((row) => size(row.anchor).w)) + air * 2;
    const step = (id: Id) => lane * depth(graph, id);
    const across = pitch(measured, layer);
    const anchors: { id: Id; depth: number }[] = [];
    let y = 0;
    for (const row of held) {
      // Flow runs from the last backbone block as shallow or shallower: a parent or a sibling.
      const deep = depth(graph, row.anchor);
      const from = anchors.findLast((each) => each.depth <= deep);
      if (from) line(from.id, row.anchor, FLOW);
      anchors.push({ id: row.anchor, depth: deep });

      // Each card centred on the row's tallest.
      const tall = Math.max(...row.cards.map((id) => size(id).h));
      row.cards.forEach((id, col) => {
        const x = col ? step(row.anchor) + lane + (col - 1) * across : step(id);
        blocks[id] = { ...blocks[id]!, x, y: y + (tall - size(id).h) / 2 };
        if (col) line(row.cards[col - 1]!, id, MEMBER);
        seat(id);
      });
      y += tall + air;
    }
  };

  seat(drawn.root);
  return { ...drawn, blocks, edges };
}

/** How many headings a block sits under. */
export function depth(graph: Graph, id: Id): number {
  let n = 0;
  for (let at = graph.blocks[id]?.parent; at && graph.blocks[at]?.type === HEADING;
       at = graph.blocks[at]?.parent) n++;
  return n;
}

/** How far apart a laid layer's content columns are: its widest content card, and a unit of air
 *  either side. On a layer with no backbone, every card is content. */
export function pitch(graph: Graph, layer: Id): number {
  const held = kids(graph, layer);
  const content = held.some(is_spine) ? held.filter((block) => !is_spine(block)) : held;
  const widths = content.map((block) => size_of(graph, block.id).w);
  return Math.max(0, ...widths) + UNITS.unit * 2;
}

/** The card the page draws for a held block: its preview, where it is a focus. */
export function seen_as(view: Graph, id: Id): Id {
  return view.blocks[`${SEE}${id}`] ? `${SEE}${id}` : id;
}


/** Whether a block is opened to be read rather than read in its row: a table, or a fence or list
 *  too long for a card. */
function is_focus(block: Block): boolean {
  const long = (block.body ?? "").split("\n").length >= LONG;
  return block.type === TABLE || ([CODE, LIST].includes(block.type ?? "") && long);
}

/** The document drawn as one page.
 *
 *  A heading holds its section, but draws as the row it heads rather than a layer to open: all it
 *  holds, subheadings too, comes up to the page in reading order. A focus block draws there as a
 *  preview, and holds itself, so opening the preview reads it alone. Content ahead of any heading
 *  hangs off a reference to the document, seated just ahead of it. Only the drawing moves: the
 *  held graph stays the outline. */
function paged(graph: Graph): Graph {
  const blocks = { ...graph.blocks };
  const root = graph.root;
  let order = 0;

  const up = (layer: Id) => {
    for (const block of kids(graph, layer)) {
      const at = ++order;
      if (is_focus(block)) {
        const id = `${SEE}${block.id}`;
        blocks[id] = { id, parent: root, of: block.id, order: at };
        blocks[block.id] = { ...block, parent: id, order: 0 };
      } else {
        blocks[block.id] = { ...block, parent: root, order: at };
      }
      if (block.type === HEADING) up(block.id);
    }
  };
  up(root);

  const held = kids({ ...graph, blocks }, root);
  const first = held.find((block) => block.type !== FRONT);
  if (first && !is_spine(first) && held.some(is_spine)) {
    const id = `self:${root}`;
    blocks[id] = { id, parent: root, of: root, order: first.order! - 0.5 };
  }
  return { ...graph, blocks };
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
