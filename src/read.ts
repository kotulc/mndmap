/** One markdown document, read into blocks.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under
 *  the definition that describes it. What a block *means* is the markdown
 *  package's business, not this reader's — so a new element is a definition
 *  there plus one line here, and nothing else moves.
 *
 *  Every element is its own block, its body the element as written. A heading
 *  holds what follows it until the layers are shaped (see `shape`). What is
 *  content rather than a part is no block: a list's items stay in its body, and
 *  a table holds one grid of values, headed by its schema. */

import { marked, type Token, type Tokens } from "marked";
import { UNITS, base_graph, new_id, set_card, set_full, size_of, type Block, type Field,
         type Graph, type Id } from "@mnd/kit";
import {
  CODE, FLOW, FRONT, HEADING, IMAGE, KEY, LEAD, LIST, MEMBER, MORE, QUOTE, ROW, TABLE,
  TEXT, with_markdown,
} from "./packages/markdown.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** How much of a name a container lists: one line of the default card, its bullet besides. */
const LISTED = 26;

/** A table's cells, in units: room for a short phrase over two lines. */
const CELL = { w: 6, h: 2 };

/** What markdown reads as its own syntax, escaped where a name is listed as text. */
const MARKUP = /([\\`*_{}[\]()#+\-.!>|~])/g;

/** What a whole cell must be to read as a number, a flag or a link. */
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const FLAG = /^(yes|no|true|false|y|n|x|✓)$/i;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$/;
const URL_ONLY = /^https?:\/\/\S+$/;


/** A document as a graph: the file as the root, one block per element.
 *
 *  See {@link shape} for how each layer is arranged. */
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
  shape(graph, root);
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
        // Named for what it is: its section already says what it is about.
        const held = put({
          id: mint("table"), parent, type: TABLE, name: "table", fields: [field(KEY, "text", key)],
        });
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        // Its rows are values, not parts: one grid block in its layer, headed by the schema.
        const id = `grid:${held.id}`;
        graph.blocks[id] = {
          id, parent: held.id, type: "grid", name: `${table.rows.length} rows`,
          x: 0, y: 0, order: 1,
          grid: {
            rows: table.rows.length + 1, cols: headers.length, size: CELL,
            schema: schema_for(headers, forms, name),
            values: [[], ...table.rows.map((row) => row.map((cell) => cell.text.trim()))],
          },
        };
        return;
      }
      default:
        // space, def, html, a rule and anything else carry no block of their own.
        return;
    }
  }
}


/** Shape each layer into a backbone of headings, each with a row of its content.
 *
 *  Every heading reads the same way: a card on the backbone, its content beside it. A heading
 *  holding no subheading gives its content up to the layer, where it sits beside the heading as
 *  a row; so does a layer's lone heading, the page's title. A heading holding subheadings hands
 *  its whole section to one container beside it, shaped the same way. Only headings dissolve: a
 *  list owns its items and a table its rows. */
function shape(graph: Graph, layer: Id): void {
  dissolve(graph, layer);
  const sections = kids(graph, layer)
    .filter((block) => block.type === HEADING && kids(graph, block.id).length)
    .map((heading) => section(graph, layer, heading.id));
  gather(graph, layer);
  for (const id of sections) shape(graph, id);
}

/** A heading's section, moved into one container beside it. */
function section(graph: Graph, layer: Id, heading: Id): Id {
  const held = kids(graph, heading);
  const id = `more:${heading}`;
  graph.blocks[id] = {
    id, parent: layer, type: MORE, name: `${held.length} blocks`, order: held[0]!.order!,
    body: listed(held),
  };
  for (const block of held) graph.blocks[block.id]!.parent = id;
  return id;
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

/** Anchor each run of content on the layer: one block beside its heading, and more than one held
 *  in a container, so the backbone is two columns — headings, and their content.
 *
 *  A run hangs off the heading before it. Content ahead of any gets a lead to hang off. A container
 *  is named for how many it holds, and its body lists them. */
function gather(graph: Graph, layer: Id): void {
  const runs: { anchor: Block | null; members: Block[] }[] = [{ anchor: null, members: [] }];
  for (const block of kids(graph, layer)) {
    if (block.type === HEADING) runs.push({ anchor: block, members: [] });
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

    // More than one, and the run is one block that holds it.
    if (members.length === 1) continue;
    const id = `more:${first.id}`;
    graph.blocks[id] = {
      id, parent: layer, type: MORE, name: `${members.length} blocks`, order: first.order!,
      body: listed(members),
    };
    for (const member of members) graph.blocks[member.id]!.parent = id;
  }
}

/** A container's body: the names of what it holds, as a list. */
function listed(blocks: Block[]): string {
  return blocks.map((block) => `- ${clip(block.name ?? "", LISTED).replace(MARKUP, "\\$1")}`)
    .join("\n");
}

/** Whether a block sits in the backbone column rather than in a row. */
function is_spine(block: Block): boolean {
  return [HEADING, FRONT, LEAD].includes(block.type ?? "");
}

/** The graph laid out as the page reads: a backbone down, each block's content beside it.
 *
 *  Backbone blocks are stacked down the page, a unit of air under the taller card of the row
 *  above, joined by a directed flow line; each one's content sits to its right, chained to it by an
 *  undirected member line, the two sharing one centre line. A layer with no backbone — a
 *  container, a folder — stacks down the page; a table's layer holds its grid, which places itself.
 *  Cards are measured at `card`, the workspace's card size, and `full` lets one that fits
 *  its body grow past it. Drawn, never stored: the held graph keeps no positions or lines to fall
 *  out of step. */
export function laid(graph: Graph, card: { w: number; h: number }, full = false): Graph {
  set_card(card.w, card.h);
  set_full(full);
  const blocks = { ...graph.blocks };
  const edges = { ...graph.edges };
  const air = UNITS.unit;

  // A table keeps the one card size and cuts its columns there, rather than growing to list them.
  for (const block of Object.values(graph.blocks)) {
    if (block.type !== TABLE) continue;
    blocks[block.id] = { ...block, w: UNITS.block.w * air, h: UNITS.block.h * air };
  }
  const measured = { ...graph, blocks: { ...blocks } };
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${to}`;
    edges[id] = { id, from, to, type, ...(type === FLOW ? { dir: "forward" as const } : {}) };
  };

  const seat = (layer: Id) => {
    const held = kids(measured, layer);
    const spined = held.some(is_spine);
    const sized = held.map((block) => ({ block, size: size_of(measured, block.id) }));
    const across = Math.max(0, ...sized.map(({ size }) => size.w)) + air * 2;

    // Rows first: a backbone block starts one, and its content joins it.
    const rows: (typeof sized)[] = [];
    let anchor: Id | null = null;
    let last: Id | null = null;
    for (const each of sized) {
      if (!spined || is_spine(each.block) || !rows.length) {
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
