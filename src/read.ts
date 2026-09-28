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
  ALLOCATES, CODE, COLUMN, FLOW, FRONT, HEADING, IMAGE, LIST, MEMBER, QUOTE, SCHEMA, TABLE,
  TEXT, with_markdown,
} from "./packages/markdown.js";
import { is_spine, rows } from "./series.js";

/** How much of a block's text a card shows before it is cut. */
const LABEL = 48;

/** How many lines make a fence or list too long for a card, so it is opened to be read. */
const LONG = 12;

/** What names a focus block's preview on the page. */
const SEE = "see:";

/** What names each part an opened table is drawn with, but for its columns' definitions. */
const SECTION = "section";
const BEFORE = "before";
const AFTER = "after";
const SCHEMA_CARD = "schema";

/** One entry on the workspace's shelf of definitions: one filed, or a folder. */
type Shelved = NonNullable<Block["shelf"]>[number];

/** The folder a column type is filed in when its tables sit in more than one section, and what
 *  names each folder. */
const SHARED = "shared";
const SHELF = "shelf:";

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

  /** Each distinct column name is one workspace definition, a column block type, whichever table
   *  it heads. Two definitions may not share a name, so one clipped to a taken name is numbered. */
  const columns = new Map<string, Id>();
  const named = new Set<string>();
  const column_for = (name: string): Id => {
    const known = columns.get(name);
    if (known) return known;
    let unique = clip(name);
    for (let n = 2; named.has(unique); n++) unique = `${clip(name)} ${n}`;
    named.add(unique);
    const id = new_id("def");
    graph.defs[id] = { id, group: "block", extends: COLUMN, name: unique };
    columns.set(name, id);
    return id;
  };

  const { front, body } = split_front(text);
  if (front) {
    put({ id: mint("front"), parent: root, type: FRONT, name: "frontmatter", body: front });
  }

  for (const token of marked.lexer(body)) walk(token);
  graph.blocks[root] = { ...graph.blocks[root]!, shelf: filed(graph) };
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
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        // Named for what it is: its section already says what it is about. Its schema is its own,
        // a field per column, the first the key. Its rows are values, not parts: it is one grid,
        // its header allocating each column's definition.
        put({
          id: mint("table"), parent, type: TABLE, name: "table",
          fields: headers.map((name, n) => ({
            name, form: forms[n] ?? "text", ...(n === 0 ? { key: true } : {}),
          })),
          grid: {
            rows: table.rows.length + 1, cols: headers.length, size: CELL,
            columns: headers.map(column_for),
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
  return placed(graph, paged(graph));
}

/** A drawing given its places: each layer's rows stacked down it, as {@link laid} describes. */
function placed(graph: Graph, drawn: Graph): Graph {
  const blocks = { ...drawn.blocks };
  const edges = { ...drawn.edges };
  const air = UNITS.unit;

  for (const block of Object.values(drawn.blocks)) {
    // A table's preview keeps the one card size and cuts its columns there.
    if (drawn.blocks[block.of ?? ""]?.type === TABLE) {
      blocks[block.id] = { ...block, w: UNITS.block.w * air, h: UNITS.block.h * air };
    }
    // A column's definition, over an opened table, is as wide as the column it heads.
    if (drawn.defs[block.of ?? ""]) blocks[block.id] = { ...block, w: CELL.w * air, h: CELL.h * air };
  }
  const measured = { ...drawn, blocks: { ...blocks } };
  const size = (id: Id) => size_of(measured, id);
  const line = (from: Id, to: Id, type: Id) => {
    const id = `${type}:${to}`;
    edges[id] = { id, from, to, type, ...(type === FLOW ? { dir: "forward" as const } : {}) };
  };

  /** An opened table, as a cutout of its section: its section's heading above it, the blocks
   *  read before and after it at either side, and under it each column's definition under its
   *  own column, dashed up to the grid, then its schema. */
  const around = (layer: Id, table: Id) => {
    const gap = air * 3;
    const grid = size(table);
    const part = (name: string) => measured.blocks[`${name}:${table}`];
    const put = (id: Id, x: number, y: number, type: Id, forward = false) => {
      blocks[id] = { ...blocks[id]!, x, y };
      const [from, to] = forward ? [table, id] : [id, table];
      edges[`${type}:${id}`] = { id: `${type}:${id}`, from, to, type,
                                 ...(type === FLOW ? { dir: "forward" as const } : {}) };
    };
    const centred = (id: Id) => (grid.w - size(id).w) / 2;

    // The section's heading over the table, and the table under it.
    const section = part(SECTION);
    const top = section ? size(section.id).h + gap : 0;
    if (section) put(section.id, centred(section.id), 0, MEMBER);
    blocks[table] = { ...blocks[table]!, x: 0, y: top };

    // What is read before and after it, level with its middle.
    const middle = (id: Id) => top + (grid.h - size(id).h) / 2;
    const before = part(BEFORE);
    const after = part(AFTER);
    if (before) put(before.id, -(size(before.id).w + gap), middle(before.id), FLOW);
    if (after) put(after.id, grid.w + gap, middle(after.id), FLOW, true);

    // Under it: each column's definition under its column, then the schema.
    const under = top + grid.h + gap;
    const columns = kids(measured, layer).filter((block) => measured.defs[block.of ?? ""]);
    columns.forEach((block, n) => put(block.id, n * CELL.w * air, under, ALLOCATES));
    const schema = part(SCHEMA_CARD);
    const low = under + (columns.length ? CELL.h * air + gap : 0);
    if (schema) put(schema.id, centred(schema.id), low, MEMBER);
  };

  const seat = (layer: Id) => {
    const opened = measured.blocks[measured.blocks[layer]?.of ?? ""];
    if (opened?.type === TABLE) { around(layer, opened.id); return; }
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
  const spine = (block: Block) => is_spine(graph, block);
  const content = held.some(spine) ? held.filter((block) => !spine(block)) : held;
  const widths = content.map((block) => size_of(graph, block.id).w);
  return Math.max(0, ...widths) + UNITS.unit * 2;
}

/** How wide a laid layer's drawing is, from its leftmost card to its rightmost. */
export function span(graph: Graph, layer: Id): number {
  const held = kids(graph, layer);
  const left = Math.min(0, ...held.map((block) => block.x ?? 0));
  return Math.max(0, ...held.map((block) => (block.x ?? 0) + size_of(graph, block.id).w)) - left;
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

/** The workspace's definitions filed on its shelf by where they are read: a folder for each
 *  section whose tables they head, in reading order, and `shared` first for one heading tables in
 *  several. The explorer lists them so, and the library's projection draws them so. */
function filed(graph: Graph): Shelved[] {
  const tables = reading(graph).filter((block) => block.grid?.columns);
  const section = (block: Block) => graph.blocks[block.parent ?? ""]?.name ?? "document";
  const folders = new Map<string, Id[]>([[SHARED, []],
    ...tables.map((table): [string, Id[]] => [section(table), []])]);
  const own = Object.values(graph.defs).filter((def) => !def.from && def.extends === COLUMN)
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const def of own) {
    const sections = new Set(tables.filter((t) => t.grid!.columns!.includes(def.id)).map(section));
    const name = sections.size > 1 ? SHARED : [...sections][0] ?? SHARED;
    folders.get(name)!.push(def.id);
  }
  return [...folders].filter(([, defs]) => defs.length).flatMap(([name, defs], n): Shelved[] => {
    const folder = `${SHELF}${n}`;
    return [{ id: folder, group: "block", name },
            ...defs.map((id): Shelved => ({ id, group: "block", in: folder }))];
  });
}

/** The document's blocks in reading order. */
export function reading(graph: Graph): Block[] {
  return kids(graph, graph.root).flatMap(function all(block): Block[] {
    return [block, ...kids(graph, block.id).flatMap(all)];
  });
}

/** What an opened table is drawn with: the heading of the section it sits in, the blocks read
 *  before and after it there, the definition each column allocates, and its own schema. Drawn
 *  only: each is a reference or a card of its own, never a block of the document. */
function beside(graph: Graph, table: Block, layer: Id): Block[] {
  if (table.type !== TABLE) return [];
  const out: Block[] = [];
  const add = (name: string, block: Omit<Block, "id" | "parent" | "order">) =>
    out.push({ ...block, id: `${name}:${table.id}`, parent: layer, order: out.length + 1 });

  // Its section's heading, and its neighbours in the section, as they are read.
  const section = graph.blocks[table.parent ?? ""];
  if (section?.type === HEADING) add(SECTION, { of: section.id });
  const kin = kids(graph, table.parent ?? graph.root);
  const at = kin.findIndex((block) => block.id === table.id);
  if (kin[at - 1]) add(BEFORE, { of: kin[at - 1]!.id });
  if (kin[at + 1]) add(AFTER, { of: kin[at + 1]!.id });

  // A column's definition is sized to the column it heads, so its card keeps the size it is given.
  (table.grid?.columns ?? []).forEach((def, n) =>
    add(`column:${n}`, { of: def, looks: { card: { height: "free" } } }));
  add(SCHEMA_CARD, { type: SCHEMA, name: "schema", fields: table.fields ?? [] });
  return out;
}

/** The document drawn as one page.
 *
 *  A heading holds its section, but draws as the row it heads rather than a layer to open: all it
 *  holds, subheadings too, comes up to the page in reading order. A focus block draws there as a
 *  preview, and holds itself — a table with what it is drawn beside (see {@link beside}) — so
 *  opening the preview reads it alone. Content ahead of any heading hangs off a reference to the
 *  document, seated just ahead of it. Only the drawing moves: the held graph stays the outline. */
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
        for (const each of beside(graph, block, id)) blocks[each.id] = each;
      } else {
        blocks[block.id] = { ...block, parent: root, order: at };
      }
      if (block.type === HEADING) up(block.id);
    }
  };
  up(root);

  const held = kids({ ...graph, blocks }, root);
  const first = held.find((block) => block.type !== FRONT);
  if (first && !is_spine(graph, first) && held.some((block) => is_spine(graph, block))) {
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
