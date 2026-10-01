/** One markdown document, read into blocks, and laid out as it reads.
 *
 *  Deliberately general: it walks `marked`'s tokens and files each one under the definition that
 *  describes it. What a block *means* is the markdown package's business, not this reader's — so
 *  a new element is a definition there plus one line here, and nothing else moves.
 *
 *  A document is one flat layer. A heading is a section group holding what follows it, and a
 *  section under it is a group inside it: membership, never parenthood. Content is split where its
 *  kind changes — a run of paragraphs and quotes is one text block, and each list, fence, table
 *  and image its own — and read in order. A block's tags are derived from its groups. */

import { marked, type Token, type Tokens } from "marked";
import { UNITS, base_graph, children, set_card, set_full, size_of, type Block,
         type Graph, type Id } from "@mnd/kit";
import { CODE, FLOW, FRONT, GROUPS, HEADING, IMAGE, LIST, SECTION, TABLE, TEXT, group_of,
         with_markdown }
  from "./packages/markdown.js";
import { form_of } from "./forms.js";
import { plain } from "./names.js";

/** One entry on the workspace's shelf of definitions: one filed, or a group. */
type Shelved = NonNullable<Block["shelf"]>[number];

/** What names a group kind's definition, and its group on the shelf. */
const KIND = "kind.";
const SHELF = "shelf:";

/** The group kind a block sitting in a section is tagged with. */
const SECTIONED = `${KIND}section`;

/** The workspace's group kinds, each a definition its blocks are tagged with: the document group
 *  a block sits in, and the content group its definition is filed in. */
const KINDS: [string, [string, string][]][] = [
  ["document", [["section", "A block sits in a section: under a heading."]]],
  ["content", GROUPS.map(([name]) => [name, `A block of the package's ${name} group.`])],
];

/** How many lines make a fence or list long, so it spans two columns. */
const LONG = 12;

/** How many default card heights a block may grow to before it is cut. */
const TALL = 3;

/** A table's cells, in units: room for a short phrase over two lines. */
const CELL_H = 2;

/** The fewest lines a table shows before it is cut: a table is read by its rows. */
const LINES = 6;


/** A document as a graph: the file as the root, one block per element, each in its section. */
export function read(name: string, text: string): Graph {
  const graph = with_markdown(base_graph());
  const root = graph.root;
  graph.blocks[root] = { ...graph.blocks[root]!, name, source: name, shelf: shelved() };
  for (const [, kinds] of KINDS) {
    for (const [kind, about] of kinds) {
      const id = `${KIND}${kind}`;
      graph.defs[id] = { id, group: "block", extends: "group", name: kind, about };
    }
  }

  /** The sections still open, outermost first. A heading holds what follows it until one of the
   *  same level or higher closes it. */
  const open: { id: Id; depth: number }[] = [];
  /** The text block a paragraph or quote joins, while nothing else has come between. */
  let prose: Id | null = null;

  const seen = new Map<string, number>();
  const mint = (kind: string): Id => {
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return `${kind}:${n}`;
  };

  let order = 0;
  const put = (block: Omit<Block, "id" | "parent" | "order">, kind: string): Block => {
    const group = open[open.length - 1]?.id;
    const held = { ...block, id: mint(kind), parent: root, order: ++order,
                   ...(group ? { group } : {}) } as Block;
    graph.blocks[held.id] = held;
    return held;
  };

  const { front, body } = split_front(text);
  if (front) put({ type: FRONT, name: "frontmatter", body: front }, "front");
  for (const token of marked.lexer(body)) walk(token);
  return tagged(graph);

  /** One token, put in whichever section is open. */
  function walk(token: Token): void {
    if (token.type === "space") return;
    const image = token.type === "paragraph" ? only_image(token as Tokens.Paragraph) : null;
    if (image || !["paragraph", "blockquote"].includes(token.type)) prose = null;
    const raw = token.raw.trim();
    switch (token.type) {
      case "heading": {
        const heading = token as Tokens.Heading;
        while (open.length && open[open.length - 1]!.depth >= heading.depth) open.pop();
        // A section group, named as the page heads it, and its heading first inside it.
        const said = `${"#".repeat(heading.depth)} ${heading.text}`;
        const held = put({ type: SECTION, name: said }, "section");
        open.push({ id: held.id, depth: heading.depth });
        put({ type: HEADING, name: plain(heading.text), body: said }, "heading");
        return;
      }
      case "paragraph":
      case "blockquote": {
        if (image) {
          put({ type: IMAGE, name: plain(image.text) || "image", source: image.href, body: raw },
              "image");
          return;
        }
        // A run of prose is one block: each paragraph or quote joins the one before it.
        const joined = prose ? graph.blocks[prose] : null;
        if (joined) { joined.body = `${joined.body}\n\n${raw}`; return; }
        prose = put({ type: TEXT, name: plain((token as Tokens.Paragraph).text), body: raw },
                    "text").id;
        return;
      }
      case "code": {
        const code = token as Tokens.Code;
        put({ type: CODE, name: plain(code.lang ?? "") || "code", body: raw }, "code");
        return;
      }
      case "list": {
        // Its items are content, not parts: they live in its body, as written.
        const list = token as Tokens.List;
        put({ type: LIST, name: `${list.items.length} items`, body: raw }, "list");
        return;
      }
      case "table": {
        // Named by its rows by its columns; its first column is its key. Its schema is its own, a
        // field per column. Its rows are values, not parts: it is one grid, headed by its
        // columns' names. Its body is the table as written.
        const table = token as Tokens.Table;
        const headers = table.header.map((cell, n) => plain(cell.text) || `col ${n + 1}`);
        const forms = headers.map((_, n) => form_of(table.rows.map((row) => row[n]?.text ?? "")));
        put({
          type: TABLE, body: raw, name: `${table.rows.length}x${headers.length} items`,
          fields: headers.map((name, n) => ({
            name, form: forms[n] ?? "text", ...(n === 0 ? { key: true } : {}),
          })),
          grid: {
            rows: table.rows.length + 1, cols: headers.length, columns: headers.map(() => ""),
            values: [headers, ...table.rows.map((row) => row.map((cell) => cell.text.trim()))],
          },
        }, "table");
        return;
      }
      default:
        // A rule, html, a link definition and anything else carry no block of their own.
        return;
    }
  }
}

