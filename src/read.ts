/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block, its body the element as written. A heading
 *  holds what follows it until the layers are shaped (see `shape`); a list holds
 *  its items, and a table its rows — each row a usage of the table's schema. */

import { marked, type Token, type Tokens } from "marked";
import { UNITS, base_graph, new_id, set_card, size_of, type Block, type Field, type Graph,
         type Id } from "@mnd/kit";
import {
  CODE, FLOW, FRONT, HEADING, IMAGE, ITEM, KEY, LEAD, LIST, MEMBER, MORE, QUOTE, ROW, RULE, TABLE,
  TEXT, with_markdown,
} from "./packages/markdown.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** How many blocks a heading's row holds before the rest are held in one. */
const CAP = 3;

/** What a whole cell must be to read as a number, a flag or a link. */
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const FLAG = /^(yes|no|true|false|y|n|x|✓)$/i;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$/;
const URL_ONLY = /^https?:\/\/\S+$/;


/** A document as a graph: the file as the root, one block per element.
 *
 *  `cap` is how many blocks a heading's row holds — see {@link gather}. */
export function read(name: string, text: string, cap = CAP): Graph {
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
   *  named for the section its first table sits in, or for its key column outside of one. */
  const schemas = new Map<string, Id>();
  const schema_for = (headers: string[], forms: Field["form"][], name: string): Id => {
    const sign = headers.map((name, n) => `${name}:${forms[n]}`).join("\u0000");
    const known = schemas.get(sign);
    if (known) return known;
    const id = new_id("def");
    graph.defs[id] = {
      id, group: "block", extends: ROW, name: clip(name),
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
  shape(graph, root, cap);
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
        const held = put({
          id: mint("list"), parent, type: LIST,
          name: list.ordered ? "ordered list" : tasks(list) ? "tasks" : "list",
          body: list.raw.trim(),
        });
        let at = 0;
        for (const item of list.items) {
          graph.blocks[mint("item")] = {
            id: `item:${seen.get("item")}`, parent: held.id, type: ITEM,
            name: clip(item.text), body: item.raw.trim(), order: ++at,
          };
        }
        return;
      }
      case "table": {
        const table = token as Tokens.Table;
        const headers = table.header.map((cell, n) => cell.text || `col ${n + 1}`);
        const key = headers[0] ?? "";
        const name = clip(open.length ? graph.blocks[parent]!.name! : key || "table");
        const held = put({
          id: mint("table"), parent, type: TABLE, name, fields: [field(KEY, "text", key)],
        });
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        const schema = schema_for(headers, forms, name);
        let at = 0;
        for (const row of table.rows) {
          graph.blocks[mint("row")] = {
            id: `row:${seen.get("row")}`, parent: held.id, type: schema,
            name: clip(row[headers.indexOf(key)]?.text ?? ""), order: ++at,
            fields: row.map((cell, n) => {
              const form = forms[n] ?? "text";
              return field(headers[n] ?? `col ${n + 1}`, form, value_of(form, cell.text));
            }),
          };
        }
        return;
      }
      case "hr":
        put({ id: mint("rule"), parent, type: RULE, name: "rule" });
        return;
      default:
        // space, def, html and anything else carry no block of their own.
        return;
    }
  }
}


/** Shape each layer into a backbone of headings, each with a row of its content.
 *
 *  A heading holding no subheading gives its content up to the layer, where it
 *  sits beside the heading as a row; so does a layer's lone heading, the page's
 *  title. A heading holding subheadings stays a layer of its own, shaped the
 *  same way. Only headings dissolve: a list owns its items and a table its rows. */
function shape(graph: Graph, layer: Id, cap: number): void {
  dissolve(graph, layer);
  gather(graph, layer, cap);
  for (const block of kids(graph, layer)) {
    if (block.type === HEADING && kids(graph, block.id).length) shape(graph, block.id, cap);
  }
}

/** Bring up the content of every heading on the layer that needs no layer of its own. */
function dissolve(graph: Graph, layer: Id): void {
  for (;;) {
    const headings = kids(graph, layer).filter((block) => block.type === HEADING);
    const loose = headings.filter((heading) => {
      const held = kids(graph, heading.id);
      return held.length && (headings.length === 1 || !held.some((k) => k.type === HEADING));
    });
    if (!loose.length) return;
    for (const heading of loose) {
      for (const child of kids(graph, heading.id)) graph.blocks[child.id]!.parent = layer;
    }
  }
}

/** Anchor each run of content on the layer, and hold what passes the cap in one block.
 *
 *  A run hangs off the heading or rule before it. Content ahead of any gets a
 *  lead to hang off. A run over `cap` keeps `cap - 1` in its row, and the rest
 *  goes into a `more` block in the last seat. */
function gather(graph: Graph, layer: Id, cap: number): void {
  const runs: { anchor: Block | null; members: Block[] }[] = [{ anchor: null, members: [] }];
  for (const block of kids(graph, layer)) {
    if (block.type === HEADING || block.type === RULE) runs.push({ anchor: block, members: [] });
    else if (block.type !== FRONT) runs[runs.length - 1]!.members.push(block);
  }

  for (const { anchor, members } of runs) {
    const [first] = members;
    if (!first) continue;

    // Opening content hangs off a lead, seated just ahead of it.
    if (!anchor) {
      const id = `lead:${layer}`;
      graph.blocks[id] = { id, parent: layer, type: LEAD, name: "lead", order: first.order! - 0.5 };
    }

    // Past the cap, the rest of the run is one block that holds it.
    if (members.length <= cap) continue;
    const rest = members.slice(cap - 1);
    const id = `more:${rest[0]!.id}`;
    graph.blocks[id] = {
      id, parent: layer, type: MORE, name: `+${rest.length} more`, order: rest[0]!.order!,
    };
    for (const member of rest) graph.blocks[member.id]!.parent = id;
  }
}

/** Whether a block sits in the backbone column rather than in a row. */
function is_spine(block: Block): boolean {
  return [HEADING, RULE, FRONT, LEAD].includes(block.type ?? "");
}

/** The graph laid out as the page reads: a backbone down, each block's content across.
 *
 *  Backbone blocks are stacked down the page, a unit of air under the tallest card of the row
 *  above, joined by a directed flow line; each one's row follows to its right, a column as wide as
 *  the layer's widest card, chained to it and to one another by undirected member lines. A layer
 *  with no backbone — a list, a table, a `more` block, a folder — stacks down the page. Cards are
 *  measured at `card`, the workspace's card size, since one that fits its body grows past it.
 *  Drawn, never stored: the held graph keeps no positions or lines to fall out of step. */
export function laid(graph: Graph, card: { w: number; h: number }): Graph {
  set_card(card.w, card.h);
  const blocks = { ...graph.blocks };
  const edges = { ...graph.edges };
  const air = UNITS.unit;
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${to}`;
    edges[id] = { id, from, to, type, ...(type === FLOW ? { dir: "forward" as const } : {}) };
  };

  const seat = (layer: Id) => {
    const held = kids(graph, layer);
    const spined = held.some(is_spine);
    const sized = held.map((block) => ({ block, size: size_of(graph, block.id) }));
    const across = Math.max(0, ...sized.map(({ size }) => size.w)) + air * 2;
    let y = 0;
    let tall = -1;
    let col = 0;
    let anchor: Id | null = null;
    let last: Id | null = null;

    for (const { block, size } of sized) {
      if (!spined || is_spine(block)) {
        if (tall >= 0) y += tall + air;
        tall = 0;
        col = 0;
        if (spined && anchor) line(anchor, block.id, FLOW);
        if (spined) anchor = block.id;
        last = anchor;
      } else {
        col += 1;
        if (last) line(last, block.id, MEMBER);
        last = block.id;
      }
      tall = Math.max(tall, size.h);
      blocks[block.id] = { ...block, x: col * across, y };
      seat(block.id);
    }
  };

  seat(graph.root);
  return { ...graph, blocks, edges };
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

/** A cell's value in its column's form: a link keeps its markdown, text and target both, and a flag
 *  reads true or false. */
function value_of(form: Field["form"], text: string): string {
  const cell = text.trim();
  if (form === "link") return cell;
  if (form === "flag") return String(/^(yes|true|y|x|✓)$/i.test(cell));
  if (form === "number") return cell.replace(/,/g, "");
  return text;
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
function clip(text: string): string {
  const line = text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // links and images, keeping the text
    .replace(/[`*_~]+/g, "")                      // emphasis, code spans, strikethrough
    .replace(/^\s*>+\s*/gm, "")                   // quote markers
    .replace(/\s+/g, " ")
    .trim();
  return line.length > LABEL ? `${line.slice(0, LABEL - 1)}…` : line;
}