/** The graph with every block's tags derived from its groups: the section it sits in, and the
 *  content group its definition is filed in. Membership is the truth; tags only follow it. */
export function tagged(graph: Graph): Graph {
  const blocks: Record<Id, Block> = {};
  for (const block of Object.values(graph.blocks)) {
    const { tags: _was, ...rest } = block;
    const content = group_of(block.type);
    const tags = [
      ...(graph.blocks[block.group ?? ""]?.type === SECTION ? [SECTIONED] : []),
      ...(content ? [`${KIND}${content}`] : []),
    ];
    blocks[block.id] = tags.length ? { ...rest, tags } : rest;
  }
  return { ...graph, blocks };
}

/** The document laid out as it reads: a backbone of headings down the page, each section's content
 *  beside its heading.
 *
 *  Each section is a box holding its heading, its content in rows `across` cards wide beside the
 *  heading, and under them its own sections, a column right — so the headings step down the page
 *  as a staircase. A flow line runs to each heading from its parent's or the sibling's before it,
 *  and from the heading through its content in order. A small block is one card; a table spans a
 *  column for every two of its own, a long fence or list two. A block is cut at `TALL` cards
 *  high, unless `full` shows all of it. Drawn, never stored: the held graph keeps no sizes, places
 *  or lines. */
export function laid(graph: Graph, card: { w: number; h: number }, full: boolean,
                     across: number): Graph {
  set_card(card.w, card.h);
  const air = UNITS.unit;
  const gap = UNITS.gap * air;
  const one = { w: UNITS.block.w * air, h: UNITS.block.h * air };
  const wide = (span: number) => span * one.w + (span - 1) * gap;
  /** The column content starts in, right of a heading; and how far a section's own sections step. */
  const lane = one.w + air * 2;
  const blocks = { ...graph.blocks };
  const edges = { ...graph.edges };
  const kin = children(graph, graph.root);

  /** How tall a block would be, shown whole. */
  const whole = (id: Id) => {
    set_full(true);
    const h = size_of(graph, id).h;
    set_full(full);
    return h;
  };
  /** A directed flow line, from one block to the next it reads to. */
  const flow = (from: Id, to: Id) => {
    const id = `${FLOW}:${to}`;
    edges[id] = { id, from, to, type: FLOW, dir: "forward" };
  };

  // Each content block spans its columns and is cut at its height.
  for (const block of kin) {
    const span = spanned(block, across);
    if (block.type === TABLE && block.grid) {
      const most = Math.max(LINES, Math.floor((TALL * one.h) / (CELL_H * air)));
      const values = full ? block.grid.values ?? [] : cut(block.grid.values ?? [], most);
      const size = { w: Math.max(2, Math.floor(wide(span) / air / block.grid.cols)), h: CELL_H };
      blocks[block.id] = { ...block, grid: { ...block.grid, values, rows: values.length, size } };
    } else if ([TEXT, LIST, CODE].includes(block.type ?? "")) {
      const h = full ? whole(block.id) : Math.min(whole(block.id), TALL * one.h);
      blocks[block.id] = { ...block, w: wide(span), h, looks: { card: { height: "free" } } };
    }
  }
  const sized: Graph = { ...graph, blocks };
  const size = (id: Id) => size_of(sized, id);
  const put = (id: Id, x: number, y: number) => { blocks[id] = { ...blocks[id]!, x, y }; };

  /** Blocks in a row from `x`, wrapping `across` cards wide back to it, flowed in order from
   *  `from`; how far down they reach. */
  const row = (held: Block[], x: number, y: number, from: Id | null): number => {
    let at = x;
    let top = y;
    let tall = 0;
    for (const block of held) {
      const { w, h } = size(block.id);
      if (at > x && at + w > x + wide(across)) { top += tall + air; at = x; tall = 0; }
      put(block.id, at, top);
      if (from) flow(from, block.id);
      from = block.id;
      at += w + gap;
      tall = Math.max(tall, h);
    }
    return held.length ? top + tall : y;
  };

  /** A section placed by hand from its own corner: its heading, its content beside it, and its
   *  own sections under them a column right. How tall it is, inside its box. */
  const section = (id: Id): number => {
    const held = kin.filter((block) => block.group === id);
    const heading = held.find((block) => block.type === HEADING);
    const content = held.filter((block) => block !== heading && block.type !== SECTION);
    if (heading) put(heading.id, 0, 0);
    const reach = row(content, heading ? lane : 0, 0, heading?.id ?? null);
    let y = Math.max(heading ? size(heading.id).h : 0, reach) + air * 2;
    for (const sub of held.filter((block) => block.type === SECTION)) {
      const h = section(sub.id);
      put(sub.id, lane, y);
      y += h + gap * 2 + air * 2;
    }
    blocks[id] = { ...blocks[id]!, arrangement: "free" };
    return y - air * 2;
  };

  // The page: the front matter, what sits in no section, then each section, down the page.
  const sizes = new Map<Id, number>();
  for (const block of kin.filter((each) => each.type === SECTION && !each.group)) {
    sizes.set(block.id, section(block.id) + gap * 2);
  }
  const front = kin.find((block) => block.type === FRONT && !block.group);
  let y = 0;
  if (front) { put(front.id, 0, 0); y = size(front.id).h + air * 2; }
  const loose = kin.filter((block) => !block.group && block.type !== SECTION && block !== front);
  if (loose.length) y = row(loose, front ? lane : 0, y, front?.id ?? null) + air * 2;
  for (const block of kin.filter((each) => sizes.has(each.id))) {
    put(block.id, 0, y);
    y += sizes.get(block.id)! + air * 2;
  }

  // The backbone: each heading flowed to from its parent's, or the sibling's before it.
  const spine: { id: Id; depth: number }[] = front ? [{ id: front.id, depth: 0 }] : [];
  for (const block of kin.filter((each) => each.type === HEADING)) {
    const deep = depth(graph, block.id) - 1;
    const from = spine.findLast((each) => each.depth <= deep);
    if (from) flow(from.id, block.id);
    spine.push({ id: block.id, depth: deep });
  }
  return { ...sized, edges };
}


/** How many sections a block sits in. */
function depth(graph: Graph, id: Id): number {
  const group = graph.blocks[id]?.group;
  return group ? 1 + depth(graph, group) : 0;
}

/** How many columns a block spans: a table one for every two of its own, a long fence or list
 *  two, anything else one — never more than a row holds. */
function spanned(block: Block, across: number): number {
  const lines = (block.body ?? "").split("\n").length;
  const span = block.type === TABLE ? Math.ceil((block.grid?.cols ?? 1) / 2)
    : [CODE, LIST].includes(block.type ?? "") && lines >= LONG ? 2 : 1;
  return Math.max(1, Math.min(span, across));
}

/** A table's lines cut to `most`, the last saying how many more there are. */
function cut(values: string[][], most: number): string[][] {
  if (values.length <= most) return values;
  const kept = values.slice(0, most - 1);
  const more = `… ${values.length - kept.length} more`;
  return [...kept, values[0]!.map((_, n) => (n ? "" : more))];
}

/** The workspace's shelf: each group kind filed in its group — document, content. */
function shelved(): Shelved[] {
  return KINDS.flatMap(([group, kinds]): Shelved[] => [
    { id: `${SHELF}${group}`, group: "block", name: group },
    ...kinds.map(([kind]): Shelved => ({ id: `${KIND}${kind}`, group: "block",
                                         in: `${SHELF}${group}` })),
  ]);
}

/** The front matter, and the document without it. */
function split_front(text: string): { front: string; body: string } {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!match) return { front: "", body: text };
  return { front: match[1]!.trim(), body: text.slice(match[0].length) };
}

/** A paragraph that is one image and nothing else. */
function only_image(paragraph: Tokens.Paragraph): Tokens.Image | null {
  const held = (paragraph.tokens ?? []).filter((token) => token.type !== "space");
  const first = held[0];
  return held.length === 1 && first?.type === "image" ? first as Tokens.Image : null;
}
